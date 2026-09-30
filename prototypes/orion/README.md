# Prototype DA — Orion (#4)

Exploration des 3 variantes de style (voir `docs/ART_DIRECTION.md`) :

- **A — Gravure tramée** : tramage ordonné 1-bit (Bayer 8×8) — ✅ **retenu**
- **B — Halftone / scanlines** : points de trame alignés en lignes horizontales
- **C — Grain** : tramage stochastique animé (particules)

```bash
python make_fixture.py   # après packages/sky-data/build_stars.py
pnpm --filter @asteria/proto-orion dev
```

Figure source : Sidney Hall, *Urania's Mirror* (1824), pl. 29 — domaine public (Wikimedia Commons). Prototype uniquement : les figures finales seront produites via le pipeline artiste + IA.
