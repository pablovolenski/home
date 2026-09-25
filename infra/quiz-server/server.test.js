import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.js';

let server;
let base;

before(async () => {
  server = createApp({ DB_PATH: ':memory:', DEV_SHOW_CONFIRM_LINK: 'true', SITE_ORIGIN: 'https://example.test' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

const quizBody = (overrides = {}) => ({
  title: 'Lunch?',
  email: 'Me@Example.com',
  questions: [
    { text: 'Where?', options: ['Pizza', 'Sushi', 'Tacos'] },
    { text: 'When?', options: ['12:00', '13:00'] },
  ],
  ...overrides,
});

async function createAndConfirm() {
  const created = await call('POST', '/api/quizzes', quizBody());
  const token = new URL(created.body.devConfirmUrl).searchParams.get('confirm');
  const confirmed = await call('POST', '/api/confirm', { token });
  const results = new URL(confirmed.body.resultsUrl);
  return { token, id: results.searchParams.get('r'), key: results.searchParams.get('k'), confirmed };
}

test('rejects invalid quizzes', async () => {
  const q = (text, n) => ({ text, options: Array.from({ length: n }, (_, i) => `o${i}`) });
  const cases = [
    [quizBody({ questions: [] }), /1 to 4 questions/],
    [quizBody({ questions: [q('a', 2), q('b', 2), q('c', 2), q('d', 2), q('e', 2)] }), /1 to 4 questions/],
    [quizBody({ questions: [q('a', 1)] }), /2 to 6 answer options/],
    [quizBody({ questions: [q('a', 7)] }), /2 to 6 answer options/],
    [quizBody({ email: 'nope' }), /valid email/],
    [quizBody({ title: '  ' }), /title/],
  ];
  for (const [body, re] of cases) {
    const res = await call('POST', '/api/quizzes', body);
    assert.equal(res.status, 400);
    assert.match(res.body.error, re);
  }
  assert.equal((await call('POST', '/api/quizzes', 'garbage')).status, 400);
});

test('honeypot pretends success without a confirm link', async () => {
  const res = await call('POST', '/api/quizzes', quizBody({ website: 'spam' }));
  assert.equal(res.status, 200);
  assert.equal(res.body.devConfirmUrl, undefined);
});

test('pending quiz is not reachable until confirmed, then lives 7 days', async () => {
  const created = await call('POST', '/api/quizzes', quizBody());
  assert.equal(created.status, 201);
  const token = new URL(created.body.devConfirmUrl).searchParams.get('confirm');
  const { id, email } = server.db.prepare('SELECT id, email FROM quizzes WHERE confirm_token = ?').get(token);
  assert.equal(email, 'me@example.com');

  assert.equal((await call('GET', `/api/quizzes/${id}`)).status, 409);
  assert.equal((await call('POST', `/api/quizzes/${id}/responses`, { answers: [0, 0] })).status, 409);

  const confirmed = await call('POST', '/api/confirm', { token });
  assert.equal(confirmed.body.shareUrl, `https://example.test/quiz/?q=${id}`);
  assert.ok(confirmed.body.expiresAt - Date.now() > 6.9 * 24 * 3600 * 1000);
  assert.equal((await call('GET', `/api/quizzes/${id}`)).status, 200);
});

test('expired quizzes are gone', async () => {
  const { id, key } = await createAndConfirm();
  server.db.prepare('UPDATE quizzes SET expires_at = ? WHERE id = ?').run(Date.now() - 1, id);
  assert.equal((await call('GET', `/api/quizzes/${id}`)).status, 404);
  assert.equal((await call('POST', `/api/quizzes/${id}/responses`, { answers: [0, 0] })).status, 404);
  assert.equal((await call('GET', `/api/quizzes/${id}/results?key=${key}`)).status, 404);
});

test('full flow: confirm, take, results', async () => {
  const { token, id, key, confirmed } = await createAndConfirm();

  // Confirming again is idempotent.
  const again = await call('POST', '/api/confirm', { token });
  assert.deepEqual(again.body, confirmed.body);
  assert.equal((await call('POST', '/api/confirm', { token: 'bad' })).status, 404);

  // Public view never leaks private fields.
  const pub = await call('GET', `/api/quizzes/${id}`);
  assert.equal(pub.status, 200);
  assert.deepEqual(Object.keys(pub.body).sort(), ['expiresAt', 'id', 'questions', 'title']);

  for (const answers of [[0, 1], [2, 1], [0, 0]]) {
    assert.equal((await call('POST', `/api/quizzes/${id}/responses`, { answers })).status, 201);
  }
  for (const answers of [[3, 0], [0], [0, 1, 1], ['0', 1], [-1, 0]]) {
    assert.equal((await call('POST', `/api/quizzes/${id}/responses`, { answers })).status, 400);
  }

  const results = await call('GET', `/api/quizzes/${id}/results?key=${key}`);
  assert.equal(results.status, 200);
  assert.equal(results.body.total, 3);
  assert.deepEqual(results.body.questions.map((q) => q.options.map((o) => o.count)), [[2, 0, 1], [1, 2]]);

  assert.equal((await call('GET', `/api/quizzes/${id}/results?key=wrong`)).status, 403);
  assert.equal((await call('GET', `/api/quizzes/${id}/results`)).status, 403);
  assert.equal((await call('GET', '/api/quizzes/doesnotexist')).status, 404);
});

test('rate limits creations per IP', async () => {
  // Earlier tests already created a few from 127.0.0.1; keep going until the limit trips.
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await call('POST', '/api/quizzes', quizBody())).status);
  assert.ok(statuses.includes(429));
  assert.equal(statuses.at(-1), 429);
});

test('CORS allows the site and localhost only', async () => {
  const pre = await fetch(`${base}/api/quizzes`, { method: 'OPTIONS', headers: { Origin: 'https://pablovolenski.com' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://pablovolenski.com');

  const local = await call('GET', '/health', undefined, { Origin: 'http://localhost:4321' });
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:4321');

  const evil = await call('GET', '/health', undefined, { Origin: 'https://evil.example' });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});
