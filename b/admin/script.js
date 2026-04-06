// --- CONFIG ---
const TOKEN_KEY  = 'blogToken';
const REPO_OWNER = 'pablovolenski';
const REPO_NAME  = 'home';
const POSTS_PATH = 'b/posts';
const INDEX_PATH = 'b/posts/index.json';
const API_BASE   = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const RAW_BASE   = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main`;

// --- STATE ---
let token     = localStorage.getItem(TOKEN_KEY) || '';
let posts     = [];
let editingId = null;

// --- GITHUB CONTENTS API ---
function ghHeaders(requireAuth = false) {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) h['Authorization'] = `token ${token}`;
    else if (requireAuth) throw new Error('No token');
    return h;
}

function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(str) {
    return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}

async function ghRead(path) {
    const res = await fetch(`${API_BASE}/${path}`, { headers: ghHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
    const data = await res.json();
    return { content: b64decode(data.content), sha: data.sha };
}

async function ghWriteRaw(path, b64content, message, sha) {
    const body = { message, content: b64content };
    if (sha) body.sha = sha;
    const res = await fetch(`${API_BASE}/${path}`, {
        method: 'PUT',
        headers: { ...ghHeaders(true), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `GitHub write failed: ${res.status}`);
    }
    return (await res.json()).content.sha;
}

async function ghWrite(path, content, message, sha) {
    return ghWriteRaw(path, b64encode(content), message, sha);
}

async function ghDelete(path, message, sha) {
    const res = await fetch(`${API_BASE}/${path}`, {
        method: 'DELETE',
        headers: { ...ghHeaders(true), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sha })
    });
    if (!res.ok) throw new Error(`GitHub delete failed: ${res.status}`);
}

// --- SYNC INDICATOR ---
function setSyncState(state) {
    const el = document.getElementById('syncIndicator');
    el.className = 'sync-indicator ' + state;
    el.textContent = { idle: '○', syncing: '↻', ok: '✓', error: '!' }[state] || '';
    el.title = { idle: '', syncing: 'Saving…', ok: 'Saved', error: 'Save failed' }[state] || '';
}

// --- VIEWS ---
function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
    window.scrollTo(0, 0);
}

// --- DATE ---
function fmtDate(ts) {
    return new Date(parseInt(ts)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// --- TOKEN PROMPT ---
function showTokenPrompt() {
    document.getElementById('tokenInput').value = '';
    document.getElementById('tokenStatus').textContent = '';
    document.getElementById('tokenPrompt').classList.add('visible');
    setTimeout(() => document.getElementById('tokenInput').focus(), 50);
}

function hideTokenPrompt() {
    document.getElementById('tokenPrompt').classList.remove('visible');
}

document.getElementById('tokenInput').addEventListener('keydown', async e => {
    if (e.key === 'Enter') await connectWithToken();
});

async function connectWithToken() {
    const t = document.getElementById('tokenInput').value.trim();
    if (!t) return;
    const status = document.getElementById('tokenStatus');
    status.style.color = '#aaa'; status.textContent = '…';
    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${t}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!res.ok) throw new Error('Invalid token');
        localStorage.setItem(TOKEN_KEY, t);
        token = t;
        hideTokenPrompt();
        setSyncState('ok');
        await loadPosts();
        renderList();
    } catch(e) {
        status.style.color = '#d9534f';
        status.textContent = e.message || 'Check your token.';
    }
}

// --- LOAD POSTS ---
async function loadPosts() {
    try {
        const result = await ghRead(INDEX_PATH);
        posts = result ? JSON.parse(result.content) : [];
    } catch(e) {
        console.warn('Failed to load posts:', e);
        posts = [];
    }
}

// --- RENDER LIST ---
function renderList() {
    const list  = document.getElementById('postList');
    const empty = document.getElementById('emptyState');
    list.innerHTML = '';
    const sorted = [...posts].sort((a, b) => b.date - a.date);
    if (sorted.length === 0) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    sorted.forEach(p => {
        const item = document.createElement('div');
        item.className = 'post-item';
        item.innerHTML = `
            <span class="post-item-title">${escHtml(p.title || 'Untitled')}</span>
            <span class="post-item-date">${fmtDate(p.date)}</span>
            <div class="post-item-actions">
                <button class="btn secondary" data-action="edit"   data-id="${p.id}">Edit</button>
                <button class="btn danger"    data-action="delete" data-id="${p.id}">Delete</button>
            </div>`;
        item.addEventListener('click', async e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'edit')   await openEditor(p.id);
            if (btn.dataset.action === 'delete') await deletePost(p.id);
        });
        list.appendChild(item);
    });
}

// --- SLUG ---
let slugManuallyEdited = false;

function titleToSlug(title) {
    return title.toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

document.getElementById('editorTitle').addEventListener('input', e => {
    if (!slugManuallyEdited) {
        document.getElementById('editorSlug').value = titleToSlug(e.target.value);
    }
});

document.getElementById('editorSlug').addEventListener('input', () => {
    slugManuallyEdited = true;
});

// --- EDITOR ---
async function openEditor(id = null) {
    editingId = id;
    slugManuallyEdited = false;
    if (id) {
        try {
            const result = await ghRead(`${POSTS_PATH}/${id}.json`);
            const post = result ? JSON.parse(result.content) : {};
            document.getElementById('editorTitle').value = post.title || '';
            document.getElementById('editorSlug').value  = post.slug  || titleToSlug(post.title || '');
            document.getElementById('editorBody').value  = post.body  || '';
            slugManuallyEdited = true; // editing existing — don't overwrite slug on title change
        } catch(e) {
            console.warn('Failed to load post for editing:', e);
        }
    } else {
        document.getElementById('editorTitle').value = '';
        document.getElementById('editorSlug').value  = '';
        document.getElementById('editorBody').value  = '';
    }
    document.getElementById('publishBtn').disabled  = false;
    document.getElementById('publishBtn').textContent = 'Publish';
    setPreviewMode(false);
    showView('editorView');
    document.getElementById('editorTitle').focus();
}

// --- PUBLISH ---
async function publishPost() {
    const title = document.getElementById('editorTitle').value.trim();
    const slug  = document.getElementById('editorSlug').value.trim() || titleToSlug(title);
    const body  = document.getElementById('editorBody').value;
    if (!title) { document.getElementById('editorTitle').focus(); return; }

    const btn = document.getElementById('publishBtn');
    btn.disabled = true; btn.textContent = '…';
    setSyncState('syncing');

    try {
        const id   = editingId || Date.now().toString();
        const date = editingId ? (posts.find(p => p.id === id)?.date || Date.now()) : Date.now();
        const post = { id, title, slug, body, date };

        const existing = await ghRead(`${POSTS_PATH}/${id}.json`);
        await ghWrite(
            `${POSTS_PATH}/${id}.json`,
            JSON.stringify(post, null, 2),
            `blog: ${editingId ? 'update' : 'add'} "${title}"`,
            existing?.sha
        );

        await upsertIndex(post, 'upsert');
        setSyncState('ok');
        renderList();
        showView('listView');
    } catch(e) {
        setSyncState('error');
        btn.disabled = false; btn.textContent = 'Publish';
        console.error('Publish failed:', e);
    }
}

// --- DELETE ---
async function deletePost(id) {
    if (!confirm('Delete this post?')) return;
    setSyncState('syncing');
    try {
        const existing = await ghRead(`${POSTS_PATH}/${id}.json`);
        if (existing) {
            const post = JSON.parse(existing.content);
            await ghDelete(`${POSTS_PATH}/${id}.json`, `blog: delete "${post.title}"`, existing.sha);
        }
        await upsertIndex({ id }, 'delete');
        setSyncState('ok');
        renderList();
        showView('listView');
    } catch(e) {
        setSyncState('error');
        console.error('Delete failed:', e);
    }
}

// --- INDEX ---
async function upsertIndex(post, action) {
    const result  = await ghRead(INDEX_PATH);
    let entries   = result ? JSON.parse(result.content) : [];
    if (action === 'upsert') {
        const idx   = entries.findIndex(e => e.id === post.id);
        const entry = { id: post.id, title: post.title, slug: post.slug, date: post.date };
        if (idx > -1) entries[idx] = entry; else entries.push(entry);
    } else if (action === 'delete') {
        entries = entries.filter(e => e.id !== post.id);
        posts   = posts.filter(p => p.id !== post.id);
    }
    posts = entries;
    await ghWrite(INDEX_PATH, JSON.stringify(entries, null, 2), 'blog: update index', result?.sha);
}

// --- TOOLBAR / MARKDOWN HELPERS ---
function insertAtCursor(ta, before, after = '') {
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const sel   = ta.value.slice(start, end);
    const replacement = before + sel + after;
    ta.setRangeText(replacement, start, end, 'select');
    ta.focus();
    // position cursor inside if no selection
    if (start === end) {
        const pos = start + before.length;
        ta.setSelectionRange(pos, pos);
    }
}

function insertLinePrefix(ta, prefix) {
    const start    = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    ta.setRangeText(prefix, lineStart, lineStart, 'end');
    ta.focus();
}

// --- PREVIEW TOGGLE ---
function setPreviewMode(on) {
    const ta       = document.getElementById('editorBody');
    const preview  = document.getElementById('editorPreview');
    const checkbox = document.getElementById('previewCheckbox');
    if (on) {
        preview.innerHTML     = ta.value || '';
        ta.style.display      = 'none';
        preview.style.display = 'block';
        checkbox.checked      = true;
        preview.focus();
    } else {
        // sync edits made in preview back to source
        if (preview.style.display !== 'none') ta.value = preview.innerHTML;
        ta.style.display      = '';
        preview.style.display = 'none';
        checkbox.checked      = false;
        ta.focus();
    }
}

document.getElementById('previewCheckbox').addEventListener('change', e => {
    setPreviewMode(e.target.checked);
});

document.querySelector('.toolbar').addEventListener('click', async e => {
    const btn = e.target.closest('.tb-btn');
    if (!btn) return;
    const action = btn.dataset.action;

    const ta = document.getElementById('editorBody');
    if (action === 'bold')      insertAtCursor(ta, '<strong>', '</strong>');
    if (action === 'italic')    insertAtCursor(ta, '<em>', '</em>');
    if (action === 'h1')        insertAtCursor(ta, '<h1>', '</h1>');
    if (action === 'h2')        insertAtCursor(ta, '<h2>', '</h2>');
    if (action === 'h3')        insertAtCursor(ta, '<h3>', '</h3>');
    if (action === 'quote')     insertAtCursor(ta, '<blockquote>', '</blockquote>');
    if (action === 'code')      insertAtCursor(ta, '<code>', '</code>');
    if (action === 'codeblock') insertAtCursor(ta, '<pre><code>', '</code></pre>');
    if (action === 'link') {
        const url = prompt('URL:');
        if (url) insertAtCursor(ta, `<a href="${url}">`, '</a>');
    }
    if (action === 'image') {
        document.getElementById('imageFileInput').click();
    }
});

// --- IMAGE UPLOAD ---
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const MAX = 1600;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
                if (width >= height) { height = Math.round(height * MAX / width); width = MAX; }
                else                 { width  = Math.round(width  * MAX / height); height = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
            // strip the data:image/jpeg;base64, prefix
            resolve(dataUrl.split(',')[1]);
        };
        img.onerror = reject;
        img.src = url;
    });
}

async function uploadImage(file) {
    const ta = document.getElementById('editorBody');
    setSyncState('syncing');
    try {
        const b64      = await compressImage(file);
        const filename = `${Date.now()}.jpg`;
        const path     = `${POSTS_PATH}/images/${filename}`;
        await ghWriteRaw(path, b64, `blog: add image ${filename}`);
        const rawUrl = `${RAW_BASE}/${path}`;
        insertAtCursor(ta, `![](${rawUrl})`);
        setSyncState('ok');
    } catch(e) {
        setSyncState('error');
        console.error('Image upload failed:', e);
    }
}

document.getElementById('imageFileInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    await uploadImage(file);
});

// --- EVENT LISTENERS ---
document.getElementById('newPostBtn').addEventListener('click', () => openEditor());
document.getElementById('backFromEditor').addEventListener('click', () => {
    editingId ? showView('listView') : showView('listView');
});
document.getElementById('publishBtn').addEventListener('click', publishPost);
document.getElementById('cancelBtn').addEventListener('click', () => showView('listView'));

// --- INIT ---
window.onload = async () => {
    if (!token) {
        showTokenPrompt();
    } else {
        setSyncState('ok');
        await loadPosts();
        renderList();
    }
};
