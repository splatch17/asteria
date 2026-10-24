# Quick wins de l'audit UX (#198)

Captures Playwright (Chromium, `--use-gl=swiftshader`), téléphone 360 × 780 à 3×, tactile ; bureau 1440 × 900. Build de production (`vite preview`), Paris (48,85° N · 2,35° E), samedi 24/10/2026 à 21 h 30 (14 h 30 pour le jour). « Avant » = `main` 2e52f6f (version de l'audit), « Après » = branche `ux/198-quick-wins`. Planches avant / après, réduites.

| Fichier | Quick win | Ce qu'on voit |
|---|---|---|
| `01-interface-masquee.jpg` | 1 | Avant : plus rien après un toucher du ciel vide. Après : bulle « Interface masquée · touche le ciel pour la retrouver » (2 s, les 3 premières fois), puis un repère discret (œil, coin du menu) qui la rend |
| `02-carte-noms-et-lieu.jpg` | 2, 6 | Carte entière : noms de constellation non barrés ; en-tête « 48,9° N · 2,4° E » au lieu de « MA POSITION » |
| `03-noms-detail.jpg` | 2 | Détail : Dauphin, Petit Cheval, Verseau, Capricorne ; contour couleur du ciel (3 px, joints arrondis), encre 0,65 |
| `04-fiches-donnees.jpg` | 4, 6 | Bételgeuse en Découverte : « AD / Déc. », « Magnitude », « Distance », virgule décimale, « Sous l'horizon · se lève à 23 h 00 » ; Véga en Expert : « V », « 0,00 » au lieu de « -0.00 » |
| `05-jour-voir-ce-soir.jpg` | 5 | De jour : le bandeau devient un bouton « Voir ce soir, 20 h 30 › » ; touché, la carte passe à la nuit noire (Soleil à −18°) |
| `06-iss-erreur.jpg` | 6 | ISS sans orbite (CelesTrak bloqué) : message clair et bouton « Réessayer », grisé avec l'heure tant que les 2 h demandées par CelesTrak ne sont pas passées |
| `07-jeu-sans-lieu.jpg` | 6 | Réglages d'un jeu sans lieu connu : bouton « Utiliser ma position » sur place |
| `08-ce-soir-coherent.jpg` | 6 | Plus de contradiction : la page d'Orion dit « visible de 0 h 40 à 6 h 15 », la fiche de Bételgeuse « se lève à 23 h 00 » |
| `09-nuit-rouge.jpg` | 7 | Nuit rouge : texte secondaire à 90 % de l'encre, filets à 40 %, contours des commandes à 70 % |
| `10-reglages-contours-voyant.jpg` | 7 | Contours des tuiles à 45 % (≥ 3:1) ; voyant réseau en pastille pleine (connecté) ou creuse (hors ligne), sans vert |
| `11-ton-ciel-decouverte.jpg` | 8 | « Ton ciel » en Découverte : noms entiers, triés par nom, sur trois colonnes |
| `12-quiz-indice.jpg` | 8 | Après une erreur : « Pégase : cherche le Grand Carré, quatre étoiles très espacées (l'une est à Andromède). » |
| `13-bureau-focus.jpg` | 7 | Bureau, au clavier : anneau de focus (ici celui du bouton lecture, dessiné par son composant ; le `:focus-visible` global couvre les éléments qui n'en avaient pas) |

Le tutoiement (quick win 3) n'a pas de capture propre : il se lit dans la bulle de `01` et dans les messages des autres planches ; règle dans `docs/TONE.md`, test dans `packages/ui/src/i18n/tone.test.ts`.
