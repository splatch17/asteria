---
description: Créer un ticket GitHub bien formé à partir d'une description libre
argument-hint: <description libre>
---

Crée un ticket GitHub à partir de : $ARGUMENTS

1. Choisis le type (feature / bug / data / design / chore / docs / research) et l'area.
2. Titre : `[area] verbe à l'infinitif + objet`.
3. Corps : contexte, objectif, critères d'acceptation (cases à cocher vérifiables), source des données le cas échéant, niveau utilisateur concerné.
4. Labels `type:*`, `area:*`, `prio:*`, `size:*`, `level:*` (+ `agent-ok` si réalisable en autonomie) et milestone de la phase (`docs/PLAN.md`).
5. Si `size:L` → propose plutôt un découpage en plusieurs tickets.
6. `gh issue create ...` puis affiche le lien.
