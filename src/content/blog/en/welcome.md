---
title: "Welcome"
description: "The first post on the new blog."
pubDate: 2026-07-20
lang: "en"
---

This is the first post. It's written in Markdown and lives in `src/content/blog/de/` — German is the source language of this site.

## How writing works here

Posts are written **in German only** — either directly as an `.md` file or through the CMS at `/admin/`. The English and Spanish versions are created automatically: after publishing, a GitHub Action translates the post and places it under `en/` and `es/`. A few minutes later the post is online in all three languages.

A post's frontmatter looks like this:

```
---
title: "Post title"
description: "One-line summary"
pubDate: 2026-07-20
lang: "de"
---
```

Setting `draft: true` in the frontmatter keeps a post out of the build until it's ready.
