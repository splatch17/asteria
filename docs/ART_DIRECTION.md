# Direction artistique

> Statut : **validée** par le porteur du projet (2026-09-30). Palette fixée. **Style de figure retenu : A — gravure tramée 1-bit (Bayer 8×8)**, sans rayons. D'autres améliorations stylistiques seront étudiées plus tard.
> Référence analysée le 2026-09-30 : https://hermes-agent.nousresearch.com/ (HTML, CSS et visuels). On reprend le **style**, pas les couleurs ni les images (droits de Nous Research : aucune de leurs images ne doit entrer dans le repo).

## 1. Ce qui fait le style Hermes Agent (analyse)

### Imagerie
| Visuel du site | Technique | Ce qu'on en retient |
|---|---|---|
| **Hero** — Hermès à six bras tenant des faisceaux de rayons | Gravure classique (taille-douce, hachures) en blanc sur noir, **rayons en fils fins** qui partent des mains, halo de rayons concentriques, fond marbré / éclairs | Les figures mythologiques sont des **gravures anciennes** mises en scène avec des **lignes géométriques fines** qui rayonnent → pour nous : les lignes de constellation sont ces fils |
| **Buste d'Hermès + fenêtres d'interface** | Statue en **tramage à points (halftone/dither 1-bit)**, glitch, fenêtres UI flottantes, yeux recadrés | Le mythique se mêle à des **panneaux de données** flottants |
| **Visage en lignes de balayage** | **Scanlines horizontales** faites de points (effet écran CRT / impression) | Texture de révélation / chargement |
| **Ange dans les nuages** | Gravure **inversée** (négatif), grain stochastique fort | Grain et négatif = aspect mystique, onirique |
| **Carré damier + tourbillon** | Motif **damier pixel**, bordure de carrés, lignes ondulantes vers un centre, petite figure au centre | Cadres et bordures **pixel/damier** ; compositions centripètes (idéal pour les tourbillons et vortex) |

**Points communs** : monochrome (noir profond + blanc), **1-bit / tramage**, grain, gravure ancienne, géométrie fine et nette, contraste maximal, un seul accent de couleur ailleurs dans l'UI.

### Typographie (relevée dans le CSS)
- Titres : **grotesque compressée/condensée** très haute (*Rules Gothic Compressed*), en capitales, très grande.
- Corps : grotesque variable sobre (*Rules*).
- Métadonnées / labels : **monospace** (*Aeonik Fono*, *Hermes Legacy Mono*), en capitales, **letter-spacing 0.1em**, numérotation `#1 Connect`, `//`.
- Un **serif display** (*Sigurd*) pour les touches solennelles.

### Mise en page et UI
- **Angles vifs** (border-radius 0 ou très faible), **filets fins (hairlines)** pour structurer.
- Sections numérotées, beaucoup de noir, blocs de texte courts.
- Modes de fusion (`screen`, `lighten`, `exclusion`, `plus-lighter`) pour superposer l'art et l'UI.
- Blocs de code/terminal utilisés comme éléments graphiques.

## 2. Palette (validée)

| Token | Valeur | Rôle |
|---|---|---|
| `--ast-night` | **#101B52** | Fond : bleu nuit profond (remplace le noir de Hermes) |
| `--ast-parchment` | **#F0E6D2** | Encre : parchemin (remplace le blanc) — étoiles, gravures, texte |
| dérivés | `color-mix()` des deux | Filets (parchemin ~15-25 %), surfaces (nuit éclaircie de 4-8 %), texte secondaire (parchemin ~65 %) |
| `--ast-night-deep` | ≈ #0A1136 | Fond plus sombre pour le ciel en mode Live (contraste des étoiles faibles) |
| nuit rouge | #FF2A1A sur #000 | Mode vision nocturne : les deux tokens sont remappés |

Principe : **deux tons**, comme une gravure imprimée à l'encre parchemin sur papier bleu nuit (cyanotype inversé). Le tramage 1-bit utilise exactement ces deux couleurs. Les couleurs physiques des étoiles (B-V) restent très désaturées et ne s'affichent qu'en niveau Amateur/Expert ou à fort zoom.

## 3. Traduction pour Asteria : « Gravure céleste computationnelle »

### Le ciel
- Fond **bleu nuit #101B52** uni (pas de dégradé cartoon). Étoiles nettes, couleur physique très **désaturée** (B-V) pour rester presque monochrome ; en mode « Pur », 100 % parchemin.
- **Lignes de constellation = fils de lumière fins**, nets, comme gravés. (Les rayons façon hero Hermes ont été testés puis écartés.)
- Voie lactée : **lueur diffuse et transparente** violet / bleu profond sur la carte, ajoutée au ciel sans jamais masquer une étoile (choix du porteur, #168, après un essai en grain de points en #162) ; même lueur dans la vue Terre en style gravure ; en style réaliste, bande de photo à longue pose sur ciel noir.

### Les figures mythologiques (le cœur de la DA)
- Style : **gravure ancienne** (référence : atlas de Bayer *Uranometria* 1603, Hevelius 1690, *Urania's Mirror* 1824 — tous **domaine public**) retravaillée par artiste + IA, puis rendue en temps réel par shader :
  - **Tramage 1-bit** (Bayer / blue-noise) ou **halftone** ;
  - variante **scanlines** pour les transitions ;
  - **grain** et léger glitch à l'apparition.
- **Apparition** : la figure « se révèle » depuis les étoiles, les points de trame se densifient.
- ~~Cadres damier/pixel pour les cartes de collection~~ : abandonnés (#185, jugés lourds par le porteur) ; voir « Cartes » dans L'interface.

### L'interface
- Titres : grotesque compressée en capitales (candidates libres : *Anton*, *Bebas Neue*, *Big Shoulders Display*, *Oswald* ; à tester).
- Données : **monospace en capitales**, espacées (`RA 05H 55M 10.3S · DEC +07° 24′ 25″`), apparition caractère par caractère. Candidates : *JetBrains Mono*, *IBM Plex Mono*, *Space Mono*.
- Solennel : serif display pour les noms mythologiques (candidates : *Cormorant*, *Cinzel*, *EB Garamond*).
- **Lecture : *Atkinson Hyperlegible*** (Braille Institute, SIL OFL 1.1 ; #208, choix du porteur, maquette C de l'audit UX) pour toute prose de plus de trois lignes : histoires et anecdotes des constellations (fiche de la carte, aperçu replié compris, et page du catalogue), explications de « Selon la latitude » (texte du niveau, « Ce que visible veut dire »). Jeton `--ast-font-text`, 15 px, interlignage 1,55 (`--ast-text-size`, `--ast-text-leading`), ligne de 65 caractères au plus (`--ast-text-measure`, 32 em) quand la mise en page le permet ; les notes secondaires d'un panneau passent à 14 px en encre atténuée. Graisse 400 seulement (pas de gras dans les textes). JetBrains Mono reste la police des données, des étiquettes, des titres de panneau et des boutons ; les mots en italique d'un récit (titres d'œuvres, mots grecs, latins ou arabes translittérés) restent en *Cormorant* italique, qui a leurs diacritiques (ḥ, ō…). **La police n'a pas de grec** : la pile `--ast-font-text` se replie sur JetBrains Mono, si bien que α, β, φ, δ… (et ′ ″) s'écrivent en mono comme des données, sans balisage. Le zéro barré (0 / O) fait partie de la police. Les phrases courtes des fiches (une ou deux lignes en Découverte, #201) gardent la serif : la règle des trois lignes ne s'y applique pas (comparaison `docs/design/reading-font/variante-fiche-betelgeuse.jpg`). Formules de l'Expert : espaces insécables dans |φ − δ| pour ne pas couper une valeur absolue. Captures `docs/design/reading-font/`.
- Angles vifs, filets fins, panneaux flottants façon fenêtres (comme le buste Hermès).
- **Séparer les parties : des panneaux, pas des numéros** (#171, demande du porteur). Les intitulés numérotés façon Hermes (`#01 // TITRE`, `//` en préfixe) sont abandonnés partout. Une partie d'écran ou de fiche est un **panneau minimaliste** : filet fin (`--ast-panel-border`, parchemin 20 %), lavis d'encre très léger (`--ast-panel-bg`, parchemin 4 %), marge intérieure généreuse (`--ast-panel-pad`, 14 px), 12 px entre deux panneaux (`--ast-panel-gap`) ; titre court en capitales espacées (mono 10 px, interlettrage 0,12 em, parchemin 65 %), sans numéro ni barres obliques. Classes globales `.panel-block` / `.panel-title` (`apps/web/src/app.css`). Les éléments d'une même partie se séparent par un simple filet. L'en-tête de la carte n'affiche que le titre et le lieu (« CARTE DU CIEL · PARIS ») ; dans les lignes de données, le séparateur est le point médian « · ». En nuit rouge, le lavis devient un rouge très sombre sur noir (mêmes jetons).
- **Cartes (catalogue, jeux) : une vignette, pas un cadre** (#185, demande du porteur). **Aucun contour en tirets ni cadre damier/pixel** autour d'une carte, d'une étiquette ou d'une case : le pointillé est réservé aux tracés du ciel (trait faux, trajectoire). Une carte est un panneau (#171) qui porte une **vignette** de ciel tramé dessinée par le code (`lib/vignettes.ts`, grille de 40 pixels, fond tramé Bayer 8×8 à double résolution, étoiles en pixels entiers, fils fins qui s'arrêtent avant les étoiles, trame dégagée sous les fils), le titre, une ligne d'accroche, le record ou la progression (jauge de pastilles ou réglet d'une graduation par constellation) et **une seule action** pleine qui couvre toute la carte (un toucher n'importe où). Hiérarchie de l'écran par des intitulés de groupe (capitales espacées prolongées d'un filet), pas par des cadres imbriqués. Apparition : la trame de la vignette se densifie en trois pas (rien en mouvement réduit).
- **Le catalogue en paquet de cartes** (#196, demande du porteur) : chaque constellation est une carte posée sur une table un ton plus sombre (`--ast-night-deep`) : feuille de nuit, filet d'encre à 55 %, coins vifs, **épaisseur tramée 1-bit** (damier d'encre d'un pixel, décalé de 5 px en bas à droite), index de l'abréviation UAI en plaque d'encre dans le coin comme sur une carte à jouer, ciel bord à bord. Les voisines dépassent de 12 px sur les côtés. Le passage d'une carte à l'autre est le défilement natif du navigateur (suit le doigt, inertie, aimantation) : aucun ressort, aucun seuil, aucune animation ajoutée ; un seul ciel vivant (la carte posée), les autres en image figée ou en croquis 2D.
- **Réglages et défis des jeux** (#187) : réglages dans une feuille qui monte sur l'écran Apprendre (pas de nouvel écran) ; choix en tuiles segmentées (la tuile choisie inversée, comme le niveau) et en lignes à case pleine, jamais en tirets. Pictogrammes 1-bit au pixel. En défi, le chiffre (série ou chrono) en grande capitale compressée dans l'en-tête ; le temps restant est un filet d'encre qui se vide le long du bas de l'en-tête (animation CSS) ; les 10 dernières secondes, chiffres sur plaque d'encre. Nouveau record : quelques étoiles-pixels lancées autour du nombre et une plaque « Nouveau record ! » ; rien ne bouge en mouvement réduit.
- **Zones de visibilité** (« Selon la latitude », #188, puis #197 à la demande du porteur) : **exception circonscrite à la palette bichrome**, la seule couleur d'interface hors des deux encres. Les zones sont des **lavis colorés translucides** posés sur le ciel, qui laissent voir les étoiles, les figures et les frontières : ciel qui ne se couche jamais en **vert-de-gris** (`--ast-zone-always`, #63C2B0 à 30 %), ciel qui ne se lève jamais en **sanguine** (`--ast-zone-never`, #F0784E à 32 %), bande qui se lève et se couche **dégagée**. Ce sont deux encres d'atlas ancien (patine du cuivre gravé, craie rouge) qui s'accordent au bleu nuit et au parchemin. En nuit rouge, seulement du rouge : les deux zones deviennent deux intensités de l'encre rouge (40 % et 16 %). **Jamais la couleur seule** : chaque zone garde un repère de forme et un libellé (limites tracées d'un trait plein d'encre, noms « TOUJOURS » / « JAMAIS » sur les calottes de la sphère, compte et nom de chaque bande sur la carte, pastille + nom dans les listes). Sur la sphère, la face arrière vue à travers le verre est lavée à 42 % de la face avant ; le sol (disque de l'horizon) reste gravé de traits horizontaux fins. Jetons dans `packages/ui/src/tokens.css` (couleur et opacité séparées, lues par les dessins ; `--ast-zone-*-wash` pour le CSS). Ne pas étendre ces couleurs à d'autres écrans sans décision du porteur. Les **chiffres** d'une carte en bandes s'écrivent **sur leur bande** (pastille, nombre en capitale compressée, nom de la zone), pas dans une légende séparée. La carte de tout le ciel s'**agrandit** en plein écran (glisser pour la faire tourner, pincer pour zoomer, curseur de latitude en bas).
- **Accueil du premier lancement** (#207, maquette B, variante 2 choisie par le porteur) : le ciel de ce soir est là dès la première seconde ; une **feuille basse** au style du menu (cadre à coins, filet, voile léger) pose deux questions, le lieu (« Utiliser ma position », ou « Plus tard · Paris en attendant ») puis le niveau (commande segmentée, choix inversé, avec la vraie fiche de Bételgeuse au niveau choisi). Progression en carrés pleins / creux, « Passer » en haut à droite. Puis **trois bulles** encadrées au-dessus de la ligne du temps, une à la fois (glisser, pincer, toucher une étoile), pictogramme gravé (doigt en disque d'encre léger, flèche pleine, jamais de pointillé), qui s'effacent quand le geste est fait ; « Plus tard » les arrête. Une seule fois : ni au deuxième lancement, ni pour qui utilisait déjà l'appli. Rien ne bouge en mouvement réduit. Captures `docs/design/welcome/`.
- **Degrés de maîtrise** (« Ton ciel ») : la case se remplit par le bas, la trame se densifie avec la hauteur : rien, un tiers en points fins (25 %), moitié en damier (50 %), plein ; le nom reste lisible au-dessus du remplissage. Deux indices (hauteur et densité), lisibles sans couleur.
- Palette **bichrome** nuit #101B52 / parchemin #F0E6D2 (voir §2) ; pas d'autre couleur d'interface, sauf l'exception des zones de visibilité ci-dessus (#197).
- **Mode nuit rouge** : conversion intégrale en rouge sur noir. Le style 1-bit s'y prête parfaitement : c'est un atout majeur de cette DA. Le rouge étant sombre, le texte secondaire y passe à 90 % de l'encre (au lieu de 65 %) et les filets à 40 % (#198).
- **Accessibilité dans la palette** (#198) : le filet (`--ast-hairline`, 20 %) sépare les parties ; le **contour d'une commande** (bouton, champ, groupe segmenté) prend `--ast-control-border` (parchemin 45 % sur la nuit, ≥ 3:1 ; rouge 70 % la nuit). **Focus clavier** : un anneau de 2 px à l'encre (`--ast-focus`) partout (`:focus-visible` global de `app.css`), qu'un composant peut redessiner. **Aucune couleur de signal** hors palette : un état se lit à la forme (voyant réseau : pastille pleine = connecté, creuse = hors ligne).

### Grand public ↔ professionnels
- Même langage visuel pour tous. Le niveau **Découverte** montre davantage les figures et moins les données ; le niveau **Expert** fait l'inverse (panneaux de données denses, figures en retrait ou désactivées).
- **Un seul niveau pour toute l'appli** (#201), réglé dans Menu › Réglages (commande segmentée, le choix inversé) ; Apprendre, « Selon la latitude » et la vue 3D gardent un raccourci qui règle le même. Les fiches de la carte suivent le niveau : en **Découverte**, une ligne « où regarder » en capitales mono à l'encre pleine (« Visible maintenant · ↑ 35° vers le sud-est », « Sous l'horizon · se lève à 23 h 00 »), une ou deux phrases courtes en serif (rang d'éclat, couleur en mots, temps de trajet de la lumière), la distance en mots, aucune coordonnée, pas de nom latin ; en **Amateur**, les mêmes plus magnitude, couleur et distance en lignes de données ; en **Expert**, le bloc de données complet plus hauteur et azimut, sans phrase. Une étoile sans nom ni lettre de Bayer s'appelle « Étoile de Pégase », son HIP dans la ligne du dessus. Captures `docs/design/ux-201/`.

## 4. Pipeline des figures (artiste + IA)
1. Source : gravure d'atlas ancien du domaine public (Bayer, Hevelius, Flamsteed/Fortin, *Urania's Mirror*) **ou** création originale.
2. Recomposition IA + retouche artiste : pose alignée sur les étoiles réelles (gabarit généré depuis nos données), style gravure homogène.
3. Export en niveaux de gris haute définition + masque + points d'ancrage (étoiles).
4. Rendu temps réel : shader de tramage/halftone/scanlines → un pipeline unique pour les 88 figures et les autres cultures.
5. Chaque figure : fiche de provenance (source, artiste, outil IA, licence) dans `packages/content/figures/`.

## 5. Livrables Phase 0 (ticket #4)

**Prototype disponible** : `prototypes/orion` (`pnpm --filter @asteria/proto-orion dev`). Captures : `docs/design/orion/`.

![Planche des variantes](design/orion/board.jpg)

- Orion en 3 variantes : **A** gravure tramée 1-bit ✅ retenue, **B** halftone/scanlines, **C** particules/grain.
- Chaque variante en mode nuit rouge.
- Planche typographique (3 combinaisons).
