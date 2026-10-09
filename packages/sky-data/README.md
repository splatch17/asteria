# sky-data — pipeline de données

Scripts Python reproductibles : source officielle → nettoyage → croisement → fichiers compacts pour l'app.

```bash
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -r requirements.txt
python build_stars.py          # → out/ (+ raw/ en cache)
python build_star_names_fr.py  # → ../content/fr/star-names.json (versionné ; IAU + Wikidata)
python -I build_deepsky.py     # → out/deepsky.json (ciel profond, OpenNGC v20260501, #100)
```

Vue Terre : `python build_earth.py` (côtes, relief, lumières → `out/earth/`) et
`python build_space.py` (textures du style réaliste, #55 → `out/space/` : Terre couleur, Lune,
atlas des planètes ; < 1,5 Mo au total, contrôlé par le script). `pnpm data:sync` copie le tout
dans `apps/web/public/data/`. Sans `out/space/`, le style réaliste utilise des couleurs
procédurales.

`raw/` (téléchargements) et `out/` (générés) ne sont pas versionnés. Sources et licences : `docs/DATA_SOURCES.md`.

## Fichiers produits (`out/`)

| Fichier                    | Contenu                                                     | Niveau 1 |
| -------------------------- | ----------------------------------------------------------- | -------- |
| `stars.bin`                | catalogue d'étoiles V ≤ 6.5, format binaire `ASTS` v2       | ✅       |
| `star-strings.json`        | chaînes de `stars.bin` par HIP (noms IAU, Bayer, réf. dist.) | ✅       |
| `constellation-lines.json` | `{ "Ori": [[hip, hip, …], …], … }`                          | ✅       |
| `stars.json`               | même catalogue en JSON (transitoire, sera retiré)           | —        |
| `deepsky.json`             | ciel profond : Messier + NGC/IC brillants (chargé à la demande) | —    |

Le pipeline échoue (code 1) si l'aller-retour binaire → enregistrements diffère du JSON, si les
fichiers du niveau 1 dépassent 1 000 000 octets ou si un contrôle échoue : étoiles témoins (nom,
V, constellation), noms IAU lus en UTF-8 (Citalá, Lesath…), distances de référence (Sirius,
Rigel, Bételgeuse, Deneb, tolérances dans `CONTROL_DISTANCES`), vitesses radiales (α Cen A,
Sirius, Arcturus, 61 Cyg A) et borne du terme radial |ζ|·15 000 ans < 0,5. Tailles au 2026-10-02
(8 872 étoiles) :

| Fichier                    |   v1 (#16) brut |   v1 gzip -9 |   v2 (#75, #79) brut |   v2 gzip -9 |
| -------------------------- | --------------: | -----------: | -------------------: | -----------: |
| `stars.bin`                |       355 160 o |    246 156 o |            452 752 o |    296 844 o |
| `star-strings.json`        |        31 060 o |     12 552 o |             31 241 o |     12 666 o |
| `constellation-lines.json` |         6 690 o |      3 115 o |              6 690 o |      3 115 o |
| **Niveau 1 (3 fichiers)**  |   **392 910 o** | **261 823 o** |        **490 683 o** | **312 625 o** |

Le passage en v2 ajoute 11 octets par étoile (+98 Ko brut, +51 Ko gzip). Les distances sont
arrondies à 3 chiffres significatifs (≤ 0,5 %, sous les erreurs de parallaxe) : 3 Ko gzip de moins
qu'avec 4 chiffres. La parallaxe Gaia demande le paquet `gaiadr3-zeropoint` (requirements.txt).

Décodeur TypeScript : `@asteria/catalog` (`decodeStarCatalog(buffer, strings)`). Écriture :
`star_binary.py`, dont `decode_stars` sert de décodeur de référence au contrôle du pipeline.

## Format `stars.bin` (ASTS v2)

Tous les entiers sont **little-endian**. Les étoiles sont dans l'ordre de `stars.json` (V croissant).

**En-tête** (16 octets) :

| Offset | Type   | Champ         | Valeur                                                    |
| -----: | ------ | ------------- | --------------------------------------------------------- |
|      0 | 4 × u8 | `magic`       | `ASTS` (ASCII)                                            |
|      4 | u16    | `version`     | `2` (v1 : sans les 4 dernières colonnes, encore décodé)   |
|      6 | u16    | `header_size` | offset du premier tableau (en-tête + table, aligné sur 4) |
|      8 | u32    | `count`       | nombre d'étoiles N                                        |
|     12 | u16    | `con_count`   | nombre de constellations C (88)                           |
|     14 | u16    | `flags`       | réservé, `0`                                              |

**Table des constellations** (offset 16) : C × 3 octets ASCII, abréviations IAU en ordre ASCII
(`And`, `Ant`, … `CMa`, … `Vul`), puis bourrage à zéro jusqu'à `header_size` (280 pour C = 88).

**Colonnes** (_structure of arrays_) : à partir de `header_size`, un tableau de N valeurs par champ,
dans cet ordre, sans bourrage. Taille totale attendue : `header_size + 51 × N` octets en v2,
`header_size + 40 × N` en v1 (vérifiée exactement par le décodeur).

| Champ       | Type | Encodage                               | Absent (sentinelle) |
| ----------- | ---- | -------------------------------------- | ------------------- |
| `hip`       | u32  | numéro Hipparcos                       | — (toujours)        |
| `ra`        | u32  | α (°) × 2³² / 360, modulo 2³²          | — (toujours)        |
| `dec`       | i32  | δ (°) × 2³¹ / 90                       | — (toujours)        |
| `plx`       | i32  | parallaxe (mas) × 1000                 | −2³¹                |
| `ePlx`      | i32  | erreur de parallaxe (mas) × 1000       | −2³¹                |
| `pmRa`      | i32  | μα cos δ (mas/an) × 1000               | −2³¹                |
| `pmDec`     | i32  | μδ (mas/an) × 1000                     | −2³¹                |
| `hd`        | u32  | numéro HD                              | 0                   |
| `v`         | i16  | magnitude V × 1000                     | — (toujours)        |
| `bv`        | i16  | indice B−V × 1000                      | −2¹⁵ (−32768)       |
| `hr`        | u16  | numéro HR (Yale BSC)                   | 0                   |
| `flamsteed` | u8   | numéro Flamsteed                       | 0                   |
| `con`       | u8   | index dans la table des constellations | — (toujours)        |
| `dist`      | u32  | distance de référence (al) × 100 (v2)  | 0                   |
| `eDist`     | u32  | son incertitude 1σ (al) × 100 (v2)     | 0                   |
| `rv`        | i16  | vitesse radiale (km/s) × 10 (v2)       | −2¹⁵ (−32768)       |
| `src`       | u8   | sources (v2) : bits 0-3 distance (1 Hipparcos, 2 Gaia DR3, 3 publication), bits 4-7 vitesse radiale (1 BSC5, 2 Gaia DR3) | 0 |

Toutes les grandeurs autres que α/δ sont **sans perte** par rapport à `stars.json` (qui arrondit
déjà à 0,001). Plages observées : parallaxe −52,82 à 796,92 mas, mouvements propres jusqu'à
5 814 mas/an (d'où i32 et non i16), HD jusqu'à 225 292 (d'où u32).

### Pourquoi des entiers à virgule fixe pour α/δ plutôt que Float32

Même taille (4 octets), mais une résolution uniforme sur tout le ciel : 0,0003″ en α et 0,00015″
en δ. En Float32, l'erreur d'arrondi croît avec la valeur : mesurée sur le catalogue, elle atteint
0,055″ en α près de 360° (0,049″ en radians), soit seulement un facteur 2 sous la tolérance de
0,1″, marge que des calculs ultérieurs (mouvement propre, précession) consommeraient. Erreur
mesurée du format retenu : **0,15 mas** au maximum (dominée par l'arrondi à 10⁻⁶° du JSON).

### Table de chaînes `star-strings.json`

```json
{"format":"asteria-star-strings","version":1,"name":{"32349":"Sirius",…},"bayer":{"32349":"α CMa",…},
 "distRef":{"102098":"Schiller & Przybilla 2008, A&A 479, 849",…}}
```

`distRef` (facultatif, ajouté par #75) cite la publication des distances de source 3. Le
décodeur expose `distanceLy`, `distanceErrorLy`, `distanceSource`, `distanceReference`,
`radialVelocity` et `radialVelocitySource` sur `CatalogStar`. Règle de choix de la distance :
`docs/DATA_SOURCES.md`.

Les chaînes sont indexées par numéro HIP et non stockées dans le binaire : une traduction ou une
translittération des noms (ADR-0002) remplace ce fichier sans régénérer `stars.bin`. Les noms sont
les noms officiels IAU (WGSN) ; les désignations Bayer utilisent les lettres grecques Unicode.

## Format `deepsky.json` (asteria-deepsky v1, #100)

JSON compact (UTF-8), **une ligne de tableau par objet**, colonnes nommées une seule fois dans
`fields`. 600 objets : 58 018 o brut, 18 273 o gzip -9 (budget 50 000 o gzip, contrôlé). Chargé à
la demande (`loadDeepSkyCatalog` de `@asteria/catalog`), pas au démarrage. Sélection, source et
contrôles : `docs/DATA_SOURCES.md`.

```json
{"format":"asteria-deepsky","version":1,"source":"OpenNGC v20260501 (commit 36cb178a0f69), …",
 "selection":"…","fields":["id","type","ra","dec","v","b","maj","min","pa","con","designations","names"],
 "objects":[["M31","galaxy",10.68479,41.26906,3.44,4.29,177.83,69.66,35.0,"And",["M 31","NGC 224"],["Andromeda Galaxy"]],…]}
```

| Champ          | Contenu                                                                        | Absent |
| -------------- | ------------------------------------------------------------------------------ | ------ |
| `id`           | identifiant stable, clé des noms localisés : `M31`, sinon nom OpenNGC sans zéros (`NGC869`, `IC2602`, `C41`, `ESO56-115`) | —      |
| `type`         | `galaxy`, `galaxy-group`, `globular-cluster`, `open-cluster`, `cluster-nebula`, `association`, `planetary-nebula`, `emission-nebula`, `reflection-nebula`, `nebula`, `dark-nebula`, `supernova-remnant`, `double-star` (M40), `asterism` (M73) | — |
| `ra`, `dec`    | α, δ J2000 (ICRS) en degrés, 10⁻⁵°                                             | —      |
| `v`, `b`       | magnitudes totales V et B                                                       | `null` |
| `maj`, `min`   | grand et petit axe (minutes d'arc)                                             | `null` |
| `pa`           | angle de position du grand axe (degrés, du nord vers l'est)                    | `null` |
| `con`          | constellation IAU (Roman 1987)                                                 | —      |
| `designations` | Messier d'abord, puis nom OpenNGC, autres NGC/IC et doublons (`M 102` sur M101) | —      |
| `names`        | noms usuels anglais d'OpenNGC ; les noms français sont dans `packages/content/fr/deepsky-names.json` | `[]` |

Ordre : objets de Messier par numéro, puis par magnitude croissante. Le décodeur valide le format
et expose `DeepSkyObject` (avec `mag` = V, sinon B, et `messier`) ; `deepSkyTarget(o)` donne la
cible `{ kind: "deepsky", id }` à ajouter à `SearchTarget` (`apps/web/src/lib/search.ts`).
