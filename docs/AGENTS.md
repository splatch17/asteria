# Agents de développement

Les agents sont des sous-agents Claude Code définis dans `.claude/agents/`. Chacun a un périmètre (`area:*`), des fichiers dont il est responsable et des procédures à suivre. Ils travaillent **toujours via tickets et PR** comme un développeur humain.

| Agent | Rôle | Périmètre (`area:`) |
|---|---|---|
| `orchestrator` | Chef de projet technique : découpe les phases en tickets, priorise, assigne, tient `PROGRESS.md` et le board | tous |
| `architect` | Architecture, ADR, structure du monorepo, interfaces entre packages, perfs | infra, transverse |
| `astro-data` | Pipeline de données (catalogues, noms, frontières), licences, formats binaires | data |
| `astro-core` | Calculs astronomiques (temps, coordonnées, éphémérides), tests de précision | astro-core |
| `sky-renderer` | Rendu WebGL du ciel, shaders, figures tramées, animations, perfs GPU | renderer |
| `ui-designer` | Design system, écrans, DA, accessibilité, mode nuit, i18n | ui |
| `mobile-live` | Capacitor/Android, capteurs, fusion d'orientation, AR caméra, offline, builds | mobile, live |
| `games-learning` | Mini-jeux, moteur de progression, répétition espacée | games |
| `astro-content` | Rédaction et **vérification scientifique** du guide (3 niveaux), mythologie, sources | content |
| `qa-reviewer` | Revue de PR, tests, vérification DoD, régressions visuelles | tous |

## Procédures communes (tous les agents)

### Au démarrage d'une session — `/start-session`
1. Lire `CLAUDE.md`, `PROGRESS.md` (section « En cours » et « Prochaines étapes »).
2. Lire le ticket ciblé (`gh issue view N`) et les ADR liés.
3. `git pull`, créer la branche `<type>/<N>-<slug>`.
4. Ajouter une ligne dans `PROGRESS.md` > En cours.

### Pendant
- Commits atomiques Conventional Commits.
- Si une décision structurante est prise → proposer un ADR (`docs/adr/NNNN-titre.md`).
- Si bloqué > 1 tentative raisonnable → noter le blocage dans `PROGRESS.md` > Blocages et commenter le ticket.

### À la fin — `/finish-ticket`
1. Lint + typecheck + tests locaux.
2. Ouvrir la PR avec le template, `Closes #N`, captures si UI.
3. Mettre à jour `PROGRESS.md` (déplacer vers « Fait récemment », ajouter les prochaines étapes découvertes).
4. Créer les tickets de suivi découverts (jamais de TODO orphelin dans le code sans ticket : `// TODO(#N)`).

### Passage de relais — `/handoff`
Écrire dans `PROGRESS.md` > Notes de passation : état exact, ce qui reste, pièges rencontrés, commande pour reprendre.

## Qui relit quoi
| Changement | Relecteurs |
|---|---|
| Calcul astro | `qa-reviewer` + `astro-core` |
| Données | `qa-reviewer` + `astro-data` (licence !) |
| Visuel / UX | `qa-reviewer` + `ui-designer` + **porteur du projet** |
| Contenu scientifique | `astro-content` (sources vérifiées) + porteur |
| Archi / ADR | `architect` + porteur |
