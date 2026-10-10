# Sources de données

⚠️ Chaque jeu de données intégré doit avoir : source, version, licence, citation requise, script de récupération reproductible (`packages/sky-data`). **Aucune donnée copiée à la main.**

| Domaine | Source | Institution | Licence / usage | Usage prévu |
|---|---|---|---|---|
| Étoiles (brillantes) | **Hipparcos** (ESA 1997, nouvelle réduction van Leeuwen 2007) | ESA / CDS VizieR `I/239`, `I/311` | **CC BY-NC 3.0 IGO** (archives scientifiques ESA), mention « Credit: ESA » ; tout usage commercial requiert une autorisation ESA (data.licences@esa.int) | Astrométrie `I/311` + V, B-V, HD depuis `I/239` — ✅ intégré (#3), 8 872 étoiles V ≤ 6.5. Positions à l'époque **J1991.25**, mouvements propres μα* = μα·cos δ et μδ en mas/an, propagés à la date affichée (#78, `astro-core/proper-motion.ts`, validé contre SIMBAD), avec la vitesse radiale depuis #79 (accélération perspective). Distance de référence quand sa parallaxe est la plus précise (#75, 6 935 étoiles). Vue 3D des constellations (#8, `sky-renderer/constellation-3d-model.ts`) : distance de référence du catalogue (`distanceLy` ± `distanceErrorLy`) si présente, sinon d = 1000/ϖ pc et ±1σ = [1000/(ϖ+σ), 1000/(ϖ−σ)] ; σ/d > 0,1 signalée, > 0,5 incertitude explicite ; validé contre SIMBAD (Bételgeuse, Rigel, Bellatrix) et Gaia DR3 (π³ Ori) |
| Étoiles (précision) | **Gaia DR3** (Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1), archive ESA : `gaiadr3.gaia_source` × `gaiadr3.hipparcos2_best_neighbour` (requête ADQL dans `build_stars.py`, G < 9, cache `raw/gaia-dr3-hip.ecsv`) | ESA / DPAC | **CC BY-NC 3.0 IGO** (https://www.cosmos.esa.int/web/gaia-users/license), mention « Credit: ESA/Gaia/DPAC » ; usage commercial sur autorisation | ✅ intégré (#75, #79) : **distances** — parallaxe corrigée du point zéro (Lindegren et al. 2021, A&A 649, A4, paquet `gaiadr3-zeropoint`) retenue si G > 6 (en deçà, Gaia sature et la correction n'est pas calibrée), RUWE < 1,4, solution à 5 ou 6 paramètres, couleur dans le domaine de calibration de cette correction, et plus précise que Hipparcos : 1 868 étoiles ; **vitesses radiales** (`radial_velocity`) : 5 082 étoiles. Niveaux 2-3 (astrométrie expert) à venir |
| Étoiles (noms, photométrie) | **Yale Bright Star Catalogue 5** | NASA HEASARC / CDS `V/50` | Domaine public | Désignations Bayer/Flamsteed, HR ; vitesse radiale `RadVel` (km/s entiers) quand Gaia DR3 n'en a pas — ✅ #79, 3 615 étoiles (dont les plus brillantes : Sirius −8, α Cen A −22) |
| Distances publiées (étoiles brillantes à parallaxe biaisée) | **Schiller & Przybilla 2008**, A&A 479, 849 (`2008A&A...479..849S`, tableau 2 : Deneb 802 ± 66 pc, appartenance à Cyg OB7) ; **Joyce et al. 2020**, ApJ 902, 63 (`2020ApJ...902...63J`, résumé : Bételgeuse 168 +27/−15 pc, modélisation évolutive, astérosismique et hydrodynamique) | — | Publications scientifiques : valeurs factuelles, citation | ✅ intégré (#75). **Seule exception à la règle « aucune donnée saisie à la main »** : ces deux valeurs sont transcrites dans `LITERATURE_DISTANCES` (`build_stars.py`) avec leur référence ADS, vérifiées sur les articles et contrôlées par le pipeline. Ni Gaia (trop brillantes) ni SIMBAD (`mesDistance` vide pour ces deux étoiles) ni Wikidata (Deneb : 1 640 al, non sourcé) n'offrent de valeur exploitable. Ajouter une étoile exige une publication de référence par une autre méthode que la parallaxe |
| Noms d'étoiles officiels | **IAU WGSN** — fichier `IAU-CSN.txt` (version 2022-04-04, E. Mamajek) | IAU | **CC BY 4.0** (citer l'IAU, https://www.iau.org/public/themes/naming_stars/) | 338 noms pour V ≤ 6.5 — ✅ intégré (#3) ; fichier lu en UTF-8 depuis #75 (avant : 5 noms manquants ou illisibles, « CitalÃ¡ », « 4.62  V ») |
| Noms d'étoiles en français | **IAU WGSN** (`IAU-CSN.txt`, nom officiel, V, HIP) + **Wikidata** (titre de l'article Wikipédia FR, libellé et alias français de l'élément portant le numéro HIP, propriété P528 / catalogue Hipparcos Q537199) | IAU / Wikimedia | IAU : CC BY ; Wikidata : **CC0** (aucune donnée CC BY-SA reprise) | ✅ intégré (#67) : `packages/content/fr/star-names.json` (144 étoiles : toutes les étoiles nommées V ≤ 3 et toutes celles dont le nom diffère, soit 13 graphies françaises : Bételgeuse, Aldébaran, Véga, Altaïr, Antarès, Régulus, Alphératz, Saïph, Schédar, Aïn, Maïa, Mérope, Pléioné), généré par `packages/sky-data/build_star_names_fr.py`. Règle reproductible : seule une graphie identique au nom IAU aux diacritiques près est retenue, par ordre de priorité titre Wikipédia FR > libellé > alias ; les noms d'usage réellement différents (ex. « l'Épi » pour Spica, « étoile Polaire ») ne sont pas repris tant qu'une référence française n'est pas choisie (liste `FRENCH_USAGE` du script) |
| Constellations : frontières | **Delporte 1930 / IAU** | IAU / CDS `VI/49` | Libre | 88 frontières officielles |
| Constellations : noms, abréviations | IAU | IAU | Libre | Latin, génitif, abréviation 3 lettres |
| Lignes de constellations | **Stellarium**, culture du ciel « modern » (`skycultures/modern/index.json`), tracés usuels proches des cartes Sky & Telescope / IAU, numéros HIP directs | Stellarium | **CC BY-SA 4.0** (attribution ; données dérivées sous CC BY-SA) | 88 figures — ✅ intégré (#43), remplace d3-celestial |
| Appartenance aux constellations | astropy `get_constellation` (Roman 1987, CDS `VI/42`) | — | Libre | Champ `con` — ✅ intégré (#3) ; planètes à la volée via `Astronomy.Constellation` d’astronomy-engine (même table Roman 1987, `constellationOf`, #53) |
| Planètes, Lune, Soleil | **JPL Horizons / DE440** (validation) + lib `astronomy-engine` (MIT) | NASA JPL | Libre | Positions temps réel |
| Ciel profond | **OpenNGC** (Mattia Verga, https://github.com/mattiaverga/OpenNGC), version **v20260501** (commit `36cb178a0f69`, 2026-04-16) : `database_files/NGC.csv` (NGC/IC) + `addendum.csv` (M40, M45 et objets hors NGC/IC), compilés depuis NED, HyperLEDA, SIMBAD, HEASARC et les notes de H. Corwin. Messier : colonne `M` d'OpenNGC | M. Verga et contributeurs | **CC BY-SA 4.0** (vérifiée : `LICENSES/CC-BY-SA-4.0.txt` et `.reuse/dep5` du dépôt, « Files: * … License: CC-BY-SA-4.0 ») ; attribution « OpenNGC, Mattia Verga » (page Crédits), le catalogue dérivé `deepsky.json` est diffusé sous CC BY-SA 4.0 | ✅ intégré (#100) : 600 objets (`build_deepsky.py`, voir ci-dessous), positions J2000, types, magnitudes V et B, axes et angle de position, noms usuels anglais. Noms français : `packages/content/fr/deepsky-names.json` |
| Voie lactée | **Gaia DR3 sky map** / NASA SVS | ESA / NASA | Citation | Texture de fond |
| Côtes (globe) | **Natural Earth** 1:50m coastline (`build_earth.py`) | Natural Earth | Domaine public | Vue Terre — ✅ intégré (#35) |
| Relief (globe) | **NASA Blue Marble: Next Generation**, topographie + bathymétrie, déc. 2004 | NASA Visible Earth | Domaine public (crédit NASA) | Texture du globe — ✅ intégré (#35) |
| Lumières nocturnes | **NASA Black Marble** 2016 (0,1°) | NASA Earth Observatory | Domaine public (crédit NASA) | Côté nuit du globe — ✅ intégré (#35) |
| Terre en couleurs (style réaliste) | **NASA Blue Marble: Next Generation**, juin 2004, sans relief ni bathymétrie (`world.200406.3x5400x2700.jpg`, Visible Earth #76487) | NASA Earth Observatory (R. Stöckli) | Domaine public (crédit NASA) | `earth-day.webp` 2048×1024, 123 Ko (`build_space.py`) — ✅ intégré (#55) |
| Lune (style réaliste) | **NASA SVS CGI Moon Kit** (#4720), mosaïque couleur LRO LROC WAC avec pôles (`lroc_color_poles_1k.jpg`) | NASA Scientific Visualization Studio | Domaine public (crédit NASA SVS) | `moon.webp` 1024×512, 74 Ko — ✅ intégré (#55) |
| Planètes et anneaux de Saturne (style réaliste) | **Solar System Scope** textures 2k (Mercure, Vénus atmosphère, Mars, Jupiter, Saturne + anneaux, Uranus, Neptune), dérivées d'images NASA | Solar System Scope (INOVE) | **CC BY 4.0** — attribution « Solar System Scope » obligatoire (page Crédits) | Atlas `planets.webp` 256×1024, 19 Ko — ✅ intégré (#55) |
| Pôles et méridiens des planètes, pôle lunaire | **IAU WGCCRE 2015** (Archinal et al. 2018, *Celest. Mech. Dyn. Astr.* 130:22), termes constants | IAU | Libre (publication scientifique, citation) | Orientation des globes et des anneaux de Saturne (`space-style.ts`), testée contre le passage de la Terre dans le plan des anneaux le 23/03/2025 — ✅ (#55) |
| Rayons de la Lune et des planètes, anneaux de Saturne | **IAU WGCCRE 2015** (Archinal et al. 2018) : rayons équatoriaux des planètes, rayon moyen de la Lune ; rayon équatorial terrestre 6 378,137 km (IAU 2015 / WGS 84) ; anneaux C (1,239 R) à A (2,27 R) | IAU | Libre (publication scientifique, citation) | Référentiel « centré sur un astre » à l'échelle réelle (`body-frame.ts`, #123) ; positions géocentriques astrométriques corrigées du temps de lumière (`geocentricPosition`, astronomy-engine), testées contre JPL Horizons — ✅ (#123) |
| Obliquité moyenne de l'écliptique | **IAU 2006** (Capitaine et al. 2003, *A&A* 412:567 ; IERS Conventions 2010, éq. 5.40) | IAU / IERS | Libre (publication scientifique, citation) | `astro-core` `meanObliquity` (±5 siècles ; au-delà, constante du modèle de précession à long terme), validé contre SOFA `iauObl06` à 0,001″ — référentiel « plan de l'écliptique » de la vue Terre (#122) |
| Satellites / ISS | **CelesTrak** (TLE) | — | Libre | Passages |
| Exoplanètes | **NASA Exoplanet Archive** | NASA / IPAC | Libre | Étoiles hôtes |
| Objets (expert) | **SIMBAD** (API TAP) | CDS Strasbourg | Libre, citation | Liens et données croisées |
| Figures illustrées des constellations (jeu 1, #95) | **Stellarium**, culture du ciel « western » : dépôt `Stellarium/stellarium-skycultures`, dossier `western/`, **commit épinglé `014fbb5e59233d133c22f9811af96b67d05a95c9`** (2026-05-26) ; 85 illustrations WebP de **Johan Meuris** (`western/illustrations/`), chacune ancrée sur 3 étoiles HIP (`index.json`, `constellations[].image.anchors`) | Stellarium | Illustrations : **Licence Art Libre (Free Art License)** — `description.md` ne précise pas la version ; nous appliquons la **1.3** (version en vigueur, https://artlibre.org/licence/lal/) ; texte et données (ancrages) : **CC BY-SA** (version non précisée → CC BY-SA 4.0, comme les lignes). Le fichier `LICENSE-AGPL-3.0.txt` à la racine du dépôt couvre ses scripts Python, pas les cultures. Copyleft : l'atlas dérivé est diffusé sous LAL 1.3 avec attribution (« Illustrations: Johan Meuris »), mention des modifications et lien vers les originaux au commit épinglé (page Crédits, manifeste) ; l'application n'est pas une œuvre dérivée (simple affichage, comme dans Stellarium) | ✅ intégré (#95, #96) : `build_figures.py` vérifie que la mention de licence de `description.md` n'a pas changé, convertit en niveaux de gris (luminance = encre), réduit à 240 px, normalise (99e centile = encre pleine), assemble un atlas 2048×2816 WebP q80 (≈ 361 Ko) + manifeste `asteria-figure-set` v1 (≈ 21 Ko, 5 Ko gzip) ; 84 figures affichées, Télescope (Tel) non affichée : son ancre HIP 91589 a V = 6,8 > 6,5 (hors catalogue). Pas d'image pour Pup, Vel (Argo Navis rattaché à Car) ni Ser |
| Cultures du ciel (figures, lignes) | Stellarium *skycultures* (licences par culture : CC BY-SA / GPL…) + publications ethnoastronomiques | Divers | Vérifier culture par culture | Cultures non occidentales |
| Histoires, mythes, anecdotes | **Wikipédia FR/EN** (point de départ) + sources antiques (Ératosthène, Hygin, Aratos) | Wikimedia | **CC BY-SA 4.0** → reformuler, attribuer, contenu dérivé sous CC BY-SA | Guide, fiches, jeux — ✅ intégré (#10) : histoires + 3 anecdotes pour les 12 constellations zodiacales, Orion, Grande Ourse et Cassiopée (`packages/content/fr/constellations/`, sources par fichier ; faits vérifiés aussi via Ian Ridpath *Star Tales*, ESO ; relecture #67 : position de Neptune en 1846 vérifiée avec JPL Horizons) |
| Gravures anciennes (base des figures) | *Uranometria* (Bayer 1603), Hevelius 1690, *Urania's Mirror* 1824 (numérisations Library of Congress, USNO, Linda Hall Library) | — | Domaine public (vérifier la numérisation) | Base des figures artiste + IA |
| Météo / nuages | Open-Meteo (API libre) ou Météo-France (données publiques) | — | Libre, citation | « Ce soir » |
| Pollution lumineuse | World Atlas of Artificial Night Sky Brightness (Falchi 2016) / VIIRS (NASA/NOAA) | — | Vérifier | Indice Bortle |

## Distance de référence d'une étoile (#75)

Règle appliquée par `build_stars.py` (champs `dist`, `eDist` en années-lumière, `distSrc`) :
1. étoile listée dans `LITERATURE_DISTANCES` → distance publiée (Deneb, Bételgeuse), incertitude = moyenne des barres d'erreur ;
2. sinon, inverse de la parallaxe la plus précise (σϖ/ϖ minimal) entre Hipparcos 2007 et Gaia DR3 (si fiable, voir ci-dessus), incertitude d = d·σϖ/ϖ ;
3. pas de distance si σϖ > ϖ (67 étoiles).

Arrondis : 3 chiffres significatifs pour la distance (≤ 0,5 %, sous les erreurs de parallaxe), 2 pour l'incertitude. L'app affiche « ≈ » (2 chiffres) au-delà de 5 % d'incertitude et rien au-delà de 50 %. Contrôles automatiques : Sirius 8,60 al (± 0,5 %), Rigel 860 al (± 10 %, Hipparcos), Bételgeuse 548 al (± 5 %, Joyce 2020), Deneb 2 600 al (± 10 %, Schiller & Przybilla 2008). Étoiles V ≤ 2 restant à plus de 10 % d'incertitude (affichées « ≈ ») : Bételgeuse, Antarès, Shaula, Alnilam, Alnitak, Wezen, Sargas — candidates à une distance publiée.

## Catalogue du ciel profond (#100)

`packages/sky-data/build_deepsky.py` télécharge les deux tables d'OpenNGC épinglées sur le commit
de la version v20260501 (empreintes SHA-256 vérifiées : un fichier amont modifié fait échouer le
build) dans `raw/openngc-<commit>/`, et écrit `out/deepsky.json` (format décrit dans
`packages/sky-data/README.md`, décodé par `@asteria/catalog`, `loadDeepSkyCatalog`).

**Sélection** (600 objets) :
1. les 110 objets de Messier. OpenNGC tient M102 pour un doublon de M101 (identification de
   Méchain) : « M 102 » est une désignation de l'entrée M101, d'où 109 entrées pour 110 numéros ;
2. les autres objets dont la magnitude **V ou B est ≤ 10**, hors étoiles simples ou doubles,
   objets inexistants, doublons et « Other ». Seuil : ~10 est la limite usuelle d'une paire de
   jumelles ou d'une petite lunette sous un ciel de campagne, soit le public visé (Découverte et
   Amateur) ; il donne 600 objets, dont 112 galaxies, pour 18 Ko gzip. Les deux bandes sont lues
   car OpenNGC n'en donne parfois qu'une, et quelques magnitudes V de galaxies sont manifestement
   trop faibles (NGC 253 : V 11,11 pour B 7,94 ; aussi NGC 4945, NGC 6822, NGC 4656) ;
3. les amas et nébuleuses qu'OpenNGC nomme mais sans magnitude (la magnitude intégrée des grandes
   nébuleuses est rarement mesurée) : Tête de Cheval, Boîte à bijoux, Pléiades du Sud, Hyades,
   Sac à charbon… (21 objets). Les galaxies sans magnitude ne sont pas retenues.

Constellation : astropy `get_constellation` (Roman 1987), comme pour les étoiles ; seule NGC 6946,
sur la frontière Céphée/Cygne, diffère de la colonne d'OpenNGC (contrôle : < 2 % d'écarts, aucun
objet de Messier). Positions : J2000 d'OpenNGC (NED/SIMBAD), arrondies à 10⁻⁵° (0,04″).

**Contrôles automatiques** (le script échoue sinon) : 550 à 700 objets ; numéros M1 à M110 tous
présents une seule fois ; aucune désignation ni identifiant en double ; bornes des positions,
magnitudes (−1 à 16), axes (petit ≤ grand) et angles (0 à 180°) ; type, constellation et
magnitude de M31, M42, M45, M13, M1, M57, ω Cen et du Grand Nuage de Magellan ; positions de
**M31, M42, M1, M13 à ≤ 1′ des coordonnées SIMBAD** (constantes `SIMBAD_REFERENCES` du script,
SIMBAD n'étant pas joignable depuis l'environnement de build ; écarts mesurés : 1,1″, 13,3″, 0,4″,
0,1″). M45 : un amas de 2° n'a pas de centre net et les catalogues divergent de plusieurs minutes
d'arc ; OpenNGC le centre sur Alcyone, contrôlée à ≤ 1′ de la position SIMBAD d'η Tau (6,5″) ;
toutes les clés des noms français présentes dans le catalogue ; `deepsky.json` < 50 000 octets
gzip. Tailles au 2026-10-09 : 58 018 o brut, 18 273 o gzip -9.

**Noms français** (`packages/content/fr/deepsky-names.json`, 42 objets) : contenu éditorial, clé =
identifiant du catalogue (`M31`, `NGC5139`, `C41`…). Seuls les objets célèbres qu'OpenNGC nomme
déjà en anglais reçoivent un nom français d'usage courant (« Galaxie d'Andromède » pour
« Andromeda Galaxy ») ; le script vérifie les deux conditions. Les autres objets s'affichent par
leur désignation (M 13, NGC 869). Vérification contre les libellés français de Wikidata (CC0),
comme pour les étoiles (#67) : à faire quand Wikidata sera joignable depuis le pipeline.

**Affichage sur la carte (#101)** : calque « Ciel profond » (`sky-renderer/src/deepsky*.ts`),
catalogue chargé à la demande (calque allumé ou recherche). Glyphes gravés par type, taille = axes
d'OpenNGC projetés (minimum lisible), orientés selon l'angle de position ; visibles selon un rang
(magnitude, bonus Messier et objets nommés) comparé à une limite qui dépend du champ ; niveau
Découverte : Messier seuls. Fiche : magnitude du catalogue (V, sinon B), dimensions apparentes,
constellation et une indication d'observation (œil nu ≤ 5,0 ; jumelles ≤ 8,0 ; petite lunette
≤ 10,5 ; au-delà télescope ; une classe de plus pour un objet diffus de brillance de surface
moyenne > 23,5 mag/arcsec²), règle documentée dans `apps/web/src/lib/deepsky.ts`. Aucune distance :
le catalogue n'en donne pas.

## Stratégie
- Données **pré-compilées** au build en tuiles binaires compactes (HEALPix ou découpage par magnitude) → offline, rapide sur mobile.
- Niveau 1 embarqué (~mag 6.5, < 1 Mo) — ✅ format binaire `ASTS` v2 (#16, distances et vitesses radiales #75/#79) : `stars.bin` + `star-strings.json` + `constellation-lines.json` = 491 Ko (313 Ko gzip, v1 : 393 Ko / 262 Ko), décrit dans `packages/sky-data/README.md`, décodé par `@asteria/catalog` ; niveaux 2-3 téléchargeables (mag 9-10, puis Gaia partiel).
- Requêtes live (SIMBAD, Horizons) uniquement en mode Expert et en ligne.
- Page « Crédits et sources » dans l'app (#66) : panneau `apps/web/src/components/Credits.svelte`, ouvert depuis le bas du panneau Calques. Source unique : `packages/content/fr/credits.json` (nom, rôle, auteur, mention, licence, URL de licence, URL source), testée (`credits.test.ts`). **Toute donnée, image, police ou bibliothèque ajoutée à l'app doit y être ajoutée en même temps qu'à ce fichier.**
- Textes complets des licences logicielles : `THIRD-PARTY-LICENSES.txt`, généré au build par `apps/web/third-party-licenses.ts` à partir des paquets réellement présents dans le bundle (code conservé après tree-shaking + fichiers de polices). **Le build échoue si un paquet embarqué n'a pas d'entrée dans `credits.json`.**

## Polices embarquées (auto-hébergées via @fontsource, hors ligne)

| Police | Usage | Auteur | Licence | Source |
|---|---|---|---|---|
| **JetBrains Mono** 400/500/700 | Données, interface | The JetBrains Mono Project Authors (2020) | SIL OFL 1.1 | https://github.com/JetBrains/JetBrainsMono |
| **Big Shoulders Display** 700 | Titres | The Big Shoulders Project Authors (2019) | SIL OFL 1.1 | https://github.com/xotypeco/big_shoulders |
| **Cormorant** 500 italique | Noms latins, récits | The Cormorant Project Authors (2015) | SIL OFL 1.1 | https://github.com/CatharsisFonts/Cormorant |

OFL : la licence doit accompagner les polices redistribuées (fait par `THIRD-PARTY-LICENSES.txt`) ; pas de vente des polices seules.

## Bibliothèques embarquées dans l'app (runtime)

| Paquet | Rôle | Licence | Copyright |
|---|---|---|---|
| `astronomy-engine` 2.1 | Soleil, Lune, planètes, constellation d'un point | MIT | © 2019-2023 Don Cross |
| `three` 0.186 | Rendu WebGL | MIT | © 2010-2026 three.js authors |
| `svelte` 5 | Interface | MIT | © 2016-2025 Svelte Contributors |
| `svelte-i18n` 4 | i18n (ADR-0002) | MIT | © 2017 Christian Kaisermann |
| `intl-messageformat`, `@formatjs/icu-messageformat-parser`, `@formatjs/icu-skeleton-parser`, `@formatjs/fast-memoize` (via svelte-i18n) | Messages ICU | BSD-3-Clause (intl-messageformat), MIT (autres) | © 2023 Oath Inc. ; © 2023 FormatJS |
| `deepmerge` (via svelte-i18n) | Fusion des catalogues | MIT | © 2012 James Halliday, Josh Duff et contributeurs |
| `tslib` (via FormatJS) | Helpers TypeScript | 0BSD | © Microsoft Corporation |

Outils de préparation des données (non redistribués) : astropy, astroquery (BSD-3-Clause), numpy, requests, Pillow — aucune obligation d'attribution dans l'app.
