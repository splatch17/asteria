# Plan de développement

## Vision

Une seule application, trois portes d'entrée (Android, Web, Desktop), quatre usages (Ciel Live, Carte Découverte, Jeux, Guide), et **trois niveaux de profondeur** qui s'adaptent à l'utilisateur :

| Niveau | Public | Ce qu'il voit |
|---|---|---|
| ✦ Découverte | Enfants, débutants | Figures mythologiques, noms usuels, histoires, jeux simples |
| ✦✦ Amateur | Passionnés, astronomes amateurs | Magnitudes, distances, types spectraux, ciel profond, planification d'observation |
| ✦✦✦ Expert | Étudiants, doctorants | Désignations catalogue (HIP, HD, Gaia DR3), astrométrie, mouvements propres, liens SIMBAD/VizieR, parallaxes, incertitudes |

Le niveau se change à tout moment ; il ne masque jamais la vérité scientifique, il en règle la densité.

## Architecture proposée (voir ADR-0001 — *à valider*)

```
galaxa/
├── packages/
│   ├── astro-core/      # TS pur : temps, coordonnées, précession/nutation, éphémérides, requêtes catalogue
│   ├── sky-data/        # Pipeline Python/TS : téléchargement → nettoyage → tuiles binaires compactes
│   ├── sky-renderer/    # WebGL2 (Three.js ou moteur maison) : étoiles, lignes, figures, shaders DA
│   ├── ui/              # Composants UI + design system
│   └── content/         # Textes du guide (Markdown/MDX, FR/EN), mythologie, fiches objets
├── apps/
│   ├── mobile/          # Android via Capacitor (capteurs, caméra AR, offline)
│   ├── web/             # PWA (partie en ligne)
│   └── desktop/         # Tauri → .exe léger
└── tools/               # scripts de build de données, validation, génération d'assets
```

**Pourquoi ce choix (recommandation)** : le cœur de l'expérience est un **rendu graphique très stylisé** (shaders, particules, figures animées). Le Web (WebGL2/WebGPU) est la plateforme la plus riche pour ça, et on la réutilise à 100 % sur Android (Capacitor) et desktop (Tauri, ~10 Mo). Alternative sérieuse : Flutter (natif, bonnes perfs) mais rendu stylisé plus coûteux à développer. Alternative native pure (Kotlin + OpenGL) : meilleures perfs AR mais pas de web/exe gratuit.

## Phases

### Phase 0 — Fondations (≈ 1-2 semaines)
- [x] Nom de travail, repo, workflow, agents, docs
- [ ] Valider nom définitif, licence, stack (ADR-0001)
- [ ] Monorepo (pnpm workspaces), lint, format, tests, CI GitHub Actions
- [ ] Moodboard DA + 3 explorations de style (constellation Orion en 3 variantes)

### Phase 1 — Données & moteur astro (≈ 3 semaines)
- [ ] Pipeline catalogue : Hipparcos + noms IAU WGSN + Yale BSC → étoiles jusqu'à mag ~6.5 (~9 000) puis ~mag 9-10 (~120 000)
- [ ] Lignes de constellations (88 IAU), frontières officielles, noms FR/EN/latin/génitif/abréviation
- [ ] Planètes, Lune, Soleil (astronomy-engine, validé contre JPL Horizons)
- [ ] Objets du ciel profond (Messier + NGC/IC brillants via OpenNGC)
- [ ] `astro-core` : RA/Dec ↔ Alt/Az, temps sidéral, réfraction, précession — **tests de précision contre Horizons/SIMBAD**

### Phase 2 — Carte Découverte (MVP visuel) (≈ 4 semaines)
- [ ] Rendu du ciel : étoiles (taille/couleur selon magnitude et B-V), scintillement, Voie lactée
- [ ] Projection stéréographique/orthographique, zoom, pan, inertie
- [ ] Contrôle du temps (voyage dans le temps, accélération) et du lieu
- [ ] Couches : lignes, figures, frontières, grilles (équatoriale/azimutale), noms, planètes, DSO
- [ ] Fiche objet au tap (3 niveaux de détail)
- [ ] Recherche (étoile, constellation, objet, catalogue)
- **→ Première release web (PWA) publique**

### Phase 3 — Figures mythologiques & DA (≈ 4 semaines, en parallèle P2)
- [ ] Style final validé, pipeline d'assets (SVG/vectoriel animé ou textures + shaders)
- [ ] 88 figures (priorité : 12 zodiacales + 15 les plus connues de l'hémisphère Nord)
- [ ] Animations d'apparition (la figure « se révèle » depuis les étoiles)

### Phase 4 — Android & Ciel Live (≈ 4 semaines)
- [ ] App Capacitor, capteurs (orientation, boussole, GPS), fusion de capteurs + filtrage
- [ ] Mode Live : la carte suit le téléphone ; calibration boussole guidée
- [ ] Mode AR caméra (superposition sur flux vidéo) — optionnel/activable
- [ ] Mode nuit (rouge), offline complet
- **→ Bêta fermée Android (Play Console, piste interne)**

### Phase 5 — Apprentissage & mini-jeux (≈ 4 semaines)
- [ ] Moteur de progression (XP, maîtrise par constellation, répétition espacée type SM-2/FSRS)
- [ ] Jeux (cf. FEATURES.md) : Relie les étoiles, Quiz silhouette, Trouve-la dans le ciel, Chrono, Défi du soir
- [ ] Parcours guidés (« Ton premier ciel d'automne », « Les étoiles de navigation »)

### Phase 6 — Guide & contenu expert (continu)
- [ ] Fiches des 88 constellations, ~300 étoiles nommées IAU, 110 Messier
- [ ] Niveau expert : données Gaia DR3, liens SIMBAD, diagrammes HR interactifs
- [ ] Traduction EN

### Phase 7 — Desktop & release publique
- [ ] Build Tauri (.exe / installateur), mise à jour auto
- [ ] Release Play Store publique, site vitrine

## Jalons GitHub (milestones)

`M0-Fondations` · `M1-Donnees` · `M2-Carte` · `M3-DA` · `M4-Android-Live` · `M5-Jeux` · `M6-Guide` · `M7-Release`
