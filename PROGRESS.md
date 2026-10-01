# PROGRESS

> Journal vivant. Chaque agent/humain le met à jour au début et à la fin de chaque tâche. Les entrées les plus récentes en haut.

**Phase actuelle** : Phase 2 — Carte Découverte / mode Terre & Ciel
**Milestone** : M2-Carte + M2b-Terre-Ciel

## 🔄 En cours
| Ticket | Titre | Agent/Personne | Branche | Depuis |
|---|---|---|---|---|
| #53 | Planètes et trajectoires (carte + vue Terre) — en attente de test sur S23, PR non ouverte | sky-renderer (agent) | `feat/53-planets-layers` | 2026-10-02 |
| #54 | Calques : rendu + API `setLayers` faits (grilles, écliptique), panneau UI à faire (ui-designer) | sky-renderer (agent) | `feat/54-layers-panel` (empilée sur #53) | 2026-10-02 |

## ⛔ Blocages / décisions en attente
- Licence du code : gratuit en bêta, repo privé, pas de licence open source pour l'instant (tous droits réservés)
- Choix final des polices et du style de figure (ticket #4)

## ⏭️ Prochaines étapes
1. Transition continue Ciel ↔ Terre au zoom (#37), mini-globe dans la vue Ciel (#38), traînées d'étoiles (#39)
2. Fiche constellation : histoires et anecdotes (#10) dans l'app, au toucher d'un nom
3. Vue 3D d'une constellation (#8), icône/PWA (#27)
4. Retours du porteur après tests sur le Galaxy S23 (visée du ciel, fluidité)

## ✅ Fait récemment
- 2026-10-01 — #36 Vue Terre depuis l'espace (globe tramé jour/nuit, lumières des villes, côtes, graticule, axe, équateur céleste, écliptique, « vous êtes ici », Soleil/Lune) ; #35 données Terre (Natural Earth, Blue/Black Marble, 490 Ko).
- 2026-10-01 — #47 Curseur de temps lisible (bulle de décalage, graduations), boutons « instrument » ; #45 boussole nord + viser le ciel avec les capteurs (roulis, réticule) ; #43 tracés de constellations Stellarium (Scorpion corrigé) ; #34 Soleil, Lune (phase), ciel de jour et crépuscules.
- 2026-10-01 — #33 Curseur de temps : 48 h / 1 an / 26 000 ans, lecture accélérée, vitesses, indications pédagogiques ; précession long terme (modèle simplifié au-delà de ±5 siècles, Véga polaire vers 14 000).
- 2026-10-01 — #32 Soleil, Lune (phase), point subsolaire via astronomy-engine, validés contre JPL Horizons (< 0,01° / 0,02°).
- 2026-10-01 — #10 Histoires et anecdotes (15 constellations) fusionnées après relecture scientifique (8 corrections). #7 mode nuit (luminosité, mémorisation), #26 libellés sans chevauchement + dézoom 200°, #16 catalogue binaire 392 Ko.
- 2026-10-01 — Épique #31 « Terre & Ciel » créée (tickets #32–#39, jalon M2b).
- 2026-10-01 — #20 Carte : barre de temps (±1 h, ±1 j, maintenant/en direct), géolocalisation mémorisée, noms latins + français des 88 constellations (`@asteria/content`), constellation dans la fiche étoile. Captures fidèles S23 via puppeteer-core (viewport 360×780 @3x).
- 2026-10-01 — #19 Moteur de carte `SkyMap` : projection stéréographique alt-az entièrement GPU (précession J2000→date validée Meeus 21.b), 8 870 étoiles, 88 constellations, sol tramé + horizon, glisser/pincer/molette avec inertie, sélection d'étoile, rendu à la demande. Polices embarquées (@fontsource, offline).
- 2026-10-01 — #18 Déploiement GitHub Pages : https://splatch17.github.io/asteria/ (données générées en CI).
- 2026-09-30 — Repo passé en **public** (historique réécrit sans adresse perso, ancien repo archivé en privé), protection de `main` active.
- 2026-09-30 — #4 DA : **style A (gravure tramée 1-bit) retenu**, rayons retirés. Prototype `prototypes/orion`.
- 2026-09-30 — #3 Pipeline `sky-data/build_stars.py` : 8 870 étoiles V ≤ 6.5 (Hipparcos I/239 + I/311, BSC5, IAU WGSN), 333 noms IAU, 88 constellations en lignes HIP, contrôles automatiques (Sirius, Vega, Bételgeuse, Polaris, Rigel, Orion).
- 2026-09-30 — #2 CI GitHub Actions (lint, typecheck, test, build).
- 2026-09-30 — #1 Monorepo pnpm : astro-core (tests Meeus OK), sky-renderer, ui (tokens + i18n svelte-i18n), content, sky-data, apps/web (Vite + Svelte 5). TypeScript fixé en ~6.0 (typescript-eslint et svelte-check pas encore compatibles TS 7).
- 2026-09-30 — Palette validée : nuit #101B52 / parchemin #F0E6D2. Appareil de test : Samsung Galaxy S23.
- 2026-09-30 — Décisions : nom **Asteria**, stack acceptée (ADR-0001), i18n (ADR-0002), DA réécrite à partir de l'analyse réelle du site Hermes Agent, indispensables validés (nuit rouge, Ce soir, ISS, cultures du ciel + histoires, vue 3D), app gratuite en bêta, FR d'abord.
- 2026-09-30 — Création du repo, docs de plan/workflow/DA/données, agents et procédures, templates GitHub, labels & milestones.

## 📝 Notes de passation
- 2026-10-02 — #54 (branche `feat/54-layers-panel`, empilée sur `feat/53-planets-layers`, non poussée) : API de calques `SkyMap.setLayers(partial: Partial<SkyLayers>)` / `getLayers()` (constellationLines, constellationNames, starNames, planets, allPaths, equatorialGrid, azimuthalGrid, ecliptic ; défauts `DEFAULT_SKY_LAYERS`), même API sur `SpaceView` (lignes, planètes, écliptique, grille équatoriale). Grilles et écliptique en fils tramés avec graduations légères. L'App pilote un objet `layers` unique : reste le panneau UI (agent ui-designer) et la mémorisation des calques. Captures `docs/design/map/s23-layers-*.jpg`.
- 2026-10-02 — #53 (branche `feat/53-planets-layers`, non poussée) : planètes sur la carte et dans la vue Terre ; retours du porteur appliqués : la trajectoire (±6 mois, repères datés exactement au 1er du mois) n'apparaît plus que pour la planète touchée, dans la vue Ciel comme dans la vue Terre (sélection au toucher Soleil/Lune/planètes dans `SpaceView`) ; bouton Trajectoires retiré (« toutes les trajectoires » reste disponible via `setPathsVisible`, futur panneau Calques #54) ; boutons-icônes 44 px ; plein jour : seule Vénus reste visible (`planetLimitingMagnitude`). Perf : fuite de la vue Terre corrigée (marqueur reconstruit à chaque date). Captures `docs/design/map/s23-planet-*.jpg`, `s23-space-selected-path.jpg`, `s23-planets-day-rule.jpg`. Reste : test du porteur sur le S23, puis push + PR.
