# ADR-0001 — Stack technique

- **Statut** : Accepté (2026-09-30 — le porteur du projet délègue le choix : « le plus adapté, beau et pro »)
- **Date** : 2026-09-30

## Contexte
Cibles : Android (prioritaire), Web (partie en ligne), Windows (.exe). Le cœur de l'expérience est un rendu du ciel très stylisé (shaders, animations) + capteurs d'orientation + mode offline.

## Décision proposée
- **TypeScript** monorepo (**pnpm** workspaces), **Vite**
- Rendu : **WebGL2** via **Three.js** (évolution WebGPU possible), shaders GLSL maison
- UI : **Svelte 5** (léger, performant sur mobile) — alternative : React
- Calculs astro : **astronomy-engine** (MIT) + code maison testé
- Android : **Capacitor** (plugins capteurs/caméra/GPS ; plugin natif Kotlin si la fusion de capteurs web est insuffisante)
- Desktop : **Tauri 2**
- Pipeline données : **Python** (astropy, astroquery) → fichiers binaires
- Tests : Vitest, Playwright (web), tests de précision astro contre valeurs JPL/SIMBAD
- CI : GitHub Actions

## Alternatives
| Option | + | − |
|---|---|---|
| Flutter | Natif, perfs, un code pour Android/Web/Windows | Shaders stylisés et rendu 3D plus laborieux, web moins bon |
| Kotlin natif + OpenGL/Filament | Meilleures perfs AR/capteurs | Ni web ni exe gratuits |
| Unity | Rendu/AR excellents | Lourd, web médiocre, UI d'app pénible |

## Conséquences
Risque principal : précision/latence des capteurs dans une WebView → prévoir un plugin natif Capacitor dès la phase 4 si nécessaire.

## Justification finale
Critères du porteur : rendu **beau et pro**, grand public **et** professionnels, Android d'abord + web + exe.
- Le style retenu (gravure tramée 1-bit, halftone, scanlines, grain : voir `docs/ART_DIRECTION.md`) se réalise **en shaders GPU**. WebGL2 + Three.js offre le meilleur rapport qualité/effort et l'écosystème le plus riche.
- Un seul code pour les 3 cibles, ce qui garde un rythme de développement soutenable.
- Svelte 5 plutôt que React : moins de surcoût d'exécution sur mobile, animations d'interface simples à écrire.
