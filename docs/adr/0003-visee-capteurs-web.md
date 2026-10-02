# ADR-0003 — Visée par capteurs dans le navigateur : sources, repli et diagnostic

- **Statut** : accepté (2026-10-02, ticket #59)
- **Zone** : `apps/web` (mode Ciel Live), à reprendre par le plugin Capacitor natif plus tard

## Contexte

« Viser le ciel » oriente la carte avec le téléphone. La première version (#45) n'écoutait que
`deviceorientationabsolute` / `deviceorientation` absolu et abandonnait après 2 s avec un message
unique. Sur le Galaxy S23 du porteur, avec **Brave Android**, elle échouait toujours.

Causes établies :

| Cause | Symptôme côté page | Comment le voir |
|---|---|---|
| **Brave bloque les capteurs de mouvement par défaut** (réglage de site « Capteurs de mouvement », protection anti-empreinte) | un seul `deviceorientation` avec `alpha`, `beta`, `gamma` à `null`, puis plus rien ; aucune invite ([brave-browser#30076](https://github.com/brave/brave-browser/issues/30076)) | Brave → ⋮ → Paramètres → Paramètres des sites → Capteurs de mouvement |
| Réglage de site « Capteurs de mouvement » bloqué (Chrome aussi) | `navigator.permissions.query({name: "accelerometer"})` → `denied` ; `AbsoluteOrientationSensor` → `NotAllowedError` | cadenas à gauche de l'adresse → Autorisations |
| Contexte non sécurisé (`http://`, IP locale en http) | `isSecureContext === false`, aucun événement | barre d'adresse |
| Pas de boussole (magnétomètre absent ou refusé) | seulement des `deviceorientation` relatifs (`absolute: false`) | — |
| Pas de capteur du tout (ordinateur) | événement vide, `NotReadableError` du Generic Sensor | — |

Le certificat auto-signé de `pnpm dev:phone` n'est pas en cause pour les capteurs : la page reste
un contexte sécurisé (schéma https) une fois l'avertissement accepté. Il empêche en revanche
l'installation en application (WebAPK) : on installe depuis GitHub Pages.

## Décision

1. **Cascade de sources**, toutes écoutées en parallèle pendant une phase de sondage :
   1. absolue : `deviceorientationabsolute`, `deviceorientation` marqué `absolute`, iOS
      `webkitCompassHeading`, ou le Generic Sensor `AbsoluteOrientationSensor` (quaternion,
      repère `device`) ; la première source absolue qui répond pilote la vue ;
   2. **relative** : `deviceorientation` sans boussole. La hauteur et le roulis viennent de la
      gravité et sont justes ; le cap garde celui de la carte au démarrage et **se recale au doigt**
      (glisser horizontal), avec un message explicite. Si une boussole se réveille ensuite, on bascule
      en absolu ;
   3. inclinaison seule (`alpha` nul) : traitée comme relative.
2. **Délais** : 1,2 s d'attente d'une boussole après une première lecture relative ; 2,5 s si seuls
   des événements vides arrivent (cas Brave) ; 5 s sans rien du tout.
3. **Messages distincts** (clés `pointing.error.*`) : `insecure`, `unsupported`, `denied`, `blocked`,
   `silent`, et une variante **Brave** avec le chemin des réglages et Shields.
4. La logique (classement des événements, choix de la source, cause d'échec) est pure et testée
   (`apps/web/src/lib/sensors.ts`) ; le quaternion est vérifié contre les angles W3C
   (`orientation.test.ts`).

## Conséquences

- Le cap absolu est celui du **nord magnétique** fourni par Android ; la correction de déclinaison
  (WMM) reste à faire (quelques degrés en France).
- Sur Brave, l'utilisateur doit toujours autoriser les capteurs lui-même : aucune API ne permet
  de déclencher une invite. Le message le guide.
- Si les API web restent insuffisantes, le plugin Capacitor natif (rotation vector Android) prendra
  le relais avec la même interface de sources.
