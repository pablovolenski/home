/* ═══════════════════════════════════════════════
   PROJECT EVALUATOR — SCRIPT
   ─────────────────────────────────────────────
   SETUP: Replace the Firebase config values below
   with your own from console.firebase.google.com
   → Project Settings → Your apps → Web app
═══════════════════════════════════════════════ */

// ── A. Firebase Config ───────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};
// Set to false to run in offline/localStorage-only mode
const USE_FIREBASE = FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';

// ── B. Firebase Init ─────────────────────────
let db, fbAuth;
function initFirebase() {
  if (!USE_FIREBASE) return;
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db     = firebase.firestore();
    fbAuth = firebase.auth();
    db.enablePersistence().catch(() => {});
    fbAuth.onAuthStateChanged(handleAuthChange);
  } catch (e) {
    console.warn('Firebase init failed:', e.message);
  }
}

// ── C. State ─────────────────────────────────
const state = {
  user:            null,
  projects:        [],
  currentId:       null,
  currentProject:  null,
  isShared:        false,
  fsUnsubscribe:   null,
};
let currentEvidenceItem = null;
let authMode = 'signin'; // 'signin' | 'signup'

const STORAGE_KEY = 'evalProjects';

// ── D. Storage ───────────────────────────────
function lsLoad() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function lsSave(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function upsertProject(proj) {
  proj.lastSaved = Date.now();
  // Always keep localStorage copy
  const all = lsLoad();
  const idx = all.findIndex(p => p.id === proj.id);
  if (idx > -1) all[idx] = proj; else all.push(proj);
  lsSave(all);
  // Firestore if logged in
  if (db && state.user) {
    db.collection('users').doc(state.user.uid)
      .collection('projects').doc(proj.id)
      .set(proj).catch(console.warn);
  }
}

function removeProject(id) {
  lsSave(lsLoad().filter(p => p.id !== id));
  if (db && state.user) {
    db.collection('users').doc(state.user.uid)
      .collection('projects').doc(id)
      .delete().catch(console.warn);
  }
}

function setupFsListener(uid) {
  if (state.fsUnsubscribe) state.fsUnsubscribe();
  state.fsUnsubscribe = db.collection('users').doc(uid)
    .collection('projects')
    .orderBy('lastSaved', 'desc')
    .onSnapshot(snap => {
      state.projects = snap.docs.map(d => d.data());
      if (document.getElementById('listView').classList.contains('active')) renderList();
    }, console.warn);
}

function getProjects() {
  if (state.user && state.projects.length >= 0 && USE_FIREBASE) return state.projects;
  return lsLoad().sort((a, b) => b.lastSaved - a.lastSaved);
}

function blankProject() {
  return {
    id: Date.now().toString(),
    name: '', description: '',
    years: 5, interestRate: 10,
    investments: [], recurringExpenses: [],
    productionCosts: [], revenues: [],
    lastSaved: Date.now(),
  };
}

// ── E. Auth ──────────────────────────────────
function handleAuthChange(user) {
  state.user = user;
  if (user) {
    hideAuthModal();
    showUserPill(user);
    if (db) setupFsListener(user.uid);
  } else {
    hideUserPill();
  }
  renderList();
}

async function signInGoogle() {
  if (!fbAuth) return;
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await fbAuth.signInWithPopup(provider);
  } catch (e) { showAuthError(e.message); }
}

async function signInEmail(email, password) {
  if (!fbAuth) return;
  try {
    await fbAuth.signInWithEmailAndPassword(email, password);
  } catch (e) { showAuthError(friendlyAuthError(e.code)); }
}

async function signUpEmail(email, password, name) {
  if (!fbAuth) return;
  try {
    const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
    if (name) await cred.user.updateProfile({ displayName: name });
    handleAuthChange(cred.user);
  } catch (e) { showAuthError(friendlyAuthError(e.code)); }
}

async function signOutUser() {
  if (!fbAuth) return;
  if (state.fsUnsubscribe) { state.fsUnsubscribe(); state.fsUnsubscribe = null; }
  await fbAuth.signOut();
  state.user = null; state.projects = [];
  hideUserPill();
  renderList();
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':       'No account found with that email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/email-already-in-use': 'That email is already registered.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

function showAuthModal() {
  el('authModal').style.display = 'flex';
  el('authError').textContent = '';
}
function hideAuthModal() { el('authModal').style.display = 'none'; }

function showAuthError(msg) { el('authError').textContent = msg; }

function showUserPill(user) {
  const initials = (user.displayName || user.email || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  el('userAvatar').textContent = initials;
  el('ddName').textContent  = user.displayName || '';
  el('ddEmail').textContent = user.email || '';
  el('userPill').style.display = 'flex';
  el('btnShowAuth').style.display = 'none';
}
function hideUserPill() {
  el('userPill').style.display = 'none';
  el('btnShowAuth').style.display = USE_FIREBASE ? '' : 'none';
}

// ── F. Share ─────────────────────────────────
async function showShareModal() {
  if (!state.currentProject) return;
  el('shareModal').style.display = 'flex';
  el('shareUrlInput').value = '';
  el('shareCopied').style.display = 'none';

  if (!db) {
    el('shareUrlInput').value = 'Sign in and configure Firebase to enable sharing.';
    return;
  }
  try {
    const proj = state.currentProject;
    await db.collection('shares').doc(proj.id).set({
      ...JSON.parse(JSON.stringify(proj)),
      ownerUid: state.user?.uid || null,
      createdAt: Date.now(),
    });
    const url = `${location.origin}/evaluator/?s=${proj.id}`;
    el('shareUrlInput').value = url;
    updateMeta(proj.name || 'Project', proj.description || '', url);
  } catch (e) {
    el('shareUrlInput').value = 'Error generating link: ' + e.message;
  }
}

async function loadShare(shareId) {
  if (!db) { renderList(); showView('listView'); return; }
  try {
    const doc = await db.collection('shares').doc(shareId).get();
    if (!doc.exists) { alert('Shared project not found or link expired.'); renderList(); showView('listView'); return; }
    const proj = doc.data();
    state.currentProject = proj;
    state.currentId      = proj.id;
    state.isShared       = true;
    document.body.classList.add('readonly');
    el('sharedBanner').style.display = 'flex';
    if (state.user) el('btnClone').style.display = '';
    updateMeta(
      proj.name || 'Shared Project',
      `ROI analysis: ${proj.name || 'project'}. View the full financial evaluation.`,
      `${location.origin}/evaluator/?s=${shareId}`
    );
    el('navEdit').disabled    = false;
    el('navResults').disabled = false;
    renderEdit();
    renderResults();
    showView('resultsView');
  } catch (e) {
    alert('Could not load shared project: ' + e.message);
    renderList(); showView('listView');
  }
}

async function cloneProject() {
  if (!state.currentProject || !state.user) return;
  const clone = JSON.parse(JSON.stringify(state.currentProject));
  clone.id       = Date.now().toString();
  clone.name     = (clone.name || 'Project') + ' (copy)';
  clone.lastSaved = Date.now();
  upsertProject(clone);
  document.body.classList.remove('readonly');
  state.isShared = false;
  el('sharedBanner').style.display = 'none';
  state.currentId      = clone.id;
  state.currentProject = clone;
  renderEdit();
  showView('editView');
  alert('Project cloned to your account!');
}

function updateMeta(title, description, url) {
  document.title = (title ? title + ' | ' : '') + 'Project Evaluator';
  const setMeta = (id, val) => { const m = document.getElementById(id); if (m) m.setAttribute('content', val); };
  setMeta('ogTitle',       title + ' | Project Evaluator');
  setMeta('ogDescription', description);
  setMeta('ogUrl',         url || location.href);
}

// ── G. Calculations ──────────────────────────
function parseNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function calcTotalInvestment(proj) {
  return proj.investments.reduce((s, x) => s + parseNum(x.amount), 0);
}

function buildYearTable(proj) {
  const r    = parseNum(proj.interestRate) / 100;
  const yrs  = Math.max(1, parseInt(proj.years) || 1);
  let cumul  = -calcTotalInvestment(proj);
  return Array.from({ length: yrs }, (_, i) => {
    const t = i + 1;
    const g = item => Math.pow(1 + parseNum(item.growthRate) / 100, t - 1);
    const revenue   = proj.revenues.reduce((s, x) => s + parseNum(x.pricePerUnit) * parseNum(x.unitsPerYear) * g(x), 0);
    const prodCost  = proj.productionCosts.reduce((s, x) => s + parseNum(x.costPerUnit) * parseNum(x.unitsPerYear) * g(x), 0);
    const recurring = proj.recurringExpenses.reduce((s, x) => s + parseNum(x.amountPerYear) * g(x), 0);
    const netCF     = revenue - prodCost - recurring;
    cumul += netCF;
    return { t, revenue, prodCost, recurring, netCF, cumulCF: cumul, discountedCF: netCF / Math.pow(1 + r, t) };
  });
}

function calcNPV(proj) {
  return buildYearTable(proj).reduce((s, r) => s + r.discountedCF, 0) - calcTotalInvestment(proj);
}
function calcROI(proj) {
  const inv = calcTotalInvestment(proj);
  return inv ? calcNPV(proj) / inv * 100 : null;
}
function calcPaybackYear(proj) {
  return (buildYearTable(proj).find(r => r.cumulCF >= 0) || {}).t || null;
}
function calcScore(proj) {
  const roi = calcROI(proj);
  if (roi === null) return 0;
  if (roi >= 50)  return 95;
  if (roi >= 20)  return 75 + (roi - 20) * (20 / 30);
  if (roi >= 5)   return 50 + (roi - 5)  * (25 / 15);
  if (roi >= 0)   return 30 + roi * (20 / 5);
  return Math.max(0, 30 + roi);
}
function viabilityLabel(score) {
  if (score >= 85) return { label: 'Excellent', cls: 'excellent' };
  if (score >= 65) return { label: 'Good',      cls: 'good' };
  if (score >= 40) return { label: 'Marginal',  cls: 'marginal' };
  if (score >  0)  return { label: 'Risky',     cls: 'risky' };
  return                  { label: 'No Data',   cls: 'neutral' };
}
function roiBadge(proj) {
  const roi = calcROI(proj);
  if (roi === null) return { text: 'No data', cls: 'neutral' };
  const { cls } = viabilityLabel(calcScore(proj));
  return { text: (roi >= 0 ? '+' : '') + roi.toFixed(1) + '% ROI', cls };
}

// ── H. Formatters ────────────────────────────
function fmtCurrency(n) {
  const abs = Math.abs(n);
  let s = abs >= 1e9 ? (n/1e9).toFixed(1)+'B' : abs >= 1e6 ? (n/1e6).toFixed(1)+'M' : abs >= 1e3 ? (n/1e3).toFixed(0)+'K' : Math.round(n).toString();
  if (n < 0) s = s.replace('-','');
  return (n < 0 ? '-$' : '$') + s;
}
function fmtFull(n) {
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(n);
}
function fmtPct(n)  { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
function fmtDate(ms) {
  return new Date(parseInt(ms)).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function el(id) { return document.getElementById(id); }

// ── I. Navigation ─────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  el('navList').classList.toggle('active',    id === 'listView');
  el('navEdit').classList.toggle('active',    id === 'editView');
  el('navResults').classList.toggle('active', id === 'resultsView');
  const hasProj = !!state.currentId;
  el('btnNew').style.display      = id === 'listView' ? '' : 'none';
  el('btnDelete').style.display   = hasProj && id !== 'listView' ? '' : 'none';
  el('btnEvaluate').style.display = id === 'editView' ? '' : 'none';
  el('btnShare').style.display    = hasProj && id !== 'listView' && USE_FIREBASE ? '' : 'none';
}

function openProject(id) {
  const proj = getProjects().find(p => p.id === id);
  if (!proj) return;
  state.currentId      = id;
  state.currentProject = JSON.parse(JSON.stringify(proj));
  el('navEdit').disabled    = false;
  el('navResults').disabled = false;
  renderEdit();
  showView('editView');
}

function createProject() {
  state.currentProject = blankProject();
  state.currentId      = state.currentProject.id;
  el('navEdit').disabled    = false;
  el('navResults').disabled = false;
  upsertProject(state.currentProject);
  renderEdit();
  showView('editView');
  el('projName').focus();
}

function deleteCurrentProject() {
  if (!state.currentId || !confirm('Delete this project?')) return;
  removeProject(state.currentId);
  state.currentId = null; state.currentProject = null;
  el('navEdit').disabled    = true;
  el('navResults').disabled = true;
  renderList(); showView('listView');
}

// ── J. Render: List ───────────────────────────
function renderList() {
  const projects = getProjects();
  const grid  = el('projectGrid');
  const empty = el('emptyState');
  grid.innerHTML = '';
  empty.style.display = projects.length ? 'none' : 'block';
  projects.forEach((proj, i) => {
    const badge = roiBadge(proj);
    const card  = document.createElement('div');
    card.className = 'project-card fade-up';
    card.style.animationDelay = (i * 40) + 'ms';
    card.innerHTML = `
      <div class="card-top">
        <div class="card-name">${escHtml(proj.name || 'Untitled Project')}</div>
        <span class="roi-badge ${badge.cls}">${escHtml(badge.text)}</span>
      </div>
      <div class="card-desc">${escHtml(proj.description || 'No description.')}</div>
      <div class="card-footer">
        <div class="card-meta-chips">
          <span class="card-chip">${proj.years||'—'} yrs</span>
          <span class="card-chip">${proj.interestRate||'—'}% rate</span>
        </div>
        <span>${fmtDate(proj.lastSaved)}</span>
      </div>`;
    card.addEventListener('click', () => openProject(proj.id));
    grid.appendChild(card);
  });
}

// ── K. Render: Edit ───────────────────────────
function renderEdit() {
  const p = state.currentProject;
  el('projName').value  = p.name        || '';
  el('projDesc').value  = p.description || '';
  el('projYears').value = p.years       || 5;
  el('projRate').value  = p.interestRate || 10;
  renderSection('investment', p.investments);
  renderSection('recurring',  p.recurringExpenses);
  renderSection('production', p.productionCosts);
  renderSection('revenue',    p.revenues);
  updateCompletionRing();
}

function renderSection(type, items) {
  const cont = el('list' + capitalize(type));
  cont.innerHTML = '';
  items.forEach(item => cont.appendChild(buildRow(type, item)));
  updateSectionCount(type, items.length);
}

const SECTION_KEY = { investment:'investments', recurring:'recurringExpenses', production:'productionCosts', revenue:'revenues' };

const ROW_FIELDS = {
  investment: [
    { key:'name',         ph:'Item name',      type:'text'   },
    { key:'amount',       ph:'Amount ($)',      type:'number' },
  ],
  recurring: [
    { key:'name',         ph:'Expense name',   type:'text'   },
    { key:'amountPerYear',ph:'$/year',          type:'number' },
    { key:'growthRate',   ph:'Growth %',        type:'number' },
  ],
  production: [
    { key:'name',         ph:'Cost name',       type:'text'   },
    { key:'costPerUnit',  ph:'$/unit',           type:'number' },
    { key:'unitsPerYear', ph:'Units/yr',         type:'number' },
    { key:'growthRate',   ph:'Growth %',         type:'number' },
  ],
  revenue: [
    { key:'name',         ph:'Revenue source',  type:'text'   },
    { key:'pricePerUnit', ph:'$/unit',           type:'number' },
    { key:'unitsPerYear', ph:'Units/yr',         type:'number' },
    { key:'growthRate',   ph:'Growth %',         type:'number' },
  ],
};

function buildRow(type, item) {
  const row = document.createElement('div');
  row.className = `line-item ${type}-row`;
  row.dataset.itemId = item.id;

  ROW_FIELDS[type].forEach(cfg => {
    const inp = document.createElement('input');
    inp.type        = cfg.type;
    inp.className   = 'li-input';
    inp.placeholder = cfg.ph;
    inp.value       = item[cfg.key] != null ? item[cfg.key] : '';
    if (cfg.type === 'number') { inp.min = '0'; inp.step = 'any'; }
    inp.addEventListener('input', () => {
      item[cfg.key] = cfg.type === 'number' ? parseFloat(inp.value)||0 : inp.value;
      autoSave(); updateCompletionRing();
    });
    row.appendChild(inp);
  });

  // Evidence button
  const evBtn = document.createElement('button');
  const evCount = (item.evidence || []).length;
  evBtn.className = 'ev-btn' + (evCount ? ' has-evidence' : '');
  evBtn.textContent = evCount || '+';
  evBtn.title = 'Add backing / evidence';
  evBtn.addEventListener('click', e => { e.stopPropagation(); openEvidencePopover(item, evBtn); });
  row.appendChild(evBtn);

  // Delete button
  const del = document.createElement('button');
  del.className = 'del-btn';
  del.innerHTML = '&times;';
  del.addEventListener('click', () => {
    del.closest('.line-item').animate(
      [{ opacity:1, transform:'scaleY(1)' }, { opacity:0, transform:'scaleY(0)' }],
      { duration:150, fill:'forwards' }
    ).onfinish = () => {
      state.currentProject[SECTION_KEY[type]] = state.currentProject[SECTION_KEY[type]].filter(i => i.id !== item.id);
      renderSection(type, state.currentProject[SECTION_KEY[type]]);
      updateCompletionRing(); autoSave();
    };
  });
  row.appendChild(del);
  return row;
}

function addItem(type) {
  const defs = {
    investment: { name:'', amount:0 },
    recurring:  { name:'', amountPerYear:0, growthRate:0 },
    production: { name:'', costPerUnit:0, unitsPerYear:0, growthRate:0 },
    revenue:    { name:'', pricePerUnit:0, unitsPerYear:0, growthRate:0 },
  };
  const item = { id: Date.now().toString(), evidence:[], ...defs[type] };
  state.currentProject[SECTION_KEY[type]].push(item);
  const cont = el('list' + capitalize(type));
  const row  = buildRow(type, item);
  cont.appendChild(row);
  row.querySelector('.li-input').focus();
  updateSectionCount(type, state.currentProject[SECTION_KEY[type]].length);
  updateCompletionRing(); autoSave();
}

function updateSectionCount(type, n) {
  const e = el('cnt' + capitalize(type));
  if (e) e.textContent = n + (n === 1 ? ' item' : ' items');
}

function updateCompletionRing() {
  const p = state.currentProject;
  let filled = 0;
  if (p.name?.trim())        filled++;
  if (p.investments.length)  filled++;
  if (p.revenues.length)     filled++;
  if (p.recurringExpenses.length || p.productionCosts.length) filled++;
  const pct  = Math.round(filled / 4 * 100);
  const circ = 2 * Math.PI * 14;
  const ring = el('completionRing');
  if (ring) {
    ring.style.strokeDasharray  = circ + ' ' + circ;
    ring.style.strokeDashoffset = circ - (pct / 100) * circ;
    ring.style.stroke = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--orange)' : 'var(--indigo)';
  }
  const pctEl = el('completionPct');
  if (pctEl) pctEl.textContent = pct + '%';
}

// ── L. Evidence ───────────────────────────────
function openEvidencePopover(item, anchorEl) {
  currentEvidenceItem = item;
  if (!item.evidence) item.evidence = [];
  el('epForm').style.display = 'none';
  renderEvidenceItems();

  const popover = el('evidencePopover');
  popover.style.display = 'block';

  // Position near the anchor
  const rect   = anchorEl.getBoundingClientRect();
  const pw     = 270;
  const ph     = popover.offsetHeight || 200;
  let top  = rect.bottom + 6 + window.scrollY;
  let left = rect.right - pw + window.scrollX;
  if (left < 8) left = 8;
  if (top + ph > window.innerHeight + window.scrollY - 8) {
    top = rect.top - ph - 6 + window.scrollY;
  }
  popover.style.top  = top + 'px';
  popover.style.left = left + 'px';
}

function closeEvidencePopover() {
  el('evidencePopover').style.display = 'none';
  currentEvidenceItem = null;
}

function renderEvidenceItems() {
  const list = el('epItems');
  list.innerHTML = '';
  if (!currentEvidenceItem?.evidence?.length) return;

  const divider = document.createElement('div');
  divider.className = 'ep-divider';
  list.appendChild(divider);

  currentEvidenceItem.evidence.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'ep-item';

    const icons = { note:'✏️', link:'🔗', image:'🖼', file:'📎' };
    const icon  = document.createElement('span');
    icon.className   = 'ep-item-icon';
    icon.textContent = icons[ev.type] || '📎';

    const content = document.createElement('div');
    content.className = 'ep-item-content';

    if (ev.type === 'note') {
      content.textContent = ev.text;
    } else if (ev.type === 'link') {
      const a = document.createElement('a');
      a.href   = ev.url;
      a.target = '_blank';
      a.rel    = 'noopener noreferrer';
      a.textContent = ev.label || ev.url;
      content.appendChild(a);
    } else if (ev.type === 'image') {
      content.textContent = ev.name;
      if (ev.dataUrl) {
        const img  = document.createElement('img');
        img.src    = ev.dataUrl;
        img.className = 'ep-item-thumb';
        img.addEventListener('click', () => window.open(ev.dataUrl, '_blank'));
        content.appendChild(img);
      }
    } else if (ev.type === 'file') {
      const a = document.createElement('a');
      a.href     = ev.dataUrl;
      a.download = ev.name;
      a.textContent = ev.name;
      content.appendChild(a);
    }

    const del = document.createElement('button');
    del.className   = 'ep-item-del';
    del.textContent = '×';
    del.addEventListener('click', () => removeEvidence(ev.id));

    item.append(icon, content, del);
    list.appendChild(item);
  });
}

function showEvidenceForm(type) {
  const form = el('epForm');
  form.innerHTML = '';
  form.style.display = 'block';

  const makeBtn = (label, cls, handler) => {
    const b = document.createElement('button');
    b.textContent = label; b.className = cls;
    b.type = 'button';
    b.addEventListener('click', handler);
    return b;
  };

  if (type === 'note') {
    const ta = document.createElement('textarea');
    ta.placeholder = 'Add a note or comment…';
    const row = document.createElement('div');
    row.className = 'ep-form-row';
    row.append(
      makeBtn('Cancel', 'ep-cancel-btn', () => { form.style.display='none'; }),
      makeBtn('Save',   'ep-save-btn',   () => {
        if (!ta.value.trim()) return;
        saveEvidence('note', { text: ta.value.trim() });
        form.style.display = 'none';
      })
    );
    form.append(ta, row);
    ta.focus();
  } else if (type === 'link') {
    const urlInp = document.createElement('input');
    urlInp.type = 'url'; urlInp.placeholder = 'https://…';
    const lblInp = document.createElement('input');
    lblInp.type = 'text'; lblInp.placeholder = 'Label (optional)';
    const row = document.createElement('div');
    row.className = 'ep-form-row';
    row.append(
      makeBtn('Cancel', 'ep-cancel-btn', () => { form.style.display='none'; }),
      makeBtn('Save',   'ep-save-btn',   () => {
        if (!urlInp.value.trim()) return;
        saveEvidence('link', { url: urlInp.value.trim(), label: lblInp.value.trim() || urlInp.value.trim() });
        form.style.display = 'none';
      })
    );
    form.append(urlInp, lblInp, row);
    urlInp.focus();
  } else {
    // image or file
    const accept = type === 'image' ? 'image/*' : 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv';
    const lbl = document.createElement('label');
    lbl.className = 'ep-file-label';
    lbl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> Choose ${type}…`;
    const fileInp = document.createElement('input');
    fileInp.type = 'file'; fileInp.accept = accept; fileInp.style.display = 'none';
    lbl.appendChild(fileInp);
    fileInp.addEventListener('change', () => {
      const file = fileInp.files[0];
      if (!file) return;
      if (file.size > 512000) {
        alert('File is too large. Please keep evidence files under 500 KB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = e => {
        saveEvidence(type, { dataUrl: e.target.result, name: file.name, size: file.size });
        form.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });
    const row = document.createElement('div');
    row.className = 'ep-form-row';
    row.appendChild(makeBtn('Cancel', 'ep-cancel-btn', () => { form.style.display='none'; }));
    form.append(lbl, row);
    fileInp.click();
  }
}

function saveEvidence(type, data) {
  if (!currentEvidenceItem) return;
  if (!currentEvidenceItem.evidence) currentEvidenceItem.evidence = [];
  currentEvidenceItem.evidence.push({ id: Date.now().toString(), type, ...data });
  updateEvBtn();
  renderEvidenceItems();
  autoSave();
}

function removeEvidence(evidenceId) {
  if (!currentEvidenceItem) return;
  currentEvidenceItem.evidence = currentEvidenceItem.evidence.filter(e => e.id !== evidenceId);
  updateEvBtn();
  renderEvidenceItems();
  autoSave();
}

function updateEvBtn() {
  if (!currentEvidenceItem) return;
  const row = document.querySelector(`.line-item[data-item-id="${currentEvidenceItem.id}"]`);
  if (!row) return;
  const btn   = row.querySelector('.ev-btn');
  const count = (currentEvidenceItem.evidence || []).length;
  btn.textContent = count || '+';
  btn.classList.toggle('has-evidence', !!count);
}

// ── M. Render: Results ────────────────────────
function renderResults() {
  const proj  = state.currentProject;
  const inv   = calcTotalInvestment(proj);
  const npv   = calcNPV(proj);
  const roi   = calcROI(proj);
  const pb    = calcPaybackYear(proj);
  const rows  = buildYearTable(proj);
  const score = calcScore(proj);
  const vib   = viabilityLabel(score);

  // Score ring
  const arc  = el('scoreArc');
  const circ = 2 * Math.PI * 50;
  setTimeout(() => {
    arc.style.strokeDasharray  = circ + ' ' + circ;
    arc.style.strokeDashoffset = circ - (score / 100) * circ;
    arc.style.stroke = score >= 65 ? 'var(--green)' : score >= 40 ? 'var(--orange)' : 'var(--red)';
  }, 80);
  animateCount(el('scoreNumber'), 0, Math.round(score), 900, v => Math.round(v));

  el('viabilityBadge').textContent = vib.label;
  el('viabilityBadge').className   = 'viability-badge ' + vib.cls;
  el('resultsProjName').textContent = proj.name || 'Untitled Project';
  el('resultsProjDesc').textContent = proj.description || '';
  el('rChipYears').textContent = (proj.years||'—') + ' years';
  el('rChipRate').textContent  = (proj.interestRate||'—') + '% rate';

  const kpis = [
    { id:'kpiInvestment', val:inv,             fmt:fmtFull,  neg:false },
    { id:'kpiCashflow',   val:rows[0]?.netCF||0, fmt:fmtFull, neg:(rows[0]?.netCF||0)<0 },
    { id:'kpiNpv',        val:npv,             fmt:fmtFull,  neg:npv<0 },
    { id:'kpiRoi',        val:roi,             fmt:v=>(v>=0?'+':'')+v.toFixed(1)+'%', neg:roi!==null&&roi<0 },
  ];
  kpis.forEach(({ id, val, fmt, neg }, i) => {
    setTimeout(() => {
      const card = el(id);
      card.classList.add('revealed');
      const valEl = card.querySelector('.kpi-value');
      if (val !== null) {
        animateCount(valEl, 0, val, 700, fmt);
        valEl.className = 'kpi-value ' + (neg ? 'negative' : 'positive');
      } else {
        valEl.textContent = 'N/A';
        valEl.className   = 'kpi-value';
      }
    }, 100 + i * 80);
  });

  setTimeout(() => {
    const card = el('kpiPayback');
    card.classList.add('revealed');
    const v = card.querySelector('.kpi-value');
    v.textContent = pb !== null ? pb + (pb===1?' year':' years') : 'Never';
    v.className   = 'kpi-value ' + (pb !== null ? 'positive' : 'negative');
  }, 480);

  renderBarChart(rows, inv);
  renderTable(rows, pb);
}

function renderBarChart(rows, totalInvestment) {
  const chart = el('barChart');
  chart.innerHTML = '';

  // Prepend year 0 (investment outflow)
  const allBars = [
    { label: 'Invest.', netCF: -totalInvestment, isYear0: true },
    ...rows.map(r => ({ label: 'Yr ' + r.t, netCF: r.netCF, isYear0: false })),
  ];

  const maxAbs = Math.max(...allBars.map(r => Math.abs(r.netCF)), 1);

  allBars.forEach((r, i) => {
    const pct   = Math.min(Math.abs(r.netCF) / maxAbs * 100, 100);
    const isPos = r.netCF >= 0;
    const div   = document.createElement('div');
    div.className = 'bar-row' + (r.isYear0 ? ' year-zero' : '');
    div.innerHTML = `
      <span class="bar-yr-label">${r.label}</span>
      <div class="bar-track">
        <div class="bar-fill ${isPos ? 'pos' : 'neg'}" style="width:0%" data-pct="${pct.toFixed(1)}"></div>
      </div>
      <span class="bar-amount">${fmtCurrency(r.netCF)}</span>`;
    chart.appendChild(div);
    setTimeout(() => {
      div.querySelector('.bar-fill').style.width = pct.toFixed(1) + '%';
    }, 200 + i * 35);
  });
}

function renderTable(rows, paybackYear) {
  const tbody = el('cfBody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    if (r.t === paybackYear) tr.className = 'payback-row';
    tr.innerHTML = `
      <td>${r.t}</td>
      <td>${fmtFull(r.revenue)}</td>
      <td>${fmtFull(r.prodCost)}</td>
      <td>${fmtFull(r.recurring)}</td>
      <td class="${r.netCF>=0?'pos':'neg'}">${fmtFull(r.netCF)}</td>
      <td class="${r.cumulCF>=0?'pos':'neg'}">${fmtFull(r.cumulCF)}</td>
      <td class="${r.discountedCF>=0?'pos':'neg'}">${fmtFull(r.discountedCF)}</td>`;
    tbody.appendChild(tr);
  });
}

// ── N. Auto-save ─────────────────────────────
let saveTimer = null;
function autoSave() {
  if (!state.currentProject) return;
  state.currentProject.name         = el('projName').value.trim();
  state.currentProject.description  = el('projDesc').value;
  state.currentProject.years        = Math.max(1, parseInt(el('projYears').value)||1);
  state.currentProject.interestRate = parseFloat(el('projRate').value)||0;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { upsertProject(state.currentProject); showSaveBadge(); }, 500);
}

function showSaveBadge() {
  const b = el('saveBadge');
  b.classList.add('visible');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('visible'), 2200);
}

// ── O. Count-up animation ────────────────────
function animateCount(el2, from, to, duration, fmt) {
  if (to === null || isNaN(to)) { el2.textContent = fmt ? fmt(0) : '—'; return; }
  const start = performance.now();
  const diff  = to - from;
  (function step(now) {
    const t    = Math.min((now - start) / duration, 1);
    const ease = t < .5 ? 2*t*t : -1+(4-2*t)*t;
    el2.textContent = fmt ? fmt(from + diff * ease) : Math.round(from + diff * ease);
    if (t < 1) requestAnimationFrame(step);
  })(start);
}

// ── P. Event Wiring ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();

  // Hide Firebase-dependent UI if not configured
  if (!USE_FIREBASE) {
    el('btnShowAuth').style.display = 'none';
    el('btnShare').style.display    = 'none';
  }

  // Check for shared project URL param
  const params   = new URLSearchParams(location.search);
  const shareId  = params.get('s');
  if (shareId) {
    loadShare(shareId);
  } else {
    renderList();
    showView('listView');
  }

  // Nav tabs
  el('navList').addEventListener('click', () => {
    if (state.currentProject) upsertProject(state.currentProject);
    renderList(); showView('listView');
  });
  el('navEdit').addEventListener('click', () => {
    if (state.currentId) showView('editView');
  });
  el('navResults').addEventListener('click', () => {
    if (state.currentProject) { renderResults(); showView('resultsView'); }
  });

  // Action buttons
  el('btnNew').addEventListener('click', createProject);
  el('btnNewEmpty').addEventListener('click', createProject);
  el('btnDelete').addEventListener('click', deleteCurrentProject);
  el('btnEvaluate').addEventListener('click', () => {
    if (!state.currentProject) return;
    upsertProject(state.currentProject);
    renderResults(); showView('resultsView');
  });
  el('btnShare').addEventListener('click', showShareModal);

  // Edit header auto-save
  ['projName','projDesc','projYears','projRate'].forEach(id => {
    el(id).addEventListener('input', () => { autoSave(); updateCompletionRing(); });
  });

  // Section collapsible headers
  document.querySelectorAll('.section-header').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.section').classList.toggle('collapsed'));
  });

  // Add-item buttons
  document.querySelectorAll('.add-row-btn').forEach(btn => {
    btn.addEventListener('click', () => addItem(btn.dataset.list));
  });

  // Auth modal
  el('btnShowAuth').addEventListener('click', showAuthModal);
  el('btnGoogle').addEventListener('click', signInGoogle);
  el('btnAuthSkip').addEventListener('click', hideAuthModal);

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      authMode = tab.dataset.tab;
      el('btnAuthSubmit').textContent = authMode === 'signup' ? 'Create Account' : 'Sign in';
      el('authName').style.display    = authMode === 'signup' ? '' : 'none';
      el('authError').textContent     = '';
    });
  });

  el('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = el('authEmail').value.trim();
    const pass  = el('authPassword').value;
    if (authMode === 'signup') {
      await signUpEmail(email, pass, el('authName').value.trim());
    } else {
      await signInEmail(email, pass);
    }
  });

  // User pill / sign out
  el('userAvatar').addEventListener('click', e => {
    e.stopPropagation();
    const dd = el('userDropdown');
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  });
  el('btnSignOut').addEventListener('click', signOutUser);
  document.addEventListener('click', e => {
    if (!el('userPill').contains(e.target)) el('userDropdown').style.display = 'none';
  });

  // Share modal
  el('closeShare').addEventListener('click', () => el('shareModal').style.display = 'none');
  el('btnCopyLink').addEventListener('click', () => {
    const url = el('shareUrlInput').value;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      el('shareCopied').style.display = 'block';
      setTimeout(() => el('shareCopied').style.display = 'none', 2500);
    });
  });

  // Clone shared project
  el('btnClone').addEventListener('click', cloneProject);

  // Evidence popover — type buttons
  document.querySelectorAll('.ep-type-btn').forEach(btn => {
    btn.addEventListener('click', () => showEvidenceForm(btn.dataset.type));
  });

  // Close evidence popover on outside click
  document.addEventListener('click', e => {
    const pop = el('evidencePopover');
    if (pop.style.display !== 'none' && !pop.contains(e.target) && !e.target.classList.contains('ev-btn')) {
      closeEvidencePopover();
    }
  });

  // Close modals on overlay click
  el('authModal').addEventListener('click',  e => { if (e.target === el('authModal'))  hideAuthModal(); });
  el('shareModal').addEventListener('click', e => { if (e.target === el('shareModal')) el('shareModal').style.display = 'none'; });
});
