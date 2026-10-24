# « Selon la latitude » (#188)

Captures Playwright (Chromium, `--use-gl=swiftshader`), téléphone 360 × 780 à 3×, tactile ; bureau 1366 × 820. Build de production (`vite preview`), date du 23/10/2026.

| Fichier | Ce qu'on voit |
|---|---|
| `mobile-paris.jpg` | Ouverture depuis le menu (Paris, Amateur) : sphère céleste, curseur, carte de tout le ciel, comptes 7 / 52 / 29 |
| `mobile-paris-listes.jpg` | Le Scorpion choisi (contour de sa région sur la sphère, qui tourne), listes et marques « en partie » |
| `mobile-equateur.jpg` | Équateur : rien de toujours ni de jamais visible (0 / 88 / 0), Orion choisi |
| `mobile-sydney-expert.jpg` | Sydney (33,9° S), Expert : la Croix du Sud, région et parts, graduations et zénith sur la carte |
| `mobile-pole-sud.jpg` | Pôle Sud, Découverte : plus rien ne se lève ni ne se couche (50 / 0 / 38) |
| `mobile-animation.jpg` | Pendant le parcours d'un pôle à l'autre (67,2° N, bouton en pause) |
| `mobile-nuit.jpg` | Vision nocturne rouge |
| `desktop.jpg` | Bureau : sphère à gauche, carte et listes à droite (Expert, Grande Ourse) |
| `mobile-menu.jpg` | Nouvelle tuile « Latitude » dans Menu › Vue › Apprendre |
| `mobile-apprendre.jpg` | Nouvelle carte « Selon la latitude » sur l'écran Apprendre (vignette tramée) |

Avant : l'écran n'existait pas ; le menu et l'écran Apprendre sont ceux des captures `docs/design/learn/apres-*.jpg` (#185), sans la tuile ni la carte.

## #197 : zones en couleurs transparentes, chiffres sur les bandes, carte agrandie

Retours du porteur sur #188 : l'animation de la sphère est gardée telle quelle ; les trames (points, hachures) des zones deviennent des lavis colorés translucides (vert-de-gris : toujours visible, sanguine : jamais visible, bande intermédiaire dégagée ; deux intensités de rouge en vision nocturne) ; chaque chiffre est écrit sur sa bande de la carte avec sa pastille et le nom de la zone (« 7 TOUJOURS VISIBLES »), le titre dit qu'il s'agit des 88 constellations, la rangée de légende séparée sous la carte disparaît ; « Agrandir » ouvre la carte en plein écran (glisser pour faire tourner le ciel, pincer ou + / − pour zoomer jusqu'à ×6, curseur de latitude et lecture en bas, Échap ou le bouton pour réduire). Mêmes réglages de capture que ci-dessus (build de production, 24/10/2026) ; paysage 780 × 360 à 3×.

| Avant (#188) | Après (#197) | Ce qu'on voit |
|---|---|---|
| `mobile-paris.jpg` | `apres-mobile-paris.jpg` | Paris, Amateur : calottes en lavis sur la sphère, chiffres sur les bandes de la carte, bouton « Agrandir » |
| `mobile-paris-listes.jpg` | `apres-mobile-paris-listes.jpg` | Scorpion choisi, listes : pastilles et marques en lavis |
| `mobile-equateur.jpg` | `apres-mobile-equateur.jpg` | Équateur : une seule bande, « 88 visibles une partie de l'année » |
| `mobile-pole-sud.jpg` | `apres-mobile-pole-sud.jpg` | Pôle Sud, Découverte : 38 jamais / 50 toujours visibles |
| `mobile-sydney-expert.jpg` | `apres-mobile-sydney-expert.jpg` | Sydney, Expert : part du ciel sous chaque chiffre, heures, Croix du Sud |
| `mobile-nuit.jpg` | `apres-mobile-nuit.jpg` | Vision nocturne : deux intensités de rouge, rien d'autre |
| — | `apres-mobile-10n.jpg` | 10° N : bandes très fines, étiquettes écartées sans se chevaucher |
| — | `apres-mobile-carte-agrandie.jpg` | Carte agrandie (portrait) : toute la hauteur, 108° d'ascension droite à l'écran |
| — | `apres-mobile-carte-agrandie-zoom.jpg` | Carte agrandie zoomée ×2,6 sur la Grande Ourse |
| — | `apres-mobile-carte-agrandie-nuit.jpg` | Carte agrandie en vision nocturne |
| — | `apres-paysage-carte-agrandie.jpg` | Téléphone en paysage : carte sur toute la largeur, commandes sur une ligne |
| `desktop.jpg` | `apres-desktop.jpg` | Bureau, Expert, Grande Ourse |
| — | `apres-desktop-carte-agrandie.jpg` | Bureau, carte agrandie (Orion) |

Coût de dessin (`?perf=1`, Chromium sans GPU canvas, 360 × 780 à 3×, médiane par image pendant le parcours) : carte 0,2 ms (0,7 ms avant), 0,3 ms en CPU ×4 (3,4 à 4,4 ms avant) grâce au calque mis en cache ; sphère inchangée (≈ 1,4 ms, 5 à 7 ms en CPU ×4). Carte agrandie : 0,3 ms en glissant (1 ms en CPU ×4), le calque des frontières étant déplacé ou mis à l'échelle et redessiné seulement en sortant de sa marge ou à la fin d'un pincement (une image de 100 ms en logiciel, à mesurer sur S23).
