# Galaxa — règles pour les agents IA

Application d'apprentissage du ciel (constellations, étoiles). Android-first + PWA + desktop (Tauri). Public : des enfants aux doctorants (3 niveaux : Découverte / Amateur / Expert).

## À lire avant toute tâche
1. `PROGRESS.md` — état courant, en cours, blocages
2. `docs/WORKFLOW.md` — branches, commits, PR, Définition de Fait
3. `docs/AGENTS.md` — ton rôle et les procédures
4. Les ADR dans `docs/adr/` liés à ta zone

## Règles non négociables
- Jamais de commit direct sur `main` : branche + PR liée à un ticket.
- **Exactitude scientifique** : toute valeur astronomique vient d'une source listée dans `docs/DATA_SOURCES.md` ; tout calcul est testé contre une référence (JPL Horizons, SIMBAD) avec tolérance explicite.
- **Licences** : ne jamais intégrer de données/assets sans licence compatible vérifiée et documentée.
- **Performance mobile** : cible 60 fps sur un Android milieu de gamme ; pas de dépendance lourde sans justification dans la PR.
- **DA** : respecter `docs/ART_DIRECTION.md` ; toute UI s'accompagne de captures.
- **Langue** : code, identifiants et commits en anglais ; docs et contenu utilisateur en français (i18n prête pour EN).
- Tenir `PROGRESS.md` à jour à chaque début/fin de tâche.
- Pas de `TODO` sans numéro de ticket : `// TODO(#N): ...`.

## Commandes utiles
- `/start-session`, `/finish-ticket`, `/handoff`, `/new-ticket` (voir `.claude/commands/`)
- `gh issue list --label agent-ok --state open` — tickets disponibles pour un agent
