// --- CONFIG ---
const TOKEN_KEY   = 'gistToken';          // shared with e/
const REPO_OWNER  = 'pablovolenski';
const REPO_NAME   = 'home';
const POSTS_PATH  = 'b/posts';
const INDEX_PATH  = 'b/posts/index.json';
const API_BASE    = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

// --- STATE ---
let token    = localStorage.getItem(TOKEN_KEY) || '';
let posts    = [];   // index entries: [{id, title, date}]
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

async function ghWrite(path, content, message, sha) {
    const body = { message, content: b64encode(content) };
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
    el.textContent = { idle: '', syncing: '↻', ok: '✓', error: '!' }[state] || '';
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

// --- ADMIN ---
function isAdmin() { return !!token; }

function activateAdmin() {
    document.body.classList.add('admin');
    document.getElementById('newPostBtn').style.display = 'flex';
    if (isAdmin()) setSyncState('ok');
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
    const list = document.getElementById('postList');
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
            <div class="post-item-right">
                <button class="item-delete-btn" data-id="${p.id}" title="Delete">✕</button>
                <span class="post-item-date">${fmtDate(p.date)}</span>
            </div>`;
        item.addEventListener('click', async e => {
            if (e.target.classList.contains('item-delete-btn')) {
                e.stopPropagation();
                await deletePost(e.target.dataset.id);
            } else {
                await openPost(p.id);
            }
        });
        list.appendChild(item);
    });
}

function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// --- OPEN POST ---
async function openPost(id) {
    try {
        const result = await ghRead(`${POSTS_PATH}/${id}.json`);
        if (!result) return;
        const post = JSON.parse(result.content);
        document.getElementById('postTitle').textContent = post.title || 'Untitled';
        document.getElementById('postDate').textContent = fmtDate(post.date);
        document.getElementById('postBody').innerHTML = marked.parse(post.body || '');
        const adminBar = document.getElementById('postAdminBar');
        adminBar.style.display = isAdmin() ? 'flex' : 'none';
        document.getElementById('editPostBtn').onclick = () => openEditor(post);
        document.getElementById('deletePostBtn').onclick = () => deletePost(post.id);
        showView('postView');
    } catch(e) {
        console.warn('Failed to open post:', e);
    }
}

// --- EDITOR ---
function openEditor(post = null) {
    editingId = post ? post.id : null;
    document.getElementById('editorTitle').value = post ? (post.title || '') : '';
    document.getElementById('editorBody').value = post ? (post.body || '') : '';
    document.getElementById('publishBtn').textContent = 'Publish';
    document.getElementById('publishBtn').disabled = false;
    showView('editorView');
}

async function publishPost() {
    const title = document.getElementById('editorTitle').value.trim();
    const body  = document.getElementById('editorBody').value;
    if (!title) { document.getElementById('editorTitle').focus(); return; }

    const btn = document.getElementById('publishBtn');
    btn.disabled = true; btn.textContent = '…';
    setSyncState('syncing');

    try {
        const id   = editingId || Date.now().toString();
        const date = editingId ? (posts.find(p => p.id === id)?.date || Date.now()) : Date.now();
        const post = { id, title, body, date };

        // 1. Write post file
        const existing = await ghRead(`${POSTS_PATH}/${id}.json`);
        await ghWrite(
            `${POSTS_PATH}/${id}.json`,
            JSON.stringify(post, null, 2),
            `blog: ${editingId ? 'update' : 'add'} "${title}"`,
            existing?.sha
        );

        // 2. Update index
        await updateIndex(post, 'upsert');

        setSyncState('ok');
        renderList();
        showView('listView');
    } catch(e) {
        setSyncState('error');
        btn.disabled = false; btn.textContent = 'Publish';
        console.error('Publish failed:', e);
    }
}

async function deletePost(id) {
    if (!confirm('Delete this post?')) return;
    setSyncState('syncing');
    try {
        // 1. Delete post file
        const existing = await ghRead(`${POSTS_PATH}/${id}.json`);
        if (existing) {
            const post = JSON.parse(existing.content);
            await ghDelete(`${POSTS_PATH}/${id}.json`, `blog: delete "${post.title}"`, existing.sha);
        }
        // 2. Update index
        await updateIndex({ id }, 'delete');
        setSyncState('ok');
        renderList();
        showView('listView');
    } catch(e) {
        setSyncState('error');
        console.error('Delete failed:', e);
    }
}

async function updateIndex(post, action) {
    const result = await ghRead(INDEX_PATH);
    let entries = result ? JSON.parse(result.content) : [];
    if (action === 'upsert') {
        const idx = entries.findIndex(e => e.id === post.id);
        const entry = { id: post.id, title: post.title, date: post.date };
        if (idx > -1) entries[idx] = entry;
        else entries.push(entry);
    } else if (action === 'delete') {
        entries = entries.filter(e => e.id !== post.id);
        posts = posts.filter(p => p.id !== post.id);
    }
    posts = entries;
    await ghWrite(INDEX_PATH, JSON.stringify(entries, null, 2), `blog: update index`, result?.sha);
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
        activateAdmin();
        hideTokenPrompt();
    } catch(e) {
        status.style.color = '#d9534f';
        status.textContent = e.message || 'Check your token.';
    }
}

// --- EVENT LISTENERS ---
document.getElementById('newPostBtn').addEventListener('click', () => {
    if (!token) { showTokenPrompt(); return; }
    openEditor();
});

document.getElementById('backFromPost').addEventListener('click', () => showView('listView'));

document.getElementById('backFromEditor').addEventListener('click', () => {
    editingId ? openPost(editingId) : showView('listView');
});

document.getElementById('publishBtn').addEventListener('click', publishPost);

// --- INIT ---
window.onload = async () => {
    await loadPosts();
    if (isAdmin()) activateAdmin();
    renderList();
    showView('listView');
};
