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

## « Où est-elle ? » (#184, remplace « Relie les étoiles » #164)

| Capture | Ce qu'elle montre |
|---|---|
| `mobile-apprendre-ou.jpg` | Écran Apprendre : la carte « Où est-elle ? » à la place de « Relie les étoiles » |
| `mobile-ou-question-decouverte.jpg` | Découverte : tout le ciel (glisser, pincer), lignes et frontières IAU en pointillé, le nom et la figure en vignette ; barre des points qui s'épuise |
| `mobile-ou-juste.jpg` | Touche juste : la région s'allume (trame 1-bit), son nom, « +1000 » |
| `mobile-ou-erreur.jpg` | Erreur : la région touchée nommée et cernée en tirets, la croix du toucher, la vue glisse jusqu'à la bonne région allumée |
| `mobile-ou-question-amateur.jpg` | Amateur : lignes, sans nom, vignette |
| `mobile-ou-question-expert.jpg` | Expert : les étoiles seules, sans vignette |
| `mobile-ou-passee-expert.jpg` | « Je ne sais pas » : la bonne région montrée |
| `mobile-ou-nuit.jpg` | Vision nocturne |
| `mobile-ou-fin.jpg` | Fin de série : points sur 10 000, record, temps et points de chaque constellation |

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

## « Quelle constellation ? » : orientation, étoiles mises en avant, dézoom (#183)

| Capture | Ce qu'elle montre |
|---|---|
| `mobile-quiz-decouverte.jpg` | Découverte : cadrage un peu plus large, étoiles de la figure plus grosses dans un halo d'encre tramé (la figure illustrée manque : la copie locale des données n'a pas l'atlas des figures) |
| `mobile-quiz-amateur.jpg` | Amateur : lignes et étoiles mises en avant |
| `mobile-quiz-expert.jpg` | Expert : étoiles seules, mises en avant, sans lignes ; figure tournée au hasard (angle tiré de la graine de la série) |
| `mobile-quiz-expert-tournee.jpg` | Expert, question suivante : un autre angle |
| `mobile-quiz-expert-reponse.jpg` | Expert après la réponse : lignes et nom révélés, orientation conservée |
| `mobile-quiz-dezoom.jpg` | Découverte, dézoom à la molette jusqu'à la borne (l'horizon fictif reste hors champ), bouton « Recentrer » |
| `mobile-quiz-pincement.jpg` | Amateur, dézoom au pincement (deux doigts) |
| `mobile-quiz-nuit.jpg` | Vision nocturne |
| `mobile-etoile-dezoom.jpg` | « Nomme l'étoile » : même dézoom et même « Recentrer » |

En Expert, pas de zoom tant que la question est posée (les voisines donneraient la réponse) ; après la réponse, zoom et déplacement libres à tous les niveaux. La question suivante revient au cadrage.

## Réglages de partie et mode Défi (#187)

| Capture | Ce qu'elle montre |
|---|---|
| `mobile-defi-apprendre.jpg` | Écran Apprendre : sous le record d'entraînement, les records des défis au niveau choisi (« SÉRIE 14 », « CHRONO 11 ») |
| `mobile-defi-reglages.jpg` | Réglages (feuille ouverte depuis la carte du jeu) : mode en trois tuiles (Entraînement, Série, Chrono) avec leur record au niveau, ciel « Visibles de chez moi » / « Ce soir » / « Toutes » et le nombre de constellations de chacun |
| `mobile-defi-reglages-serie.jpg` | Le mode Série choisi, sa règle en une ligne |
| `mobile-defi-reglages-inconnu.jpg` | « Nomme l'étoile », position inconnue : « Toutes » par défaut, ciel de Paris expliqué |
| `mobile-defi-serie.jpg` | Série en cours : une case par bonne réponse, le compteur en grand, « Record battu » une fois le record dépassé |
| `mobile-defi-serie-erreur.jpg` | La première erreur arrête la série : bonne réponse montrée, « Voir le résultat » |
| `mobile-defi-serie-record.jpg` | Fin de série avec nouveau record : étoiles 1-bit lancées autour du nombre, plaque « Nouveau record ! », ancien record |
| `mobile-defi-chrono.jpg` | Contre-la-montre : chrono, bonnes réponses, barre du temps restant le long du bas de l'en-tête |
| `mobile-defi-chrono-urgent.jpg` | Les 10 dernières secondes : chiffres sur plaque d'encre, barre plus épaisse |
| `mobile-defi-chrono-fin.jpg` | « Temps écoulé » sans record : le record du mode rappelé |
| `mobile-defi-ou-chrono.jpg` | « Où est-elle ? » en chrono : des points en 60 s |
| `mobile-defi-nuit.jpg` | Vision nocturne, « Nomme l'étoile » en série |

Règle « Visibles de chez moi » (`lib/games/visibility.ts`) : une étoile culmine à 90° − |φ − δ| (déclinaison à la date, réfraction ignorée) ; une constellation compte quand au moins la moitié de sa figure, en nombre d'étoiles ou en éclat, monte à 5° ou plus au cours de l'année. Depuis Paris : 59 constellations (Scorpion et Éridan compris, jamais la Croix du Sud) ; depuis l'équateur : les 88.
