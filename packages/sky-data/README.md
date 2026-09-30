# sky-data — pipeline de données

Scripts Python reproductibles : source officielle → nettoyage → croisement → fichiers compacts pour l'app.

```bash
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -r requirements.txt
python build_stars.py          # → out/stars.json (+ raw/ en cache)
```

`raw/` (téléchargements) et `out/` (générés) ne sont pas versionnés. Sources et licences : `docs/DATA_SOURCES.md`.
