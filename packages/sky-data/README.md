# sky-data — pipeline de données

Scripts Python reproductibles : source officielle → nettoyage → croisement → fichiers compacts pour l'app.

```bash
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -r requirements.txt
python build_stars.py          # → out/ (+ raw/ en cache)
python build_star_names_fr.py  # → ../content/fr/star-names.json (versionné ; IAU + Wikidata)
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
| `stars.bin`                | catalogue d'étoiles V ≤ 6.5, format binaire `ASTS` v1       | ✅       |
| `star-strings.json`        | table de chaînes de `stars.bin` (noms IAU, Bayer) par HIP   | ✅       |
| `constellation-lines.json` | `{ "Ori": [[hip, hip, …], …], … }`                          | ✅       |
| `stars.json`               | même catalogue en JSON (transitoire, sera retiré)           | —        |

Le pipeline échoue (code 1) si l'aller-retour binaire → enregistrements diffère du JSON, ou si les
fichiers du niveau 1 dépassent 1 000 000 octets. Tailles au 2026-10-01 (8 870 étoiles) :

| Fichier                    |          Brut |        gzip -9 |
| -------------------------- | ------------: | -------------: |
| `stars.json` (avant)       |   1 391 429 o |      384 532 o |
| `stars.bin`                |     355 080 o |      246 111 o |
| `star-strings.json`        |      31 060 o |       12 552 o |
| `constellation-lines.json` |       6 379 o |        3 089 o |
| **Niveau 1 (3 fichiers)**  | **392 519 o** |  **261 752 o** |

Décodeur TypeScript : `@asteria/catalog` (`decodeStarCatalog(buffer, strings)`). Écriture :
`star_binary.py`, dont `decode_stars` sert de décodeur de référence au contrôle du pipeline.

## Format `stars.bin` (ASTS v1)

Tous les entiers sont **little-endian**. Les étoiles sont dans l'ordre de `stars.json` (V croissant).

**En-tête** (16 octets) :

| Offset | Type   | Champ         | Valeur                                                    |
| -----: | ------ | ------------- | --------------------------------------------------------- |
|      0 | 4 × u8 | `magic`       | `ASTS` (ASCII)                                            |
|      4 | u16    | `version`     | `1` — toute évolution incompatible incrémente la version  |
|      6 | u16    | `header_size` | offset du premier tableau (en-tête + table, aligné sur 4) |
|      8 | u32    | `count`       | nombre d'étoiles N                                        |
|     12 | u16    | `con_count`   | nombre de constellations C (88)                           |
|     14 | u16    | `flags`       | réservé, `0`                                              |

**Table des constellations** (offset 16) : C × 3 octets ASCII, abréviations IAU en ordre ASCII
(`And`, `Ant`, … `CMa`, … `Vul`), puis bourrage à zéro jusqu'à `header_size` (280 pour C = 88).

**Colonnes** (_structure of arrays_) : à partir de `header_size`, un tableau de N valeurs par champ,
dans cet ordre, sans bourrage. Taille totale attendue : `header_size + 40 × N` octets (vérifiée
exactement par le décodeur).

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
{"format":"asteria-star-strings","version":1,"name":{"32349":"Sirius",…},"bayer":{"32349":"α CMa",…}}
```

Les chaînes sont indexées par numéro HIP et non stockées dans le binaire : une traduction ou une
translittération des noms (ADR-0002) remplace ce fichier sans régénérer `stars.bin`. Les noms sont
les noms officiels IAU (WGSN) ; les désignations Bayer utilisent les lettres grecques Unicode.
