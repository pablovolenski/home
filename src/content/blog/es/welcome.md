---
title: "Bienvenido"
description: "La primera entrada del nuevo blog."
pubDate: 2026-07-20
lang: "es"
translationKey: "welcome"
---

Esta es la primera entrada. Está escrita en Markdown y vive en `src/content/blog/es/`.

## Añadir una nueva entrada

Coloca un nuevo archivo `.md` en esta carpeta con un frontmatter como este:

```
---
title: "Título de la entrada"
description: "Resumen de una línea"
pubDate: 2026-07-20
lang: "es"
translationKey: "clave-unica"
---
```

Luego escribe el cuerpo en Markdown debajo. Pon `draft: true` en el frontmatter para mantener una entrada fuera del build hasta que esté lista.

Para las traducciones: usa el mismo nombre de archivo y el mismo `translationKey` en las carpetas `de/` y `en/` para que las versiones de idioma se enlacen limpiamente con `hreflang`.
