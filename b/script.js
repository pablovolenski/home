// --- CONFIG ---
const REPO_OWNER = 'pablovolenski';
const REPO_NAME  = 'home';
const POSTS_PATH = 'b/posts';
const INDEX_PATH = 'b/posts/index.json';
const API_BASE   = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const SITE_BASE  = 'https://pablovolenski.com/b/';

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

// --- META TAGS ---
function setMeta({ title, description, imageUrl, postUrl }) {
    document.title = title ? title + ' · blog' : 'blog';
    const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.setAttribute('content', val || ''); };
    set('meta[property="og:title"]',       title || 'blog');
    set('meta[property="og:description"]', description);
    set('meta[property="og:image"]',       imageUrl);
    set('meta[property="og:url"]',         postUrl);
    set('meta[name="twitter:card"]',       imageUrl ? 'summary_large_image' : 'summary');
    set('meta[name="twitter:title"]',      title || 'blog');
    set('meta[name="twitter:description"]',description);
    set('meta[name="twitter:image"]',      imageUrl);
}

function resetMeta() {
    document.title = 'blog';
    setMeta({ title: '', description: '', imageUrl: '', postUrl: SITE_BASE });
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

// --- SHARING ---
function buildShareBar(title, url) {
    const eu = encodeURIComponent(url);
    const et = encodeURIComponent(title);
    const links = [
        {
            name: 'Facebook', color: '#1877F2',
            href: `https://www.facebook.com/sharer/sharer.php?u=${eu}`,
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`
        },
        {
            name: 'WhatsApp', color: '#25D366',
            href: `https://wa.me/?text=${encodeURIComponent(title + '\n' + url)}`,
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>`
        },
        {
            name: 'Telegram', color: '#2AABEE',
            href: `https://t.me/share/url?url=${eu}&text=${et}`,
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`
        },
        {
            name: 'Threads', color: '#000',
            href: `https://www.threads.net/intent/post?text=${encodeURIComponent(title + ' ' + url)}`,
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.583-1.279-.878-2.29-.882h-.04c-.833 0-1.545.237-2.12.706-.433.348-.76.821-.974 1.403l-1.956-.546c.283-.86.733-1.616 1.342-2.25.863-.899 2.057-1.407 3.699-1.467h.04c3.023.01 4.842 1.9 5.073 5.258.503.187.983.41 1.42.67C20.516 13.387 21.2 14.4 21.44 15.6c.609 2.988-.572 5.788-3.092 7.504C16.634 24.271 14.548 24 12.186 24zm-.25-8.043c.955-.05 1.668-.35 2.12-.89.55-.64.838-1.688.852-3.114a11.87 11.87 0 0 0-2.472-.157c-.93.056-1.69.3-2.196.706-.42.344-.63.78-.596 1.25.064 1.123 1.058 2.162 2.292 2.205z"/></svg>`
        },
        {
            name: 'Reddit', color: '#FF4500',
            href: `https://www.reddit.com/submit?url=${eu}&title=${et}`,
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>`
        }
    ];

    const bar = document.getElementById('shareBar');
    bar.innerHTML = '<span class="share-label">Share</span>' +
        links.map(l => `<a class="share-btn" href="${l.href}" target="_blank" rel="noopener" title="${l.name}" style="--brand:${l.color}">${l.svg}</a>`).join('');
}

// --- OPEN POST ---
async function openPost(id) {
    try {
        const result = await ghRead(`${POSTS_PATH}/${id}.json`);
        if (!result) return;
        const post = JSON.parse(result.content);
        const slug     = post.slug || post.id;
        const url      = `https://pablovolenski.com/b/p/${slug}.html`; // permalink with baked OG tags

        // Extract first image + description for meta/featured
        const tmp = document.createElement('div');
        tmp.innerHTML = post.body || '';
        const firstImg   = tmp.querySelector('img');
        const imageUrl   = firstImg ? firstImg.src : '';
        const firstPText = (tmp.querySelector('p, h1, h2, h3')?.textContent || '').slice(0, 160);

        // Featured image: extract from body so it doesn't duplicate
        const featImg = document.getElementById('postFeaturedImg');
        if (firstImg) {
            featImg.src           = firstImg.src;
            featImg.alt           = firstImg.alt || post.title;
            featImg.style.display = 'block';
            firstImg.remove(); // prevent duplication in body
        } else {
            featImg.style.display = 'none';
        }

        document.getElementById('postTitle').textContent = post.title || 'Untitled';
        document.getElementById('postDate').textContent  = fmtDate(post.date);
        document.getElementById('postBody').innerHTML    = tmp.innerHTML; // body without featured img

        setMeta({ title: post.title || 'Untitled', description: firstPText, imageUrl, postUrl: url });
        buildShareBar(post.title || 'Untitled', url);

        // Use permalink as browser URL — so copying the address bar gives a Facebook-friendly URL
        history.pushState(null, '', `/b/p/${slug}.html`);
        showView('postView');
    } catch(e) {
        console.warn('Failed to open post:', e);
    }
}

async function openPostBySlug(slug) {
    const entry = posts.find(p => (p.slug || p.id) === slug);
    if (entry) await openPost(entry.id);
}

// --- EVENT LISTENERS ---
document.getElementById('backFromPost').addEventListener('click', () => {
    history.pushState(null, '', '/b/');
    resetMeta();
    showView('listView');
});

window.addEventListener('popstate', () => {
    const m = location.pathname.match(/\/b\/p\/(.+)\.html$/);
    if (m) openPostBySlug(decodeURIComponent(m[1]));
    else { resetMeta(); showView('listView'); }
});

// --- INIT ---
window.onload = async () => {
    await loadPosts();
    renderList();
    // Support both permalink path (/b/p/slug.html) and legacy hash (#slug)
    const m    = location.pathname.match(/\/b\/p\/(.+)\.html$/);
    const hash = location.hash.slice(1);
    if (m)    await openPostBySlug(decodeURIComponent(m[1]));
    else if (hash) await openPostBySlug(hash);
    else showView('listView');
};
