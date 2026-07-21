# CMS login setup (one-time, ~10 minutes)

The CMS at `https://pablovolenski.com/admin/` logs in with your GitHub
account. Because the site is static (GitHub Pages), the OAuth token exchange
needs one tiny external piece: this Worker, running on Cloudflare's free tier.

Do these four steps once, in order.

## 1. Create the GitHub OAuth App

1. Go to <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - **Application name:** `pablovolenski.com CMS`
   - **Homepage URL:** `https://pablovolenski.com`
   - **Authorization callback URL:** `https://pv-cms-auth.<your-subdomain>.workers.dev/callback`
     (you'll know the exact worker URL after step 2 — you can come back and correct it)
3. Click **Register application**, then **Generate a new client secret**.
4. Keep the **Client ID** and **Client secret** visible for step 3.

## 2. Create the Cloudflare Worker

1. Create a free account at <https://dash.cloudflare.com> (if you don't have one).
2. **Workers & Pages** → **Create** → **Create Worker**.
3. Name it, e.g. `pv-cms-auth` → **Deploy** (the hello-world placeholder).
4. Click **Edit code**, delete the placeholder, paste the entire contents of
   [`worker.js`](./worker.js), then **Deploy**.
5. Note the worker URL, e.g. `https://pv-cms-auth.pablo.workers.dev`.
   If it differs from what you entered in step 1, update the OAuth App's
   callback URL to `<worker-url>/callback`.

## 3. Add the two secrets to the Worker

In the worker's page: **Settings** → **Variables and Secrets** → **Add**:

| Type   | Name                   | Value                        |
|--------|------------------------|------------------------------|
| Secret | `GITHUB_CLIENT_ID`     | Client ID from step 1        |
| Secret | `GITHUB_CLIENT_SECRET` | Client secret from step 1    |

Click **Deploy** again so the secrets take effect.

## 4. Point the CMS at the Worker

In `public/admin/config.yml`, replace the placeholder:

```yaml
backend:
  base_url: https://pv-cms-auth.pablo.workers.dev   # ← your worker URL
```

Commit and push (or ask Claude to do it). After the site redeploys, open
`https://pablovolenski.com/admin/` → **Login with GitHub** → authorize → done.

---

**Also required for translations** (separate from login): add the DeepL key
as a repo secret — GitHub repo → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**, name `DEEPL_API_KEY`, value from
<https://www.deepl.com/pro-api> (free plan).
