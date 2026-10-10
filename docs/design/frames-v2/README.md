# Points de vue de la vue Terre (#128, #124)

Refonte des référentiels de #122 (avant : `docs/design/frames/`, où « fixé sur les étoiles »,
« lié à la Terre » et « écliptique » donnaient presque la même image). Chaque référentiel devient
un **point de vue** qui raconte un phénomène : son cadrage, ses repères gravés, une démonstration
(le temps défile à la vitesse du phénomène en entrant, via les commandes du temps) et une légende
« Fixe : … · Bouge : … » selon le niveau.

Captures Playwright (Chromium headless, rendu logiciel SwiftShader), mobile 360 × 780 CSS px @3x
et ordinateur 1440 × 900, Paris, samedi 10 octobre 2026 à 9 h TU, niveau Amateur, style gravé.
**Données temporaires, non versionnées** (`apps/web/public/data/` est ignoré par git) : étoiles
HYG (dérivées d'Hipparcos) V ≤ 6,5, lignes Stellarium, côtes Natural Earth 1:50m, relief et
lumières tirés des textures d'exemple de three.js (les mosaïques NASA ne sont pas joignables
depuis l'environnement de capture). Seuls le cadrage, les repères, les échelles et l'interface
sont à juger ici.

## Au repos

| Fichier | Point de vue | Ce qu'on voit |
|---|---|---|
| `{mobile,desktop}-stars.jpg` | 1. **La Terre tourne** (fixé sur les étoiles, par défaut) | La Terre entière avec une marge, pôle Nord céleste en haut, vue à 90° du Soleil : le terminateur coupe le disque. La lumière du Soleil arrive de la gauche (symbole du Soleil au bord de la zone libre, trois rayons gravés en pointillé jusqu'au limbe éclairé). Flèche de rotation au-dessus du pôle Nord, « 1 tour en 23 h 56 min ». |
| `{mobile,desktop}-earth.jpg` | 2. **Vu du sol** (lié à la Terre) | Caméra au-dessus de votre lieu (« Vous êtes ici » au centre). Le Soleil et la Lune (glyphes gravés de la carte, phase de la Lune) sur leurs cercles du jour en pointillé, à des distances schématiques ; trajet subsolaire et sublunaire du jour sur le globe, point subsolaire cerclé. |
| `{mobile,desktop}-seasons.jpg` | 3. **Les saisons** (écliptique, centré sur le Soleil) | Le Soleil au centre, l'orbite de la Terre (vraie forme, 1 au = 6 rayons terrestres) vue de 32° au-dessus sur ordinateur et de 58° sur un téléphone en portrait (l'ellipse plus haute occupe la hauteur libre), juin à droite. Terre agrandie ≈ 3 900 fois (annoncé dans la légende), son axe allongé. Quatre Terres fantômes aux équinoxes et solstices de l'année, datées, éclairées depuis le Soleil, leurs axes parallèles ; lignes des solstices et des équinoxes ; arc d'inclinaison et pôle de l'écliptique sur la Terre. |
| `{mobile,desktop}-solar.jpg` | 4. **Le système solaire** (héliocentrique, #124) | Le Soleil, les 8 orbites (distances compressées 6,1 · ln(1 + r / 0,15 au)), les planètes à leur position du jour en petits globes gravés éclairés par le Soleil (rayons (R / R⊕)^¼), vu de 48° (64° en portrait). Chaque planète garde son nom : étiquettes posées à l'opposé du Soleil, avec un trait de rappel quand elles sont serrées, sans jamais couvrir un disque. Ligne de visée Terre → Mars en pointillé jusqu'au cercle de fond, et sa trace sur 6 mois (spirale vers l'intérieur pour que le retour en arrière se voie). Toucher une planète la visite (point de vue 5). |
| | | **Étiquettes des schémas** : quand la Terre est à moins de 20 jours d'un équinoxe ou d'un solstice, son étiquette et celle de la marque fusionnent (« Terre · équinoxe il y a 17 j ») ; « Vous êtes ici » est posé sur son repère et masqué quand le lieu est sur la face cachée ; « 1 tour en 23 h 56 min » au-dessus de la flèche de rotation. |
| `{mobile,desktop}-body.jpg` | 5. **Visiter un astre** (#123, ici Mars) | Inchangé sauf la légende au format commun et l'en-tête « Visite : Mars ». |
| `{mobile,desktop}-panel.jpg` | Sélecteur | Les 5 points de vue, chacun avec un pictogramme gravé et une ligne d'aide ; sous-liste des astres pour « Visiter un astre ». |
| `{mobile,desktop}-seasons-night.jpg` | Les saisons en mode nuit rouge | Repères, glyphes, globes et légende ramenés à l'encre rouge. |
| `{mobile,desktop}-earth-reduced.jpg` | Vu du sol avec `prefers-reduced-motion` | Pas de lecture automatique : état statique explicite, Soleils fantômes 3 h et 6 h avant et après. (Les saisons et le système solaire ont toujours leurs fantômes et leur trace.) |

L'en-tête nomme le point de vue (« LES SAISONS ») ; le lieu passe dans la ligne de méta.

## Démonstrations (planches de 6 étapes)

Lancées par `?demo=1` (ou en choisissant le point de vue, ou en arrivant du ciel), horloge simulée
de Playwright ; la date et le curseur du temps défilent dans chaque image. La démonstration boucle
sur la plage ; elle se met en pause au premier geste (vérifié : un glisser met la lecture en pause)
ou au premier toucher du curseur.

| Fichier | Vitesse | Ce qui se voit |
|---|---|---|
| `demo-stars-{mobile,desktop}.jpg` | 1 s = 1 h, étapes de 2 s | Les continents tournent sous la ligne jour/nuit fixe, la lumière venant toujours de la gauche. |
| `demo-earth-{mobile,desktop}.jpg` | 1 s = 1 h, étapes de 2 s | Votre lieu reste fixe ; le Soleil et la Lune font le tour de la Terre, le terminateur balaie les continents (la nuit tombe sur Paris vers 17 h TU ; le jour s'y lève vers + 20 h dans la boucle). |
| `demo-ecliptic-{mobile,desktop}.jpg` | 1 s = 1 semaine (par jours entiers, même heure chaque jour : pas de stroboscope), étapes de 5 s | La Terre fait le tour du Soleil, son axe garde sa direction ; l'année repart à −6 mois en fin de plage. |
| `demo-heliocentric-{mobile,desktop}.jpg` | 1 s = 1 mois, étapes de 2 s | Les planètes avancent, d'autant plus lentement qu'elles sont loin ; la ligne Terre → Mars balaie le fond. |
| `transition-{mobile,desktop}.jpg` | — | Passage « La Terre tourne » → « Les saisons », ralenti à 4 s (`?frameMs=4000`, 1,4 s normalement, instantané avec `prefers-reduced-motion`) : la caméra recule et se tourne d'un seul mouvement continu (slerp, distance interpolée géométriquement) vers le Soleil du schéma. |

## Mesures

CPU du fil principal, Chromium headless (SwiftShader), 360 × 780 : mise à jour par image (poids
des points de vue, opacités, caméra, étiquettes et rayons du Soleil) 0,03–0,06 ms ; recalcul par
changement de date (une démonstration change la date à chaque image) 0,01 ms (Terre tourne),
0,05 ms (saisons), 0,09 ms (système solaire, trace Terre → Mars en cache) ; profil de 3 s pendant
une démonstration : ≈ 0,4 ms de JavaScript par image. Appels de rendu : 14 (Terre tourne), 17 (vu
du sol), 20 (saisons), 30 (système solaire, 7 globes de 32 × 16) ; triangles 9 k → 16 k. Le temps
GPU sous SwiftShader (rendu logiciel) n'est pas représentatif d'un téléphone : à mesurer sur un
Android milieu de gamme.

Paramètres d'URL de capture : `?space=1&frame=<stars|earth|ecliptic|heliocentric|body>`,
`&body=`, `&demo=1`, `&panel=frame`, `&night=1`, `&frameMs=`, `&orbit=lon,lat,dist`.
