---
title: "Willkommen"
description: "Der erste Beitrag im neuen Blog."
pubDate: 2026-07-20
lang: "de"
---

Das ist der erste Beitrag. Er ist in Markdown geschrieben und liegt unter `src/content/blog/de/`.

## So funktioniert das Schreiben hier

Geschrieben wird **nur auf Deutsch** — entweder direkt als `.md`-Datei in diesem Ordner oder bequem über das CMS unter `/admin/`. Die englische und spanische Version entstehen automatisch: Nach dem Veröffentlichen übersetzt eine GitHub Action den Beitrag und legt ihn unter `en/` und `es/` ab. Ein paar Minuten später ist der Beitrag in allen drei Sprachen online.

Das Frontmatter eines Beitrags sieht so aus:

```
---
title: "Titel des Beitrags"
description: "Eine Zeile Zusammenfassung"
pubDate: 2026-07-20
lang: "de"
---
```

Mit `draft: true` im Frontmatter bleibt ein Beitrag aus dem Build, bis er fertig ist.
