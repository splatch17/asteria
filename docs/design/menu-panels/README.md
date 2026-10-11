# Recherche en haut à droite, boussole, menu en panneaux (#138)

Retour du porteur du projet après #130/#135 : « Bouton de recherche en haut à droite plutôt. Et on
enlève le bouton nord, petite boussole plutôt. […] Il vaudrait mieux faire des panneaux séparés,
plus clean. »

## Ce qui change

- **Instruments en haut à droite de la carte**, sur un même axe : la loupe (cercle gravé de
  44 px), le mini-globe (56 px), puis une **petite boussole**. La ligne de temps du bas ne garde que
  lecture, date, visée (téléphone) et menu ; la date n'est plus tronquée sur téléphone.
- **Boussole** : anneau en filet, sept graduations, aiguille pleine vers le nord et « N ». Elle
  tourne en continu avec le cap de la vue (sans transition, donc rien à couper en mouvement réduit) ;
  un toucher remet la vue face au nord (action existante). Libellé vocal : « Boussole : la vue
  regarde vers le sud (180°). Touchez pour faire face au nord. » Pendant la visée capteurs elle
  reste affichée mais ne se touche plus. Masquée en mode immersif et dans la vue Terre ; nuit rouge
  par les jetons.
- **La tuile « Nord » disparaît** du menu.
- **Menu en quatre panneaux** au lieu des sections numérotées « 01 // … » : une rangée d'onglets
  (pictogramme gravé + libellé court) **Vue**, **Affichage**, **Lieu et temps**, **Réglages**. Un
  seul panneau à la fois, sans numérotation, mémorisé sur l'appareil.
  - Sur téléphone, les onglets sont **au pied** de la feuille, sous le pouce et là où était le
    bouton menu (la croix de fermeture prend sa place) : ils ne bougent pas quand la hauteur du
    panneau change. Sur ordinateur, panneau latéral avec les onglets en haut.
  - **Vue** : Carte, Terre, Viser (carte) ou Recentrer (Terre), Nuit, et la luminosité en mode
    nuit ; dans la vue Terre, les quatre cartes de **point de vue** (liste issue de
    `REFERENCE_FRAMES`).
  - **Affichage** : tous les calques de la vue, groupés par famille (Ciel, Système solaire,
    Repères). Le repli « Plus de réglages » disparaît.
  - **Lieu et temps** : lieu et coordonnées (ma position), date (régler, maintenant), une phrase
    d'aide.
  - **Réglages** : Vue réaliste, Masquer l'interface, Plein écran, Crédits, puis l'aide (dont la
    boussole).
- Aucun réglage supprimé hormis « Nord », remplacé par la boussole.

Accessibilité : `tablist`/`tab`/`tabpanel`, `aria-selected`, focus itinérant (flèches gauche/droite,
Début/Fin, activation automatique), piège du focus et Échap inchangés, cibles d'au moins 44 px
(onglets 52 px). Clés ICU dans `fr.json`.

## Hauteur du menu sur téléphone (360 × 780), aucun défilement

| Panneau | Carte du ciel | Vue Terre |
|---|---|---|
| Avant (feuille unique) | 521 px | 555 px |
| Vue | 183 px (237 px en mode nuit) | 285 px |
| Affichage | 452 px | 382 px |
| Lieu et temps | 217 px | 217 px |
| Réglages | 326 px | 292 px |

## Captures

Playwright (Chromium headless, SwiftShader), mobile 360 × 780 @3x tactile et ordinateur
1440 × 900, Paris, samedi 10 octobre 2026 à 22 h 30, niveau Amateur, mouvement réduit. Données
temporaires, non versionnées. `-before` : `main` (d2b2f61) ; `-after` : cette branche. Chaque
fichier existe en `mobile-…` et `desktop-…`.

| Fichier | Ce qu'on voit |
|---|---|
| `*-sky-rest-{before,after}.jpg` | Carte au repos : loupe, mini-globe, boussole (après) |
| `*-sky-rest-night-{before,after}.jpg` | Idem en nuit rouge |
| `*-earth-rest-{before,after}.jpg` | Vue Terre au repos |
| `*-sky-menu-{before,night-before}.jpg`, `*-earth-menu-{before,night-before}.jpg` | Ancien menu |
| `*-sky-menu-{view,display,place,settings}-after.jpg` | Les quatre panneaux, carte du ciel |
| `*-earth-menu-{view,display,place,settings}-after.jpg` | Les quatre panneaux, vue Terre |
| `*-sky-menu-{view,display}-night-after.jpg`, `*-earth-menu-view-night-after.jpg` | Nuit rouge |
