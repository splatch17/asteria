# Workflow de développement

## Principe
**Un ticket → une branche → une PR → une revue → un merge.** Rien n'arrive sur `main` sans PR. `main` est toujours déployable.

## Cycle d'un ticket

```
Backlog → Prêt → En cours → En revue → Fait
```

1. **Backlog** : ticket créé avec un template (feature / bug / data / design / tâche).
2. **Prêt** : critères d'acceptation clairs, labels `type:*`, `area:*`, `prio:*` posés, milestone assignée, estimation (`size:S|M|L`). Un ticket `L` doit être découpé.
3. **En cours** : assigné (humain ou agent), branche créée, entrée ajoutée dans `PROGRESS.md`.
4. **En revue** : PR ouverte, CI verte, relue par l'agent `reviewer` + validation du porteur de projet pour tout ce qui touche l'UX/DA.
5. **Fait** : merge en *squash*, ticket fermé automatiquement (`Closes #N`), `PROGRESS.md` mis à jour.

## Règles des tickets
- Titre : `[area] verbe à l'infinitif + objet` — ex. `[renderer] Afficher la couleur des étoiles selon l'indice B-V`
- Un ticket = un résultat vérifiable. Pas de ticket « améliorer X ».
- Critères d'acceptation sous forme de cases à cocher.
- Tout ticket touchant des données cite sa source (cf. `DATA_SOURCES.md`).
- Labels :
  - `type:` feature · bug · data · design · chore · docs · research
  - `area:` astro-core · data · renderer · ui · mobile · live · games · content · infra
  - `prio:` P0 (bloquant) · P1 · P2 · P3
  - `size:` S (< ½ j) · M (≤ 2 j) · L (à découper)
  - `level:` decouverte · amateur · expert (public concerné)
  - `agent-ok` : peut être traité en autonomie par un agent IA

## Branches
`<type>/<numero>-<description-courte>` — ex. `feat/42-bv-star-colors`, `fix/57-compass-drift`, `data/12-iau-star-names`

## Commits — Conventional Commits
`<type>(<scope>): <résumé impératif>` — types : `feat fix data perf refactor test docs chore ci style`
Ex. `feat(renderer): colorer les étoiles selon B-V`

## Règles des PR
- Titre = titre du commit squash (Conventional Commits).
- Template obligatoire (`.github/PULL_REQUEST_TEMPLATE.md`) : lien ticket, quoi/pourquoi, captures (obligatoires pour l'UI), comment tester, checklist.
- **Petites PR** : viser < 400 lignes modifiées hors données générées/lockfiles.
- CI verte obligatoire : lint, typecheck, tests, build.
- Toute modification de calcul astronomique inclut un **test de précision** contre une valeur de référence (JPL Horizons, SIMBAD) avec la tolérance explicite.
- Toute modification visuelle inclut une capture avant/après (mobile + desktop).
- Pas de secret ni de donnée brute volumineuse dans git (données générées → release assets / stockage).

## Définition de « Fait »
- [ ] Critères d'acceptation remplis
- [ ] Tests ajoutés/à jour, CI verte
- [ ] Testé sur mobile (émulateur ou appareil) si UI
- [ ] Docs mises à jour si comportement/archi changé (ADR si décision structurante)
- [ ] `PROGRESS.md` mis à jour

## Releases
- SemVer. `main` → déploiement web preview automatique. Tag `vX.Y.Z` → build Android (AAB) + Tauri + PWA production.
- CHANGELOG généré depuis les commits.
