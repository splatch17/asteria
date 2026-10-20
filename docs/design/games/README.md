# Jeux et « Quelle constellation ? » (#163)

Captures Chromium (SwiftShader), téléphone 360×780 @3x, build de production.

| Capture | Ce qu'elle montre |
|---|---|
| `mobile-menu-jeux.jpg` | Menu > Vue : tuile « Jeux » sous « Apprendre » |
| `mobile-jeux.jpg` | Écran Jeux : niveau, cartes de jeu à bord damier (02 et 03 « Bientôt »), « Ton ciel » (une case par constellation, tramée selon la maîtrise) |
| `mobile-question-decouverte.jpg` | Question en Découverte : lignes et figure illustrée |
| `mobile-question-amateur.jpg` | Question en Amateur : lignes seules |
| `mobile-question-expert.jpg` | Question en Expert : les étoiles seules |
| `mobile-reponse-fausse.jpg` | Mauvaise réponse : choix barré, bonne réponse encrée (nom latin), figure et nom révélés |
| `mobile-reponse-juste.jpg` | Bonne réponse |
| `mobile-reponse-nuit.jpg` | Vision nocturne, Découverte |
| `mobile-fin.jpg` | Fin de série : score, record, ce que chaque réponse a changé |

## « Relie les étoiles » (#164)

| Capture | Ce qu'elle montre |
|---|---|
| `mobile-relie-debut.jpg` | Début en Découverte : champ d'étoiles réel, sans lignes ni noms, étoiles de la figure légèrement cerclées |
| `mobile-relie-trace.jpg` | Un trait juste (encre) et un trait faux (pointillé barré, qui s'efface) ; l'étoile choisie a un réticule |
| `mobile-relie-glisser.jpg` | Glisser d'une étoile vers une autre : trait pointillé jusqu'au doigt |
| `mobile-relie-indice.jpg` | Indice : l'étoile de départ choisie, l'étoile suivante clignote |
| `mobile-relie-complete.jpg` | Figure complète : lignes, nom et figure illustrée de la carte |
| `mobile-relie-solution.jpg` | « Solution » : la figure montrée |
| `mobile-relie-amateur.jpg` | Amateur : aucune étoile mise en avant |
| `mobile-relie-nuit.jpg` | Vision nocturne |
| `mobile-relie-fin.jpg` | Fin de série : score sur 5, erreurs et indices de chaque figure |

## « Nomme l'étoile » (#165)

| Capture | Ce qu'elle montre |
|---|---|
| `mobile-apprendre-etoile.jpg` | Écran Apprendre : la carte « Nomme l'étoile » jouable |
| `mobile-etoile-question.jpg` | Découverte : l'étoile dans le réticule, sa constellation mise en avant, 4 noms (d'autres constellations, proches dans le ciel) |
| `mobile-etoile-reponse.jpg` | Mauvaise réponse : « C'est Bételgeuse. » et la fiche de l'étoile (nom, constellation, magnitude, rang d'éclat), « Voir dans le catalogue » |
| `mobile-etoile-catalogue.jpg` | La page de la constellation ouverte depuis le jeu, l'étoile marquée |
| `mobile-etoile-retour.jpg` | Retour au jeu, dans l'état laissé |
| `mobile-etoile-amateur.jpg` | Amateur : les noms proposés viennent d'abord de la même constellation |
| `mobile-etoile-juste.jpg` | Bonne réponse |
| `mobile-etoile-expert.jpg` | Expert : le nom se tape |
| `mobile-etoile-faute.jpg` | Une faute de frappe pardonnée : « Oui ! On écrit Arcturus. » |
| `mobile-etoile-je-ne-sais-pas.jpg` | « Je ne sais pas » : la fiche s'affiche quand même |
| `mobile-etoile-nuit.jpg` | Vision nocturne |
| `mobile-etoile-fin.jpg` | Fin de série : chaque étoile avec sa constellation |

Les distances n'apparaissent pas sur ces captures : la copie locale des données du conteneur est antérieure aux distances de référence (#75) ; l'application déployée les affiche (« DIST »).

Captures prises avec `--disable-accelerated-2d-canvas` : dans le conteneur, Chromium avec SwiftShader représente parfois l'image précédente d'un canvas 2D vidé (problème du rendu logiciel, absent sans accélération 2D).

La figure est placée au zénith d'un observateur fictif : nord en haut, est à gauche, comme sur une carte du ciel. Fermer les jeux rend la carte exactement comme elle était (vérifié par différence d'images avant/après).
