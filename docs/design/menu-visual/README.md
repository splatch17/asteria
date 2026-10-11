# Menu visuel : tuiles, cartes et « Plus de réglages » (#135)

Retour du porteur du projet sur le menu unique (#130) : « modifier certains styles de boutons pour
que ça fasse moins grosse bibliothèque / liste d'options avec plein d'informations dans le
menu ». Le menu était une longue liste de lignes en capitales, chacune avec un interrupteur et une
sous-ligne explicative. Il devient une surface de commande compacte :

- **Tuiles iconiques**, grille de 4 colonnes : un pictogramme gravé sur un libellé court. L'état se
  lit sans interrupteur : une tuile active est encrée (cadre plein, fond légèrement teinté, petit
  carré plein dans l'angle) ; une tuile inactive n'a qu'un filet et un carré vide. Les actions
  sans état (Nord, Recentrer, Masquer, Crédits) n'ont pas de carré.
  - `01 // VUE` : Carte, Terre, puis Nord et Viser (carte) ou Recentrer et Vue réaliste (Terre) ;
  - `02 // POINT DE VUE` (vue Terre) : quatre cartes avec le pictogramme de chaque point de vue.
    Un toucher change de point de vue ; « Visiter un astre » ouvre le sélecteur et ses astres ;
  - `AFFICHAGE` : Lignes, Noms, Figures, Étoiles, Ciel profond, Planètes (carte) ou Lignes,
    Planètes (Terre), puis Nuit et Masquer l'interface.
- **Lieu et temps** : deux lignes de relevé en monospace (lieu et coordonnées, date et
  « ● en direct ») avec leurs actions en boutons-icônes (ma position, régler la date, maintenant).
- **Les sous-lignes disparaissent.** Le libellé complet et l'explication s'affichent dans un
  relevé au pied du menu (`// CIEL PROFOND  Galaxies, nébuleuses et amas…`) quand une tuile a le
  focus, est survolée ou reçoit un appui long (450 ms, le toucher qui suit est annulé). Les
  lecteurs d'écran les reçoivent comme description de la tuile (`aria-describedby`).
- **« Plus de réglages »**, replié par défaut et mémorisé sur l'appareil : grilles, écliptique,
  mini-globe, trajectoires (« Chemins »), voir à travers la Terre, ciel réaliste de jour, vue
  réaliste (carte), plein écran, crédits, luminosité (en mode nuit) et l'aide.
- **Sélecteur de point de vue** (FramePanel) : cartes 2 × 2 avec pictogramme ; l'explication de la
  carte choisie (ou survolée) est lue sous les cartes ; les astres en onglets de 44 px.

Aucun réglage n'est supprimé. Inchangés : nuit rouge par les jetons, mouvement réduit, piège du
focus, Échap, rôles (`aria-pressed`, `radio`/`aria-checked`, `aria-expanded`), cibles d'au moins
44 px, clés ICU (`fr.json`), mémorisation des calques, `lib/hud.ts`.

Captures Playwright (Chromium headless, rendu logiciel SwiftShader), mobile 360 × 780 CSS px @3x
(écran tactile) et ordinateur 1440 × 900, Paris, samedi 10 octobre 2026 à 22 h 30, niveau
Amateur. **Données temporaires, non versionnées** (`apps/web/public/data/` est ignoré par git).

## Hauteur du menu sur téléphone (360 × 780)

| Menu ouvert | Avant | Après |
|---|---|---|
| Carte du ciel | feuille de 710 px, **784 px à faire défiler** | feuille de 520 px, **aucun défilement** |
| Vue Terre | 710 px, 429 px à faire défiler | 555 px, aucun défilement |
| « Plus de réglages » déplié (carte / Terre) | — | 710 px, 144 / 40 px à faire défiler |

Sur ordinateur, le panneau latéral ne prend plus toute la hauteur : il s'arrête à son contenu
(517 px au lieu de 868 px), même déplié (832 px) sans défilement.

## Fichiers

Chaque capture existe en `mobile-…` et `desktop-…` ; `-before` est le menu de `main` (#130),
`-after` le nouveau.

| Fichier | Ce qu'on voit |
|---|---|
| `*-sky-menu-{before,after}.jpg` | Menu ouvert sur la carte du ciel |
| `*-earth-menu-{before,after}.jpg` | Menu ouvert dans la vue Terre (cartes des points de vue) |
| `*-sky-menu-night-{before,after}.jpg`, `*-earth-menu-night-{before,after}.jpg` | Mode nuit rouge |
| `*-earth-pov-{before,after}.jpg` | Sélecteur de point de vue (liste → cartes) |
| `*-sky-more-{before,after}.jpg`, `*-earth-more-{before,after}.jpg` | Avant : bas de la liste ; après : « Plus de réglages » déplié |
| `*-sky-hint-after.jpg` | Relevé du détail : focus sur « Ciel profond » |
| `metrics-{before,after}.json` | Hauteur de la feuille, défilement restant, cibles < 44 px (0) |

## Limites

- L'appui long n'est pas découvrable seul : le relevé l'annonce au repos (« Appui long ou
  survol : le détail d'une tuile »). Sur Android, toucher une tuile lui donne aussi le focus, donc
  son détail s'affiche après chaque toucher.
- Les explications ne dépendent pas du niveau (Découverte/Amateur/Expert) : le niveau par défaut
  étant Amateur, les afficher à ce niveau aurait rallongé le menu par défaut.
