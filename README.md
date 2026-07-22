# pablovolenski.com

Personal site + trilingual blog. Astro static build, deployed to GitHub Pages
by Actions on every push to `main`, custom domain via `public/CNAME`.

## Languages — German is the source of truth

| | URL | maintained |
|---|---|---|
| Deutsch | `/`, `/blog`, … | **by hand / CMS** — the only language you edit |
| English | `/en/…` | generated (DeepL) |
| Español | `/es/…` | generated (DeepL) |

Every page carries `hreflang` alternates, per-language canonical, translated
meta title/description, and is listed in `sitemap-index.xml`.

### How publishing works

1. Edit German content — blog post in the CMS (`/admin/`) or any file under
   `src/content/blog/de/` / `src/i18n/de.json`.
2. On push to `main`, the **Translate** workflow (`.github/workflows/translate.yml`)
   sends the changed German text to DeepL and commits the English/Spanish
   versions automatically (needs the `DEEPL_API_KEY` repo secret).
3. That commit triggers the normal **Deploy site** workflow — a few minutes
   later all three languages are live.

### Fixing a bad machine translation

Don't edit `src/i18n/en.json` / `es.json` or `src/content/blog/en|es/` by
hand — the next translation run overwrites them. Instead:

- **Page copy:** put the corrected string into `src/i18n/overrides/en.json`
  (or `es.json`) mirroring the structure of `de.json`. Overrides always win.
- **Blog posts:** overrides don't cover posts; if a post translation needs a
  permanent fix, edit the German source until the translation comes out right,
  or ask Claude to adjust the pipeline.

Manual full re-run: Actions → "Translate DE → EN/ES" → Run workflow.
Local run: `npm run translate -- --all` (needs `DEEPL_API_KEY` in the env).

## CMS

Decap CMS at `/admin/` (GitHub login via a Cloudflare Worker OAuth relay —
one-time setup in [`infra/oauth-worker/README.md`](infra/oauth-worker/README.md)).
It edits **German only**: blog posts and all page texts (including SEO
metadata). Local alternative without OAuth: `npx decap-server` in one
terminal, `npm run dev` in another, then open `http://localhost:4321/admin/`.

## Development

```bash
npm install
npm run dev        # dev server
npm run build      # production build to dist/
npm run translate  # translation pipeline (see above)
```

## Repo layout

- `src/pages/` — German routes at root, `[lang]/` for en/es
- `src/components/` — shared page bodies (one markup, three languages)
- `src/i18n/` — `de.json` (source), `en/es.json` (generated), `overrides/`
- `src/content/blog/{de,en,es}/` — posts; `de/` is the only hand-edited folder
- `public/` — static passthrough: legacy apps (`a.html`, `c.html`, `d.html`,
  `e/`, `f/`, `evaluator/`), `admin/` (CMS), `CNAME`, `robots.txt`
- `scripts/translate.mjs` — DE→EN/ES pipeline (DeepL, Markdown-AST-safe)
- `infra/oauth-worker/` — CMS login relay (deployed on Cloudflare)
