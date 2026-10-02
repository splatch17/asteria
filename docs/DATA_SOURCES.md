# Sources de données

⚠️ Chaque jeu de données intégré doit avoir : source, version, licence, citation requise, script de récupération reproductible (`packages/sky-data`). **Aucune donnée copiée à la main.**

| Domaine | Source | Institution | Licence / usage | Usage prévu |
|---|---|---|---|---|
| Étoiles (brillantes) | **Hipparcos** (ESA 1997, nouvelle réduction van Leeuwen 2007) | ESA / CDS VizieR `I/239`, `I/311` | **CC BY-NC 3.0 IGO** (archives scientifiques ESA), mention « Credit: ESA » ; tout usage commercial requiert une autorisation ESA (data.licences@esa.int) | Astrométrie `I/311` + V, B-V, HD depuis `I/239` — ✅ intégré (#3), 8 872 étoiles V ≤ 6.5. Positions à l'époque **J1991.25**, mouvements propres μα* = μα·cos δ et μδ en mas/an, propagés à la date affichée (#78, `astro-core/proper-motion.ts`, validé contre SIMBAD), avec la vitesse radiale depuis #79 (accélération perspective). Distance de référence quand sa parallaxe est la plus précise (#75, 6 935 étoiles) |
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

## Distance de référence d'une étoile (#75)

Règle appliquée par `build_stars.py` (champs `dist`, `eDist` en années-lumière, `distSrc`) :
1. étoile listée dans `LITERATURE_DISTANCES` → distance publiée (Deneb, Bételgeuse), incertitude = moyenne des barres d'erreur ;
2. sinon, inverse de la parallaxe la plus précise (σϖ/ϖ minimal) entre Hipparcos 2007 et Gaia DR3 (si fiable, voir ci-dessus), incertitude d = d·σϖ/ϖ ;
3. pas de distance si σϖ > ϖ (67 étoiles).

Arrondis : 3 chiffres significatifs pour la distance (≤ 0,5 %, sous les erreurs de parallaxe), 2 pour l'incertitude. L'app affiche « ≈ » (2 chiffres) au-delà de 5 % d'incertitude et rien au-delà de 50 %. Contrôles automatiques : Sirius 8,60 al (± 0,5 %), Rigel 860 al (± 10 %, Hipparcos), Bételgeuse 548 al (± 5 %, Joyce 2020), Deneb 2 600 al (± 10 %, Schiller & Przybilla 2008). Étoiles V ≤ 2 restant à plus de 10 % d'incertitude (affichées « ≈ ») : Bételgeuse, Antarès, Shaula, Alnilam, Alnitak, Wezen, Sargas — candidates à une distance publiée.

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
