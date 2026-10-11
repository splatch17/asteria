# Ce qui reste fixe : Étoiles, Soleil, Terre ou planète (#139)

Retour du porteur de projet : « La vue où on voit la terre tourner ne sert pas à grand-chose, on
peut la retirer et simplement garder la possibilité de voir la terre tourner (fixer le
référentiel par rapport à la Terre ou au Soleil ou à une planète ou aux étoiles). Il faut
toujours garder ça intuitif, éducatif et pro. »

## Avant

Captures déjà versionnées : `../frames-v2/mobile-stars.jpg`, `../frames-v2/desktop-stars.jpg`
(le point de vue « La Terre tourne ») et `../visit-return/phone-earth-rest-after.jpg` (son dernier
état). Un point de vue à part, centré sur la Terre, avec sa flèche de rotation et son symbole du
Soleil ; il ne servait qu'à montrer la rotation.

## Après

1. **« La Terre tourne » retiré** : plus que trois points de vue (« Les saisons », « Le système
   solaire », « Visiter un astre »), trois cartes dans le panneau Vue du menu. Clés ICU
   `frame.stars.*` et `space.rotation`, pictogramme, démonstration et flèche de rotation retirés.
   Un choix enregistré `stars` (comme `earth` depuis #131) retombe sur le point de vue par
   défaut, désormais « Le système solaire ». L'entrée dans la vue Terre ne change pas : la caméra
   monte du sol jusqu'à la Terre puis recule d'un seul mouvement jusqu'au système entier ; zoomer
   sur « Vous êtes ici » près de la Terre ramène dans la carte du ciel (comme avant, depuis la
   scène à l'échelle réelle).
2. **« Fixe : Étoiles ▾ »** : une puce compacte au-dessus de la légende, sans colonne de boutons.
   Elle ouvre un petit menu gravé (pictogramme, nom, une ligne d'explication) :
   - **Étoiles** (par défaut) : les étoiles ne bougent pas ; la caméra suit en translation l'astre
     regardé : on voit la Terre tourner (GMST) et les planètes tourner (modèle UAI) et avancer ;
   - **Soleil** : origine liée au Soleil, axes fixes ; la caméra cadre le Soleil et l'orbite de
     ce qu'elle regardait, les planètes défilent. En visite, l'astre file sur son orbite ;
   - **Terre** : la caméra tourne avec la Terre (axes terrestres, méridien de Greenwich) : la
     Terre est immobile, le ciel tourne autour du pôle céleste (nommé) en 23 h 56 min, le Soleil
     en 24 h ;
   - **Planète** : nommée d'après l'astre visité ou regardé (« Mars », « la Lune ») ; la caméra
     tourne avec lui (pôle et méridien origine UAI). Sans astre regardé, le choix reste affiché,
     grisé, avec ce qu'il faut faire : « Approchez-vous d'une planète ou de la Lune pour la
     fixer ». En visite, « Terre » est grisé : « Revenez au système solaire pour fixer la Terre ».
3. **Légende d'une ligne** sous la puce : ce qui est fixe et ce qui bouge, selon le niveau
   (Découverte / Amateur / Expert), avec la période de rotation de l'astre (« 24 h 37 min »,
   « 243 j, sens rétrograde »). « Les saisons » garde sa propre légende avec les étoiles fixes.
4. **Transitions** : changer de référentiel fige la pose de la caméra puis glisse (slerp,
   distance géométrique, 1,4 s) vers la nouvelle : vers « Terre » depuis le système entier, la
   caméra plonge jusqu'à la Terre ; entre « Terre » et « Étoiles » elle ne bouge pas, seul le
   haut de l'écran pivote du pôle céleste au pôle de l'écliptique. Mouvement réduit : fondu
   enchaîné de 220 ms. Choisir « Terre » ou une planète, le temps arrêté, lance la rotation
   (1 s = 1 h) ; un défilement déjà en cours continue. Changer de point de vue revient aux
   étoiles.
5. **Gestes** : inchangés dans chaque référentiel (1 doigt déplace, 2 doigts tournent, pincer
   zoome), exprimés dans les axes du référentiel ; double toucher sur le globe attaché le tourne
   face à la caméra, à côté il recadre sur lui.

## Captures

Playwright (Chromium headless, rendu SwiftShader), téléphone 360 × 780 @3x et ordinateur
1440 × 900, Paris, 11 octobre 2026 à 19 h 45, niveau Amateur, style gravé. Données temporaires
non versionnées (`apps/web/public/data/`). URL de capture : `?space=1&rest=earth` (référentiel,
sans transition), `&restDemo=1` (rotation 1 s = 1 h), `&frameMs=4000` (transition ralentie).

| Fichier | Contenu |
|---|---|
| `phone-frames-board.jpg` | Étoiles, Soleil, Terre, visite de Mars fixée sur Mars, visite de Jupiter fixée sur le Soleil |
| `phone-stars.jpg`, `phone-stars-popover.jpg` | Système solaire, « Fixe : Étoiles » ; le menu ouvert (Planète grisée : aucun astre regardé) |
| `phone-sun.jpg` | « Fixe : Soleil » depuis le système entier (déjà centré sur le Soleil : la caméra ne bouge pas) |
| `phone-earth.jpg`, `phone-earth-popover.jpg` | « Fixe : Terre » : la Terre, pôle Nord céleste en haut |
| `phone-seasons-earth.jpg` | « Les saisons », fixé sur la Terre |
| `phone-visit-mars-{stars,body,popover}.jpg` | Visite de Mars : étoiles fixes ; Mars fixe ; le menu (Terre grisée, « Mars ») |
| `phone-visit-jupiter-sun.jpg` | Visite de Jupiter fixée sur le Soleil |
| `phone-menu-points-of-view.jpg` | Panneau Vue du menu (#138) : trois points de vue |
| `phone-night-earth.jpg` | Mode nuit rouge, menu ouvert |
| `phone-reduced-motion-crossfade.jpg` | Mouvement réduit : Étoiles → Terre par un fondu (90 ms après le choix) |
| `phone-sequence-earth-vs-stars-board.jpg`, `phone-seq-{earth,stars}-{1..4}.jpg` | **La Terre qui tourne** : temps à 1 s = 1 h, une image toutes les 1,5 s. Fixé sur la Terre (4 premières) : le globe immobile, les constellations défilent ; puis fixé sur les étoiles (4 dernières) : les constellations immobiles, les Amériques passent sur le globe |
| `phone-transition-board.jpg`, `phone-transition-{1..5}.jpg`, `phone-earth-zoom.jpg` | Étoiles → Terre depuis le système entier, ralenti à 4 s : un seul plongeon continu jusqu'à la Terre ; puis un zoom à la molette dans le référentiel terrestre |
| `desktop-stars-popover.jpg`, `desktop-earth.jpg`, `desktop-visit-saturn-body.jpg` | Ordinateur : menu ouvert ; fixé sur la Terre ; visite de Saturne fixée sur Saturne |

## Exactitude

- Terre : axes de l'équateur moyen de la date tournés du GMST (le globe tourne du même angle) ;
  GMST testé contre SOFA `iauGmst06` (0,002″ en 2006) et l'ERA ajouté à astro-core contre SOFA
  `iauEra00` (< 1e-9 rad). Un jour sidéral (86 164,0905 s) ramène le référentiel à 0,01″ près ;
  la longitude du Soleil dans le référentiel terrestre suit l'équation du temps de Meeus
  (exemple 28.b, à 0,03°).
- Planètes : W = W0 + Ẇ·d (UAI WGCCRE 2015, termes constants) ; périodes comparées aux périodes
  sidérales publiées (JPL) à 0,2 % (Neptune : 0,9 %, écart propre au modèle UAI).

## Performance

Temps JavaScript par image (somme des rappels `requestAnimationFrame`, glisser d'un doigt
pendant 4 s, SwiftShader sur le conteneur de build, pas un téléphone) : Étoiles, temps arrêté
0,79 ms (p95 2,3) ; Terre, temps arrêté 0,94 ms (p95 2,2) ; Terre, temps à 1 s = 1 h 0,95 ms
(p95 2,6) ; visite de Mars fixée sur Mars, temps à 1 s = 1 h 0,36 ms (p95 0,8). Intervalle entre
images : 16 ms (moyenne et p95) dans chaque référentiel. Le calcul des référentiels n'alloue
rien à temps arrêté ; quand la date change, il appelle comme avant astronomy-engine (position
de l'astre, matrice de précession), qui alloue. Mesure sur un Android milieu de gamme : à faire
(S23 du porteur).
