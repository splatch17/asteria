# PROGRESS

> Journal vivant. Chaque agent/humain le met à jour au début et à la fin de chaque tâche. Les entrées les plus récentes en haut.

**Phase actuelle** : Phase 2 — Carte Découverte / mode Terre & Ciel
**Milestone** : M2-Carte + M2b-Terre-Ciel

## 🔄 En cours
| Ticket | Titre | Agent/Personne | Branche | Depuis |
|---|---|---|---|---|
| #98 | Décalage de la visée capteurs (S23) | Claude (en attente de mesures porteur) | `fix/98-pointing-offset` | 2026-10-08 |

## ⛔ Blocages / décisions en attente
- Licence du code : gratuit en bêta, repo privé, pas de licence open source pour l'instant (tous droits réservés)
- Choix final des polices et du style de figure (ticket #4)
- #98 visée décalée : besoin des observations du porteur (sens, ampleur, constance, navigateur) ; la déclinaison magnétique (≈ 2° en France) est corrigée depuis #144
- Figures Stellarium : versions de licence non précisées par la source (Free Art License 1.3 et CC BY-SA 4.0 retenues), à confirmer

## ⏭️ Prochaines étapes
1. Tester sur S23 la vague du 2026-10-09 : recherche + surbrillance, étoiles de jour, figures des constellations, gestes 3D, référentiels ; mesurer le temps par image (figures, gestes, référentiels)
2. Référentiels : #123 (centré sur un astre, en cours) puis #124 (héliocentrique)
3. Figures : #110 (choix du style), #108 (Urania's Mirror), #109 (al-Sûfî), #119 (Télescope)
4. Finitions : transition (#87), lisibilité de la vue 3D (#86), dégradé d'horizon réaliste sur la carte (reste de #55) ; flèche de guidage hors écran vers l'objet sélectionné ; bouton retour Android pour la recherche
5. Traînées d'étoiles (#39) 
6. Génitifs latins des 88 constellations (source IAU à documenter) ; vérification en ligne des noms et constantes du ciel profond (SIMBAD/Wikidata, bloqués depuis le conteneur)
7. Locale anglaise (catalogue `en.json`, contenu `packages/content/en/`)
8. Licences : Hipparcos et Gaia en CC BY-NC 3.0 IGO → autorisation ESA requise avant toute monétisation

## ✅ Fait récemment
- 2026-10-19 — #163 Jeux (branche `feat/163-games`) : tuile « Jeux » dans Menu > Vue, écran Jeux (niveau, cartes de jeu, « Ton ciel » : une case par constellation tramée selon la maîtrise) ; moteur `apps/web/src/lib/games/` (SM-2 allégé avec révision anticipée amortie, maîtrise par élément `con:`/`star:`, tirage pondéré à revoir > dues > nouvelles, max 4-5 nouvelles par série, ×2 pour le ciel de ce soir, stockage local versionné) ; jeu « Quelle constellation ? » : 10 questions sur la vraie carte (SkyMap, figure au zénith), 4 noms voisins, figure illustrée en Découverte, étoiles seules en Expert. Découverte = 29 constellations (zodiaque, étoiles V ≤ 1,5, Grande/Petite Ourse, Cassiopée, Pégase). Captures `docs/design/games/`. Suites : #164, #165.
- 2026-10-19 — #162 (PR à suivre) Calque « Ciel réaliste » retiré : étoiles, noms et ciel profond restent dessinés de jour (un ancien réglage mémorisé est ignoré). Nouveau calque « Voie lactée » (actif par défaut) : densité des étoiles Tycho-2 de magnitude 9 à 11 tirée d'AT-HYG v3.2 (CC BY-SA 4.0, commit épinglé), lissée sur la sphère (`build_milkyway.py`, texture 1024×512 WebP 19 Ko), tracée en lavis + grain d'encre sous tout le reste, dans la projection de la carte ; Grand Rift et nuages d'Ophiuchus visibles ; copie hors ligne. Captures `docs/design/milky-way/`. À mesurer sur S23 (ms/image).
- 2026-10-19 — #160 iPhone : l'appli s'installe depuis Safari (Partager → « Sur l'écran d'accueil »), marche à suivre affichée dans Réglages sur iOS ; plein écran et titre via les balises Apple ; la boussole demande l'autorisation d'orientation d'iOS quand on la touche. Capture `docs/design/ios-install/`.
- 2026-10-16 — #158 Depuis la carte, la vue s'arrête sur la Terre vue de haut (thème choisi) au lieu de partir seule vers le système solaire ; on dézoome en continu jusqu'au système solaire. Plus de démonstration à l'arrivée. Capture `docs/design/earth-zoom-out/`.
- 2026-10-16 — #156 Carte : tourner deux doigts fait tourner le ciel autour du centre (avec le pincement pour zoomer). Capture `docs/design/free-pan/two-finger-twist.png`.
- 2026-10-16 — #154 Carte : plus aucune rotation automatique au relâcher ; la boussole remet la vue droite face au nord.
- 2026-10-16 — #152 Carte : au-dessus de 60° le ciel suit le doigt librement (caméra tournée sur ses axes, pas de demi-tour au zénith) ; horizon redressé au relâcher sous 60°. Capture `docs/design/free-pan/`.
- 2026-10-16 — #150 Carte : le ciel suit le doigt et passe par-dessus le zénith (vue à l'envers, redressée au relâcher), azimut à l'échelle de la hauteur ; textes de l'interface épurés (aides, notes, hors ligne). Capture `docs/design/free-pan/`.
- 2026-10-16 — #148 Titan sur la carte (Meeus 46, exemple 46.a à 0,01 rayon de Saturne), visible dès que le zoom le sépare de Saturne ; champ minimal de la carte 0,5° ; le trajet d'une planète touchée n'apparaît plus qu'avec le calque « Trajectoires des planètes ». Capture `docs/design/titan/`.
- 2026-10-16 — #146 Voyant réseau dans Réglages (vert « Connecté », rouge « Hors ligne : l'appli utilise sa copie »), ligne « Copie hors ligne », aide de la boussole à jour. Captures `docs/design/network/`.
- 2026-10-16 — #144 Vraie boussole : l'aiguille suit le magnétomètre du téléphone (nord géographique, repère fixe en haut), un toucher remet la vue au nord ; déclinaison WMM2025 dans `astro-core` (100 valeurs de test officielles), appliquée aussi à la visée (−18,6° en Guyane). Captures `docs/design/compass/`.
- 2026-10-16 — #142 Mode hors ligne (PR à suivre) : service worker généré au build (`apps/web/offline.ts`, gabarit `src/sw/service-worker.js`) qui télécharge tout le build (code, polices woff2, catalogue, textures, figures, ciel profond) ; mise à jour incrémentale par empreinte de contenu ; état dans Réglages (« Hors ligne · Prêt · N Mo », progression, reprise) ; stockage persistant demandé ; « Ma position » repasse par le GPS sans réseau. Vérifié dans Chromium en mode avion (carte, système solaire, mise à jour) ; captures `docs/design/offline/`.
- 2026-10-16 — Vague menu et référentiels fusionnée : #130/#131 (PR #132, #133), #135 tuiles (PR #136), #134 retour fluide de visite (PR #137), #138 recherche/boussole/panneaux (PR #140), #139 « La Terre tourne » retiré, puce « Fixe » (PR #141). #101 et #123 fusionnés auparavant.
- 2026-10-10 — #122 Référentiels de la vue Terre (PR #125) : sélecteur (fixé sur les étoiles, lié à la Terre, plan de l'écliptique ; héliocentrique et centré sur un astre « Bientôt »), transition slerp 800 ms (instantanée en mouvement réduit), phrase pédagogique par niveau, repères pointillés de l'écliptique ; `meanObliquity` IAU 2006 dans astro-core (SOFA `iauObl06` < 0,001″). Découpage de #105 en #122/#123/#124.
- 2026-10-09 — #107 Gestes tactiles des vues 3D (PR #121) : 1 doigt orbite avec inertie, 2 doigts déplacer/pincer vers les doigts/pivoter, double toucher centrer ou revenir, bouton recentrer, astuce de première utilisation ; angle d'ouverture de la vue 3D corrigé (38°).
- 2026-10-09 — #95/#96 Figures illustrées des constellations Stellarium / Johan Meuris (PR #120) : pipeline `build_figures.py` (commit épinglé, licence contrôlée, atlas WebP 360 Ko), calage affine sur 3 étoiles d'ancrage (< 0,01″), trame 1-bit Bayer, calque « Figures des constellations » ; 84/85 figures (Télescope : #119).
- 2026-10-09 — #117 Rotation de la carte instantanée en mouvement réduit, NaN corrigé (PR #118). #115 Déploiement : cache des téléchargements restauré + reprises Gaia (PR #116), 2 h → 1 min 30.
- 2026-10-09 — #103 Surbrillance de l'objet recherché (réticule gravé, anneaux d'arrivée, constellation ressortie et ciel voilé) ; #104 étoiles des constellations plus visibles (lignes interrompues avant les étoiles) ; #106 étoiles et noms visibles de jour (calque « ciel réaliste de jour » en option) ; #100 catalogue du ciel profond OpenNGC (PR #111–#114).
- 2026-10-08 — #99 Recherche : étoiles, désignations Bayer/Flamsteed, HIP, 88 constellations, Soleil, Lune, planètes ; tolérance d'une faute ; ≈ 0,6 ms par frappe.
- 2026-10-02 — #37 Transition continue Ciel ↔ Terre : un seul trajet de caméra (`flight.ts`), dézoom au-delà de 200° → espace, zoom sur « vous êtes ici » → carte, même animation pour le bouton ; vue Terre préchargée et préparée (shaders/textures). #38 Mini-globe (canvas 2D tramé, terminateur à la date, toucher → vol, calque `miniGlobe`). #80 Bandeau pédagogique au-dessus de la bulle du curseur (PR #85). Suivi : #87.
- 2026-10-02 — #8 Vue 3D d'une constellation : bouton dans la fiche, transition depuis la projection de la carte, distances réelles (#82 prioritaire, sinon parallaxe ±1σ), incertitudes signalées, barres ±1σ en Expert, niveaux Découverte/Amateur/Expert, nuit rouge, chunk à part 12 Ko gzip (PR #84). Suivi lisibilité : #86.
- 2026-10-02 — #75 Distances de référence (Gaia DR3 corrigé du point zéro si G > 6 et RUWE < 1,4 ; publiées pour Deneb et Bételgeuse, documentées) et #79 vitesses radiales (Gaia DR3 / BSC5) dans le catalogue ASTS v2 ; noms IAU décodés en UTF-8 (338 noms) (PR #82). Correctif déploiement NumPy 2 (PR #83).
- 2026-10-02 — #78 Mouvement propre des étoiles : `astro-core` propage les positions Hipparcos (époque J1991.25) par le modèle rigoureux en ligne droite (ESA 1997 §1.5.5, vitesse radiale optionnelle), validé contre SIMBAD (Arcturus, Sirius, α Cen A < 0,1″ en 2000 et 2026 ; 61 Cyg A < 1″ face à Gaia ; Barnard avec v_r < 0,005″) ; étoiles et extrémités des lignes de constellation déplacées sur GPU (`aPm` + `uYears`) dans la carte et la vue Terre (deux styles), copies CPU (toucher, étiquettes, figure sélectionnée, noms de constellation) mises à jour au changement de date sans allocation ; fiche étoile à la date ; Lune/planètes non calculées hors ±3000 ans (fiches fermées) ; bandeau 26 000 ans complété ; lieu mémorisé de nouveau restauré (PR #81, fusionnée). Limite : sans vitesse radiale, α Cen et 61 Cyg décalés de 3 à 6° à ±13 000 ans (#79).
- 2026-10-02 — Revue rendu (PR #77, fusionnée) : toucher limité aux objets visibles, visée allégée, cycle de vie et perte de contexte WebGL, étiquettes de la vue Terre hors HUD, Lune/planètes masquées hors ±3000 ans, glyphes de la vue Terre gravure réparés.
- 2026-10-02 — #74 Revue interface : fiches étoile/Soleil-Lune/planète réunies dans `InfoPanel` et placées au-dessus des contrôles mesurés (plus de ligne DIST masquée pendant la lecture ou avec le curseur de luminosité) ; échelle « 1 an » lue par jours entiers à heure civile fixe (fin de l'effet stroboscope, 1 s = 1 h reste continu) ; lettres grecques en minuscules (« α CYG ») ; années « 1975 av. J.-C. » ; arrondi sexagésimal corrigé (plus de 60.0s ni 24′00″ pour 25′00″) ; libellés RA/DEC/V/B−V/DIST/HIP, « N » de la boussole et G2V en clés i18n, dates à la locale courante ; distance « ≈ » quand σπ/π > 0,1 et masquée au-delà de 0,5 ; échecs de chargement (ciel, Terre) avec « Réessayer » ; icônes explicites (globe, ciel étoilé, palette « couleurs réelles », téléphone visant une étoile, horloge, lune étoilée) et vrai bouton « ma position » ; dégradé derrière l'en-tête ; App.svelte découpé (`SkyHeader`, `DialsColumn`, `InfoPanel`, `lib/pointing.svelte.ts`) (PR #76, fusionnée).
- 2026-10-02 — #66 Page Crédits et sources dans l'application (chargée à la demande depuis le panneau Calques) (PR #72).
- 2026-10-02 — Corrections des histoires de constellations et noms d'étoiles en français (PR #71).
- 2026-10-02 — #55 Style réaliste de la vue Terre (textures chargées à la demande, mémorisé) (PR #70).
- 2026-10-02 — #65 Voir à travers la Terre : ciel sous l'horizon atténué, sélection possible sous l'horizon (PR #69).
- 2026-10-02 — Fiche constellation avec histoire et anecdotes au toucher (PR #64) ; noms du ciel hors du HUD (PR #63).
- 2026-10-02 — #61 Fiche constellation : sélection au toucher du nom (rectangles d'étiquettes mémorisés) ou dans la figure loin de toute étoile (enveloppe convexe), figure mise en évidence par un trait tramé 1-bit, vue recadrée si la fiche la masque ; fiche (noms FR/latin, abréviation, étoile la plus brillante, position par rapport à l'horizon) avec histoire + 3 anecdotes + sources CC BY-SA pour les 15 constellations rédigées (chargement paresseux des .md, 1 chunk ~3 Ko chacune), fiche courte sans histoire pour les autres ; lien étoile/planète → constellation (PR #64).
- 2026-10-02 — #59 Visée capteurs : diagnostic par cause (https, capteurs refusés, événements vides de Brave, pas de boussole, pas de capteur) avec messages dédiés dont Brave (Paramètres des sites → Capteurs de mouvement / Shields), repli Generic Sensor `AbsoluteOrientationSensor` et mode relatif (cap recalé au doigt), ADR-0003 ; bouton plein écran (mémorisé, masqué sans API), safe-areas latérales. #27 Icône tramée (favicon SVG/ICO, PWA 192/512/maskable, script `pnpm icons`), manifeste `display: fullscreen` construit avec la base Vite. (PR #60), à tester sur S23.
- 2026-10-02 — #54 Calques : panneau (Ciel / Système solaire / Repères), grilles équatoriale et azimutale, écliptique, graduations préfixées hors HUD, état mémorisé par vue ; correctif mode nuit mémorisé (PR #58).
- 2026-10-02 — #53 Planètes : glyphes tramés, trajectoire datée ±6 mois au toucher (carte + vue Terre), fiche planète, `constellationOf` (frontières IAU), plein jour = Vénus seule, fuite de la vue Terre corrigée ; `pnpm dev:phone` (HTTPS) (PR #57).
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
_(vide)_
