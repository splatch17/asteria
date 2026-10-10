# Référentiels de la vue Terre (#122)

Captures Playwright (Chromium headless, rendu logiciel SwiftShader), mobile 360 × 780 CSS px
@3x et ordinateur 1440 × 900, Paris, 21 juin 2026 à 19 h 30 UTC (soir du solstice), style gravé.
**Données temporaires, non versionnées** (`apps/web/public/data/` est ignoré par git) : étoiles
HYG v4.0 (dérivées d'Hipparcos) V ≤ 6,5 et lignes Stellarium, côtes Natural Earth 1:50m réelles,
mais relief schématique (terres claires, océans sombres, tirés des polygones Natural Earth) et
pas de lumières nocturnes : les mosaïques NASA ne sont pas joignables depuis l'environnement de
capture. Seuls la caméra, les repères et l'interface sont à juger ici.

| Fichier | Contenu |
|---|---|
| `{mobile,desktop}-stars.jpg` | Fixé sur les étoiles (par défaut) : pôle Nord céleste en haut, la Terre tourne. |
| `{mobile,desktop}-earth.jpg` | Lié à la Terre : même vue de départ ; quand le temps avance, le lieu reste fixe et le ciel défile (vérifié par test à 0,1° près sur 24 h). |
| `{mobile,desktop}-ecliptic.jpg` | Plan de l'écliptique : pôle de l'écliptique en haut, anneau pointillé du plan de l'écliptique, arc et étiquette « Inclinaison 23,44° ». |
| `{mobile,desktop}-ecliptic-side.jpg` | Le même vu presque dans le plan (orbite 12° au-dessus) : axe terrestre (trait plein) incliné sur la normale pointillée. |
| `{mobile,desktop}-ecliptic-night.jpg` | Mode nuit rouge : les repères pointillés suivent l'encre. |
| `{mobile,desktop}-panel.jpg` | Sélecteur : 4 entrées, « Héliocentrique » et « Centré sur un astre » désactivées (« Bientôt », #123, #124). |
| `{mobile,desktop}-note-*.jpg` | Phrase d'explication affichée au choix d'un référentiel (niveau Amateur ici), discrète, fermée au toucher ou après 9 s. |
| `transition-board-{mobile,desktop}.jpg` | Transition « fixé sur les étoiles » → « plan de l'écliptique » (slerp, ralenti à 4 s par `?frameMs=4000` ; 800 ms normalement, instantané avec `prefers-reduced-motion`). |

Paramètres d'URL de capture : `?space=1&frame=<stars|earth|ecliptic>&orbit=lon,lat,dist`
(orbite dans le référentiel choisi), `&panel=frame`, `&frameNote=1`, `&frameMs=`.
