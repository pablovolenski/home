/**
 * Backend for the survey/poll generator at https://pablovolenski.com/quiz/
 * (Cloudflare Worker + one KV namespace).
 *
 *   POST /api/quizzes                    create a quiz (pending until the email is confirmed)
 *   POST /api/confirm                    confirm the email → quiz goes live for 7 days
 *   GET  /api/quizzes/:id                public quiz (title + questions)
 *   POST /api/quizzes/:id/responses      submit one set of answers
 *   GET  /api/quizzes/:id/results?key=   aggregated answers (creator only)
 *
 * KV layout (binding QUIZ_KV) — everything expires on its own via KV TTLs:
 *   quiz:<id>          quiz JSON                       48h while pending, 7d once active
 *   confirm:<token>    quiz id                         48h, then until the quiz expires
 *   resp:<id>:<rand>   empty value, answers in metadata until the quiz expires
 *   rl:<ip>:<hour>     create counter (soft rate limit) 1h
 *
 * Vars (Worker settings or wrangler.toml, never secrets committed):
 *   SITE_ORIGIN            where the frontend lives, default https://pablovolenski.com
 *   EMAIL_PROVIDER         'log' (default: print mails to the Worker log) — real provider later
 *   DEV_SHOW_CONFIRM_LINK  'true' returns the confirm link to the browser (local testing only!)
 */

const ALLOWED_ORIGINS = ['https://pablovolenski.com', 'https://www.pablovolenski.com'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const HOUR = 3600;
const PENDING_TTL = 48 * HOUR;
const ACTIVE_TTL = 7 * 24 * HOUR;
const CREATES_PER_IP_PER_HOUR = 5;

const LIMITS = { title: 120, question: 200, option: 100, questions: [1, 4], options: [2, 6], email: 254 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin'));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      console.error(err);
      return json({ error: 'Something went wrong. Please try again.' }, 500, cors);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const m = path.match(/^\/api\/quizzes\/([a-z0-9]+)(\/responses|\/results)?$/);

  if (path === '/api/quizzes' && request.method === 'POST') return createQuiz(request, env);
  if (path === '/api/confirm' && request.method === 'POST') return confirmQuiz(request, env);
  if (m && !m[2] && request.method === 'GET') return getQuiz(m[1], env);
  if (m && m[2] === '/responses' && request.method === 'POST') return submitResponse(m[1], request, env);
  if (m && m[2] === '/results' && request.method === 'GET') return getResults(m[1], url.searchParams.get('key'), env);

  return json({ error: 'Not found' }, 404);
}

// ── Handlers ─────────────────────────────────

async function createQuiz(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: 'Invalid request body.' }, 400);

  // Honeypot: humans never see this field. Pretend success so bots learn nothing.
  if (body.website) return json({ ok: true });

  const parsed = validateQuiz(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `rl:${ip}:${Math.floor(Date.now() / 1000 / HOUR)}`;
  const count = Number(await env.QUIZ_KV.get(rlKey)) || 0;
  if (count >= CREATES_PER_IP_PER_HOUR) {
    return json({ error: 'Too many quizzes created from your network. Please try again in an hour.' }, 429);
  }
  await env.QUIZ_KV.put(rlKey, String(count + 1), { expirationTtl: HOUR });

  const id = randomId(10);
  const token = randomId(32);
  const quiz = {
    id,
    ...parsed.quiz,
    adminKey: randomId(32),
    status: 'pending',
    createdAt: Date.now(),
  };
  await env.QUIZ_KV.put(`quiz:${id}`, JSON.stringify(quiz), { expirationTtl: PENDING_TTL });
  await env.QUIZ_KV.put(`confirm:${token}`, id, { expirationTtl: PENDING_TTL });

  const confirmUrl = `${site(env)}/quiz/?confirm=${token}`;
  await sendEmail(env, {
    to: quiz.email,
    subject: `Confirm your quiz: ${quiz.title}`,
    text:
      `Hi,\n\nsomeone (hopefully you) created the quiz "${quiz.title}" at pablovolenski.com/quiz.\n\n` +
      `Confirm your email address to publish it — the link is valid for 48 hours:\n${confirmUrl}\n\n` +
      `Once confirmed, the quiz stays online for 7 days.\n\nIf this wasn't you, just ignore this email.\n`,
  });

  const out = { ok: true };
  if (env.DEV_SHOW_CONFIRM_LINK === 'true') out.devConfirmUrl = confirmUrl;
  return json(out, 201);
}

async function confirmQuiz(request, env) {
  const body = await readJson(request);
  const token = body && typeof body.token === 'string' ? body.token : '';
  const id = token && (await env.QUIZ_KV.get(`confirm:${token}`));
  const quiz = id && (await loadQuiz(id, env));
  if (!quiz) return json({ error: 'This confirmation link is invalid or has expired.' }, 404);

  if (quiz.status === 'pending') {
    quiz.status = 'active';
    quiz.confirmedAt = Date.now();
    quiz.expiresAt = quiz.confirmedAt + ACTIVE_TTL * 1000;
    const expiration = Math.floor(quiz.expiresAt / 1000);
    await env.QUIZ_KV.put(`quiz:${id}`, JSON.stringify(quiz), { expiration });
    // Keep the token until the quiz expires so clicking the link again shows the links again.
    await env.QUIZ_KV.put(`confirm:${token}`, id, { expiration });

    const links = quizLinks(quiz, env);
    await sendEmail(env, {
      to: quiz.email,
      subject: `Your quiz is live: ${quiz.title}`,
      text:
        `Your quiz "${quiz.title}" is live until ${new Date(quiz.expiresAt).toUTCString()}.\n\n` +
        `Share this link:\n${links.shareUrl}\n\n` +
        `See the results (keep this one private):\n${links.resultsUrl}\n`,
    });
  }

  return json({ ok: true, title: quiz.title, expiresAt: quiz.expiresAt, ...quizLinks(quiz, env) });
}

async function getQuiz(id, env) {
  const quiz = await loadQuiz(id, env);
  if (!quiz) return notFound();
  if (quiz.status !== 'active') return notActive();
  return json(publicQuiz(quiz));
}

async function submitResponse(id, request, env) {
  const quiz = await loadQuiz(id, env);
  if (!quiz) return notFound();
  if (quiz.status !== 'active') return notActive();
  if (Date.now() >= quiz.expiresAt) return notFound();

  const body = await readJson(request);
  const answers = body && body.answers;
  const valid =
    Array.isArray(answers) &&
    answers.length === quiz.questions.length &&
    answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < quiz.questions[i].options.length);
  if (!valid) return json({ error: 'Please answer every question.' }, 400);

  await env.QUIZ_KV.put(`resp:${id}:${randomId(16)}`, '', {
    expiration: Math.floor(quiz.expiresAt / 1000),
    metadata: { a: answers },
  });
  return json({ ok: true }, 201);
}

async function getResults(id, key, env) {
  const quiz = await loadQuiz(id, env);
  if (!quiz) return notFound();
  if (!key || !safeEqual(key, quiz.adminKey)) return json({ error: 'Invalid results link.' }, 403);

  const counts = quiz.questions.map((q) => q.options.map(() => 0));
  let total = 0;
  let cursor;
  do {
    const page = await env.QUIZ_KV.list({ prefix: `resp:${id}:`, cursor });
    for (const k of page.keys) {
      const a = k.metadata && k.metadata.a;
      if (!Array.isArray(a)) continue;
      total++;
      a.forEach((opt, qi) => {
        if (counts[qi] && counts[qi][opt] !== undefined) counts[qi][opt]++;
      });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return json({
    ...publicQuiz(quiz),
    status: quiz.status,
    total,
    questions: quiz.questions.map((q, qi) => ({
      text: q.text,
      options: q.options.map((label, oi) => ({ label, count: counts[qi][oi] })),
    })),
  });
}

// ── Helpers ──────────────────────────────────

function validateQuiz(body) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const title = str(body.title);
  const email = str(body.email).toLowerCase();
  const questions = Array.isArray(body.questions) ? body.questions : [];

  if (!title) return { error: 'Please give your quiz a title.' };
  if (title.length > LIMITS.title) return { error: `Title is too long (max ${LIMITS.title} characters).` };
  if (!EMAIL_RE.test(email) || email.length > LIMITS.email) return { error: 'Please enter a valid email address.' };
  if (questions.length < LIMITS.questions[0] || questions.length > LIMITS.questions[1]) {
    return { error: `A quiz has ${LIMITS.questions[0]} to ${LIMITS.questions[1]} questions.` };
  }

  const clean = [];
  for (const [i, q] of questions.entries()) {
    const text = str(q && q.text);
    const options = (Array.isArray(q && q.options) ? q.options : []).map(str).filter(Boolean);
    const n = i + 1;
    if (!text) return { error: `Question ${n} is empty.` };
    if (text.length > LIMITS.question) return { error: `Question ${n} is too long (max ${LIMITS.question} characters).` };
    if (options.length < LIMITS.options[0] || options.length > LIMITS.options[1]) {
      return { error: `Question ${n} needs ${LIMITS.options[0]} to ${LIMITS.options[1]} answer options.` };
    }
    if (options.some((o) => o.length > LIMITS.option)) {
      return { error: `An option in question ${n} is too long (max ${LIMITS.option} characters).` };
    }
    clean.push({ text, options });
  }
  return { quiz: { title, email, questions: clean } };
}

async function loadQuiz(id, env) {
  const raw = await env.QUIZ_KV.get(`quiz:${id}`);
  return raw ? JSON.parse(raw) : null;
}

function publicQuiz(quiz) {
  return { id: quiz.id, title: quiz.title, questions: quiz.questions, expiresAt: quiz.expiresAt };
}

function quizLinks(quiz, env) {
  return {
    shareUrl: `${site(env)}/quiz/?q=${quiz.id}`,
    resultsUrl: `${site(env)}/quiz/?r=${quiz.id}&k=${quiz.adminKey}`,
  };
}

function site(env) {
  return (env.SITE_ORIGIN || 'https://pablovolenski.com').replace(/\/+$/, '');
}

function notFound() {
  return json({ error: 'This quiz does not exist or has expired.' }, 404);
}

function notActive() {
  return json(
    { error: "This quiz hasn't been activated yet. If you just confirmed it, try again in a minute." },
    409,
  );
}

// Lowercase + digits, without look-alikes (0/o, 1/l).
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
function randomId(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

function corsHeaders(origin) {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin));
  return ok
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

// ── Email ────────────────────────────────────
// The one place that talks to the outside world about mail. Until a provider is
// configured, mails are printed to the Worker log (Dashboard → Worker → Logs,
// or `npx wrangler tail`). To go live, add a case for the chosen provider here.

async function sendEmail(env, { to, subject, text }) {
  const provider = env.EMAIL_PROVIDER || 'log';
  switch (provider) {
    case 'log':
      console.log(`[email → ${to}] ${subject}\n${text}`);
      return;
    default:
      throw new Error(`Unknown EMAIL_PROVIDER "${provider}"`);
  }
}
