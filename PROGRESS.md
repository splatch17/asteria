# PROGRESS

> Journal vivant. Chaque agent/humain le met à jour au début et à la fin de chaque tâche. Les entrées les plus récentes en haut.

**Phase actuelle** : Phase 2 — Carte Découverte / mode Terre & Ciel
**Milestone** : M2-Carte + M2b-Terre-Ciel

## 🔄 En cours
| Ticket | Titre | Agent/Personne | Branche | Depuis |
|---|---|---|---|---|
| — | — | — | — | — |

## ⛔ Blocages / décisions en attente
- Licence du code : gratuit en bêta, repo privé, pas de licence open source pour l'instant (tous droits réservés)
- Choix final des polices et du style de figure (ticket #4)

## ⏭️ Prochaines étapes
1. Soleil et Lune sur la carte, ciel de jour (#34)
2. Données Terre (#35) puis vue Terre depuis l'espace (#36)
3. Fiche constellation avec les histoires (#10 intégré)
2. Format binaire des étoiles (#16)
3. Figures suivantes en style A (pipeline artiste + IA)

## ✅ Fait récemment
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
_(vide)_
