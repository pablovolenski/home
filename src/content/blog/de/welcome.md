---
title: "Willkommen"
description: "Der erste Beitrag im neuen Blog."
pubDate: 2026-07-20
lang: "de"
translationKey: "welcome"
---

Das ist der erste Beitrag. Er ist in Markdown geschrieben und liegt unter `src/content/blog/de/`.

## Einen neuen Beitrag hinzufügen

Leg eine neue `.md`-Datei in diesem Ordner ab, mit Frontmatter wie hier:

```
---
title: "Titel des Beitrags"
description: "Eine Zeile Zusammenfassung"
pubDate: 2026-07-20
lang: "de"
translationKey: "eindeutiger-schluessel"
---
```

Danach schreibst du den Text darunter in Markdown. Setze `draft: true` im Frontmatter, um einen Beitrag aus dem Build herauszuhalten, bis er fertig ist.

Für Übersetzungen: verwende denselben Dateinamen und denselben `translationKey` in den Ordnern `en/` und `es/`, damit die Sprachversionen sauber über `hreflang` verknüpft werden.
