# Police de lecture Atkinson Hyperlegible (#208)

Choix du porteur, maquette C de l'audit UX. Captures Playwright (Chromium, `--use-gl=swiftshader`) : téléphone 360 × 780 à 3×, tactile ; bureau 1366 × 820. Build de production servi en statique, date du 24/10/2026 à 21 h 30, Paris. `avant-*` : `main` au commit `b27a194` ; `apres-*` : branche `design/208-reading-font`.

| Fichier | Ce qu'on voit |
|---|---|
| `*-mobile-fiche-orion.jpg` | Fiche d'Orion sur la carte, histoire dépliée : JetBrains Mono 13 px → Atkinson Hyperlegible 15 px / 1,55 |
| `*-mobile-fiche-orion-repliee.jpg` | La même fiche repliée : l'aperçu de trois lignes passe aussi en police de lecture |
| `*-mobile-catalogue-orion.jpg` | Page d'Orion dans le catalogue (paquet de cartes), panneau Histoire |
| `*-mobile-catalogue-gemeaux-grec.jpg` | Gémeaux, anecdotes : α et β écrits en JetBrains Mono par la pile de polices (Atkinson n'a pas de grec) |
| `*-mobile-fiche-sagittaire-grec.jpg` | Sagittaire, anecdotes : α et ε dans la fiche de la carte |
| `*-mobile-latitude-expert.jpg` | « Selon la latitude », texte de l'Expert : φ et δ en mono, valeurs absolues insécables |
| `*-mobile-latitude-amateur-definition.jpg` | « Ce que visible veut dire » (Amateur) : note secondaire en 14 px, encre atténuée |
| `*-mobile-fiche-orion-nuit-rouge.jpg` | Fiche d'Orion en vision nocturne rouge |
| `*-mobile-latitude-expert-nuit-rouge.jpg` | Texte de l'Expert en vision nocturne rouge |
| `*-desktop-latitude-expert.jpg` | Bureau : ligne limitée à 65 caractères environ (`--ast-text-measure`, 32 em) |
| `*-desktop-catalogue-orion.jpg` | Bureau : page du catalogue, histoire et anecdotes |
| `variante-fiche-betelgeuse.jpg` | Fiche d'étoile en Découverte : en haut, serif actuelle (gardée) ; en bas, la même phrase en Atkinson, pour comparaison seulement (non appliquée) |

Notes :
- Le zéro barré (« 2022 », « 27 000 ») est un trait de la police (0 et O distincts) ; elle n'a pas de variante sans barre.
- Les mots en italique des récits (titres d'œuvres, mots translittérés) restent en Cormorant italique.
- Poids : 17 Ko (woff2, latin) chargés à la première histoire ; 9 Ko (latin-ext) seulement pour une lettre rare (ń de Gdańsk, Lynx) ; les deux dans la copie hors ligne.
