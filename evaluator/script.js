/* ═══════════════════════════════════════════════
   PROJECT EVALUATOR — SCRIPT
═══════════════════════════════════════════════ */

// ── A. Constants & State ─────────────────────
const STORAGE_KEY = 'evalProjects';

const state = {
  projects: [],
  currentId: null,
  currentProject: null,
};

// ── B. Storage ───────────────────────────────
function loadProjects() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function persistProjects(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function upsertProject(proj) {
  const all = loadProjects();
  const idx = all.findIndex(p => p.id === proj.id);
  proj.lastSaved = Date.now();
  if (idx > -1) all[idx] = proj;
  else all.push(proj);
  persistProjects(all);
}

function removeProject(id) {
  persistProjects(loadProjects().filter(p => p.id !== id));
}

function blankProject() {
  return {
    id: Date.now().toString(),
    name: '',
    description: '',
    years: 5,
    interestRate: 10,
    investments: [],
    recurringExpenses: [],
    productionCosts: [],
    revenues: [],
    lastSaved: Date.now(),
  };
}

// ── C. Calculations ──────────────────────────
function calcTotalInvestment(proj) {
  return proj.investments.reduce((s, x) => s + (parseNum(x.amount)), 0);
}

function buildYearTable(proj) {
  const r    = (parseNum(proj.interestRate)) / 100;
  const yrs  = Math.max(1, parseInt(proj.years) || 1);
  let cumul  = -calcTotalInvestment(proj);
  const rows = [];

  for (let t = 1; t <= yrs; t++) {
    const g = item => Math.pow(1 + (parseNum(item.growthRate)) / 100, t - 1);

    const revenue   = proj.revenues.reduce(
      (s, x) => s + parseNum(x.pricePerUnit) * parseNum(x.unitsPerYear) * g(x), 0);
    const prodCost  = proj.productionCosts.reduce(
      (s, x) => s + parseNum(x.costPerUnit) * parseNum(x.unitsPerYear) * g(x), 0);
    const recurring = proj.recurringExpenses.reduce(
      (s, x) => s + parseNum(x.amountPerYear) * g(x), 0);
    const netCF     = revenue - prodCost - recurring;
    const discount  = Math.pow(1 + r, t);

    cumul += netCF;
    rows.push({
      t, revenue, prodCost, recurring, netCF,
      cumulCF:     cumul,
      discountedCF: netCF / discount,
    });
  }
  return rows;
}

function calcNPV(proj) {
  const rows = buildYearTable(proj);
  return rows.reduce((s, r) => s + r.discountedCF, 0) - calcTotalInvestment(proj);
}

function calcROI(proj) {
  const inv = calcTotalInvestment(proj);
  if (!inv) return null;
  return (calcNPV(proj) / inv) * 100;
}

function calcPaybackYear(proj) {
  const rows = buildYearTable(proj);
  const row  = rows.find(r => r.cumulCF >= 0);
  return row ? row.t : null;
}

// Viability score 0–100 based on ROI thresholds
function calcScore(proj) {
  const roi = calcROI(proj);
  if (roi === null) return 0;
  if (roi >= 50)  return 95;
  if (roi >= 20)  return 75 + (roi - 20) * (20 / 30);
  if (roi >= 5)   return 50 + (roi - 5)  * (25 / 15);
  if (roi >= 0)   return 30 + roi * (20 / 5);
  return Math.max(0, 30 + roi);  // negative ROI pulls below 30
}

function viabilityLabel(score) {
  if (score >= 85) return { label: 'Excellent',  cls: 'excellent' };
  if (score >= 65) return { label: 'Good',        cls: 'good' };
  if (score >= 40) return { label: 'Marginal',    cls: 'marginal' };
  if (score > 0)   return { label: 'Risky',       cls: 'risky' };
  return                 { label: 'No Data',      cls: 'neutral' };
}

function roiBadge(proj) {
  const roi = calcROI(proj);
  if (roi === null) return { text: 'No data', cls: 'neutral' };
  const { cls } = viabilityLabel(calcScore(proj));
  return { text: (roi >= 0 ? '+' : '') + roi.toFixed(1) + '% ROI', cls };
}

// ── D. Formatters ────────────────────────────
function parseNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function fmtCurrency(n) {
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e9)      s = (n / 1e9).toFixed(1) + 'B';
  else if (abs >= 1e6) s = (n / 1e6).toFixed(1) + 'M';
  else if (abs >= 1e3) s = (n / 1e3).toFixed(0) + 'K';
  else                 s = n.toFixed(0);
  return (n < 0 ? '-$' : '$') + (n < 0 ? s.replace('-','') : s);
}

function fmtCurrencyFull(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  }).format(n);
}

function fmtPct(n)  { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
function fmtDate(ms) {
  return new Date(parseInt(ms)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}
function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── E. Navigation ────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === id);
  });
  // Sync nav tabs
  ['listView','editView','resultsView'].forEach(vid => {
    const btn = document.getElementById('nav' + capitalize(vid.replace('View','')));
    if (btn) btn.classList.toggle('active', vid === id);
  });
  // Context-sensitive topbar actions
  const inEdit    = id === 'editView';
  const inResults = id === 'resultsView';
  const hasProject = !!state.currentId;

  el('btnNew').style.display     = id === 'listView' ? '' : 'none';
  el('btnDelete').style.display  = hasProject && !id.includes('list') ? '' : 'none';
  el('btnEvaluate').style.display= inEdit ? '' : 'none';

  el('navEdit').disabled    = !hasProject;
  el('navResults').disabled = !hasProject;
}

// ── F. Render: Project List ──────────────────
function renderList() {
  state.projects = loadProjects().sort((a, b) => b.lastSaved - a.lastSaved);
  const grid  = el('projectGrid');
  const empty = el('emptyState');
  grid.innerHTML = '';

  if (!state.projects.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  state.projects.forEach((proj, i) => {
    const badge = roiBadge(proj);
    const card  = document.createElement('div');
    card.className = 'project-card fade-up';
    card.style.animationDelay = (i * 50) + 'ms';
    card.innerHTML = `
      <div class="card-top">
        <div class="card-name">${escHtml(proj.name || 'Untitled Project')}</div>
        <span class="roi-badge ${badge.cls}">${escHtml(badge.text)}</span>
      </div>
      <div class="card-desc">${escHtml(proj.description || 'No description.')}</div>
      <div class="card-footer">
        <div class="card-meta-chips">
          <span class="card-chip">${proj.years || '—'} yrs</span>
          <span class="card-chip">${proj.interestRate || '—'}% rate</span>
        </div>
        <span>${fmtDate(proj.lastSaved)}</span>
      </div>`;
    card.addEventListener('click', () => openProject(proj.id));
    grid.appendChild(card);
  });
}

// ── G. Render: Edit View ─────────────────────
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
  const container = el('list' + capitalize(type));
  container.innerHTML = '';
  items.forEach(item => container.appendChild(buildRow(type, item)));
  updateSectionCount(type, items.length);
}

function buildRow(type, item) {
  const row = document.createElement('div');
  row.className = 'line-item ' + type + '-row';
  row.dataset.id = item.id;

  const fields = {
    investment: [
      { key: 'name',         cls: 'name', ph: 'Item name',     type: 'text'   },
      { key: 'amount',       cls: 'num',  ph: 'Amount',        type: 'number' },
    ],
    recurring: [
      { key: 'name',         cls: 'name', ph: 'Expense name',  type: 'text'   },
      { key: 'amountPerYear',cls: 'num',  ph: '$/year',        type: 'number' },
      { key: 'growthRate',   cls: 'num',  ph: 'Growth %',      type: 'number' },
    ],
    production: [
      { key: 'name',         cls: 'name', ph: 'Cost name',     type: 'text'   },
      { key: 'costPerUnit',  cls: 'num',  ph: '$/unit',        type: 'number' },
      { key: 'unitsPerYear', cls: 'num',  ph: 'Units/yr',      type: 'number' },
      { key: 'growthRate',   cls: 'num',  ph: 'Growth %',      type: 'number' },
    ],
    revenue: [
      { key: 'name',         cls: 'name', ph: 'Revenue source',type: 'text'   },
      { key: 'pricePerUnit', cls: 'num',  ph: '$/unit',        type: 'number' },
      { key: 'unitsPerYear', cls: 'num',  ph: 'Units/yr',      type: 'number' },
      { key: 'growthRate',   cls: 'num',  ph: 'Growth %',      type: 'number' },
    ],
  };

  fields[type].forEach(cfg => {
    const inp = document.createElement('input');
    inp.type        = cfg.type;
    inp.className   = 'li-input';
    inp.placeholder = cfg.ph;
    inp.value       = item[cfg.key] != null ? item[cfg.key] : '';
    if (cfg.type === 'number') { inp.min = '0'; inp.step = 'any'; }
    inp.addEventListener('input', () => {
      item[cfg.key] = cfg.type === 'number' ? parseFloat(inp.value) || 0 : inp.value;
      autoSave();
      updateCompletionRing();
    });
    row.appendChild(inp);
  });

  const del = document.createElement('button');
  del.className   = 'del-btn';
  del.title       = 'Remove';
  del.innerHTML   = '×';
  del.addEventListener('click', () => {
    removeItem(type, item.id);
    del.closest('.line-item').animate([
      { opacity: 1, transform: 'scaleY(1)' },
      { opacity: 0, transform: 'scaleY(0)' }
    ], { duration: 150, fill: 'forwards' }).onfinish = () => {
      del.closest('.line-item').remove();
    };
  });
  row.appendChild(del);

  return row;
}

function addItem(type) {
  const listKey = sectionKey(type);
  const defs = {
    investment: { name:'', amount:0 },
    recurring:  { name:'', amountPerYear:0, growthRate:0 },
    production: { name:'', costPerUnit:0, unitsPerYear:0, growthRate:0 },
    revenue:    { name:'', pricePerUnit:0, unitsPerYear:0, growthRate:0 },
  };
  const item = { id: Date.now().toString(), ...defs[type] };
  state.currentProject[listKey].push(item);

  const container = el('list' + capitalize(type));
  const row = buildRow(type, item);
  container.appendChild(row);
  row.querySelector('.li-input').focus();

  updateSectionCount(type, state.currentProject[listKey].length);
  updateCompletionRing();
  autoSave();
}

function removeItem(type, id) {
  const key = sectionKey(type);
  state.currentProject[key] = state.currentProject[key].filter(i => i.id !== id);
  updateSectionCount(type, state.currentProject[key].length);
  updateCompletionRing();
  autoSave();
}

function sectionKey(type) {
  return { investment:'investments', recurring:'recurringExpenses',
           production:'productionCosts', revenue:'revenues' }[type];
}

function updateSectionCount(type, n) {
  const el2 = el('cnt' + capitalize(type));
  if (el2) el2.textContent = n + (n === 1 ? ' item' : ' items');
}

// Completion ring: % of fields that have meaningful data
function updateCompletionRing() {
  const p = state.currentProject;
  let filled = 0, total = 4;

  if (p.name?.trim())        filled++;
  if (p.investments.length)  filled++;
  if (p.revenues.length)     filled++;
  if (p.recurringExpenses.length || p.productionCosts.length) filled++;

  const pct = Math.round((filled / total) * 100);
  const circumference = 2 * Math.PI * 14; // r=14
  const offset = circumference - (pct / 100) * circumference;

  const ring = el('completionRing');
  if (ring) {
    ring.style.strokeDashoffset = offset;
    ring.setAttribute('stroke-dasharray', circumference + ' ' + circumference);
    // Color shift based on completion
    ring.style.stroke = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--orange)' : 'var(--indigo)';
  }
  const pctEl = el('completionPct');
  if (pctEl) pctEl.textContent = pct + '%';
}

// ── H. Render: Results View ──────────────────
function renderResults() {
  const proj  = state.currentProject;
  const inv   = calcTotalInvestment(proj);
  const npv   = calcNPV(proj);
  const roi   = calcROI(proj);
  const pb    = calcPaybackYear(proj);
  const rows  = buildYearTable(proj);
  const score = calcScore(proj);
  const vib   = viabilityLabel(score);

  // Score ring animation
  const arc  = el('scoreArc');
  const circ = 2 * Math.PI * 50; // r=50
  setTimeout(() => {
    const offset = circ - (score / 100) * circ;
    arc.style.strokeDasharray  = circ + ' ' + circ;
    arc.style.strokeDashoffset = offset;
    arc.style.stroke = score >= 65 ? 'var(--green)' : score >= 40 ? 'var(--orange)' : 'var(--red)';
  }, 80);

  // Score number count-up
  animateCount(el('scoreNumber'), 0, Math.round(score), 900, v => Math.round(v));

  // Viability badge
  const badge = el('viabilityBadge');
  badge.textContent = vib.label;
  badge.className   = 'viability-badge ' + vib.cls;

  // Project name / desc / meta
  el('resultsProjName').textContent = proj.name || 'Untitled Project';
  el('resultsProjDesc').textContent = proj.description || '';
  el('rChipYears').textContent      = (proj.years || '—') + ' years';
  el('rChipRate').textContent       = (proj.interestRate || '—') + '% rate';

  // KPI cards with staggered reveal + count-up
  const kpiData = [
    { id: 'kpiInvestment', val: inv,  fmt: v => fmtCurrencyFull(v), isNeg: false },
    { id: 'kpiCashflow',   val: rows[0]?.netCF ?? 0, fmt: v => fmtCurrencyFull(v), isNeg: (rows[0]?.netCF ?? 0) < 0 },
    { id: 'kpiNpv',        val: npv,  fmt: v => fmtCurrencyFull(v), isNeg: npv < 0 },
    { id: 'kpiRoi',        val: roi,  fmt: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%', isNeg: roi !== null && roi < 0 },
  ];

  kpiData.forEach(({ id, val, fmt, isNeg }, i) => {
    const card  = el(id);
    const valEl = card.querySelector('.kpi-value');
    setTimeout(() => {
      card.classList.add('revealed');
      if (val !== null) {
        animateCount(valEl, 0, val, 700, fmt);
        valEl.className = 'kpi-value ' + (isNeg ? 'negative' : 'positive');
      } else {
        valEl.textContent = 'N/A';
        valEl.className   = 'kpi-value';
      }
    }, 100 + i * 80);
  });

  // Payback
  setTimeout(() => {
    const kpiPb = el('kpiPayback');
    kpiPb.classList.add('revealed');
    const pbVal = kpiPb.querySelector('.kpi-value');
    if (pb !== null) {
      pbVal.textContent = pb + (pb === 1 ? ' year' : ' years');
      pbVal.className   = 'kpi-value positive';
    } else {
      pbVal.textContent = 'Never';
      pbVal.className   = 'kpi-value negative';
    }
  }, 480);

  // Bar chart
  renderBarChart(rows);

  // Table
  renderTable(rows, pb);
}

function renderBarChart(rows) {
  const chart  = el('barChart');
  chart.innerHTML = '';
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.netCF)), 1);

  rows.forEach((r, i) => {
    const pct   = Math.min((Math.abs(r.netCF) / maxAbs) * 100, 100);
    const isPos = r.netCF >= 0;
    const div   = document.createElement('div');
    div.className = 'bar-row';
    div.innerHTML = `
      <span class="bar-yr-label">Yr ${r.t}</span>
      <div class="bar-track">
        <div class="bar-fill ${isPos ? 'pos' : 'neg'}" style="width:0%"
             data-pct="${pct.toFixed(1)}"></div>
      </div>
      <span class="bar-amount">${fmtCurrency(r.netCF)}</span>`;
    chart.appendChild(div);

    // Stagger bar fill animation
    setTimeout(() => {
      div.querySelector('.bar-fill').style.width = pct.toFixed(1) + '%';
    }, 200 + i * 40);
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
      <td>${fmtCurrencyFull(r.revenue)}</td>
      <td>${fmtCurrencyFull(r.prodCost)}</td>
      <td>${fmtCurrencyFull(r.recurring)}</td>
      <td class="${r.netCF  >= 0 ? 'pos' : 'neg'}">${fmtCurrencyFull(r.netCF)}</td>
      <td class="${r.cumulCF >= 0 ? 'pos' : 'neg'}">${fmtCurrencyFull(r.cumulCF)}</td>
      <td class="${r.discountedCF >= 0 ? 'pos' : 'neg'}">${fmtCurrencyFull(r.discountedCF)}</td>`;
    tbody.appendChild(tr);
  });
}

// ── I. Auto-save ─────────────────────────────
let saveTimer = null;
function autoSave() {
  if (!state.currentProject) return;
  // Sync header fields
  state.currentProject.name         = el('projName').value.trim();
  state.currentProject.description  = el('projDesc').value;
  state.currentProject.years        = Math.max(1, parseInt(el('projYears').value) || 1);
  state.currentProject.interestRate = parseFloat(el('projRate').value) || 0;

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    upsertProject(state.currentProject);
    showSaveBadge();
  }, 500);
}

function showSaveBadge() {
  const badge = el('saveBadge');
  badge.classList.add('visible');
  clearTimeout(badge._timer);
  badge._timer = setTimeout(() => badge.classList.remove('visible'), 2000);
}

// ── J. Project Lifecycle ─────────────────────
function openProject(id) {
  const all = loadProjects();
  const proj = all.find(p => p.id === id);
  if (!proj) return;
  state.currentId      = id;
  state.currentProject = JSON.parse(JSON.stringify(proj)); // deep clone
  renderEdit();
  showView('editView');
}

function createProject() {
  state.currentProject = blankProject();
  state.currentId      = state.currentProject.id;
  upsertProject(state.currentProject);
  renderEdit();
  showView('editView');
  el('projName').focus();
}

function deleteCurrentProject() {
  if (!state.currentId) return;
  if (!confirm('Delete this project? This cannot be undone.')) return;
  removeProject(state.currentId);
  state.currentId = null;
  state.currentProject = null;
  renderList();
  showView('listView');
}

// ── K. Micro-interaction utilities ───────────
function animateCount(el2, from, to, duration, fmt) {
  if (to === null || isNaN(to)) { el2.textContent = fmt ? fmt(0) : '—'; return; }
  const start = performance.now();
  const diff  = to - from;
  function step(now) {
    const t       = Math.min((now - start) / duration, 1);
    const ease    = t < .5 ? 2*t*t : -1+(4-2*t)*t; // ease-in-out
    const current = from + diff * ease;
    el2.textContent = fmt ? fmt(current) : Math.round(current);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function el(id) { return document.getElementById(id); }

// ── L. Event Wiring ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Nav buttons
  el('navList').addEventListener('click', () => {
    if (state.currentProject) upsertProject(state.currentProject);
    renderList();
    showView('listView');
  });
  el('navEdit').addEventListener('click', () => {
    if (state.currentId) showView('editView');
  });
  el('navResults').addEventListener('click', () => {
    if (state.currentProject) {
      renderResults();
      showView('resultsView');
    }
  });

  // Action buttons
  el('btnNew').addEventListener('click', createProject);
  el('btnNewEmpty').addEventListener('click', createProject);
  el('btnDelete').addEventListener('click', deleteCurrentProject);
  el('btnEvaluate').addEventListener('click', () => {
    if (!state.currentProject) return;
    upsertProject(state.currentProject);
    renderResults();
    showView('resultsView');
  });

  // Edit header inputs → auto-save
  ['projName','projDesc','projYears','projRate'].forEach(id => {
    el(id).addEventListener('input', () => {
      autoSave();
      updateCompletionRing();
    });
  });

  // Collapsible section headers (event delegation on each section)
  document.querySelectorAll('.section-header').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.section').classList.toggle('collapsed');
    });
  });

  // "Add item" buttons
  document.querySelectorAll('.add-row-btn').forEach(btn => {
    btn.addEventListener('click', () => addItem(btn.dataset.list));
  });

  // Init
  renderList();
  showView('listView');
});
