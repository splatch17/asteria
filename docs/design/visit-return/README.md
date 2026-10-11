# Retour fluide de la visite d'un astre au système solaire (#134)

Retour du porteur de projet : « Bien pour la visite des astres, il faudrait que cela soit plus
fluide pour le retour au système solaire ensuite. »

## Diagnostic (avant)

`phone-before-menu-board.jpg` : la seule sortie passait par le menu, tuile « Le système solaire ».

- **Le menu** : il faut l'ouvrir, choisir un point de vue, puis une note explicative s'affiche par
  dessus la scène ; vers « Les saisons », la démonstration (le temps qui défile) démarrait.
- **La caméra** : le retour utilisait le trajet « vers un astre » (`trip`) : la caméra se tournait
  d'abord vers la destination (le Soleil, hors de l'écran), si bien que la planète quittait l'écran
  dès les premières images ; le ciel restait vide, puis la caméra traversait l'orbite de la Terre
  (la Lune, la Terre, Vénus défilaient) avant d'arriver sur le système entier, cadré par défaut.
- **Le changement de scène** : les globes, repères et noms du système solaire apparaissaient d'un
  coup à mi-transition (poids ≥ 0,5), le globe de la visite restait affiché jusqu'à la fin.
- **Le temps de lumière** : la visite place l'astre à sa position astrométrique (corrigée du temps
  de lumière), le système solaire à sa position géométrique : jusqu'à ≈ 12 rayons terrestres
  d'écart pour Neptune (5,4 km/s pendant ≈ 4 h). Pendant la seconde moitié de la transition, les
  deux globes du même astre étaient dessinés côte à côte, puis le premier disparaissait.
- **Le cadrage précédent** était perdu (retour sur le cadrage par défaut du point de vue).
- **Première image** : les programmes du système solaire n'étaient compilés qu'à leur premier
  affichage : 80–220 ms de blocage au premier retour (mesuré sous SwiftShader).

## Après

1. **Sortie sans le menu** : continuer à écarter les doigts (ou la molette) au-delà de la
   distance la plus lointaine de la visite (40 rayons de l'astre) : au-delà d'un excès cumulé de
   ×1,25 dans le même geste (`PinchExit`, comme l'entrée dans la carte du ciel), la caméra
   continue seule vers le système solaire. Ou bien « ← Système solaire », une ligne gravée sous
   l'en-tête (clé `frame.body.back`, aide `frame.body.backHint`), sans colonne de boutons.
2. **Trajet continu** : l'inverse de l'aller. La caméra recule en regardant l'astre, sa distance
   interpolée géométriquement ; le point regardé ne quitte l'astre qu'à mesure que la distance
   grandit (`returnFraction`, un `travelFraction` dont l'étendue est la croissance de la distance) :
   l'angle de l'astre par rapport à l'axe de visée ne fait que croître jusqu'à sa place finale,
   l'astre reste donc à l'écran du début à la fin (testé). Le globe passe la main à son repère
   (le repère de l'astre visité est dessiné sur le globe, à pleine opacité ; son glyphe du ciel
   reste masqué) ; les autres repères, noms et la barre d'échelle apparaissent en fondu
   (`sceneFade`) au lieu d'un coup.
3. **Pas de saut de temps de lumière** : pendant les premiers 35 % du retour, le globe et le
   point regardé glissent ensemble de la position astrométrique à la position géométrique
   (`shiftProgress`, `returnTarget`) : rien ne bouge à l'écran (les étoiles sont à l'infini, les
   autres astres à des millions de rayons). À l'aller, le même écart est absorbé quand l'astre est
   encore loin. Le globe de la scène du même astre est masqué pendant la transition : un seul
   globe, jamais deux.
4. **Contexte conservé** : date, calques, style. Le cadrage du système solaire d'avant la visite
   (et le point de vue : « Le système solaire » ou « Les saisons ») est repris si l'astre y est
   bien visible (à 24 px du bord de la zone utile) ; sinon la caméra se cadre sur l'astre avec son
   primaire (le Soleil, ou la Terre pour la Lune) au-dessus, vue de 35° au-dessus de l'écliptique,
   et suit l'astre quand la date avance. Pas de note ni de démonstration au retour.
5. **Mouvement réduit** : fondu enchaîné de 220 ms (l'image de la visite copiée sur un canvas posé
   par-dessus, qui s'efface) au lieu du vol.

## Captures

Playwright (Chromium headless, rendu SwiftShader), téléphone 360 × 780 @3x et ordinateur
1440 × 900, Paris, 11 octobre 2026 vers 19 h 45, niveau Amateur, style gravé. Données
temporaires non versionnées (`apps/web/public/data/`). Dézoom à la molette ; `?frameMs=4000`
ralentit la transition pour la séquence (durée réelle : 1,6 s).

| Fichier | Ce qu'on voit |
|---|---|
| `phone-before-menu-board.jpg` | **Avant** : menu → « Le système solaire » ; la caméra se détourne de Jupiter, ciel vide, traversée de l'orbite terrestre, note par-dessus. |
| `phone-saturn-board.jpg`, `phone-saturn-{1..5}.jpg` | Système solaire → toucher Saturne (aller) → visite → dézoom au-delà : Saturne recule au centre, son repère prend le relais, retour exact au cadrage d'avant. |
| `phone-jupiter-board.jpg`, `phone-jupiter-{1..7}.jpg` | Visite de Jupiter ouverte directement (pas de cadrage précédent) → dézoom : retour cadré sur Jupiter, le Soleil et les planètes internes au-dessus, « 1 UA ». |
| `desktop-jupiter-board.jpg` | Même séquence sur ordinateur. |
| `desktop-moon-visit.jpg`, `desktop-moon-return.jpg` | « ← Système solaire » sous l'en-tête pendant la visite de la Lune ; après le clic : la Lune cadrée avec la Terre et l'orbite lunaire. |
| `phone-reduced-motion-board.jpg` | `prefers-reduced-motion` : visite de Mars, fondu enchaîné (≈ 60 ms puis 120 ms), arrivée. |
| `phone-earth-rest-{before,after}.jpg` | « La Terre tourne » : les flèches tiretées du Soleil vers la Terre retirées ; le Soleil, son nom, l'anneau de rotation et « Vous êtes ici » restent. |

## Mesures

Temps CPU du fil principal par image (rappel `requestAnimationFrame` de la vue), Chromium
headless SwiftShader ; ≈ 25–30 images/s, limitées par le GPU logiciel (non représentatif d'un
téléphone) :

| Cas | Visite, pendant le pincement | Pendant le retour (1,6 s) |
|---|---|---|
| Jupiter, téléphone | médiane 0,5 ms, p95 1,1 ms | médiane 1,0 ms, p95 2,7 ms, max 4,5 ms |
| Neptune, téléphone | médiane 0,5 ms, p95 1,2 ms | médiane 1,1 ms, p95 3,0 ms, max 4,2 ms |
| Lune, téléphone | médiane 0,3 ms, p95 1,1 ms | médiane 1,0 ms, p95 2,0 ms, max 7,2 ms |
| Jupiter, ordinateur | médiane 0,5 ms, p95 1,9 ms | médiane 1,1 ms, p95 3,5 ms, max 5,0 ms |

Le départ du retour (`exitVisit` : changement de repère, positions, cadrage) coûte 6,2 ms une
fois. Avant le préchauffage des programmes, la première image du retour prenait 80–220 ms. Le
calcul de la transition (`placeCamera`, `placeVisitedGlobe`, `returnTarget`) n'alloue rien : des
vecteurs réutilisés. À mesurer sur un Android milieu de gamme.
