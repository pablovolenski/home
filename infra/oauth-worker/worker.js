/**
 * GitHub OAuth relay for Decap CMS on a static host (Cloudflare Worker).
 *
 * Implements the two endpoints Decap's GitHub backend needs:
 *   GET /auth      → redirects the browser to GitHub's OAuth consent screen
 *   GET /callback  → exchanges the code for a token and hands it back to the
 *                    CMS window via the postMessage handshake Decap expects
 *
 * Deploy: see README.md in this folder. Secrets (set in the Worker, never
 * committed): GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET.
 */

const ALLOWED_ORIGINS = ['https://pablovolenski.com', 'https://www.pablovolenski.com'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/auth') {
      const state = crypto.randomUUID();
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', `${url.origin}/callback`);
      authorize.searchParams.set('scope', 'repo,user');
      authorize.searchParams.set('state', state);
      return new Response(null, {
        status: 302,
        headers: {
          Location: authorize.href,
          'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
        },
      });
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const cookieState = (request.headers.get('Cookie') || '')
        .split(/;\s*/)
        .find((c) => c.startsWith('oauth_state='))
        ?.slice('oauth_state='.length);

      if (!code || !state || state !== cookieState) {
        return html(errorPage('Invalid OAuth state. Close this window and try again.'));
      }

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await tokenRes.json();

      if (data.error || !data.access_token) {
        return html(errorPage(`GitHub error: ${data.error_description || data.error || 'no token returned'}`));
      }

      return html(successPage(data.access_token));
    }

    return new Response('Decap CMS OAuth relay. Endpoints: /auth, /callback', { status: 200 });
  },
};

function html(body) {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Decap handshake: the CMS window opens this popup; the popup announces
// "authorizing:github", waits for the CMS to answer, then posts the result.
function successPage(token) {
  const payload = JSON.stringify({ token, provider: 'github' });
  return `<!doctype html><html><body><script>
  (function () {
    var allowed = ${JSON.stringify(ALLOWED_ORIGINS)};
    var result = 'authorization:github:success:' + ${JSON.stringify(payload)};
    function receive(e) {
      if (allowed.indexOf(e.origin) === -1) return;
      window.removeEventListener('message', receive);
      e.source.postMessage(result, e.origin);
      window.close();
    }
    window.addEventListener('message', receive);
    if (window.opener) {
      allowed.forEach(function (o) { window.opener.postMessage('authorizing:github', o); });
    } else {
      document.body.textContent = 'No opener window — open the CMS and log in from there.';
    }
  })();
  </script>Logging in…</body></html>`;
}

function errorPage(message) {
  return `<!doctype html><html><body><p>${message}</p></body></html>`;
}
