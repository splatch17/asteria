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
| Voie lactée | **AT-HYG v3.2** (Augmented Tycho-HYG, David Nash / astronexus, https://github.com/astronexus/ATHYG-Database), sous-ensemble `data/subsets/athyg_32_reduced_m11.csv.gz` (871 139 étoiles jusqu'à V/VT 11), **commit épinglé `e7ee3a737a17d84530e0012b77492f412e0e02c0`** (2024-08-17), taille (70 833 346 o) et SHA-256 vérifiés. Le dépôt annonce son déménagement sur Codeberg, injoignable depuis l'environnement de build : on garde la copie GitHub à ce commit | D. Nash, d'après Tycho-2 et Hipparcos (ESA 1997) et Gaia DR3 (ESA/Gaia/DPAC) | **CC BY-SA 4.0** (vérifiée : `LICENSE` et `README.md` du dépôt à ce commit, « This license applies to versions v3.0 and later ») ; attribution « Voie lactée : densité d'étoiles Tycho-2, AT-HYG v3.2 (D. Nash, astronexus), CC BY-SA 4.0 » (page Crédits) ; la texture dérivée `milkyway.webp` est diffusée sous CC BY-SA 4.0 | ✅ intégré (#162) : densité des étoiles de magnitude 9 à 11 (`build_milkyway.py`, voir ci-dessous), calque « Voie lactée » de la carte |
| Côtes (globe) | **Natural Earth** 1:50m coastline (`build_earth.py`) | Natural Earth | Domaine public | Vue Terre — ✅ intégré (#35) |
| Relief (globe) | **NASA Blue Marble: Next Generation**, topographie + bathymétrie, déc. 2004 | NASA Visible Earth | Domaine public (crédit NASA) | Texture du globe — ✅ intégré (#35) |
| Lumières nocturnes | **NASA Black Marble** 2016 (0,1°) | NASA Earth Observatory | Domaine public (crédit NASA) | Côté nuit du globe — ✅ intégré (#35) |
| Terre en couleurs (style réaliste) | **NASA Blue Marble: Next Generation**, juin 2004, sans relief ni bathymétrie (`world.200406.3x5400x2700.jpg`, Visible Earth #76487) | NASA Earth Observatory (R. Stöckli) | Domaine public (crédit NASA) | `earth-day.webp` 2048×1024, 123 Ko (`build_space.py`) — ✅ intégré (#55) |
| Lune (style réaliste) | **NASA SVS CGI Moon Kit** (#4720), mosaïque couleur LRO LROC WAC avec pôles (`lroc_color_poles_1k.jpg`) | NASA Scientific Visualization Studio | Domaine public (crédit NASA SVS) | `moon.webp` 1024×512, 74 Ko — ✅ intégré (#55) |
| Planètes et anneaux de Saturne (style réaliste) | **Solar System Scope** textures 2k (Mercure, Vénus atmosphère, Mars, Jupiter, Saturne + anneaux, Uranus, Neptune), dérivées d'images NASA | Solar System Scope (INOVE) | **CC BY 4.0** — attribution « Solar System Scope » obligatoire (page Crédits) | Atlas `planets.webp` 256×1024, 19 Ko — ✅ intégré (#55) |
| Pôles et méridiens des planètes, pôle lunaire | **IAU WGCCRE 2015** (Archinal et al. 2018, *Celest. Mech. Dyn. Astr.* 130:22), termes constants | IAU | Libre (publication scientifique, citation) | Orientation des globes et des anneaux de Saturne (`space-style.ts`), testée contre le passage de la Terre dans le plan des anneaux le 23/03/2025 — ✅ (#55). Rotation W = W0 + Ẇ·d (d en jours UTC depuis J2000, TDB non distingué : ≈ 69 s, 0,3° pour Mars) : globes et référentiel « Fixe : planète » (#139, `rest-frames.ts`) ; périodes 360°/Ẇ testées à 0,2 % des périodes sidérales publiées par le JPL (Mars 24,622962 h à 1 s ; Neptune à 0,9 % : le taux UAI 541,14°/j donne 15,97 h contre 16,11 h pour la période radio de Voyager) ; Lune : Ẇ = 13,17635815°/j (rotation synchrone), méridien origine au point sub-terrestre moyen |
| Rayons de la Lune et des planètes, anneaux de Saturne | **IAU WGCCRE 2015** (Archinal et al. 2018) : rayons équatoriaux des planètes, rayon moyen de la Lune ; rayon équatorial terrestre 6 378,137 km (IAU 2015 / WGS 84) ; anneaux C (1,239 R) à A (2,27 R) | IAU | Libre (publication scientifique, citation) | Référentiel « centré sur un astre » à l'échelle réelle (`body-frame.ts`, #123) ; positions géocentriques astrométriques corrigées du temps de lumière (`geocentricPosition`, astronomy-engine), testées contre JPL Horizons — ✅ (#123) |
| Obliquité moyenne de l'écliptique | **IAU 2006** (Capitaine et al. 2003, *A&A* 412:567 ; IERS Conventions 2010, éq. 5.40) | IAU / IERS | Libre (publication scientifique, citation) | `astro-core` `meanObliquity` (±5 siècles ; au-delà, constante du modèle de précession à long terme), validé contre SOFA `iauObl06` à 0,001″ — référentiel « plan de l'écliptique » de la vue Terre (#122) |
| Rotation de la Terre | **IAU 2000 Resolution B1.8** (angle de rotation de la Terre, ERA) et **IAU 2006** (GMST = ERA + précession accumulée en ascension droite ; IERS Conventions 2010, éq. 5.15 et 5.32) ; référence de test : **SOFA** (IAU Standards of Fundamental Astronomy), programme de test `t_sofa_c.c` : `iauEra00(2400000.5, 54388.0)` = 0,4022837240028158102 rad, `iauGmst06(2400000.5, 53736.0, …)` = 1,754174971870091203 rad | IAU / IERS | Libre (publication scientifique, valeurs de test SOFA citées) | `astro-core` `earthRotationAngle` (< 1e-9 rad de SOFA) et `greenwichMeanSiderealTime` (Meeus 12.4, à 0,002″ de `iauGmst06` en 2006, ≤ 0,3″ de 1900 à 2100) ; UT1 pris égal à UTC (< 0,9 s). Le globe et le référentiel « Fixe : Terre » (#139, `sky-renderer/rest-frames.ts`) tournent du GMST, car les axes du monde sont l'équateur et l'équinoxe moyens de la date ; testé : un jour sidéral (86 164,0905 s) ramène le référentiel à 0,01″, et la longitude du Soleil y suit l'équation du temps de Meeus (exemple 28.b, 1992-10-13 : +13 min 42,6 s) à 0,03° — ✅ |
| Déclinaison magnétique | **World Magnetic Model 2025** (WMM2025, NOAA NCEI / British Geological Survey ; Chulliat et al. 2025, rapport technique, §1.2), valide 2025,0–2030,0 ; coefficients de Gauss au degré 12 (fichier `WMM.COF`, repris du paquet npm `geomagnetism` 0.2.0 `data/wmm-2025.json`, Apache-2.0, qui transcrit le fichier NOAA) ; référence de test : les 100 **valeurs de test officielles WMM2025** (même paquet, `test/values.csv`) | NOAA / BGS | Domaine public (œuvre du gouvernement des États-Unis) | `astro-core` `magneticDeclination` : les 100 valeurs à 0,006° (arrondi au centième) ; Cayenne ≈ −18,6°, Paris ≈ +2,1° fin 2026. Corrige le cap magnétique du téléphone vers le nord géographique pour la boussole et la visée (#144) — ✅ |
| Titan (satellite de Saturne) | **Meeus**, *Astronomical Algorithms* (2e éd., 1998), chap. 46 (théorie de Dourneau 1987) ; demi-grand axe 1 221 870 km (NASA, fiche Titan) pour passer des rayons de Saturne aux km ; référence de test : **exemple 46.a** du livre (JDE 2451439,50074 : X = +14,568, Y = +4,738, Z = −12,755 rayons de Saturne), valeurs reprises du test de `astronomia` (MIT) | Meeus / NASA | Libre (publication, citation) | `astro-core` `titanPosition` : exemple 46.a à 0,01 rayon (≈ 0,03″) ; Saturne par astronomy-engine, passage de l'écliptique B1950 au J2000 par ses rotations (#148) — ✅ |
| Positions héliocentriques de la Terre et des planètes | lib `astronomy-engine` `HelioVector` (MIT) ; validation **JPL Horizons DE441** : états héliocentriques géométriques (centre Soleil @10, ICRF, au), tables `generate/heliostate/<Corps>.txt` du dépôt astronomy-engine (github.com/cosinekitty/astronomy, commit `865d3da7d811`, requêtes Horizons du 2021-11-14), Horizons n'étant pas joignable depuis l'environnement de build | NASA JPL | Libre | Points de vue « Les saisons » et « Le système solaire » de la vue Terre (#128, #124) : `astro-core` `heliocentricPosition`, testé à **1′** (direction vue du Soleil) et 1e-4 (distance) sur 3 dates (2001, 2026, 2039) pour les 8 corps — écart maximal mesuré 15″ (Neptune) — ✅ |
| Rayon du Soleil ; paramètres gravitationnels des orbites | **IAU 2015 Resolution B3** (rayon solaire nominal 695 700 km) ; constante de Gauss k = 0,01720209895 (IAU 1976) ; rapports de masse Soleil/planète et GM⊕, Terre/Lune du **système de constantes IAU 2009** (Luzum et al. 2011, *Celest. Mech. Dyn. Astr.* 110:293) | IAU | Libre (publication scientifique, citation) | Système solaire à l'échelle réelle (#131) : globe du Soleil, orbites osculatrices (`orbits.ts`), testées à < 0,5 % du trajet d'astronomy-engine un quart de période plus loin — ✅ |
| Équinoxes et solstices | lib `astronomy-engine` `Seasons` (MIT) ; validation **USNO**, Astronomical Applications Department, « Earth's Seasons » (api.usno.navy.mil/seasons, heures TU à la minute), tableau `generate/seasons/seasons.txt` du dépôt astronomy-engine (commit `865d3da7d811`), l'USNO et l'IMCCE n'étant pas joignables depuis l'environnement de build | U.S. Naval Observatory | Domaine public (œuvre du gouvernement des États-Unis) | Marques de « Les saisons » (#128) : `astro-core` `seasons`, testé à **10 min** pour 2000, 2024, 2025, 2026, 2027 et 2100 — écart maximal mesuré 1,9 min (2100) ; contrôle croisé : déclinaison apparente du Soleil = ± obliquité moyenne IAU 2006 aux solstices (0,005°) — ✅ |
| Périodes orbitales sidérales | **JPL Horizons**, données physiques des mêmes tables (« Sidereal orb. per. » : Mercure 87,969 j … Neptune 60 189 j, Terre 365,25636 j) | NASA JPL | Libre | Échantillonnage des orbites dessinées par « Le système solaire » (un tour) ; les positions viennent de `heliocentricPosition` |
| Satellites / ISS | **CelesTrak** (TLE) | — | Libre | Passages |
| Exoplanètes | **NASA Exoplanet Archive** | NASA / IPAC | Libre | Étoiles hôtes |
| Objets (expert) | **SIMBAD** (API TAP) | CDS Strasbourg | Libre, citation | Liens et données croisées |
| Figures illustrées des constellations (jeu 1, #95) | **Stellarium**, culture du ciel « western » : dépôt `Stellarium/stellarium-skycultures`, dossier `western/`, **commit épinglé `014fbb5e59233d133c22f9811af96b67d05a95c9`** (2026-05-26) ; 85 illustrations WebP de **Johan Meuris** (`western/illustrations/`), chacune ancrée sur 3 étoiles HIP (`index.json`, `constellations[].image.anchors`) | Stellarium | Illustrations : **Licence Art Libre (Free Art License)** — `description.md` ne précise pas la version ; nous appliquons la **1.3** (version en vigueur, https://artlibre.org/licence/lal/) ; texte et données (ancrages) : **CC BY-SA** (version non précisée → CC BY-SA 4.0, comme les lignes). Le fichier `LICENSE-AGPL-3.0.txt` à la racine du dépôt couvre ses scripts Python, pas les cultures. Copyleft : l'atlas dérivé est diffusé sous LAL 1.3 avec attribution (« Illustrations: Johan Meuris »), mention des modifications et lien vers les originaux au commit épinglé (page Crédits, manifeste) ; l'application n'est pas une œuvre dérivée (simple affichage, comme dans Stellarium) | ✅ intégré (#95, #96) : `build_figures.py` vérifie que la mention de licence de `description.md` n'a pas changé, convertit en niveaux de gris (luminance = encre), réduit à 240 px, normalise (99e centile = encre pleine), assemble un atlas 2048×2816 WebP q80 (≈ 361 Ko) + manifeste `asteria-figure-set` v1 (≈ 21 Ko, 5 Ko gzip) ; 84 figures affichées, Télescope (Tel) non affichée : son ancre HIP 91589 a V = 6,8 > 6,5 (hors catalogue). Pas d'image pour Pup, Vel (Argo Navis rattaché à Car) ni Ser |
| Cultures du ciel (figures, lignes) | Stellarium *skycultures* (licences par culture : CC BY-SA / GPL…) + publications ethnoastronomiques | Divers | Vérifier culture par culture | Cultures non occidentales |
| Histoires, mythes, anecdotes | **Wikipédia FR/EN** (point de départ, #10) ; depuis #172 : **textes antiques** des dépôts Perseus Digital Library (`PerseusDL/canonical-greekLit`, commit `0189b9c8d8d1f148133f2f0af309b4ee90ea4332` ; `PerseusDL/canonical-latinLit`, commit `128a05afa9cc7179ab18f8d05f78a9f1dd50e415`) et Open Greek and Latin (`OpenGreekAndLatin/First1KGreek`, commit `03776b39f4047c5cff06f5296fae4b2bae4b08fb`) : Aratos (*Phénomènes*, grec, éd. Mair 1921), Hésiode (*Travaux*, trad. Evelyn-White 1914), Homère (*Odyssée*, grec), Apollodore (*Bibliothèque*, trad. Frazer 1921), Ovide (*Fastes*, latin ; *Métamorphoses*, trad. More 1922), Hipparque (*Commentaire sur Aratos*, éd. Manitius 1894), Ptolémée (*Almageste*, éd. Heiberg 1898-1903 : décompte des étoiles et noms) ; **Stellarium** cultures `western` et `ruelle` (commit `014fbb5e5923`, `description.md`, `index.json` : 88 constellations de 1922, frontières de 1928, astérismes) | Wikimedia ; Perseus (Tufts University) ; Open Greek and Latin ; Stellarium | **CC BY-SA 4.0** (Wikipédia ; Perseus et First1KGreek : mention `<licence>` des fichiers TEI et README des dépôts, textes antiques eux-mêmes du domaine public ; Stellarium « CC BY-SA », version non précisée → 4.0) → reformuler, attribuer, contenu dérivé sous CC BY-SA | Guide, fiches, jeux — ✅ intégré (#10) : histoires + 3 anecdotes pour les 12 constellations zodiacales, Orion, Grande Ourse et Cassiopée (`packages/content/fr/constellations/`, sources par fichier ; faits vérifiés aussi via Ian Ridpath *Star Tales*, ESO ; relecture #67 : position de Neptune en 1846 vérifiée avec JPL Horizons). #172 (Wikipédia et ianridpath.com injoignables depuis l'environnement) : liste Découverte des jeux puis constellations de Ptolémée, à partir des seuls textes antiques lus et des données du catalogue (Hipparcos, IAU WGSN, OpenNGC, Schiller & Przybilla 2008) ; rangs d'éclat, séparations et hauteurs calculés depuis le catalogue, passage du Soleil dans Ophiuchus et constellations voisines calculés avec `Astronomy.Constellation` (astronomy-engine 2.1.19, Roman 1987) ; aucune légende inventée pour les constellations sans mythe dans ces sources |
| Gravures anciennes (base des figures) | *Uranometria* (Bayer 1603), Hevelius 1690, *Urania's Mirror* 1824 (numérisations Library of Congress, USNO, Linda Hall Library) | — | Domaine public (vérifier la numérisation) | Base des figures artiste + IA |
| Météo / nuages | Open-Meteo (API libre) ou Météo-France (données publiques) | — | Libre, citation | « Ce soir » |
| Pollution lumineuse | World Atlas of Artificial Night Sky Brightness (Falchi 2016) / VIIRS (NASA/NOAA) | — | Vérifier | Indice Bortle |

## Distance de référence d'une étoile (#75)

Règle appliquée par `build_stars.py` (champs `dist`, `eDist` en années-lumière, `distSrc`) :
1. étoile listée dans `LITERATURE_DISTANCES` → distance publiée (Deneb, Bételgeuse), incertitude = moyenne des barres d'erreur ;
2. sinon, inverse de la parallaxe la plus précise (σϖ/ϖ minimal) entre Hipparcos 2007 et Gaia DR3 (si fiable, voir ci-dessus), incertitude d = d·σϖ/ϖ ;
3. pas de distance si σϖ > ϖ (67 étoiles).

Arrondis : 3 chiffres significatifs pour la distance (≤ 0,5 %, sous les erreurs de parallaxe), 2 pour l'incertitude. L'app affiche « ≈ » (2 chiffres) au-delà de 5 % d'incertitude et rien au-delà de 50 %. Contrôles automatiques : Sirius 8,60 al (± 0,5 %), Rigel 860 al (± 10 %, Hipparcos), Bételgeuse 548 al (± 5 %, Joyce 2020), Deneb 2 600 al (± 10 %, Schiller & Przybilla 2008). Étoiles V ≤ 2 restant à plus de 10 % d'incertitude (affichées « ≈ ») : Bételgeuse, Antarès, Shaula, Alnilam, Alnitak, Wezen, Sargas — candidates à une distance publiée.

## Échelles des points de vue de la vue Terre (#128, #131)

Depuis #139, « La Terre tourne » n'existe plus (un réglage `stars` retombe sur « Le système
solaire ») : la rotation de la Terre se voit dans la scène à l'échelle réelle, en choisissant ce
qui reste fixe (Étoiles, Soleil, Terre ou planète, `rest-frames.ts`).

Depuis #131, **tout est à l'échelle réelle** : le schéma compressé du système solaire
(distances en 6,1 · ln(1 + r / 0,15 au), tailles en (R / R⊕)^¼) et la Terre agrandie ≈ 3 900 fois
des saisons ont été retirés, ainsi que le point de vue « Vu du sol » (#131 : un réglage
enregistré `earth` retombe sur le point de vue par défaut). Règles appliquées par
`packages/sky-renderer/src/points-of-view.ts`, `orbits.ts` et `pov-scene.ts` (constantes testées
dans `points-of-view.test.ts`, `orbits.test.ts`, `pov-scene.test.ts`).

- **Unité et repère** : le rayon équatorial terrestre (6 378,137 km, IAU 2015 / WGS 84) ;
  l'origine au centre de la Terre, axes de l'équateur et de l'équinoxe moyens de la date. 1 au
  (149 597 870,7 km, IAU 2012 B2) = 23 454,8 rayons terrestres.
- **Positions** : héliocentriques géométriques d'astronomy-engine (`heliocentricPosition`, testées
  contre JPL Horizons à 15″), moins celle de la Terre, précessées vers la date. La Lune : position
  géocentrique astrométrique (`geocentricPosition`, la même que la visite d'un astre).
- **Rayons** : Soleil, rayon nominal 695 700 km (IAU 2015 Resolution B3) ; planètes, rayon
  équatorial, et Lune, rayon moyen (IAU WGCCRE 2015, Archinal et al. 2018) ; sphères (aplatissement
  ignoré).
- **Orbites** : ellipse de Kepler osculatrice à la date affichée, calculée à partir de la position
  et de la vitesse (différence centrée sur ± 0,05 j, ± 600 s pour la Lune) avec GM☉ = k²
  (k = 0,01720209895, IAU 1976) × (1 + m / M☉) (rapports de masse du système IAU 2009, Luzum et
  al. 2011) et, pour la Lune, GM⊕ + GM☾ = 398 600,4418 × (1 + 1 / 81,300569) km³/s². Elle passe
  exactement par l'astre ; à un quart de période elle s'écarte du trajet réel de moins de 0,5 % de
  la distance (perturbations, testé pour les huit planètes).
- **Repères** : chaque astre a un repère gravé de taille fixe (rayon 4,5 px, sa phase vue de la
  caméra) qui s'efface quand le globe vrai atteint un rayon apparent de 3 à 6 px (`markerOpacity`,
  même seuil de 6 px que la visite : `GLOBE_MIN_PX`) ; le Soleil garde un halo gravé de rayons. Les
  repères à moins de 9 px l'un de l'autre fusionnent (le premier de `SCENE_BODIES` reste) : vue de
  Neptune, les planètes internes sont dans le halo du Soleil.
- **Les saisons** : la même scène cadrée sur l'orbite de la Terre ; marques des équinoxes et
  solstices (instants d'astronomy-engine `Seasons`) aux positions vraies ; la direction de l'axe
  (pôle céleste de la date) est un trait de 13 px sur les repères de la Terre, symbolique en
  longueur, exacte en direction. Toucher la Terre amène la caméra à quelques rayons d'elle (vrai
  axe, vrai terminateur) et la suit quand la date avance.
- **Échelle affichée** : barre de longueur ronde (1, 2, 5 × 10ⁿ km, ou en ua à partir de 0,1 au)
  à la profondeur du point regardé (`scaleBar`).
- **Précision** : aucun sommet loin de l'origine de son objet (globes = sphères unité mises à
  l'échelle et déplacées ; chaque orbite écrite par rapport à son astre et posée sur lui) ; three.js
  compose la matrice modèle-vue en double précision côté CPU (positions relatives à l'œil).
  Plans de découpe adaptés au zoom (proche à mi-chemin de la surface la plus proche, ≤ 2 % de la
  distance regardée ; lointain 45 au au-delà du Soleil).

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

## Voie lactée (#162)

`packages/sky-data/build_milkyway.py` (numpy + Pillow, lancé avec `python -I` : le catalogue
téléchargé est une donnée non fiable) télécharge le sous-ensemble AT-HYG au commit épinglé dans
`raw/athyg-<commit>/`, vérifie sa taille et son SHA-256, et écrit `out/milkyway.webp`.

**Traitement** (détaillé dans la docstring du script) :
1. étoiles de magnitude **9 ≤ V/VT < 11** (745 563) : la lumière diffuse de la Voie lactée vient
   des étoiles faibles et lointaines ; les plus brillantes, proches, couvrent tout le ciel ;
2. comptage sur une grille équirectangulaire **équatoriale J2000** de 1024 × 512 (x : AD 0 → 360°,
   y : Déc +90° → −90°) ;
3. lissage gaussien **sur la sphère** (σ = 1,5° depuis #168, 1° avant ; distance angulaire vraie) : pour deux lignes de la
   grille, la distance ne dépend que de l'écart en AD, d'où une convolution circulaire exacte par
   FFT (pas de couture à 0 h, pas de déformation aux pôles) ; le même lissage des angles solides
   des cellules normalise en étoiles par stéradian ;
4. log10 de la densité, moins un « plancher » (90e centile pour |b| > 60°) ; division par le
   99,7e centile ; bornée à [0, 1] : le ciel loin de la bande vaut 0 ;
5. WebP en niveaux de gris, qualité 82 : **12 674 octets** (2026-10-19, #168).

**Contrôles automatiques** (le script échoue sinon) : 500 000 à 800 000 étoiles retenues ;
densité moyenne à |b| < 5° ≥ 3 fois celle à |b| > 60° (mesuré : 39,0 contre 7,5 étoiles/deg²) ;
disque de 15° autour du centre galactique dans le quart le plus dense du ciel (87e centile) ;
pôles galactiques nord et sud à 0 ; Grand Rift (l = 35–45°, b = 0°) plus sombre que la bande à
b = −6° (0,40 contre 0,54) ; fichier < 100 000 octets. Repère galactique : matrice ICRS →
galactique d'ESA 1997 (*The Hipparcos and Tycho Catalogues*, vol. 1, §1.5.3).

**Affichage** (`sky-renderer/src/milky-way.ts`, revu en #168 à la demande du porteur : le grain
de points de #162 restait fixe à l'écran et masquait des étoiles). La densité est lue par pixel
depuis la direction J2000, filtrage bilinéaire lissé (smoothstep sur la fraction du texel) :
- **carte** : passe plein écran sous tout le reste ; chaque pixel est ramené par la projection
  inverse de la carte puis la transposée de la matrice qui place les étoiles (J2000 → horizontal)
  aux coordonnées de la texture (testé : centre et pôle galactiques, raccord à 0 h, aller-retour
  par la projection). Lueur diffuse **ajoutée** au ciel (jamais par-dessus une étoile ou une
  ligne) : indigo profond aux bords, violet-bleu, lavande pâle dans les nuages les plus denses ;
  lueur rouge sombre de l'encre en vision nocturne. Éteinte par le jour (facteur (1 − jour)²),
  atténuée sous l'horizon avec « Voir à travers la Terre », réduite à 20 % aux champs étroits
  (< 8°, de 8 à 40°) où la texture n'a plus de détail ;
- **vue Terre / système solaire** : sphère à l'infini dont les sommets sont des directions J2000
  placées par la même précession que les étoiles (testé : centre galactique dans le Sagittaire,
  lu au bon texel en 2026), dessinée avant les étoiles et ajoutée au fond. Gravure : la même
  lueur violette que la carte (même dégradé, un peu moins intense : le champ de 40° de cette vue
  est souvent tout entier dans la bande). Réaliste, façon photo à longue pose : ciel noir hors de
  la bande (seuil haut), courbe de tons raide qui garde nuages brillants et bandes sombres, cœur
  crème, bords faibles plus froids ; nuit rouge : la même courbe dans l'encre.

Texture chargée à la demande dans chaque vue ; sans le fichier, le calque ne dessine rien.

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
