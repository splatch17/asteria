# Menu unique et mode immersif (#130)

Retour du porteur du projet : « arrêtons d'ajouter des boutons à l'infini […] la majorité de
l'espace doit être dédiée à la visualisation ». La colonne de boutons ronds, les rangées du bas et
l'en-tête de trois lignes sont remplacés par :

- **une ligne d'en-tête discrète** : `#02 // CARTE DU CIEL · PARIS`, ou
  `#03 // LA TERRE TOURNE · PARIS` dans la vue Terre (le point de vue). Les coordonnées passent
  dans le menu, la date sur la ligne du temps ;
- **une ligne du temps en bas** : lecture/pause, date et « ● en direct » (ou l'écart à
  maintenant), puis les seules actions de terrain : **recherche** et **visée au téléphone**
  (seulement sur un écran tactile en HTTPS avec capteurs d'orientation ; sinon dans le menu),
  puis le **menu**. Toucher la date déplie le curseur du temps, l'échelle (48 h, 1 an, 26 000 ans)
  et « Maintenant » ;
- **un menu** : feuille en bas de l'écran sur téléphone, panneau latéral sur grand écran, en
  gravure 1-bit avec les coins en équerre des autres panneaux. Sections numérotées
  `01 // VUE`, `02 // CALQUES`, `03 // LIEU ET TEMPS`, `04 // AFFICHAGE`, `05 // AIDE`, et la
  vision nocturne à portée dans l'en-tête du menu ;
- **le mode immersif** : toucher le ciel vide (rien de touché, rien de sélectionné, rien d'ouvert)
  efface l'en-tête, la ligne du temps, le mini-globe et la légende ; n'importe quel toucher les
  ramène (un toucher sur un astre le sélectionne toujours). Aussi « Masquer l'interface » dans
  `04 // AFFICHAGE`, et Échap ou Tab au clavier pour revenir.

Captures Playwright (Chromium headless, rendu logiciel SwiftShader), mobile 360 × 780 CSS px @3x
(écran tactile) et ordinateur 1440 × 900, Paris, samedi 10 octobre 2026 à 22 h 30, niveau
Amateur. **Données temporaires, non versionnées** (`apps/web/public/data/` est ignoré par git) :
seule l'interface est à juger ici.

## Surface de l'interface au repos

Mesure : union des boîtes de tous les éléments d'interface qui dessinent quelque chose (texte,
boutons, champs, cadres, fonds), échantillonnée au pixel CSS, rapportée à la surface de l'écran.
Le dégradé d'ombre sous l'en-tête (`scrim`) et le voile du menu ouvert ne sont pas comptés.

| Écran | Vue | Avant | Après |
|---|---|---|---|
| Mobile 360 × 780 | Carte du ciel (avec mini-globe) | 23,3 % | **7,5 %** |
| Mobile 360 × 780 | Vue Terre (avec légende du point de vue) | 27,6 % | **9,8 %** |
| Mobile 360 × 780 | Carte, nuit rouge | 25,3 % | **7,5 %** |
| Mobile 360 × 780 | Terre, nuit rouge | 29,6 % | **9,8 %** |
| Mobile 360 × 780 | Commandes du temps dépliées (carte / Terre) | (toujours dépliées) | 17,6 % / 19,8 % |
| Mobile 360 × 780 | Mode immersif | — | 0 % |
| 1440 × 900 | Carte du ciel | 9,8 % | **2,0 %** |
| 1440 × 900 | Vue Terre | 10,8 % | **2,5 %** |
| 1440 × 900 | Menu ouvert (panneau latéral) | 25,4 % (calques) | 26,4 % |

Objectif du ticket (≤ 12–15 % au repos sur 360 × 780) : tenu dans les deux vues. Le menu ouvert
couvre l'écran du téléphone (feuille) : c'est voulu, il se ferme d'un toucher à l'extérieur, par
« × » ou Échap.

## Fichiers

Chaque capture existe en `mobile-…` et `desktop-…` ; `-before` est l'interface de `main` avant
#130, `-after` la nouvelle.

| Fichier | Ce qu'on voit |
|---|---|
| `*-sky-rest-{before,after}.jpg` | Carte du ciel au repos |
| `*-earth-rest-{before,after}.jpg` | Vue Terre au repos (« La Terre tourne ») ; après : légende réduite à une ligne, touchée elle se déplie |
| `*-sky-night-{before,after}.jpg`, `*-earth-night-{before,after}.jpg` | Mode nuit rouge au repos |
| `*-sky-menu-{before,after}.jpg` | Avant : panneau des calques ; après : menu ouvert sur la carte |
| `*-sky-menu-night-{before,after}.jpg` | Idem en nuit rouge |
| `*-earth-menu-{before,after}.jpg` | Avant : sélecteur de point de vue ; après : menu ouvert dans la vue Terre |
| `*-earth-pov-after.jpg` | Menu → « Point de vue » : le sélecteur de #128 (contenu inchangé), sous l'en-tête |
| `*-sky-time-after.jpg`, `*-earth-time-after.jpg` | Commandes du temps dépliées depuis la date |
| `*-sky-immersive-after.jpg`, `*-earth-immersive-after.jpg` | Mode immersif |

## Accessibilité et préférences

- Cibles de 44 × 44 px au moins ; Échap ferme le menu (focus rendu au bouton menu), replie le
  temps, quitte le mode immersif ; Tab reste dans le menu (dialogue modal) ; `aria-expanded`,
  `aria-pressed`, `role="switch"` et `role="radio"` sur les commandes ; l'état immersif est annoncé.
- `prefers-reduced-motion` : pas d'animation d'ouverture ni de fondu.
- Zones sûres (`env(safe-area-inset-*)`) sur l'en-tête, la ligne du temps et le menu.
- Toutes les préférences mémorisées le restent (nuit, luminosité, calques, style réaliste, point de
  vue, astre visité, lieu, plein écran) ; le mode immersif, lui, ne l'est pas exprès.

## Limites

- Sur la carte, au champ par défaut, presque chaque toucher tombe à moins de 26 px d'une étoile
  (rayon de sélection du moteur, inchangé) et la sélectionne : le ciel « vide » est rare. Le mode
  immersif reste accessible par le menu, et tout toucher le quitte. Un ticket de suivi pourra
  revoir le rayon de sélection des étoiles faibles.
- Vue Terre : un double toucher dans le vide (recentrer) bascule aussi l'interface au premier
  toucher.
