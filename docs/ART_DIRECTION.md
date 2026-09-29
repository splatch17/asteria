# Direction artistique

> Statut : **exploratoire** — à valider avec le porteur du projet (voir questions ouvertes).

## Référence : style Hermes Agent (Nous Research)
On retient le **style**, pas les couleurs. Interprétation actuelle (à confirmer) :
- Imagerie **antique réinterprétée par le numérique** : statuaire/gravures classiques traitées en **tramage (dithering), halftone, ASCII / caractères**, pixels, grain.
- Typographie **monospace / terminal** pour les données, associée à une display élégante pour les titres.
- Interfaces **épurées**, beaucoup d'espace négatif, UI « instrument de précision », micro-animations, curseurs et textes qui s'écrivent.
- Contraste fort entre le **mythique** (dieux, héros) et le **technique** (coordonnées, données brutes).

## Traduction pour Galaxa : « Mythologie computationnelle »
- **Figures des constellations** : héros antiques (Orion, Persée, Andromède…) rendus en **gravure tramée / particules lumineuses**, comme si les étoiles elles-mêmes dessinaient la figure. Apparition par *dithering progressif* (les points se densifient), respiration lente, légère aberration chromatique.
- **Étoiles** : points nets, couleur physique (indice B-V → température), halo discret ; pas de cartoon.
- **Lignes** : fines, « tracées au laser », avec un léger scintillement lors de la sélection.
- **Données** : panneaux en monospace, labels style coordonnées (`RA 05h 55m 10.3s · DEC +07° 24′ 25″`), apparition caractère par caractère.
- **Mode Découverte** : même langage, mais figures plus présentes, textes plus grands, sons doux.
- **Mode nuit** : conversion intégrale en monochrome rouge (le tramage fonctionne très bien en monochrome — atout du style).

## Techniques de rendu envisagées
1. Figures sources en haute définition (illustration vectorielle ou IA + retouche) → **shader de tramage temps réel** (Bayer / blue-noise) sur GPU : un seul pipeline pour les 88 figures, animable, léger.
2. Alternative : figures en **nuages de particules** échantillonnés depuis l'image source (animations d'apparition spectaculaires).
3. Palette : à définir (proposition : fond noir profond bleuté, un accent unique « or pâle » ou « cyan phosphore »).

## Livrables Phase 0
- Moodboard (références)
- Orion en 3 variantes : A) tramage gravure, B) particules, C) ASCII/glyphes
- Mockups : écran Live, Carte, fiche objet, un jeu
