// --- GIST SYNC ---
const GIST_TOKEN_KEY = 'gistToken';
const GIST_ID_KEY = 'gistId';

let gistToken = localStorage.getItem(GIST_TOKEN_KEY) || '';
let gistId = localStorage.getItem(GIST_ID_KEY) || '';
let gistSaveTimer = null;
let isSyncing = false;

function updateSyncIndicator(state) {
    const el = document.getElementById('syncIndicator');
    if (!el) return;
    el.className = 'sync-indicator ' + state;
    const labels = { idle: '○', dirty: '●', syncing: '↻', ok: '✓', error: '!' };
    const titles = { idle: 'No Gist sync', dirty: 'Unsaved — click to sync now', syncing: 'Syncing…', ok: 'Synced', error: 'Sync failed — click to retry' };
    el.textContent = labels[state] || '';
    el.title = titles[state] || '';
}

async function loadFromGist() {
    if (!gistToken || !gistId) { updateSyncIndicator('idle'); return; }
    updateSyncIndicator('syncing');
    try {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: { 'Authorization': `token ${gistToken}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!res.ok) { updateSyncIndicator('error'); return; }
        const data = await res.json();
        const textFile = data.files['text_files.json'];
        if (textFile) {
            let content = textFile.content;
            if (textFile.truncated && textFile.raw_url) {
                const rawRes = await fetch(textFile.raw_url);
                if (rawRes.ok) content = await rawRes.text();
            }
            localStorage.setItem('appTextFiles', content);
        }
        updateSyncIndicator('ok');
    } catch(e) {
        console.warn('Gist load failed:', e);
        updateSyncIndicator('error');
    }
}

function scheduleGistSave() {
    if (!gistToken || !gistId) return;
    clearTimeout(gistSaveTimer);
    gistSaveTimer = setTimeout(pushToGist, 3000);
}

async function pushToGist() {
    if (!gistToken || !gistId || isSyncing) return;
    isSyncing = true;
    updateSyncIndicator('syncing');
    try {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${gistToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ files: {
                'text_files.json': { content: localStorage.getItem('appTextFiles') || '[]' }
            }})
        });
        updateSyncIndicator(res.ok ? 'ok' : 'error');
    } catch(e) {
        console.warn('Gist push failed:', e);
        updateSyncIndicator('error');
    }
    isSyncing = false;
}

async function findExistingGist(token) {
    const res = await fetch('https://api.github.com/gists?per_page=100', {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return null;
    const gists = await res.json();
    const found = gists.find(g => g.description === 'Workspace App Data' && g.files['text_files.json']);
    return found ? found.id : null;
}

async function createGist(token) {
    const res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            description: 'Workspace App Data',
            public: false,
            files: {
                'text_files.json': { content: localStorage.getItem('appTextFiles') || '[]' }
            }
        })
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return (await res.json()).id;
}

// --- GLOBAL STATE ---
let currentTextId = null;
let currentMode = 'plain'; // 'plain' | 'code' | 'rich'

// --- DOM ELEMENTS ---
const modeSwitch = document.getElementById('modeSwitch');
const filesBtn = document.getElementById('filesBtn');
const deleteCurrentBtn = document.getElementById('deleteCurrentBtn');
const filePanel = document.getElementById('filePanel');
const panelOverlay = document.getElementById('panelOverlay');
const panelSearch = document.getElementById('panelSearch');
const fileList = document.getElementById('fileList');
const newFileBtn = document.getElementById('newFileBtn');

// Plain/Code editor elements
const mainEditor = document.getElementById('mainEditor');
const textStats = document.getElementById('textStats');
const editorWrapper = document.getElementById('editorWrapper');
const lineNumbers = document.getElementById('lineNumbers');
const codeHighlight = document.getElementById('codeHighlight');

// Rich editor elements
const richWrapper = document.getElementById('richWrapper');
const richToolbar = document.getElementById('richToolbar');
const richEditor = document.getElementById('richEditor');
const richImageUpload = document.getElementById('richImageUpload');
const outlineOverlay = document.getElementById('outlineOverlay');
const outlinePanel = document.getElementById('outlinePanel');
const outlineBody = document.getElementById('outlineBody');

document.execCommand('defaultParagraphSeparator', false, 'p');
setEditorMode('plain');

window.onload = async () => {
    if (!gistToken) {
        showTokenPrompt();
    } else {
        await loadFromGist();
        renderFileList();
    }
};

// --- MODE SWITCHING ---
function setEditorMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    const isRich = mode === 'rich';
    editorWrapper.classList.toggle('active', !isRich);
    editorWrapper.classList.toggle('code-mode', mode === 'code');
    richWrapper.classList.toggle('active', isRich);
}

modeSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === currentMode) return;

    // Any mode switch starts a fresh file — never silently append onto or
    // reinterpret content the user is already looking at.
    closeOutline();
    currentTextId = null;
    mainEditor.value = '';
    richEditor.innerHTML = '';
    setEditorMode(mode);
    updateStats();
    updateLineNumbersAndCode();
    closePanel();
});

function formatDate(ms) {
    const d = new Date(parseInt(ms));
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
}

function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- FILE SYSTEM & DELETION ---

// First real "line" of a rich note — the same first-line-of-content
// semantics Plain/Code already use, but for HTML: walk block-level elements
// in order, skip anything inside a table (so table cells never leak into
// the title), and return the first one with visible text.
function extractRichTitle(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    const blocks = tmp.querySelectorAll('p, h1, h2, h3, li, blockquote, div');
    for (const el of blocks) {
        if (el.closest('table')) continue;
        const text = (el.textContent || '').trim();
        if (text) return text;
    }
    const clone = tmp.cloneNode(true);
    clone.querySelectorAll('table').forEach(t => t.remove());
    return (clone.textContent || '').trim() || 'Untitled';
}

const TYPE_ICONS = {
    plain: '<svg viewBox="0 0 24 24"><path d="M5 2h10l4 4v16H5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="8" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="1.4"/><line x1="8" y1="14" x2="17" y2="14" stroke="currentColor" stroke-width="1.4"/><line x1="8" y1="18" x2="14" y2="18" stroke="currentColor" stroke-width="1.4"/></svg>',
    rich: '<svg viewBox="0 0 24 24"><path d="M5 2h10l4 4v16H5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="8" y="9" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="15" y1="10.5" x2="17" y2="10.5" stroke="currentColor" stroke-width="1.3"/><line x1="15" y1="13" x2="17" y2="13" stroke="currentColor" stroke-width="1.3"/><line x1="8" y1="17" x2="17" y2="17" stroke="currentColor" stroke-width="1.3"/></svg>',
    code: '<svg viewBox="0 0 24 24"><path d="M5 2h10l4 4v16H5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.5 10.5L7.5 13l2 2.5M14.5 10.5l2 2.5-2 2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function renderFileList() {
    fileList.innerHTML = '';
    const files = JSON.parse(localStorage.getItem('appTextFiles')) || [];
    const query = panelSearch.value.toLowerCase().trim();

    const items = files.map(file => {
        const type = file.type || 'plain';
        const title = type === 'rich'
            ? extractRichTitle(file.content)
            : ((file.content || '').split('\n')[0].trim() || 'Untitled');
        return { file, type, title };
    }).filter(({ title }) => !query || title.toLowerCase().includes(query));

    items.sort((a, b) => b.file.lastSaved - a.file.lastSaved);

    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'file-empty';
        empty.textContent = query ? 'No matches' : 'No files yet';
        fileList.appendChild(empty);
        return;
    }

    items.forEach(({ file, type, title }) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <span class="file-type-icon">${TYPE_ICONS[type] || TYPE_ICONS.plain}</span>
            <span class="file-title">${escHtml(title)}</span>
            <div class="file-right-panel">
                <button class="list-delete-btn" data-id="${file.id}">✕</button>
                <span class="file-date">${formatDate(file.lastSaved)}</span>
            </div>
        `;
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('list-delete-btn')) {
                e.stopPropagation();
                deleteFile(file.id);
            } else {
                openTextFile(file.id);
                closePanel();
            }
        });
        fileList.appendChild(item);
    });
}

function deleteFile(id) {
    if (!confirm("Are you sure you want to delete this file?")) return;

    let files = JSON.parse(localStorage.getItem('appTextFiles')) || [];
    files = files.filter(f => f.id !== id);
    localStorage.setItem('appTextFiles', JSON.stringify(files));

    if (currentTextId === id) {
        currentTextId = null;
        mainEditor.value = '';
        richEditor.innerHTML = '';
        closeOutline();
        updateStats(); updateLineNumbersAndCode();
    }
    updateSyncIndicator('dirty');
    scheduleGistSave();
    renderFileList();
}

deleteCurrentBtn.addEventListener('click', () => {
    if (!currentTextId) return alert("No saved file is currently open.");
    deleteFile(currentTextId);
});

function openPanel() {
    closeOutline();
    renderFileList();
    filePanel.classList.add('open');
    panelOverlay.classList.add('open');
    panelSearch.focus();
}

function closePanel() {
    filePanel.classList.remove('open');
    panelOverlay.classList.remove('open');
    panelSearch.value = '';
}

filesBtn.addEventListener('click', () => filePanel.classList.contains('open') ? closePanel() : openPanel());
document.getElementById('panelClose').addEventListener('click', closePanel);
panelOverlay.addEventListener('click', closePanel);
panelSearch.addEventListener('input', renderFileList);

// --- DOCUMENT OUTLINE (Rich mode) ---
function renderOutline() {
    outlineBody.innerHTML = '';
    const headings = richEditor.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'outline-empty';
        empty.textContent = 'No headings yet';
        outlineBody.appendChild(empty);
        return;
    }
    headings.forEach(h => {
        const item = document.createElement('div');
        item.className = 'outline-item level-' + h.tagName.slice(1);
        item.textContent = h.textContent.trim() || 'Untitled heading';
        item.addEventListener('click', () => {
            h.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const range = document.createRange();
            range.selectNodeContents(h);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            richEditor.focus();
        });
        outlineBody.appendChild(item);
    });
}

function openOutline() {
    closePanel();
    renderOutline();
    outlinePanel.classList.add('open');
    outlineOverlay.classList.add('open');
}

function closeOutline() {
    outlinePanel.classList.remove('open');
    outlineOverlay.classList.remove('open');
}

function toggleOutline() {
    outlinePanel.classList.contains('open') ? closeOutline() : openOutline();
}

outlineOverlay.addEventListener('click', closeOutline);

newFileBtn.addEventListener('click', () => {
    currentTextId = null;
    mainEditor.value = '';
    richEditor.innerHTML = '';
    closeOutline();
    updateStats(); updateLineNumbersAndCode();
    closePanel();
});

document.getElementById('syncIndicator').addEventListener('click', () => {
    if (gistToken && gistId) pushToGist();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    if (!confirm('Disconnect Gist sync? Your local files are kept.')) return;
    localStorage.removeItem(GIST_TOKEN_KEY);
    localStorage.removeItem(GIST_ID_KEY);
    location.reload();
});

// --- INVISIBLE / HIDDEN CHARACTER STRIPPING (plain text mode) ---
// Strips zero-width chars, bidi control/override marks, BOM, soft hyphen, and the
// Unicode Tag block (U+E0000-U+E007F, used by some LLM-output steganographic
// watermarking) — all referenced by numeric code point rather than literal
// characters so this stays correct and auditable no matter how it round-trips.
const INVISIBLE_CODE_POINTS = [
    0x200B, 0x200C, 0x200D, 0x200E, 0x200F, // zero-width space/joiners, bidi marks
    0x202A, 0x202B, 0x202C, 0x202D, 0x202E, // bidi embedding/override controls
    0x2060, 0x2061, 0x2062, 0x2063, 0x2064, // word joiner, invisible operators
    0xFEFF, // byte order mark
    0x00AD  // soft hyphen
];
const INVISIBLE_CHARS_RE = new RegExp(
    INVISIBLE_CODE_POINTS.map(cp => String.fromCharCode(cp)).join('|'),
    'g'
);
// Unicode Tag block U+E0000-U+E007F, encoded as its UTF-16 surrogate pair range.
const UNICODE_TAG_RE = /\uDB40[\uDC00-\uDC7F]/g;

function stripInvisibleChars(text) {
    return (text || '').replace(INVISIBLE_CHARS_RE, '').replace(UNICODE_TAG_RE, '');
}

// --- TEXT EDITOR LOGIC (shared textarea for Plain + Code) ---
function isContentEmpty() {
    if (currentMode === 'rich') {
        return richEditor.innerText.trim() === '' && !richEditor.querySelector('img, table');
    }
    return mainEditor.value.trim() === '';
}

function updateStats() {
    const text = currentMode === 'rich' ? richEditor.innerText : mainEditor.value;
    const chars = text.length;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    textStats.textContent = `${words} words | ${chars} chars`;
}

function updateLineNumbersAndCode() {
    const lines = mainEditor.value.split('\n');
    lineNumbers.innerHTML = lines.map((_, i) => i + 1).join('<br>');
    if (currentMode === 'code' && typeof Prism !== 'undefined') {
        let text = mainEditor.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (text[text.length-1] === '\n') text += ' ';
        codeHighlight.innerHTML = text;
        Prism.highlightElement(codeHighlight);
    }
}

mainEditor.addEventListener('scroll', () => {
    lineNumbers.scrollTop = mainEditor.scrollTop;
    document.querySelector('.code-overlay').scrollTop = mainEditor.scrollTop;
    document.querySelector('.code-overlay').scrollLeft = mainEditor.scrollLeft;
});

mainEditor.addEventListener('input', () => {
    updateStats(); updateLineNumbersAndCode(); saveTextFile();
});

mainEditor.addEventListener('paste', (e) => {
    if (currentMode !== 'plain') return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, stripInvisibleChars(text));
});

function saveTextFile() {
    if (isContentEmpty() && !currentTextId) return;
    let content = currentMode === 'rich' ? richEditor.innerHTML : mainEditor.value;
    if (currentMode === 'plain') content = stripInvisibleChars(content);

    let files = JSON.parse(localStorage.getItem('appTextFiles')) || [];

    if (currentTextId) {
        const idx = files.findIndex(f => f.id === currentTextId);
        if (idx > -1) { files[idx].content = content; files[idx].lastSaved = Date.now(); files[idx].type = currentMode; }
    } else {
        currentTextId = Date.now().toString();
        files.push({ id: currentTextId, content, type: currentMode, lastSaved: Date.now() });
    }

    try {
        localStorage.setItem('appTextFiles', JSON.stringify(files));
    } catch(e) {
        console.warn("Storage full! Couldn't save file:", e);
        alert("Couldn't save — local storage is full. Try removing some files or images.");
        return;
    }
    updateSyncIndicator('dirty');
    scheduleGistSave();
    renderFileList();
}

function openTextFile(id) {
    const files = JSON.parse(localStorage.getItem('appTextFiles')) || [];
    const file = files.find(f => f.id === id);
    if (!file) return;
    currentTextId = file.id;
    const type = file.type || 'plain';
    setEditorMode(type);
    if (type === 'rich') {
        richEditor.innerHTML = file.content || '';
        wrapAllBareImages();
        mainEditor.value = '';
        if (outlinePanel.classList.contains('open')) renderOutline();
    } else {
        mainEditor.value = file.content || '';
        richEditor.innerHTML = '';
        closeOutline();
    }
    updateStats();
    updateLineNumbersAndCode();
}

// --- RICH TEXT EDITOR ---
const RICH_ALLOWED_TAGS = new Set(['P','BR','B','STRONG','I','EM','U','A','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','PRE','CODE','IMG','TABLE','THEAD','TBODY','TR','TD','TH','SPAN','DIV']);
const RICH_ALLOWED_ATTRS = { A: ['href'], IMG: ['src', 'alt'] };
const DEFAULT_TABLE_HTML = '<table><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></table>';

function sanitizeRichHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    Array.from(tmp.querySelectorAll('*')).forEach(el => {
        if (!RICH_ALLOWED_TAGS.has(el.tagName)) {
            if (['SCRIPT', 'STYLE', 'META', 'LINK'].includes(el.tagName)) {
                el.remove();
            } else {
                while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
                el.remove();
            }
            return;
        }
        const allowed = RICH_ALLOWED_ATTRS[el.tagName] || [];
        Array.from(el.attributes).forEach(attr => {
            if (!allowed.includes(attr.name)) el.removeAttribute(attr.name);
        });
    });

    return tmp.innerHTML;
}

function insertHtmlAtCursor(html) {
    richEditor.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !richEditor.contains(sel.anchorNode)) {
        richEditor.insertAdjacentHTML('beforeend', html);
        return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = range.createContextualFragment(html);
    const lastNode = frag.lastChild;
    range.insertNode(frag);
    if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

function insertNodeAtCursor(node) {
    richEditor.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !richEditor.contains(sel.anchorNode)) {
        richEditor.appendChild(node);
        return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

// Wraps an <img> in a resizable container (native CSS drag-corner resize),
// sized from its natural dimensions capped to maxWidth. If the image is
// already attached to the DOM, the wrapper takes its exact place in place;
// otherwise the wrapper is just returned, ready to insert fresh.
function wrapImageForResize(img, maxWidth = 400) {
    const wrap = document.createElement('span');
    wrap.className = 'img-wrap';
    wrap.contentEditable = 'false';

    const originalParent = img.parentNode;
    const nextSibling = img.nextSibling;
    wrap.appendChild(img);
    if (originalParent) originalParent.insertBefore(wrap, nextSibling);

    const applySize = () => {
        let w = img.naturalWidth || maxWidth;
        let h = img.naturalHeight || maxWidth;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
    };
    if (img.complete && img.naturalWidth) applySize();
    else img.addEventListener('load', applySize, { once: true });

    return wrap;
}

// Wraps any <img> in the rich editor that isn't already inside a resize
// wrapper — covers images arriving via pasted external HTML or loaded from
// notes saved before image resizing existed.
function wrapAllBareImages() {
    richEditor.querySelectorAll('img').forEach(img => {
        if (img.closest('.img-wrap')) return;
        wrapImageForResize(img);
    });
}

function compressImageToDataUrl(file, maxSize = 960, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            if (width > maxSize || height > maxSize) {
                if (width >= height) { height = Math.round(height * maxSize / width); width = maxSize; }
                else { width = Math.round(width * maxSize / height); height = maxSize; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = url;
    });
}

async function insertImageFile(file) {
    if (!file || !file.type.includes('image/')) return;
    try {
        const dataUrl = await compressImageToDataUrl(file);
        const img = document.createElement('img');
        img.src = dataUrl; img.alt = '';
        insertNodeAtCursor(wrapImageForResize(img));
        saveTextFile();
    } catch(e) {
        console.warn('Image insert failed:', e);
    }
}

function getCurrentTable() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    let node = sel.anchorNode;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    return node ? node.closest('table') : null;
}

function tableAddCol() {
    const table = getCurrentTable();
    if (!table) return;
    Array.from(table.rows).forEach(row => {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        row.appendChild(td);
    });
}

function tableDelCol() {
    const table = getCurrentTable();
    if (!table) return;
    Array.from(table.rows).forEach(row => {
        if (row.children.length > 1) row.lastElementChild.remove();
    });
}

function tableAddRow() {
    const table = getCurrentTable();
    if (!table) return;
    const colCount = table.rows.length > 0 ? table.rows[0].children.length : 3;
    const tr = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        tr.appendChild(td);
    }
    const lastRow = table.rows[table.rows.length - 1];
    (lastRow ? lastRow.parentNode : table).appendChild(tr);
}

function tableDelRow() {
    const table = getCurrentTable();
    if (!table || table.rows.length <= 1) return;
    table.rows[table.rows.length - 1].remove();
}

richToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tb-btn');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'image') { richImageUpload.click(); return; }
    if (action === 'outline') { toggleOutline(); return; }

    richEditor.focus();
    if (action === 'bold') document.execCommand('bold');
    else if (action === 'italic') document.execCommand('italic');
    else if (action === 'h1') document.execCommand('formatBlock', false, '<h1>');
    else if (action === 'h2') document.execCommand('formatBlock', false, '<h2>');
    else if (action === 'h3') document.execCommand('formatBlock', false, '<h3>');
    else if (action === 'quote') document.execCommand('formatBlock', false, '<blockquote>');
    else if (action === 'link') {
        const url = prompt('URL:');
        if (url) document.execCommand('createLink', false, url);
    }
    else if (action === 'table') insertHtmlAtCursor(DEFAULT_TABLE_HTML);
    else if (action === 'addcol') tableAddCol();
    else if (action === 'delcol') tableDelCol();
    else if (action === 'addrow') tableAddRow();
    else if (action === 'delrow') tableDelRow();
    saveTextFile();
});

richImageUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await insertImageFile(file);
});

richEditor.addEventListener('paste', async (e) => {
    e.preventDefault();
    const cd = e.clipboardData || window.clipboardData;

    const items = cd.items || [];
    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) { await insertImageFile(file); return; }
        }
    }

    const html = cd.getData('text/html');
    if (html) {
        insertHtmlAtCursor(sanitizeRichHtml(html));
        wrapAllBareImages();
        saveTextFile();
        return;
    }
    const text = cd.getData('text/plain') || '';
    document.execCommand('insertText', false, stripInvisibleChars(text));
    saveTextFile();
});

richEditor.addEventListener('input', () => {
    updateStats();
    saveTextFile();
    if (outlinePanel.classList.contains('open')) renderOutline();
});

// --- TOKEN PROMPT ---
const tokenPrompt = document.getElementById('tokenPrompt');
const tokenInput = document.getElementById('tokenInput');
const tokenStatus = document.getElementById('tokenStatus');

function showTokenPrompt() {
    tokenInput.value = '';
    tokenStatus.textContent = '';
    tokenStatus.style.color = '#aaa';
    tokenPrompt.classList.add('visible');
    setTimeout(() => tokenInput.focus(), 50);
}

function hideTokenPrompt() {
    tokenPrompt.classList.remove('visible');
}

tokenInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') await connectWithToken();
});
document.getElementById('tokenSubmitBtn').addEventListener('click', () => connectWithToken());

async function connectWithToken() {
    const token = tokenInput.value.trim();
    if (!token) return;
    tokenStatus.textContent = '…';
    try {
        let id = await findExistingGist(token);
        if (!id) id = await createGist(token);
        localStorage.setItem(GIST_TOKEN_KEY, token);
        localStorage.setItem(GIST_ID_KEY, id);
        gistToken = token; gistId = id;
        await loadFromGist();
        renderFileList();
        hideTokenPrompt();
    } catch(e) {
        tokenStatus.style.color = '#d9534f';
        tokenStatus.textContent = 'Invalid token.';
    }
}
