# Écran « Apprendre » sans cadres en tirets (#185)

Captures Playwright (Chromium headless, SwiftShader, `--disable-accelerated-2d-canvas`), téléphone
360×780 @3x et bureau 1280×800 @1,5x, build de production. Progression de démonstration : 6
constellations maîtrisées, 8 connues, 5 à revoir, 12 consultées, records 8/10 et 6/10.

`avant-*` : cartes de jeu dans un cadre damier en tirets, étiquette « Bientôt » en tirets, cases
« à revoir » en tirets. `apres-*` : cartes à vignette.

| Capture | Ce qu'elle montre |
|---|---|
| `avant-mobile.jpg` / `apres-mobile.jpg` | Haut de l'écran : niveau (commande segmentée pleine largeur), groupe Catalogue (planisphère tramé, réglet des 88 constellations consultées), début des jeux |
| `avant-mobile-bas.jpg` / `apres-mobile-bas.jpg` | Bas de l'écran : dernière carte de jeu et « Ton ciel » (compteurs, cases qui se remplissent par le bas) |
| `avant-mobile-nuit.jpg` / `apres-mobile-nuit.jpg` | Vision nocturne (rouge sur noir), mêmes jetons |
| `apres-mobile-nuit-bas.jpg` | « Ton ciel » en vision nocturne |
| `apres-mobile-nouveau.jpg` | Premier lancement : « Pas encore joué », jauges vides, aucune consultée |
| `apres-mobile-decouverte.jpg` | Niveau Découverte : « Ton ciel » des 29 constellations en 6 colonnes |
| `avant-desktop.jpg` / `apres-desktop.jpg` | Bureau : chaque carte sur une ligne, action à droite |

Vignettes : `apps/web/src/lib/vignettes.ts` (grille 40 × 40, trame Bayer 8×8 à double résolution,
étoiles en pixels, fils fins), rendues en SVG à l'encre `currentColor` par `Vignette.svelte`.
Règle consignée dans `docs/ART_DIRECTION.md` §3 (L'interface).
