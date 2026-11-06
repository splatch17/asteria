# Outils de captures (`docs/design/<sujet>/`)

Scripts de l'agent pour produire les captures des PR d'interface (#176). Hors CI, à lancer à la main.

1. **Données du ciel temporaires** (non versionnées) quand `apps/web/public/data` est vide et que VizieR est injoignable :
   `python -I tools/captures/build_capture_data.py <dossier téléchargé> packages/sky-data apps/web/public/data`
   — attend dans `<dossier téléchargé>` le catalogue HYG v4.1 (`hyg.csv`, v4.1, dérivé d'Hipparcos, CC BY-SA 4.0) et
   `stellarium-modern.json` (lignes Stellarium « modern »). Ces données servent **uniquement aux captures** : ne pas les
   committer ni les déployer (le site utilise `build_stars.py`).
2. **Serveur** : `pnpm --filter @asteria/web dev --port 4317` (ou `vite preview --port 4317` après un build).
3. **Captures** : `node tools/captures/capture.mjs docs/design/modes [noms…]` — 360 × 780 @3x et bureau 1366 × 820,
   Chromium en rendu logiciel (`--use-gl=swiftshader`).
4. **Retour Android** : `node tools/captures/back-check.mjs` — vérifie que le bouton retour ferme les couches dans l'ordre.

`PW_CHROMIUM` peut désigner un autre Chromium (par ex. `/opt/pw-browsers/chromium`) si la version de Playwright diffère.
