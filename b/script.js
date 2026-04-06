// --- CONFIG ---
const REPO_OWNER = 'pablovolenski';
const REPO_NAME  = 'home';
const POSTS_PATH = 'b/posts';
const INDEX_PATH = 'b/posts/index.json';
const API_BASE   = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

// --- GITHUB READ ---
function b64decode(str) {
    return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}

async function ghRead(path) {
    const res = await fetch(`${API_BASE}/${path}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
    const data = await res.json();
    return { content: b64decode(data.content), sha: data.sha };
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

// --- LOAD POSTS ---
let posts = [];

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
            <span class="post-item-date">${fmtDate(p.date)}</span>`;
        item.addEventListener('click', () => openPost(p.id));
        list.appendChild(item);
    });
}

// --- OPEN POST ---
async function openPost(id) {
    try {
        const result = await ghRead(`${POSTS_PATH}/${id}.json`);
        if (!result) return;
        const post = JSON.parse(result.content);
        document.getElementById('postTitle').textContent = post.title || 'Untitled';
        document.getElementById('postDate').textContent  = fmtDate(post.date);
        document.getElementById('postBody').innerHTML    = marked.parse(post.body || '');
        showView('postView');
    } catch(e) {
        console.warn('Failed to open post:', e);
    }
}

// --- EVENT LISTENERS ---
document.getElementById('backFromPost').addEventListener('click', () => showView('listView'));

// --- INIT ---
window.onload = async () => {
    await loadPosts();
    renderList();
    showView('listView');
};
