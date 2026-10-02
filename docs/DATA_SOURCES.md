# Sources de données

⚠️ Chaque jeu de données intégré doit avoir : source, version, licence, citation requise, script de récupération reproductible (`packages/sky-data`). **Aucune donnée copiée à la main.**

| Domaine | Source | Institution | Licence / usage | Usage prévu |
|---|---|---|---|---|
| Étoiles (brillantes) | **Hipparcos** (ESA 1997, nouvelle réduction van Leeuwen 2007) | ESA / CDS VizieR `I/311` | Libre usage scientifique, citation | Astrométrie `I/311` + V, B-V, HD depuis `I/239` — ✅ intégré (#3), 8 870 étoiles V ≤ 6.5 |
| Étoiles (précision) | **Gaia DR3** | ESA | Libre, citation obligatoire | Astrométrie niveau expert, distances, mouvement propre |
| Étoiles (noms, photométrie) | **Yale Bright Star Catalogue 5** | NASA HEASARC / CDS `V/50` | Domaine public | Désignations Bayer/Flamsteed, HR |
| Noms d'étoiles officiels | **IAU WGSN** — fichier `IAU-CSN.txt` (version 2022-04-04, E. Mamajek) | IAU | **CC BY** (citer l'IAU) | 333 noms pour V ≤ 6.5 — ✅ intégré (#3) |
| Noms d'étoiles en français | **IAU WGSN** (`IAU-CSN.txt`, nom officiel, V, HIP) + **Wikidata** (titre de l'article Wikipédia FR, libellé et alias français de l'élément portant le numéro HIP, propriété P528 / catalogue Hipparcos Q537199) | IAU / Wikimedia | IAU : CC BY ; Wikidata : **CC0** (aucune donnée CC BY-SA reprise) | ✅ intégré (#67) : `packages/content/fr/star-names.json` (144 étoiles : toutes les étoiles nommées V ≤ 3 et toutes celles dont le nom diffère, soit 13 graphies françaises : Bételgeuse, Aldébaran, Véga, Altaïr, Antarès, Régulus, Alphératz, Saïph, Schédar, Aïn, Maïa, Mérope, Pléioné), généré par `packages/sky-data/build_star_names_fr.py`. Règle reproductible : seule une graphie identique au nom IAU aux diacritiques près est retenue, par ordre de priorité titre Wikipédia FR > libellé > alias ; les noms d'usage réellement différents (ex. « l'Épi » pour Spica, « étoile Polaire ») ne sont pas repris tant qu'une référence française n'est pas choisie (liste `FRENCH_USAGE` du script) |
| Constellations : frontières | **Delporte 1930 / IAU** | IAU / CDS `VI/49` | Libre | 88 frontières officielles |
| Constellations : noms, abréviations | IAU | IAU | Libre | Latin, génitif, abréviation 3 lettres |
| Lignes de constellations | **Stellarium**, culture du ciel « modern » (`skycultures/modern/index.json`), tracés usuels proches des cartes Sky & Telescope / IAU, numéros HIP directs | Stellarium | **CC BY-SA 4.0** (attribution ; données dérivées sous CC BY-SA) | 88 figures — ✅ intégré (#43), remplace d3-celestial |
| Appartenance aux constellations | astropy `get_constellation` (Roman 1987, CDS `VI/42`) | — | Libre | Champ `con` — ✅ intégré (#3) ; planètes à la volée via `Astronomy.Constellation` d’astronomy-engine (même table Roman 1987, `constellationOf`, #53) |
| Planètes, Lune, Soleil | **JPL Horizons / DE440** (validation) + lib `astronomy-engine` (MIT) | NASA JPL | Libre | Positions temps réel |
| Ciel profond | **OpenNGC** (CC BY-SA 4.0) + Messier | — | CC BY-SA | NGC/IC/Messier |
| Voie lactée | **Gaia DR3 sky map** / NASA SVS | ESA / NASA | Citation | Texture de fond |
| Côtes (globe) | **Natural Earth** 1:50m coastline (`build_earth.py`) | Natural Earth | Domaine public | Vue Terre — ✅ intégré (#35) |
| Relief (globe) | **NASA Blue Marble: Next Generation**, topographie + bathymétrie, déc. 2004 | NASA Visible Earth | Domaine public (crédit NASA) | Texture du globe — ✅ intégré (#35) |
| Lumières nocturnes | **NASA Black Marble** 2016 (0,1°) | NASA Earth Observatory | Domaine public (crédit NASA) | Côté nuit du globe — ✅ intégré (#35) |
| Terre en couleurs (style réaliste) | **NASA Blue Marble: Next Generation**, juin 2004, sans relief ni bathymétrie (`world.200406.3x5400x2700.jpg`, Visible Earth #76487) | NASA Earth Observatory (R. Stöckli) | Domaine public (crédit NASA) | `earth-day.webp` 2048×1024, 123 Ko (`build_space.py`) — ✅ intégré (#55) |
| Lune (style réaliste) | **NASA SVS CGI Moon Kit** (#4720), mosaïque couleur LRO LROC WAC avec pôles (`lroc_color_poles_1k.jpg`) | NASA Scientific Visualization Studio | Domaine public (crédit NASA SVS) | `moon.webp` 1024×512, 74 Ko — ✅ intégré (#55) |
| Planètes et anneaux de Saturne (style réaliste) | **Solar System Scope** textures 2k (Mercure, Vénus atmosphère, Mars, Jupiter, Saturne + anneaux, Uranus, Neptune), dérivées d'images NASA | Solar System Scope (INOVE) | **CC BY 4.0** — attribution « Solar System Scope » obligatoire (page Crédits) | Atlas `planets.webp` 256×1024, 19 Ko — ✅ intégré (#55) |
| Pôles et méridiens des planètes, pôle lunaire | **IAU WGCCRE 2015** (Archinal et al. 2018, *Celest. Mech. Dyn. Astr.* 130:22), termes constants | IAU | Libre (publication scientifique, citation) | Orientation des globes et des anneaux de Saturne (`space-style.ts`), testée contre le passage de la Terre dans le plan des anneaux le 23/03/2025 — ✅ (#55) |
| Satellites / ISS | **CelesTrak** (TLE) | — | Libre | Passages |
| Exoplanètes | **NASA Exoplanet Archive** | NASA / IPAC | Libre | Étoiles hôtes |
| Objets (expert) | **SIMBAD** (API TAP) | CDS Strasbourg | Libre, citation | Liens et données croisées |
| Cultures du ciel (figures, lignes) | Stellarium *skycultures* (licences par culture : CC BY-SA / GPL…) + publications ethnoastronomiques | Divers | Vérifier culture par culture | Cultures non occidentales |
| Histoires, mythes, anecdotes | **Wikipédia FR/EN** (point de départ) + sources antiques (Ératosthène, Hygin, Aratos) | Wikimedia | **CC BY-SA 4.0** → reformuler, attribuer, contenu dérivé sous CC BY-SA | Guide, fiches, jeux — ✅ intégré (#10) : histoires + 3 anecdotes pour les 12 constellations zodiacales, Orion, Grande Ourse et Cassiopée (`packages/content/fr/constellations/`, sources par fichier ; faits vérifiés aussi via Ian Ridpath *Star Tales*, ESO ; relecture #67 : position de Neptune en 1846 vérifiée avec JPL Horizons) |
| Gravures anciennes (base des figures) | *Uranometria* (Bayer 1603), Hevelius 1690, *Urania's Mirror* 1824 (numérisations Library of Congress, USNO, Linda Hall Library) | — | Domaine public (vérifier la numérisation) | Base des figures artiste + IA |
| Météo / nuages | Open-Meteo (API libre) ou Météo-France (données publiques) | — | Libre, citation | « Ce soir » |
| Pollution lumineuse | World Atlas of Artificial Night Sky Brightness (Falchi 2016) / VIIRS (NASA/NOAA) | — | Vérifier | Indice Bortle |

## Stratégie
- Données **pré-compilées** au build en tuiles binaires compactes (HEALPix ou découpage par magnitude) → offline, rapide sur mobile.
- Niveau 1 embarqué (~mag 6.5, < 1 Mo) — ✅ format binaire `ASTS` v1 (#16) : `stars.bin` + `star-strings.json` + `constellation-lines.json` = 393 Ko (262 Ko gzip), décrit dans `packages/sky-data/README.md`, décodé par `@asteria/catalog` ; niveaux 2-3 téléchargeables (mag 9-10, puis Gaia partiel).
- Requêtes live (SIMBAD, Horizons) uniquement en mode Expert et en ligne.
- Page « Crédits & sources » dans l'app, générée depuis ce fichier.
