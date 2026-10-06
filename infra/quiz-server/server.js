/**
 * Backend for the survey/poll generator at https://pablovolenski.com/quiz/
 * Plain Node (>= 22.13), SQLite via the built-in node:sqlite, SMTP via nodemailer.
 *
 *   POST /api/quizzes                    create a quiz (pending until the email is confirmed)
 *   POST /api/confirm                    confirm the email → quiz goes live for 7 days
 *   GET  /api/quizzes/:id                public quiz (title + questions)
 *   POST /api/quizzes/:id/responses      submit one set of answers
 *   GET  /api/quizzes/:id/results?key=   aggregated answers (creator only)
 *   GET  /health                         liveness check
 *
 * Configuration: environment variables, see README.md.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const HOUR = 3600 * 1000;
const PENDING_TTL = 48 * HOUR;
const ACTIVE_TTL = 7 * 24 * HOUR;
const CREATES_PER_IP_PER_HOUR = 5;
const MAX_BODY = 16 * 1024;

const LIMITS = { title: 120, question: 200, option: 100, questions: [1, 4], options: [2, 6], email: 254 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// ── App ──────────────────────────────────────

export function createApp(env = process.env) {
  const config = {
    siteOrigin: (env.SITE_ORIGIN || 'https://pablovolenski.com').replace(/\/+$/, ''),
    allowedOrigins: (env.ALLOWED_ORIGINS || 'https://pablovolenski.com,https://www.pablovolenski.com')
      .split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === '1',
    devShowConfirmLink: env.DEV_SHOW_CONFIRM_LINK === 'true',
  };
  const db = openDb(env.DB_PATH || './quiz.db');
  const mailer = createMailer(env);
  const rateLimits = new Map(); // ip → { hour, count }

  const handlers = { createQuiz, confirmQuiz, getQuiz, submitResponse, getResults };

  // Expired quizzes (and their answers, via ON DELETE CASCADE) are removed hourly;
  // every query also filters on expires_at, so nothing expired is ever served.
  const sweep = () => {
    db.prepare('DELETE FROM quizzes WHERE expires_at <= ?').run(Date.now());
    const hour = currentHour();
    for (const [ip, rl] of rateLimits) if (rl.hour !== hour) rateLimits.delete(ip);
  };
  sweep();
  const sweeper = setInterval(sweep, HOUR);
  sweeper.unref();

  const server = http.createServer(async (req, res) => {
    const cors = corsHeaders(req.headers.origin, config);
    if (req.method === 'OPTIONS') return send(res, 204, null, cors);
    try {
      const { status, body } = await route(req);
      send(res, status, body, cors);
    } catch (err) {
      if (err.status) return send(res, err.status, { error: err.message }, cors);
      console.error(err);
      send(res, 500, { error: 'Something went wrong. Please try again.' }, cors);
    }
  });
  server.on('close', () => { clearInterval(sweeper); db.close(); });
  server.db = db; // for tests
  return server;

  async function route(req) {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/\/+$/, '');
    const m = path.match(/^\/api\/quizzes\/([a-z0-9]+)(\/responses|\/results)?$/);

    if (path === '/health') return ok({ ok: true });
    if (path === '/api/quizzes' && req.method === 'POST') return handlers.createQuiz(req);
    if (path === '/api/confirm' && req.method === 'POST') return handlers.confirmQuiz(req);
    if (m && !m[2] && req.method === 'GET') return handlers.getQuiz(m[1]);
    if (m && m[2] === '/responses' && req.method === 'POST') return handlers.submitResponse(m[1], req);
    if (m && m[2] === '/results' && req.method === 'GET') return handlers.getResults(m[1], url.searchParams.get('key'));
    return fail(404, 'Not found');
  }

  // ── Handlers ───────────────────────────────

  async function createQuiz(req) {
    const body = await readJson(req);
    if (!body) return fail(400, 'Invalid request body.');

    // Honeypot: humans never see this field. Pretend success so bots learn nothing.
    if (body.website) return ok({ ok: true });

    const parsed = validateQuiz(body);
    if (parsed.error) return fail(400, parsed.error);

    const ip = clientIp(req);
    const hour = currentHour();
    const rl = rateLimits.get(ip);
    const count = rl && rl.hour === hour ? rl.count : 0;
    if (count >= CREATES_PER_IP_PER_HOUR) {
      return fail(429, 'Too many quizzes created from your network. Please try again in an hour.');
    }
    rateLimits.set(ip, { hour, count: count + 1 });

    const now = Date.now();
    const quiz = {
      id: randomId(10),
      ...parsed.quiz,
      adminKey: randomId(32),
      confirmToken: randomId(32),
    };
    db.prepare(`
      INSERT INTO quizzes (id, title, email, questions, admin_key, confirm_token, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(quiz.id, quiz.title, quiz.email, JSON.stringify(quiz.questions), quiz.adminKey, quiz.confirmToken,
      now, now + PENDING_TTL);

    const confirmUrl = `${config.siteOrigin}/quiz/?confirm=${quiz.confirmToken}`;
    await mailer.send({
      onError: () => db.prepare('DELETE FROM quizzes WHERE id = ?').run(quiz.id),
      to: quiz.email,
      subject: `Confirm your quiz: ${quiz.title}`,
      text:
        `Hi,\n\nsomeone (hopefully you) created the quiz "${quiz.title}" at pablovolenski.com/quiz.\n\n` +
        `Confirm your email address to publish it — the link is valid for 48 hours:\n${confirmUrl}\n\n` +
        `Once confirmed, the quiz stays online for 7 days.\n\nIf this wasn't you, just ignore this email.\n`,
    });

    const out = { ok: true };
    if (config.devShowConfirmLink) out.devConfirmUrl = confirmUrl;
    return ok(out, 201);
  }

  async function confirmQuiz(req) {
    const body = await readJson(req);
    const token = body && typeof body.token === 'string' ? body.token : '';
    const quiz = token && loadQuiz('confirm_token = ?', token);
    if (!quiz) return fail(404, 'This confirmation link is invalid or has expired.');

    // Clicking the link again just shows the links again.
    if (quiz.status === 'pending') {
      const now = Date.now();
      quiz.status = 'active';
      quiz.expiresAt = now + ACTIVE_TTL;
      db.prepare(`UPDATE quizzes SET status = 'active', confirmed_at = ?, expires_at = ? WHERE id = ?`)
        .run(now, quiz.expiresAt, quiz.id);

      const links = quizLinks(quiz);
      await mailer.send({
        to: quiz.email,
        subject: `Your quiz is live: ${quiz.title}`,
        text:
          `Your quiz "${quiz.title}" is live until ${new Date(quiz.expiresAt).toUTCString()}.\n\n` +
          `Share this link:\n${links.shareUrl}\n\n` +
          `See the results (keep this one private):\n${links.resultsUrl}\n`,
      });
    }

    return ok({ ok: true, title: quiz.title, expiresAt: quiz.expiresAt, ...quizLinks(quiz) });
  }

  function getQuiz(id) {
    const quiz = loadQuiz('id = ?', id);
    if (!quiz) return notFound();
    if (quiz.status !== 'active') return notActive();
    return ok(publicQuiz(quiz));
  }

  async function submitResponse(id, req) {
    const quiz = loadQuiz('id = ?', id);
    if (!quiz) return notFound();
    if (quiz.status !== 'active') return notActive();

    const body = await readJson(req);
    const answers = body && body.answers;
    const valid =
      Array.isArray(answers) &&
      answers.length === quiz.questions.length &&
      answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < quiz.questions[i].options.length);
    if (!valid) return fail(400, 'Please answer every question.');

    db.prepare('INSERT INTO responses (quiz_id, answers, created_at) VALUES (?, ?, ?)')
      .run(id, JSON.stringify(answers), Date.now());
    return ok({ ok: true }, 201);
  }

  function getResults(id, key) {
    const quiz = loadQuiz('id = ?', id);
    if (!quiz) return notFound();
    if (!key || !safeEqual(key, quiz.adminKey)) return fail(403, 'Invalid results link.');

    const counts = quiz.questions.map((q) => q.options.map(() => 0));
    const rows = db.prepare('SELECT answers FROM responses WHERE quiz_id = ?').all(id);
    for (const row of rows) {
      JSON.parse(row.answers).forEach((opt, qi) => {
        if (counts[qi] && counts[qi][opt] !== undefined) counts[qi][opt]++;
      });
    }

    return ok({
      ...publicQuiz(quiz),
      status: quiz.status,
      total: rows.length,
      questions: quiz.questions.map((q, qi) => ({
        text: q.text,
        options: q.options.map((label, oi) => ({ label, count: counts[qi][oi] })),
      })),
    });
  }

  // ── Helpers needing app state ──────────────

  function loadQuiz(where, value) {
    const row = db.prepare(`SELECT * FROM quizzes WHERE ${where} AND expires_at > ?`).get(value, Date.now());
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      email: row.email,
      questions: JSON.parse(row.questions),
      adminKey: row.admin_key,
      status: row.status,
      expiresAt: row.expires_at,
    };
  }

  function quizLinks(quiz) {
    return {
      shareUrl: `${config.siteOrigin}/quiz/?q=${quiz.id}`,
      resultsUrl: `${config.siteOrigin}/quiz/?r=${quiz.id}&k=${quiz.adminKey}`,
    };
  }

  function clientIp(req) {
    if (config.trustProxy) {
      const fwd = req.headers['x-forwarded-for'];
      // Last entry = added by our own proxy; earlier ones can be spoofed by the client.
      if (fwd) return String(fwd).split(',').at(-1).trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }
}

// ── Database ─────────────────────────────────

function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS quizzes (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      email         TEXT NOT NULL,
      questions     TEXT NOT NULL,              -- JSON [{ text, options: [..] }]
      admin_key     TEXT NOT NULL,
      confirm_token TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL,              -- 'pending' | 'active'
      created_at    INTEGER NOT NULL,
      confirmed_at  INTEGER,
      expires_at    INTEGER NOT NULL            -- ms; pending: +48h, active: +7d
    );
    CREATE INDEX IF NOT EXISTS quizzes_expires ON quizzes (expires_at);
    CREATE TABLE IF NOT EXISTS responses (
      id         INTEGER PRIMARY KEY,
      quiz_id    TEXT NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
      answers    TEXT NOT NULL,                 -- JSON [optionIndex, ...]
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS responses_quiz ON responses (quiz_id);
  `);
  return db;
}

// ── Email ────────────────────────────────────
// Until SMTP_HOST is set, mails are printed to stdout (journalctl / docker logs).

function createMailer(env) {
  if (!env.SMTP_HOST) {
    return {
      async send({ to, subject, text }) {
        console.log(`[email → ${to}] ${subject}\n${text}`);
      },
    };
  }
  let transport;
  return {
    async send({ to, subject, text, onError }) {
      if (!transport) {
        const { default: nodemailer } = await import('nodemailer');
        transport = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT) || 587,
          secure: env.SMTP_SECURE === 'true', // true for port 465, false for STARTTLS on 587
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        });
      }
      try {
        await transport.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to, subject, text });
      } catch (err) {
        console.error('SMTP send failed:', err);
        if (onError) onError();
        throw httpError(502, "We couldn't send the email right now. Please try again in a few minutes.");
      }
    },
  };
}

// ── Pure helpers ─────────────────────────────

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

function publicQuiz(quiz) {
  return { id: quiz.id, title: quiz.title, questions: quiz.questions, expiresAt: quiz.expiresAt };
}

function notFound() {
  return fail(404, 'This quiz does not exist or has expired.');
}

function notActive() {
  return fail(409, "This quiz hasn't been activated yet. The creator still needs to confirm their email.");
}

function ok(body, status = 200) {
  return { status, body };
}

function fail(status, error) {
  return { status, body: { error } };
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function currentHour() {
  return Math.floor(Date.now() / HOUR);
}

// Lowercase + digits, without look-alikes (0/o, 1/l). 32 symbols → no modulo bias.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
function randomId(len) {
  let out = '';
  for (const b of crypto.randomBytes(len)) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw httpError(413, 'Request too large.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

function corsHeaders(origin, config) {
  const allowed = origin && (config.allowedOrigins.includes(origin) || LOCAL_ORIGIN.test(origin));
  return allowed
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };
}

function send(res, status, body, headers) {
  res.writeHead(status, {
    ...headers,
    ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    'Cache-Control': 'no-store',
  });
  res.end(body ? JSON.stringify(body) : undefined);
}

// ── Start ────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => {
    console.log(`quiz-server listening on http://${host}:${port}` +
      (process.env.SMTP_HOST ? '' : ' (SMTP not configured — emails are logged)'));
  });
}
