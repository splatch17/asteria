# Les modes derrière un seul bouton (#176)

Maquette A′1 « Tout derrière le bouton », validée par le porteur avec un changement : le bouton principal porte **trois traits** (type paramètres). Captures Playwright (Chromium, `--use-gl=swiftshader`), téléphone 360 × 780 à 3×, tactile ; bureau 1366 × 820. Build de production (`vite preview`), Paris, samedi 24/10/2026 à 21 h 30, niveau Amateur.

**Données temporaires, non versionnées** (`apps/web/public/data/` est ignoré par git ; VizieR et les mosaïques NASA ne sont pas joignables depuis le conteneur) : étoiles HYG v4.1 (dérivées d'Hipparcos) V ≤ 6,5 et lignes Stellarium « modern » ; côtes Natural Earth 1:50m, relief et lumières tirés des textures d'exemple de three.js. Seules l'interface et la navigation sont à juger ici.

Avant : `docs/design/welcome/05-geste-glisse.jpg` (en-tête « CARTE DU CIEL », loupe, mini-globe et boussole permanents, ligne du temps en bas, menu à droite).

| Fichier | Ce qu'on voit |
|---|---|
| `01-base.jpg` | L'écran de base : le ciel, les lettres de l'horizon et un seul bouton en bas à gauche (60 px), trois traits sur le nom du mode |
| `02-feuille-observer.jpg` | Le bouton ouvre une feuille sous le pouce (≈ 360 px) : le lieu en titre, les 3 modes en tuiles illustrées (le mode en cours inversé), puis Vue : champ de recherche, ligne « Heure », tuiles Viser · Nuit · Recentrer · Masquer ; en pied, « × Fermer » à la place du bouton puis les onglets Vue · Affichage · Lieu et temps · Réglages |
| `03-ligne-du-temps.jpg` | « Heure » déplie la ligne du temps depuis le coin du bouton : sa première case est le bouton, devenu × ; curseur, échelle et « Maintenant » au-dessus |
| `04-pas-maintenant.jpg` | Heure qui n'est pas maintenant : une puce date à côté du bouton ; la date rouvre la ligne du temps, ↺ revient à maintenant en 1 toucher |
| `05-viser.jpg` | Viser activé : puce « Viser × » inversée (1 toucher l'arrête) ; boussole et mini-globe présents tant que le téléphone mène la vue |
| `06-orbites.jpg` | Orbites (l'ancienne vue Terre / Espace) : légende et puce « Fixe » au-dessus du bouton, qui dit « Orbites » |
| `07-feuille-orbites.jpg` | La feuille en Orbites : Heure, Nuit · Recentrer · Masquer, points de vue |
| `08-apprendre.jpg` | Apprendre : la carte « Reprendre » en tête (dernier jeu, derniers réglages, 1 toucher), puis le niveau, le catalogue, la latitude, les jeux ; le même bouton en bas à gauche |
| `09-feuille-apprendre.jpg` | La feuille sur Apprendre : les 3 modes, « Observer ramène au ciel » en pied |
| `10-nuit-rouge-base.jpg`, `11-nuit-rouge-feuille.jpg` | Nuit rouge : bouton et feuille en rouge sur noir, tuile du mode inversée, réglage de luminosité |
| `12-feuille-reglages.jpg` | Onglet Réglages (mémorisé) : niveau global (#201), vue réaliste, plein écran, crédits, réseau, copie hors ligne, aide à jour |
| `13-geste-boussole.jpg` | Pendant un glisser : boussole et mini-globe apparaissent en haut à droite, puis s'effacent 2 s après |
| `14-bureau-base.jpg`, `15-bureau-feuille.jpg`, `16-bureau-ligne-du-temps.jpg` | Bureau : même bouton, la feuille devient un panneau de 380 px qui monte du coin, la ligne du temps garde 420 px |
| `17-interface-masquee.jpg` | Interface masquée (#198) : la bulle les premières fois, puis l'œil seul à la place du bouton |
| `18-accueil-geste.jpg` | Accueil du premier lancement (#207) : les bulles de gestes se posent juste au-dessus du bouton |

## Choix

- **Le nom du mode sous les trois traits** (« OBSERVER », « ORBITES », « APPRENDRE », 7,5 px en capitales mono, encre atténuée) : il se lit sans gêner (les captures `01`, `06`, `08`), il dit où l'on est quand la vue Terre et le ciel se ressemblent de loin, et il donne au bouton son nom pour les lecteurs d'écran (« Menu · Observer »). Il tient dans 60 px même pour « APPRENDRE ».
- **Recentrer** remet la carte face au nord : c'était le rôle de la boussole, qui n'est plus là au repos.
- **Masquer** passe de Réglages à Vue : c'est un geste de terrain.
- **Jeux, catalogue et latitude quittent l'onglet Vue** : ils sont dans Apprendre.
- **Retour Android** : chaque couche (feuille, ligne du temps, recherche, fiche, Apprendre et ses vues, latitude et sa carte agrandie, crédits, vue 3D, Orbites) a une entrée d'historique ; le retour ferme celle du dessus, puis Orbites revient au ciel ; sur le ciel, il quitte l'appli.

## Nombre de touchers (testés, `apps/web/src/lib/modes.test.ts`)

Apprendre : 2 (bouton, Apprendre) · un jeu : 3 (bouton, Apprendre, Reprendre ; 4 la première fois) · ligne du temps : 2 (bouton, Heure ; 1 par la puce date) · revenir à maintenant : 1 (↺) · arrêter Viser : 1 · revenir au ciel depuis Orbites ou Apprendre : 2 (bouton, Observer) ou le retour Android.
