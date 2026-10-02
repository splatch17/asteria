# @asteria/content

Contenu éditorial (guide, histoires, anecdotes, fiches), **un dossier par langue** (`fr/`, plus tard `en/`…), mêmes identifiants d'objet dans chaque langue (ADR-0002).

Règles : chaque fait chiffré est sourcé ; tout contenu dérivé de Wikipédia est reformulé et attribué (CC BY-SA 4.0), voir `docs/DATA_SOURCES.md`.

## Noms d'étoiles (`fr/star-names.json`)

Noms usuels français des étoiles nommées par l'IAU, par numéro Hipparcos (`{ "names": { "27989": "Bételgeuse", … } }`) : toutes les étoiles nommées V ≤ 3 et toutes celles dont le nom français diffère du nom IAU. Fichier **généré** par `packages/sky-data/build_star_names_fr.py` (IAU WGSN, CC BY + Wikidata, CC0), à ne pas éditer à la main ; un nom d'usage réellement différent se déclare dans `FRENCH_USAGE` du script, avec sa référence.

API : `starNameFr(hip, iauName)`, `starName(locale, hip, iauName)` et `localizeStarStrings(locale, strings)`. Cette dernière est appliquée une seule fois, au décodage du catalogue (`apps/web`) : carte et fiches affichent ainsi le nom français.
