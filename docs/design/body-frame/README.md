# Référentiel « centré sur un astre » (#123)

Captures Playwright (Chromium headless, rendu logiciel SwiftShader), mobile 360 × 780 CSS px
@3x et ordinateur 1440 × 900, Paris, 1er octobre 2026 à 20 h UTC, niveau Amateur.
**Données temporaires, non versionnées** (`apps/web/public/data/` est ignoré par git) : étoiles
HYG v4.1 (dérivées d'Hipparcos) V ≤ 6,5, lignes Stellarium « modern », côtes Natural Earth
1:50m ; relief, lumières nocturnes, carte de la Terre et carte de la Lune tirées des textures
d'exemple de three.js (les mosaïques NASA ne sont pas joignables depuis l'environnement de
capture). Pas d'atlas des planètes : en style réaliste, les planètes prendraient leurs couleurs
de repli. Seuls la caméra, l'éclairage, l'échelle et l'interface sont à juger ici.

Avant : l'entrée « Centré sur un astre » était désactivée (« Bientôt »), voir
`docs/design/frames/{mobile,desktop}-panel.jpg`.

| Fichier | Contenu |
|---|---|
| `{mobile,desktop}-moon.jpg` | Centré sur la Lune (gravure) : globe tramé 1-bit éclairé par le Soleil, vu à 50° du Soleil, côté Terre. Encart d'échelle : distance à la Terre, temps de lumière, ce qui est à l'échelle. |
| `{mobile,desktop}-saturn.jpg` | Centré sur Saturne : anneaux C à A dans le plan de l'équateur (pôle IAU en haut), ombre des anneaux sur le globe et du globe sur les anneaux. En 2026 la Terre est presque dans le plan des anneaux ; la vue de départ est relevée de 15° vers le pôle. |
| `{mobile,desktop}-jupiter.jpg` | Centré sur Jupiter. |
| `{mobile,desktop}-moon-realistic.jpg` | Style réaliste : carte de la Lune, éclairage de Lambert (mêmes textures et shaders que les vignettes de `space-style`). |
| `{mobile,desktop}-moon-night.jpg` | Mode nuit rouge : tout le rendu ramené à l'encre rouge. |
| `{mobile,desktop}-moon-earth.jpg` | Derrière la Lune (`orbit=75.44,18.63,4`) : la Terre, à l'échelle réelle à 369 000 km, « vous êtes ici » ; la Lune est en croissant vue de là. |
| `{mobile,desktop}-panel.jpg` | Sélecteur : l'entrée est active, avec la sous-liste Lune, Mercure… Neptune. |
| `{mobile,desktop}-note.jpg` | Phrase d'explication (niveau Amateur) au choix du référentiel. |
| `transition-board-moon-{mobile,desktop}.jpg` | Voyage de la Terre (fixé sur les étoiles) à la Lune ; `t` = fraction du temps de la transition. |
| `transition-board-saturn-desktop.jpg` | Voyage de la Terre à Saturne (1,3 milliard de km) : la planète reste un point avec son nom tant que son disque fait moins de 6 px, puis le globe prend le relais. |

Transition : d'abord la caméra se tourne vers l'astre (40 % du temps), puis elle voyage ; la
distance est parcourue géométriquement (autant d'images de 10⁶ à 10⁵ km que de 10⁵ à 10⁴ km),
si bien qu'une planète lointaine grandit régulièrement. Durée : au moins 1,6 s, ralentie ici à
6 s par `?frameMs=6000` (horloge simulée de Playwright) ; instantanée avec
`prefers-reduced-motion`.

Paramètres d'URL de capture : `?space=1&frame=body&body=<Moon|Mercury|…|Neptune>`,
`&orbit=lon,lat,dist` (dans le référentiel de l'astre, distance en rayons terrestres),
`&style=realistic`, `&night=1`, `&panel=frame`, `&frameNote=1`, `&frameMs=`.
