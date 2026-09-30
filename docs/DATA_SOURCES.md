# Sources de données

⚠️ Chaque jeu de données intégré doit avoir : source, version, licence, citation requise, script de récupération reproductible (`packages/sky-data`). **Aucune donnée copiée à la main.**

| Domaine | Source | Institution | Licence / usage | Usage prévu |
|---|---|---|---|---|
| Étoiles (brillantes) | **Hipparcos** (ESA 1997, nouvelle réduction van Leeuwen 2007) | ESA / CDS VizieR `I/311` | Libre usage scientifique, citation | Astrométrie `I/311` + V, B-V, HD depuis `I/239` — ✅ intégré (#3), 8 870 étoiles V ≤ 6.5 |
| Étoiles (précision) | **Gaia DR3** | ESA | Libre, citation obligatoire | Astrométrie niveau expert, distances, mouvement propre |
| Étoiles (noms, photométrie) | **Yale Bright Star Catalogue 5** | NASA HEASARC / CDS `V/50` | Domaine public | Désignations Bayer/Flamsteed, HR |
| Noms d'étoiles officiels | **IAU WGSN** — fichier `IAU-CSN.txt` (version 2022-04-04, E. Mamajek) | IAU | **CC BY** (citer l'IAU) | 333 noms pour V ≤ 6.5 — ✅ intégré (#3) |
| Constellations : frontières | **Delporte 1930 / IAU** | IAU / CDS `VI/49` | Libre | 88 frontières officielles |
| Constellations : noms, abréviations | IAU | IAU | Libre | Latin, génitif, abréviation 3 lettres |
| Lignes de constellations | **d3-celestial** `constellations.lines.json` (O. Frohn), sommets rattachés aux étoiles HIP à ≤ 0.2° | — | **BSD-3-Clause** (attribution) | 88 figures modernes — ✅ intégré (#3) |
| Appartenance aux constellations | astropy `get_constellation` (Roman 1987, CDS `VI/42`) | — | Libre | Champ `con` — ✅ intégré (#3) |
| Planètes, Lune, Soleil | **JPL Horizons / DE440** (validation) + lib `astronomy-engine` (MIT) | NASA JPL | Libre | Positions temps réel |
| Ciel profond | **OpenNGC** (CC BY-SA 4.0) + Messier | — | CC BY-SA | NGC/IC/Messier |
| Voie lactée | **Gaia DR3 sky map** / NASA SVS | ESA / NASA | Citation | Texture de fond |
| Satellites / ISS | **CelesTrak** (TLE) | — | Libre | Passages |
| Exoplanètes | **NASA Exoplanet Archive** | NASA / IPAC | Libre | Étoiles hôtes |
| Objets (expert) | **SIMBAD** (API TAP) | CDS Strasbourg | Libre, citation | Liens et données croisées |
| Cultures du ciel (figures, lignes) | Stellarium *skycultures* (licences par culture : CC BY-SA / GPL…) + publications ethnoastronomiques | Divers | Vérifier culture par culture | Cultures non occidentales |
| Histoires, mythes, anecdotes | **Wikipédia FR/EN** (point de départ) + sources antiques (Ératosthène, Hygin, Aratos) | Wikimedia | **CC BY-SA 4.0** → reformuler, attribuer, contenu dérivé sous CC BY-SA | Guide, fiches, jeux — ✅ intégré (#10) : histoires + 3 anecdotes pour les 12 constellations zodiacales, Orion, Grande Ourse et Cassiopée (`packages/content/fr/constellations/`, sources par fichier ; faits vérifiés aussi via Ian Ridpath *Star Tales*, ESO) |
| Gravures anciennes (base des figures) | *Uranometria* (Bayer 1603), Hevelius 1690, *Urania's Mirror* 1824 (numérisations Library of Congress, USNO, Linda Hall Library) | — | Domaine public (vérifier la numérisation) | Base des figures artiste + IA |
| Météo / nuages | Open-Meteo (API libre) ou Météo-France (données publiques) | — | Libre, citation | « Ce soir » |
| Pollution lumineuse | World Atlas of Artificial Night Sky Brightness (Falchi 2016) / VIIRS (NASA/NOAA) | — | Vérifier | Indice Bortle |

## Stratégie
- Données **pré-compilées** au build en tuiles binaires compactes (HEALPix ou découpage par magnitude) → offline, rapide sur mobile.
- Niveau 1 embarqué (~mag 6.5, < 1 Mo) ; niveaux 2-3 téléchargeables (mag 9-10, puis Gaia partiel).
- Requêtes live (SIMBAD, Horizons) uniquement en mode Expert et en ligne.
- Page « Crédits & sources » dans l'app, générée depuis ce fichier.
