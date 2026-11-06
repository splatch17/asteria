# Menu v2 — onglets-destinations, accueils illustrés, réglages à part, boussole permanente

Suite de #176 (maquette A′1). Le porteur a choisi le mélange des croquis A et B (`croquis-AB.jpg`) et la boussole permanente (`croquis-compass.jpg`). Les croquis et maquettes d'étude (`croquis-*`, `maquette-*`) viennent de la branche `design/menu-v2`.

Captures `apres-*` : téléphone 360 × 780 @3x et bureau 1366 × 820, Chromium en rendu logiciel, Paris, samedi 24 octobre 2026 à 21 h 30, niveau Amateur. Données du ciel **temporaires** (HYG v4.1 + lignes Stellarium, voir `tools/captures/README.md`), non versionnées : moins d'étoiles faibles que le site. Script : `node tools/captures/menu-v2.mjs docs/design/menu-v2` (serveur sur le port 4317).

| Capture | Ce qu'elle montre |
|---|---|
| `apres-01-base` | Le ciel au repos : le bouton ≡ « Ciel » en bas à gauche, la boussole en haut à droite (vue vers le sud-sud-ouest : l'aiguille pointe le nord, derrière). |
| `apres-02-ciel` | ≡ ouvre l'onglet du mode en cours. Ciel : recherche, « Ce soir » (la constellation connue la plus haute et le coucher de la Lune), « Heure », outils Viser · Nuit · Masquer ; ⚙ en haut à droite ; pied « × Fermer » puis Ciel · Orbites · Catalogue · Jeux. |
| `apres-03-catalogue` | Catalogue : tes trois dernières cartes (le vrai ciel de chaque carte en croquis), « Ouvrir les 88 cartes », « Selon la latitude », « Visibles ce soir » (leur nombre). |
| `apres-04-paquet` | « Ouvrir les 88 cartes » : le paquet posé sur la constellation connue la plus haute (ici le Cygne). Retour : l'accueil du Catalogue. |
| `apres-05-catalogue-vide` | Catalogue la première fois : la constellation la plus haute proposée comme première carte. |
| `apres-06-jeux` | Jeux : « Reprendre » en grand (dernier jeu, ses réglages, son record, ▶ Jouer), les jeux en tuiles sur deux colonnes (record en étiquette), « Ton ciel », le niveau dans l'en-tête. |
| `apres-07-orbites` | Orbites : la carte bascule tout de suite en vue Terre derrière la feuille ; points de vue, « Heure », les gestes. En haut à droite, la case de la boussole recadre le point de vue. |
| `apres-08-reglages-affichage`, `apres-09-reglages-lieu` | ⚙ : la page des réglages, ‹ pour revenir à l'onglet, Affichage · Lieu et temps · Appli ; l'onglet d'origine garde son filet. |
| `apres-10-boussole-tournee`, `apres-11-boussole-nord` | Carte tournée vers l'est : l'aiguille montre le nord à gauche ; un toucher sur la boussole : nord en haut. |
| `apres-12-nuit-rouge`, `apres-13-nuit-rouge-catalogue` | Nuit rouge : la boussole et la feuille en encre rouge, croquis des cartes compris. |
| `apres-14-bureau` | Bureau : la même feuille en panneau de 380 px depuis le coin, la boussole en haut à droite. |

Non capturé : Viser (les capteurs ne s'allument pas dans Chromium sans tête) ; le trait d'encre du téléphone sur l'anneau est à vérifier sur un téléphone.
