---
title: "Bienvenido"
description: "La primera entrada del nuevo blog."
pubDate: 2026-07-20
lang: "es"
---

Esta es la primera entrada. Está escrita en Markdown y vive en `src/content/blog/de/` — el alemán es el idioma fuente de este sitio.

## Cómo funciona la escritura aquí

Las entradas se escriben **solo en alemán** — directamente como archivo `.md` o a través del CMS en `/admin/`. Las versiones en inglés y español se crean automáticamente: tras publicar, una GitHub Action traduce la entrada y la coloca en `en/` y `es/`. Unos minutos después, la entrada está online en los tres idiomas.

El frontmatter de una entrada se ve así:

```
---
title: "Título de la entrada"
description: "Resumen de una línea"
pubDate: 2026-07-20
lang: "de"
---
```

Con `draft: true` en el frontmatter, una entrada queda fuera del build hasta que esté lista.
