# Ton des textes

> Règle posée par #198 (audit UX du 24/10/2026). Vaut pour tout texte que lit l'utilisateur : interface (`packages/ui/src/i18n/locales/fr.json`), fiches et histoires (`packages/content/fr/`).

## Tutoiement partout

Asteria parle à chacun comme un guide sous le ciel, d'un enfant à un doctorant : **« tu »**, jamais « vous ».

| Oui | Non |
|---|---|
| Touche le ciel pour la retrouver | Touchez le ciel… |
| Lève le téléphone vers le ciel | Levez le téléphone… |
| Tu es ici | Vous êtes ici |
| Autorise-les, puis recharge la page | Autorisez-les, puis rechargez |
| Ta position n'est pas connue | Votre position… |

- **Consignes à l'impératif singulier** : « Touche », « Glisse », « Lève le téléphone », « Reviens au système solaire ».
- **Libellés de boutons et d'onglets** : verbe à l'infinitif ou nom, sans pronom (« Utiliser ma position », « Réessayer », « Jouer », « Réglages »).
- **« Ma » / « mon » pour ce qui appartient à l'utilisateur** dans un libellé qu'il choisit (« Ma position », « Visibles de chez moi ») ; **« ta » / « ton »** quand l'appli lui parle (« Ton ciel », « Ta position n'est pas connue »).
- **Citations** : un texte ancien cité mot pour mot entre guillemets « … » garde sa forme ; c'est la seule exception.

## Phrases

- Courtes, une idée par phrase ; le chiffre plutôt que l'adjectif (« 2 h », « 5° »).
- Une erreur dit **ce qui se passe et quoi faire**, avec un bouton quand une action existe (« Réessayer », « Utiliser ma position ») ; jamais de code d'erreur seul.
- Nombres à la française : virgule décimale (`Intl.NumberFormat`), espace avant les unités (« 8,6 al », « 48,9° N »).
- Typographie française : espace avant « : ; ? ! », guillemets « … », points de suspension « … ».

## Vérification

`packages/ui/src/i18n/tone.ts` repère les formes en « vous » (le pronom, ses possessifs et les verbes en « -ez », hors « chez », « assez »…). Deux tests l'appliquent :

- `packages/ui/src/i18n/tone.test.ts` : toutes les clés de `fr.json` (une exception se déclare dans `ALLOWED`, avec sa raison) ;
- `packages/content/src/stories.test.ts` : histoires et anecdotes, citations « … » exclues.
