/* ─────────────────────────────────────────────
   Quick Quiz: create / confirm / take / results
   One page, with the view picked by the query string:
     /quiz/                      create
     /quiz/?confirm=<token>      email confirmation
     /quiz/?q=<id>               take the quiz (one question per page, same URL)
     /quiz/?r=<id>&k=<key>       results (creator only)

   SETUP: set QUIZ_API to your Worker URL (infra/quiz-worker/README.md).
   ───────────────────────────────────────────── */

// ── A. Config ────────────────────────────────
const QUIZ_API_PROD = 'YOUR_WORKER_URL'; // e.g. https://pv-quiz.<subdomain>.workers.dev
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const QUIZ_API = (IS_LOCAL ? 'http://localhost:8787' : QUIZ_API_PROD).replace(/\/+$/, '');
const API_READY = IS_LOCAL || QUIZ_API_PROD !== 'YOUR_WORKER_URL';

const MAX_QUESTIONS = 4;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

// ── B. Helpers ───────────────────────────────
const el = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'class') node.className = v;
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== false && c != null) node.append(c);
  return node;
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(QUIZ_API + path, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

function showError(id, message) {
  const node = el(id);
  node.textContent = message;
  node.hidden = !message;
}

function show(viewId) {
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== viewId));
}

function noindex() {
  document.head.append(h('meta', { name: 'robots', content: 'noindex' }));
}

function formatDate(ms) {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const input = el(btn.dataset.copy);
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  const label = btn.textContent;
  btn.textContent = 'Copied';
  setTimeout(() => (btn.textContent = label), 1500);
});

// ── C. Create ────────────────────────────────
const draft = { questions: [] };

function newQuestion() {
  return { text: '', options: ['', ''] };
}

function renderQuestions() {
  const wrap = el('questions');
  wrap.replaceChildren(
    ...draft.questions.map((q, qi) =>
      h('fieldset', { class: 'question' },
        h('div', { class: 'question-head' },
          h('legend', {}, `Question ${qi + 1}`),
          draft.questions.length > 1 &&
            h('button', {
              type: 'button', class: 'icon-btn', title: 'Remove question', 'aria-label': `Remove question ${qi + 1}`,
              on: { click: () => { draft.questions.splice(qi, 1); renderQuestions(); } },
            }, '×'),
        ),
        h('input', {
          type: 'text', maxlength: 200, placeholder: 'Your question', value: q.text, 'aria-label': `Question ${qi + 1}`,
          on: { input: (e) => (q.text = e.target.value) },
        }),
        h('div', { class: 'option-list' },
          q.options.map((opt, oi) =>
            h('div', { class: 'option-row' },
              h('span', { class: 'bullet' }, String.fromCharCode(65 + oi)),
              h('input', {
                type: 'text', maxlength: 100, placeholder: `Option ${oi + 1}`, value: opt,
                'aria-label': `Question ${qi + 1}, option ${oi + 1}`,
                on: { input: (e) => (q.options[oi] = e.target.value) },
              }),
              q.options.length > MIN_OPTIONS &&
                h('button', {
                  type: 'button', class: 'icon-btn', title: 'Remove option', 'aria-label': `Remove option ${oi + 1}`,
                  on: { click: () => { q.options.splice(oi, 1); renderQuestions(); } },
                }, '×'),
            ),
          ),
        ),
        q.options.length < MAX_OPTIONS &&
          h('button', {
            type: 'button', class: 'link-btn',
            on: { click: () => { q.options.push(''); renderQuestions(); focusLast(qi); } },
          }, '+ Add option'),
      ),
    ),
  );
  el('btnAddQuestion').hidden = draft.questions.length >= MAX_QUESTIONS;
}

function focusLast(qi) {
  const inputs = el('questions').children[qi].querySelectorAll('.option-row input');
  inputs[inputs.length - 1].focus();
}

function initCreate() {
  show('viewCreate');
  draft.questions = [newQuestion()];
  renderQuestions();

  el('btnAddQuestion').addEventListener('click', () => {
    if (draft.questions.length >= MAX_QUESTIONS) return;
    draft.questions.push(newQuestion());
    renderQuestions();
    el('questions').lastElementChild.querySelector('input').focus();
  });

  el('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('createError', '');

    const payload = {
      title: el('quizTitle').value.trim(),
      email: el('quizEmail').value.trim(),
      website: el('quizWebsite').value,
      questions: draft.questions.map((q) => ({
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()).filter(Boolean),
      })),
    };

    const problem = checkDraft(payload);
    if (problem) return showError('createError', problem);

    const btn = el('btnCreate');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    try {
      const data = await api('/api/quizzes', { method: 'POST', body: JSON.stringify(payload) });
      el('sentEmail').textContent = payload.email;
      if (data.devConfirmUrl) {
        // Keep the dev link on this origin (the Worker builds it from SITE_ORIGIN).
        const token = new URL(data.devConfirmUrl).searchParams.get('confirm');
        el('devConfirmLink').href = `${location.pathname}?confirm=${encodeURIComponent(token)}`;
        el('devConfirm').hidden = false;
      }
      show('viewSent');
      window.scrollTo(0, 0);
    } catch (err) {
      showError('createError', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create quiz';
    }
  });
}

// Mirrors the server's validation so people get instant feedback.
function checkDraft(p) {
  if (!p.title) return 'Please give your quiz a title.';
  for (const [i, q] of p.questions.entries()) {
    if (!q.text) return `Question ${i + 1} is empty.`;
    if (q.options.length < MIN_OPTIONS) return `Question ${i + 1} needs at least ${MIN_OPTIONS} options.`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return 'Please enter a valid email address.';
  return '';
}

// ── D. Confirm ───────────────────────────────
async function initConfirm(token) {
  show('viewConfirm');
  noindex();
  try {
    const data = await api('/api/confirm', { method: 'POST', body: JSON.stringify({ token }) });
    el('confirmTitle').textContent = data.title;
    el('confirmExpires').textContent = formatDate(data.expiresAt);
    el('shareUrl').value = localize(data.shareUrl);
    el('resultsUrl').value = localize(data.resultsUrl);
    el('confirmDone').hidden = false;
  } catch (err) {
    showError('confirmError', err.message);
  } finally {
    el('confirmLoading').hidden = true;
  }
}

// When testing locally the Worker still builds production links; point them here instead.
function localize(url) {
  if (!IS_LOCAL) return url;
  const u = new URL(url);
  return location.origin + location.pathname + u.search;
}

// ── E. Take ──────────────────────────────────
const take = { quiz: null, step: 0, answers: [] };

async function initTake(id) {
  show('viewTake');
  noindex();
  const doneKey = `quiz-answered:${id}`;
  try {
    take.quiz = await api(`/api/quizzes/${encodeURIComponent(id)}`);
    document.title = `${take.quiz.title} — Quick Quiz`;
    if (storageGet(doneKey)) {
      el('takeDone').hidden = false;
      el('takeDone').querySelector('.lead').textContent = "You've already answered this quiz. Thanks!";
      return;
    }
    take.answers = take.quiz.questions.map(() => null);
    el('takeTitle').textContent = take.quiz.title;
    el('takeQuiz').hidden = false;
    renderStep();
  } catch (err) {
    showError('takeMissing', err.message);
  } finally {
    el('takeLoading').hidden = true;
  }

  el('btnBack').addEventListener('click', () => {
    if (take.step > 0) { take.step--; renderStep(); }
  });

  el('btnNext').addEventListener('click', async () => {
    const last = take.step === take.quiz.questions.length - 1;
    if (!last) { take.step++; renderStep(); return; }

    const btn = el('btnNext');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    showError('takeError', '');
    try {
      await api(`/api/quizzes/${encodeURIComponent(id)}/responses`, {
        method: 'POST',
        body: JSON.stringify({ answers: take.answers }),
      });
      storageSet(doneKey, '1');
      el('takeQuiz').hidden = true;
      el('takeDone').hidden = false;
    } catch (err) {
      showError('takeError', err.message);
      btn.disabled = false;
      btn.textContent = 'Submit';
    }
  });
}

function renderStep() {
  const { quiz, step, answers } = take;
  const total = quiz.questions.length;
  const q = quiz.questions[step];

  el('takeStep').textContent = `Question ${step + 1} of ${total}`;
  el('takeBar').style.width = `${((step + 1) / total) * 100}%`;
  el('takeQuestion').textContent = q.text;
  el('takeOptions').replaceChildren(
    ...q.options.map((label, oi) =>
      h('button', {
        type: 'button', role: 'radio', class: 'option' + (answers[step] === oi ? ' selected' : ''),
        'aria-checked': answers[step] === oi ? 'true' : 'false',
        on: { click: () => { answers[step] = oi; renderStep(); } },
      },
        h('span', { class: 'bullet' }, String.fromCharCode(65 + oi)),
        h('span', {}, label),
      ),
    ),
  );

  el('btnBack').style.visibility = step === 0 ? 'hidden' : 'visible';
  const next = el('btnNext');
  next.textContent = step === total - 1 ? 'Submit' : 'Next';
  next.disabled = answers[step] === null;
  showError('takeError', '');
}

// ── F. Results ───────────────────────────────
async function initResults(id, key) {
  show('viewResults');
  noindex();
  el('btnRefresh').addEventListener('click', () => loadResults(id, key));
  await loadResults(id, key);
}

async function loadResults(id, key) {
  showError('resultsError', '');
  try {
    const data = await api(`/api/quizzes/${encodeURIComponent(id)}/results?key=${encodeURIComponent(key)}`);
    document.title = `Results: ${data.title} — Quick Quiz`;
    el('resultsTitle').textContent = data.title;
    el('resultsTotal').textContent = `${data.total} ${data.total === 1 ? 'response' : 'responses'}`;
    el('resultsExpires').textContent = data.expiresAt ? formatDate(data.expiresAt) : '—';
    el('resultsShareUrl').value = `${location.origin}${location.pathname}?q=${data.id}`;
    el('resultsList').replaceChildren(
      ...data.questions.map((q, qi) => {
        const max = Math.max(...q.options.map((o) => o.count));
        return h('div', { class: 'result' },
          h('h2', {}, `${qi + 1}. ${q.text}`),
          q.options.map((o) => {
            const pct = data.total ? Math.round((o.count / data.total) * 100) : 0;
            return h('div', { class: 'bar-row' + (o.count && o.count === max ? ' top' : '') },
              h('div', { class: 'bar-label' },
                h('span', {}, o.label),
                h('span', { class: 'bar-num' }, `${o.count} · ${pct}%`),
              ),
              h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${pct}%` })),
            );
          }),
        );
      }),
    );
    el('resultsBody').hidden = false;
  } catch (err) {
    showError('resultsError', err.message);
  } finally {
    el('resultsLoading').hidden = true;
  }
}

// ── G. Boot ──────────────────────────────────
(function boot() {
  const params = new URLSearchParams(location.search);
  if (!API_READY) el('configNotice').hidden = false;

  if (params.get('confirm')) return initConfirm(params.get('confirm'));
  if (params.get('q')) return initTake(params.get('q'));
  if (params.get('r')) return initResults(params.get('r'), params.get('k') || '');
  initCreate();
})();
