# Système solaire à l'échelle réelle et gestes « carte » (#131)

Retour du porteur de projet : « La visite des astres est bien, j'aime moins le repère au sol, je
préférerais voir le système solaire dans une configuration plus réaliste uniquement. Il serait
mieux de pouvoir rotater avec deux doigts et bouger longitudinalement avec 1 doigt. »

Avant : `docs/design/frames-v2/` (schéma compressé, Terre agrandie ≈ 3 900 fois dans les saisons,
« Vu du sol »). Après : une seule scène à l'échelle réelle, de l'orbite de Neptune à la surface
d'une planète, zoom logarithmique continu ; « Vu du sol » retiré.

Captures Playwright (Chromium headless, rendu logiciel SwiftShader), mobile 360 × 780 CSS px @3x et
ordinateur 1440 × 900, Paris, dimanche 11 octobre 2026 vers 17 h (heure locale du conteneur, horloge
réelle : les transitions animées ne progressent pas sous l'horloge simulée de Playwright), niveau
Amateur, style gravé, nouvelle interface de #130. **Données temporaires, non versionnées**
(`apps/web/public/data/` est ignoré par git) : étoiles HYG V ≤ 6,5, lignes Stellarium, côtes
Natural Earth, textures d'exemple de three.js. Les zooms sont faits à la molette vers le repère de
l'astre, les gestes tactiles par CDP (`Input.dispatchTouchEvent`).

| Fichier | Ce qu'on voit |
|---|---|
| `{mobile,desktop}-solar.jpg` | **Le système solaire** à l'ouverture : tout le système jusqu'à l'orbite de Neptune, vu de 64° (48° sur ordinateur) au-dessus de l'écliptique. Orbites osculatrices gravées, repères des planètes (leur phase vue de la caméra), Soleil à son vrai rayon avec un halo gravé ; Mercure, Vénus, la Terre et Mars sont dans le halo du Soleil (fusionnés : à cette échelle on ne peut pas les séparer). Barre d'échelle « 20 UA ». |
| `{mobile,desktop}-inner.jpg` | Le système interne après quelques pincements vers le Soleil : Mercure, Vénus, la Terre, Mars, « 1 UA » / « 0,5 UA ». La Lune reste fusionnée avec la Terre. |
| `{mobile,desktop}-approach-board.jpg` | Approche de Jupiter (zoom ancré sur son repère : Jupiter ne bouge pas d'un pixel pendant 6 ordres de grandeur, mesuré ± 0,2 px jusqu'à 1,8 R⊕ de la surface) : repère seul, repère qui s'efface (globe de 3 à 6 px), globe vrai. L'orbite passe par le centre du globe. Barre « 2 000 000 km » → « 200 000 km ». |
| `{mobile,desktop}-visit.jpg` | Toucher le repère de Jupiter : la visite démarre (transition existante), fiche de Jupiter. |
| `{mobile,desktop}-seasons.jpg` | **Les saisons** refaites : la même scène cadrée sur l'orbite de la Terre ; Soleil et orbite à l'échelle ; la Terre et ses quatre positions aux équinoxes et solstices, datées, chacune avec sa phase et le trait de l'axe (pôle céleste de la date : même direction partout) ; lignes des solstices et des équinoxes ; autres planètes en retrait. L'étiquette de la Terre fusionne avec la marque la plus proche (« Terre · équinoxe il y a 19 j »). |
| `{mobile,desktop}-seasons-earth.jpg` | Toucher la Terre : la caméra la rejoint (à l'échelle, ≈ 12 rayons terrestres) et la suit ; vrai axe, vrai terminateur, arc d'inclinaison, orbite qui traverse le globe ; « 5 000 km ». |
| `{mobile,desktop}-gestures-board.jpg` | Gestes, même vue de départ : **1 doigt** (ou glisser à la souris) déplace la scène sous le doigt ; **2 doigts** glissés vers le haut (ou clic droit + glisser) font tourner la caméra autour du point regardé (ici elle s'abaisse vers l'écliptique). |

## Échelle et précision

- Unité : le rayon terrestre ; 1 au = 23 454,8. Positions héliocentriques d'astronomy-engine
  (testées contre JPL Horizons), rayons IAU ; règles détaillées dans `docs/DATA_SOURCES.md`
  (« Échelles des points de vue »).
- Zoom logarithmique : chaque pincement multiplie la distance de la caméra ; le point sous les
  doigts reste fixe (la caméra et le point regardé sont mis à l'échelle autour de lui). Près d'un
  repère (28 px), le zoom vise le centre de l'astre, la caméra le suit ensuite quand la date avance,
  et ne peut pas entrer dans son globe ; sinon il vise le globe, l'écliptique ou le plan du point
  regardé. Distances de 0,05 R⊕ à 400 au.
- Précision : chaque objet garde ses sommets près de sa propre origine (globes = sphères unité
  mises à l'échelle, orbites écrites par rapport à leur astre, échantillonnées en progression
  géométrique près de lui) ; three.js compose la matrice modèle-vue en double précision : rendu
  relatif à l'œil sans déplacer le monde. Plans de découpe recalculés à chaque image (proche :
  moitié de la distance à la surface la plus proche, ≤ 2 % de la distance regardée ; lointain :
  45 au au-delà du Soleil). Aucun scintillement ni z-fighting observé de Neptune à la surface de
  Jupiter.

## Mesures

CPU du fil principal, Chromium headless (SwiftShader), 360 × 780 : recalcul par changement de
date de la scène (≈ 30 appels d'astronomy-engine, 9 orbites osculatrices de 321 points) 0,55 ms ;
étiquettes, repères, barre d'échelle 0,11 ms (système solaire) à 0,17 ms (saisons) par image ;
préparation du rendu 0,4–0,5 ms. Appels de rendu : 29–30 (13 pour « La Terre tourne ») ;
45 k triangles (globes 64 × 32). Le temps GPU sous SwiftShader n'est pas représentatif d'un
téléphone : à mesurer sur un Android milieu de gamme.
