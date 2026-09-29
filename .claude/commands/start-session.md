---
description: Démarrer une session de travail sur un ticket (contexte, branche, PROGRESS.md)
argument-hint: <numero-ticket>
---

Démarre le travail sur le ticket #$ARGUMENTS :

1. Lis `CLAUDE.md`, puis `PROGRESS.md` (En cours, Blocages, Notes de passation).
2. `gh issue view $ARGUMENTS` — vérifie que les critères d'acceptation sont clairs ; sinon, commente le ticket et arrête-toi.
3. Lis les ADR et docs liés à la zone (`area:*`) du ticket.
4. `git checkout main && git pull`, puis crée la branche `<type>/$ARGUMENTS-<slug>` (cf. `docs/WORKFLOW.md`).
5. Ajoute une ligne dans `PROGRESS.md` > En cours (ticket, titre, agent, branche, date du jour).
6. Résume en 5 lignes max ce que tu vas faire avant de commencer.
