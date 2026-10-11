# Gestes tactiles des vues 3D (#107)

Captures Playwright (Chromium headless, rendu logiciel SwiftShader, 360 × 780 CSS px, toucher
émulé par CDP ; les anneaux clairs marquent les doigts). **Données factices** : quelques étoiles
d'Orion approximatives, un champ d'étoiles aléatoire et une Terre schématique (continents en
taches) — le réseau bloque les sources réelles dans l'environnement de capture. Seuls les gestes
et la caméra sont à juger ici, pas les données.

- `c3d-board.jpg` / `c3d-gestures.gif` — vue 3D d'une constellation : ouverture avec l'astuce,
  orbite à un doigt (inertie), bouton « Recentrer », double toucher sur une étoile (centrée),
  pincement vers le point entre les doigts, glisser à deux doigts, rotation à deux doigts autour
  du point entre les doigts, double toucher à côté des étoiles (retour à la vue de départ).
- `earth-board.jpg` / `earth-gestures.gif` — vue Terre : astuce, pincement (dézoom), orbite,
  glisser à deux doigts (borné : la Terre reste à l'écran), pincement vers un point, double
  toucher sur le globe (ce lieu vient face à la caméra), bouton « Recentrer ».

## Depuis #131 : gestes « carte »

Les captures ci-dessus montrent les gestes de #107. Depuis #131, toutes les vues 3D (vue Terre et
ses points de vue, visite d'un astre, constellation en 3D) se comportent comme une application de
cartes : **1 doigt** déplace le point regardé (légère inertie), **2 doigts** glissés ensemble font
tourner la caméra autour de lui, pincer zoome vers les doigts, tourner les doigts pivote (pas dans
la vue Terre, nord en haut) ; à la souris, glisser déplace, clic droit ou Maj + glisser tourne, la
molette zoome vers le curseur. Le double toucher ne change pas. Planche :
`docs/design/solar-system/{mobile,desktop}-gestures-board.jpg`.
