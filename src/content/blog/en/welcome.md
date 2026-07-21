---
title: "Welcome"
description: "The first post on the new blog."
pubDate: 2026-07-20
lang: "en"
translationKey: "welcome"
---

This is the first post. It's written in Markdown and lives in `src/content/blog/en/`.

## Adding a new post

Drop a new `.md` file in this folder with frontmatter like:

```
---
title: "Post title"
description: "One-line summary"
pubDate: 2026-07-20
lang: "en"
translationKey: "unique-key"
---
```

Then write the body in Markdown below it. Set `draft: true` in the frontmatter to keep a post out of the build until it's ready.

For translations: use the same filename and the same `translationKey` in the `de/` and `es/` folders so the language versions link cleanly via `hreflang`.
