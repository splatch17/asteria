---
description: Terminer un ticket (vérifs, PR, PROGRESS.md, tickets de suivi)
---

Termine le ticket en cours sur la branche actuelle :

1. Lance lint, typecheck et tests (`pnpm lint && pnpm typecheck && pnpm test` une fois le monorepo en place). Corrige tout échec.
2. Vérifie la Définition de Fait (`docs/WORKFLOW.md`) point par point.
3. Si UI/rendu : produis des captures (mobile + desktop) ; si rendu : relève les ms/frame.
4. Pousse la branche et ouvre la PR avec `gh pr create` en remplissant `.github/PULL_REQUEST_TEMPLATE.md` (`Closes #N`).
5. Mets à jour `PROGRESS.md` : retire la ligne de « En cours », ajoute une ligne datée dans « Fait récemment » (avec lien PR), complète « Prochaines étapes ».
6. Crée les tickets de suivi découverts (`gh issue create` avec les bons labels) et référence-les dans la PR.
