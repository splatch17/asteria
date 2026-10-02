<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { _, locale } from "@asteria/ui";
  import {
    SkyMap,
    SpaceView,
    type BodyName,
    type CatalogStar,
    type SkyLayers,
    type SkySelection,
    type SpaceStyle,
    type ViewState,
    isSpaceStyle,
    DEFAULT_SKY_LAYERS,
    DEFAULT_SPACE_LAYERS,
    ephemerisReliable,
    skyOpacity,
    FLIGHT_MS,
  } from "@asteria/sky-renderer";
  import {
    PLANETS,
    bodyPosition,
    constellationOf,
    moonPhase,
    propagateStar,
    yearsSinceHipparcos,
    type Planet,
  } from "@asteria/astro-core";
  import { CONSTELLATION_LATIN, constellationNames, localizeStarStrings } from "@asteria/content";
  import {
    decodeCoastlines,
    decodeStarCatalog,
    type CatalogStar as CatalogRecord,
  } from "@asteria/catalog";
  import { formatDec, formatRa, starDistance, yearLabel } from "./lib/format";
  import { MIN_DIM, nightInk } from "./lib/night";
  import { readSetting, writeSetting } from "./lib/storage";
  import { PlanetPathCache } from "./lib/planet-paths";
  import { SensorPointing } from "./lib/pointing.svelte";
  import { failureMessageKey } from "./lib/sensors";
  import {
    FULLSCREEN_STORAGE_KEY,
    enterFullscreen,
    exitFullscreen,
    readFullscreenEnvironment,
    shouldRestoreFullscreen,
    showFullscreenButton,
  } from "./lib/fullscreen";
  import Icon from "./components/Icon.svelte";
  import TimeScrubber, { BUBBLE_RISE } from "./components/TimeScrubber.svelte";
  import LayersPanel from "./components/LayersPanel.svelte";
  import ConstellationSheet from "./components/ConstellationSheet.svelte";
  import InfoPanel, { type InfoRow } from "./components/InfoPanel.svelte";
  import Designation from "./components/Designation.svelte";
  import SkyHeader from "./components/SkyHeader.svelte";
  import DialsColumn from "./components/DialsColumn.svelte";
  import MiniGlobe from "./components/MiniGlobe.svelte";
  import { brightestStar, figureDirections, frameAbove, placeFigure } from "./lib/constellation";
  import { altitudeOf } from "./lib/horizon";
  import {
    LAYERS_STORAGE_KEY,
    graduationFormatter,
    isRecord,
    layersFromUrl,
    restoreLayers,
    serializeLayers,
    type LayerKey,
    type LayerView,
  } from "./lib/layers";
  import {
    RANGES,
    RANGE_ORDER,
    advance,
    clampOffset,
    dateAt,
    offsetParts,
    restartOffset,
    type TimeRange,
  } from "./lib/timeline";

  const THEMES = {
    day: { ink: "#f0e6d2", sky: "#101b52", daySky: "#2b4597", ground: "#0a1136" },
    red: { ink: "#ff2a1a", sky: "#000000", daySky: "#1f0303", ground: "#000000" },
  };

  let canvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let map: SkyMap | undefined;
  let spaceCanvas: HTMLCanvasElement;
  let spaceOverlay: HTMLCanvasElement;
  let skyView: HTMLDivElement;
  let space = $state<SpaceView | undefined>();
  let mode = $state<"sky" | "space">("sky");
  /** Sky ↔ Earth flight under way (#37): both views are shown, the sky map fading over. */
  let flying = $state<"out" | "in" | null>(null);
  /**
   * Pinch/wheel past the zoom limits flies between Sky and Earth (#37) only with a mouse or
   * trackpad (web, desktop): on a touch screen a pinch left the view by accident, so phones
   * switch with the button only.
   */
  const zoomFlights = !matchMedia("(pointer: coarse)").matches;
  let spaceLoading = $state(false);
  let spaceError = $state(false);
  // Earth view style (#55): engraving or realistic, remembered; `?style=` for captures.
  const urlStyle = new URLSearchParams(location.search).get("style");
  let spaceStyle = $state<SpaceStyle>(
    isSpaceStyle(urlStyle)
      ? urlStyle
      : readSetting("asteria.spaceStyle", "engraving", isSpaceStyle),
  );
  let catalog: { stars: CatalogStar[]; lines: Record<string, number[][]> } | undefined;
  let status = $state<"loading" | "ready" | "error">("loading");
  const isBool = (v: unknown): v is boolean => typeof v === "boolean";
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  let night = $state(readSetting("asteria.night", false, isBool));
  let brightness = $state(readSetting("asteria.nightBrightness", 0.7, isNum));
  // Layers (#54): one state per view (the Earth view keeps the ecliptic by default), edited by
  // the layers panel and remembered between sessions. `?layers=` (captures) takes precedence and
  // is then not saved.
  const urlLayers = new URLSearchParams(location.search).get("layers");
  function initialLayers(view: LayerView): SkyLayers {
    const defaults = view === "sky" ? DEFAULT_SKY_LAYERS : DEFAULT_SPACE_LAYERS;
    const fromUrl = layersFromUrl(urlLayers, defaults);
    if (fromUrl) return fromUrl;
    const saved = readSetting<unknown>(LAYERS_STORAGE_KEY[view], null, isRecord);
    // Before #54 only the planets switch was remembered.
    if (saved === null && view === "sky")
      return { ...defaults, planets: readSetting("asteria.planets", true, isBool) };
    return restoreLayers(saved, defaults);
  }
  let viewLayers = $state<Record<LayerView, SkyLayers>>({
    sky: initialLayers("sky"),
    space: initialLayers("space"),
  });
  const setLayer = (key: LayerKey, value: boolean) => (viewLayers[mode][key] = value);
  const showPlanets = $derived(viewLayers[mode].planets);
  let layersOpen = $state(false);
  let creditsOpen = $state(false);
  /** Constellation 3D view (#8): the figure, the catalogue and the map's view it starts from. */
  let view3d = $state.raw<{
    abbr: string;
    view: ViewState;
    // The map holds the decoded catalogue records, which carry the reference distances (#75).
    stars: CatalogRecord[];
    lines: Record<string, number[][]>;
  } | null>(null);
  // Loaded on demand with its renderer: not in the start-up bundle.
  let Constellation3D = $state.raw<
    typeof import("./components/Constellation3D.svelte").default | null
  >(null);
  async function open3d(abbr: string) {
    try {
      Constellation3D ??= (await import("./components/Constellation3D.svelte")).default;
    } catch (e) {
      console.error(e); // offline before the chunk was cached: the sheet stays as it is
      return;
    }
    if (!map || !catalog) return;
    stopPlaying();
    const stars = catalog.stars as CatalogRecord[];
    view3d = { abbr, view: { ...map.view }, stars, lines: catalog.lines };
    map.stop(); // hidden under the 3D view, which starts from its last frame
  }
  function close3d() {
    view3d = null;
    if (mode === "sky") map?.start();
  }
  let layersButton = $state<HTMLButtonElement>();
  let selection = $state<SkySelection | null>(null);
  const selected = $derived(selection?.kind === "star" ? selection.star : null);
  const selectedBody = $derived(selection?.kind === "body" ? selection.body : null);
  const selectedPlanet = $derived(selection?.kind === "planet" ? selection.planet : null);
  const selectedConstellation = $derived(
    selection?.kind === "constellation" ? selection.abbr : null,
  );
  let date = $state(new Date());
  let live = $state(true);
  let range = $state<TimeRange>("48h");
  let anchor = new Date();
  let offset = $state(0);
  let playing = $state(false);
  let speedIndex = $state(1);
  let playFrame = 0;
  /** Playback time not yet applied (whole-day speeds of the one-year range, #74). */
  let playCarry = 0;
  let viewAzimuth = $state(180);
  let viewRoll = $state(0);
  // Declared before loadPlace() runs: read earlier, it was in its temporal dead zone and the
  // saved place was never restored (the ReferenceError fell into loadPlace's catch).
  const PLACE_KEY = "asteria.place";
  let place = $state(loadPlace());
  let locating = $state<"idle" | "busy" | "error">("idle");
  let clock: ReturnType<typeof setInterval>;
  const names = constellationNames("fr");
  /** Current UI locale, for dates and numbers formatted outside ICU messages. */
  const lang = $derived($locale ?? "fr");
  // One formatter for the ~80 path marks (toLocaleDateString builds a new one on each call).
  const pathMarkFormat = $derived(
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }),
  );
  const planetName = (p: Planet) => $_(`planet.${p}`);
  const planetNames = () =>
    Object.fromEntries(PLANETS.map((p) => [p, planetName(p)])) as Record<Planet, string>;
  const hipLabel = (hip: number) => $_("star.hip", { values: { hip } });
  const starLabel = (s: CatalogStar) => s.name ?? s.bayer ?? hipLabel(s.hip);

  interface Place {
    name: string | null; // null = default city (translated at render time)
    latitude: number;
    longitude: number;
  }

  function loadPlace(): Place {
    try {
      const saved = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null");
      if (saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude))
        return saved;
    } catch {
      // storage unavailable: fall back to the default place
    }
    return { name: null, latitude: 48.8566, longitude: 2.3522 };
  }

  function setOffset(value: number) {
    offset = clampOffset(value, range);
    live = false;
    date = dateAt(anchor, offset, range);
    map?.setDate(date);
  }

  function goLive() {
    stopPlaying();
    anchor = new Date();
    offset = 0;
    live = true;
    date = anchor;
    map?.setDate(date);
  }

  function cycleRange() {
    stopPlaying();
    range = RANGE_ORDER[(RANGE_ORDER.indexOf(range) + 1) % RANGE_ORDER.length]!;
    anchor = date;
    offset = 0;
    speedIndex = 1;
  }

  function cycleSpeed() {
    speedIndex = (speedIndex + 1) % RANGES[range].speeds.length;
    playCarry = 0;
  }

  function togglePlay() {
    if (playing) return stopPlaying();
    if (offset >= RANGES[range].half) setOffset(restartOffset(range)); // restart from the beginning
    playing = true;
    playCarry = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); // cap: a background tab must not jump
      last = now;
      const step = advance(offset, playCarry, dt, range, speedIndex);
      playCarry = step.carry;
      if (step.offset !== offset) setOffset(step.offset);
      if (step.done) return stopPlaying();
      playFrame = requestAnimationFrame(tick);
    };
    playFrame = requestAnimationFrame(tick);
  }

  function stopPlaying() {
    cancelAnimationFrame(playFrame);
    playing = false;
  }

  // --- Sensor pointing (#45, #59), in lib/pointing.svelte.ts
  const pointer = new SensorPointing({
    setView: (view) => map?.setView(view),
    setPointing: (on) => map?.setPointing(on),
    azimuth: () => viewAzimuth,
  });

  // --- Fullscreen (#59)
  let fullscreenEnv = $state(readFullscreenEnvironment());
  const fullscreenAvailable = $derived(showFullscreenButton(fullscreenEnv));
  function onFullscreenChange() {
    fullscreenEnv = readFullscreenEnvironment();
    writeSetting(FULLSCREEN_STORAGE_KEY, fullscreenEnv.active);
  }
  function toggleFullscreen() {
    if (fullscreenEnv.active) void exitFullscreen();
    else void enterFullscreen();
  }
  // Fullscreen needs a user gesture: a remembered choice comes back on the first tap.
  function restoreFullscreen() {
    removeEventListener("pointerup", restoreFullscreen, true);
    const env = readFullscreenEnvironment();
    if (shouldRestoreFullscreen(readSetting(FULLSCREEN_STORAGE_KEY, false, isBool), env))
      void enterFullscreen();
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);
  addEventListener("pointerup", restoreFullscreen, true);

  // --- Earth view, loaded on demand (#36), and the Sky ↔ Earth flights (#37)
  const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;
  const getData = (path: string) =>
    fetch(dataUrl(path)).then((r) =>
      r.ok ? r : Promise.reject(new Error(`${path}: HTTP ${r.status}`)),
    );
  const getImage = (path: string) =>
    getData(path)
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b));
  /** Relief and night lights: shared by the mini-globe (#38) and the Earth view. */
  let earthImages: Promise<{ relief: ImageBitmap; lights: ImageBitmap }> | null = null;
  function loadEarthImages() {
    earthImages ??= Promise.all([getImage("earth/relief.webp"), getImage("earth/lights.webp")])
      .then(([relief, lights]) => ({ relief, lights }))
      .catch((e: unknown) => {
        earthImages = null; // a later request tries again
        throw e;
      });
    return earthImages;
  }

  /** The Earth view, built once (on demand, or preloaded while zooming out towards it). */
  let spacePromise: Promise<SpaceView> | null = null;
  function ensureSpace(): Promise<SpaceView> {
    spacePromise ??= createSpace().catch((e: unknown) => {
      spacePromise = null;
      throw e;
    });
    return spacePromise;
  }

  async function createSpace(): Promise<SpaceView> {
    if (!catalog) throw new Error("star catalogue not loaded");
    const [{ relief, lights }, coast] = await Promise.all([
      loadEarthImages(),
      getData("earth/coastlines.bin").then((r) => r.arrayBuffer()),
    ]);
    const view = new SpaceView({
      canvas: spaceCanvas,
      overlay: spaceOverlay,
      stars: catalog.stars,
      lines: catalog.lines,
      earth: { relief, lights, coastlines: decodeCoastlines(coast) },
      theme: night ? { ...THEMES.red, ink: nightInk(brightness) } : THEMES.day,
      labels: {
        here: $_("space.here"),
        sun: $_("body.Sun"),
        moon: $_("body.Moon"),
        pole: $_("space.pole"),
      },
      planetNames: planetNames(),
      formatPathMark: (d) => pathMarkFormat.format(d),
      onSelect: (s) => (selection = s),
      ...(zoomFlights ? { onEnterSky: () => flyToSky() } : {}),
      style: spaceStyle,
      monochrome: night,
      loadTexture: (name) => getImage(`space/${name}.webp`),
    });
    syncSpace(view);
    space = view;
    updateGraduationExclusions();
    // Shaders compiled and textures uploaded now, not on the flight's first frame.
    await view.prepare().catch((e: unknown) => console.warn("Earth view warm-up", e));
    return view;
  }

  /** Date, place, bodies and layers into the Earth view (the effects keep them in sync after). */
  function syncSpace(view: SpaceView) {
    view.setObserver(place);
    view.setDate(date);
    view.setBodies(skyBodies);
    view.setPlanets(planets);
    view.setLayers({ ...viewLayers.space });
    view.setSelectedPath(selectedPath);
  }

  /** Starts building the Earth view in the background (approaching the widest field). */
  function preloadSpace() {
    if (status === "ready") ensureSpace().catch(() => {}); // a user request reports errors
  }

  // Flight duration: none with reduced motion; `?flightMs=` slows it down for captures.
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const urlFlightMs = Number(new URLSearchParams(location.search).get("flightMs"));
  const flightDuration = () =>
    reducedMotion.matches ? 0 : urlFlightMs > 0 ? urlFlightMs : FLIGHT_MS;
  /** Nothing in the way of leaving the sky (re-read after awaiting the Earth view). */
  const canLeaveSky = () => !flying && mode === "sky" && map !== undefined;

  /**
   * Leaves the sky for the Earth view (#37): globe button, mini-globe, or zooming out past the
   * widest field. The camera climbs from the observer's eye, looking where the map looks.
   */
  async function flyToSpace(instant = false): Promise<void> {
    if (!canLeaveSky()) return;
    if (pointer.state !== "off") pointer.stop();
    spaceError = false;
    let view: SpaceView;
    try {
      spaceLoading = !space;
      view = await ensureSpace();
    } catch (e) {
      console.error(e);
      spaceError = true;
      return;
    } finally {
      spaceLoading = false;
    }
    if (!canLeaveSky() || !map) return;
    syncSpace(view);
    flying = "out";
    mode = "space";
    skyView.style.opacity = "1";
    await tick(); // the Earth view's canvas is shown (sized) under the fading map
    map.stop();
    view.start();
    await new Promise<void>((done) =>
      view.flyFromSky(
        { ...map!.view },
        {
          duration: instant ? 0 : flightDuration(),
          onFrame: (s) => (skyView.style.opacity = String(skyOpacity(s))),
          onDone: () => {
            flying = null;
            skyView.style.opacity = "";
            updateGraduationExclusions();
            done();
          },
        },
      ),
    );
  }

  /**
   * Lands back in the sky (#37): sky button, or zooming in on "you are here". The map is set to
   * the view the flight ends on (heading as the camera's) and fades in near the ground.
   */
  function flyToSky() {
    if (flying || mode !== "space" || !space || !map) return;
    const view = space;
    flying = "in";
    skyView.style.opacity = "0";
    const target = view.flyToSky({
      duration: flightDuration(),
      onFrame: (s) => (skyView.style.opacity = String(skyOpacity(s))),
      onDone: () => {
        flying = null;
        skyView.style.opacity = "";
        view.stop();
        updateGraduationExclusions();
      },
    });
    map.setView(target);
    mode = "sky";
    map.start();
  }

  function toggleSpace() {
    if (mode === "space") flyToSky();
    else void flyToSpace();
  }

  function faceNorth() {
    if (pointer.state === "on") return;
    map?.animateTo({ azimuth: 0 });
  }

  function locate() {
    if (locating === "busy") return;
    if (!("geolocation" in navigator)) {
      locating = "error";
      return;
    }
    locating = "busy";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        place = { name: "mine", latitude: coords.latitude, longitude: coords.longitude };
        map?.setObserver(place);
        locating = "idle";
        try {
          localStorage.setItem(PLACE_KEY, JSON.stringify(place));
        } catch {
          // not persisted: acceptable
        }
      },
      () => (locating = "error"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
    );
  }

  /** Loads the catalogue and starts the map; on failure, the error screen offers a retry. */
  async function loadSky() {
    status = "loading";
    try {
      const base = import.meta.env.BASE_URL;
      const load = (file: string) =>
        fetch(`${base}data/${file}`).then((r) => {
          if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
          return r;
        });
      const [catalogBuffer, strings, constellationLines] = await Promise.all([
        load("stars.bin").then((r) => r.arrayBuffer()),
        load("star-strings.json").then((r) => r.json()),
        load("constellation-lines.json").then((r) => r.json()),
      ]);
      const stars = decodeStarCatalog(catalogBuffer, localizeStarStrings("fr", strings));
      catalog = { stars, lines: constellationLines };
      map = new SkyMap({
        canvas,
        overlay,
        stars,
        lines: constellationLines,
        constellationNames: names,
        cardinals: $_("map.cardinals").split(","),
        formatGraduation: graduationFormatter($_),
        theme: night ? { ...THEMES.red, ink: nightInk(brightness) } : THEMES.day,
        bodyNames: { Sun: $_("body.Sun"), Moon: $_("body.Moon") },
        planetNames: planetNames(),
        formatPathMark: (d) => pathMarkFormat.format(d),
        onSelect: select,
        ...(zoomFlights
          ? { onZoomPastMax: () => void flyToSpace(), onNearMaxFov: preloadSpace }
          : {}),
        onPointingDrag: (delta) => pointer.drag(delta),
        onViewChange: (v) => {
          viewAzimuth = v.azimuth;
          viewRoll = v.roll ?? 0;
        },
        describeTarget: (t) =>
          t.kind === "body"
            ? $_(`body.${t.body}` as `body.${BodyName}`)
            : t.kind === "planet"
              ? planetName(t.planet)
              : t.kind === "constellation"
                ? (names[t.abbr] ?? t.abbr)
                : starLabel(t.star),
      });
    } catch (e) {
      console.error(e);
      map?.dispose();
      map = undefined;
      status = "error";
      return false;
    }
    map.setObserver(place);
    status = "ready";
    return true;
  }

  onMount(async () => {
    if (!(await loadSky())) return;
    startSession();
  });

  /** After the first successful load: URL state (captures), HUD exclusions, live clock. */
  async function startSession() {
    if (!map) return;
    observeHud();
    const params = new URLSearchParams(location.search);
    if (params.get("night") === "1") night = true;
    const r = params.get("range");
    if (r === "48h" || r === "1y" || r === "26ky") range = r;
    const off = Number(params.get("offset"));
    if (Number.isFinite(off) && off !== 0) setOffset(off);
    const view = ["az", "alt", "fov"].map((k) => Number(params.get(k) ?? NaN));
    map.setView({
      ...(Number.isFinite(view[0]) && { azimuth: view[0] }),
      ...(Number.isFinite(view[1]) && { altitude: view[1] }),
      ...(Number.isFinite(view[2]) && { fov: view[2] }),
    });
    if (params.get("panel") === "layers") layersOpen = true; // captures
    if (params.get("panel") === "credits") creditsOpen = true; // captures
    const hip = Number(params.get("star")); // captures: ?star=<HIP> opens the star's sheet
    const star = hip ? catalog?.stars.find((s) => s.hip === hip) : undefined;
    if (star) selection = { kind: "star", star };
    // Constellation sheet and 3D view from the URL (captures): ?constellation=Ori&view3d=1
    const con = params.get("constellation");
    if (con && catalog?.lines[con]) {
      select({ kind: "constellation", abbr: con });
      if (params.get("view3d") === "1") open3d(con);
    }
    // Space view from the URL (captures): ?space=1&orbit=lon,lat,dist
    if (params.get("space") === "1") {
      await flyToSpace(true);
      const [lon = NaN, lat = NaN, dist = NaN] = (params.get("orbit") ?? "").split(",").map(Number);
      if ([lon, lat, dist].every(Number.isFinite)) space?.setOrbit({ lon, lat, dist });
    }
    clock = setInterval(() => {
      if (live) goLive();
    }, 30_000);
  }

  async function retrySky() {
    if (await loadSky()) startSession();
  }

  // --- Constellation sheet (#61)
  /** Selects from the map; a constellation hidden under the sheet is brought above it. */
  function select(s: SkySelection | null) {
    selection = s;
    if (s?.kind !== "constellation" || !map || !catalog || pointer.state !== "off") return;
    const placement = placeFigure(
      figureDirections(catalog.stars, catalog.lines, s.abbr, yearsSinceHipparcos(date)),
      date,
      place,
    );
    if (!placement || placement.visibility === "down") return;
    const next = frameAbove(placement, map.view, canvas.clientWidth / canvas.clientHeight);
    if (next) map.animateTo(next);
  }
  const constellationInfo = $derived.by(() => {
    if (!selectedConstellation || !catalog) return null;
    const abbr = selectedConstellation;
    const star = brightestStar(catalog.stars, abbr);
    const placement = placeFigure(
      figureDirections(catalog.stars, catalog.lines, abbr, yearsSinceHipparcos(date)),
      date,
      place,
    );
    return {
      abbr,
      name: names[abbr] ?? abbr,
      latin: CONSTELLATION_LATIN[abbr] ?? abbr,
      star,
      brightest: star ? { label: starLabel(star), v: star.v } : null,
      visibility: placement?.visibility ?? null,
    };
  });
  $effect(() => {
    if (status !== "ready") return;
    map?.setSelectedConstellation(selectedConstellation);
  });

  // Grid and ecliptic graduations are not written under the HUD (header, dials, time controls).
  let header = $state<HTMLElement>();
  let compass = $state<HTMLElement>();
  let bottomNav: HTMLElement;
  let globeButton = $state<HTMLElement>();
  let hudObserver: ResizeObserver | undefined;
  const hudBlocks = () =>
    [header, compass, bottomNav, globeButton].filter((el) => el !== undefined && el !== null);
  function updateGraduationExclusions() {
    const m = 4; // margin around each block, CSS px
    const rects = hudBlocks()
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0) // hidden (mini-globe in the Earth view)
      .map((r) => ({ x: r.left - m, y: r.top - m, w: r.width + 2 * m, h: r.height + 2 * m }));
    map?.setHudExclusions(rects);
    space?.setHudExclusions(rects);
  }
  function observeHud() {
    hudObserver = new ResizeObserver(updateGraduationExclusions);
    for (const el of hudBlocks()) hudObserver.observe(el);
    addEventListener("resize", updateGraduationExclusions);
  }
  // The mini-globe (#38) comes and goes (layer, view): its area is kept free of labels too.
  $effect(() => {
    const el = globeButton;
    if (!el || !hudObserver) return;
    hudObserver.observe(el);
    return () => hudObserver?.unobserve(el);
  });
  // It sits under the dials column: it moves (without resizing) when the column grows.
  $effect(() => {
    void dialsHeight;
    void globeButton;
    if (status === "ready") tick().then(updateGraduationExclusions);
  });

  // --- Mini-globe (#38): relief and lights loaded after the map (they also serve the Earth view).
  // Kept mounted while its layer is on (hidden in the Earth view and during flights), so the
  // sampled textures and per-pixel geometry survive the trips (no stall on landing).
  const globeLayer = $derived(status === "ready" && viewLayers.sky.miniGlobe);
  const showGlobe = $derived(globeLayer && mode === "sky" && !flying);
  let globeImages = $state<{ relief: ImageBitmap; lights: ImageBitmap } | null>(null);
  $effect(() => {
    if (!globeLayer || globeImages) return;
    loadEarthImages()
      // Sampling them (~15 ms on a phone) waits for an idle moment.
      .then((images) =>
        "requestIdleCallback" in window
          ? requestIdleCallback(() => (globeImages = images), { timeout: 1000 })
          : (globeImages = images),
      )
      .catch((e: unknown) => console.warn("mini-globe images", e));
  });
  let controlsHeight = $state(140);
  let dialsHeight = $state(148);
  let headerHeight = $state(90);
  /** Sheets and panels stay above the time controls, whatever their measured height. */
  const aboveControls = $derived(
    `calc(max(16px, env(safe-area-inset-bottom)) + ${controlsHeight + 8}px)`,
  );

  onDestroy(() => {
    hudObserver?.disconnect();
    removeEventListener("resize", updateGraduationExclusions);
    space?.dispose();
    pointer.stop();
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    removeEventListener("pointerup", restoreFullscreen, true);
    stopPlaying();
    clearInterval(clock);
    map?.dispose();
  });

  $effect(() => {
    const root = document.documentElement;
    root.dataset.night = night ? "red" : "";
    const ink = nightInk(brightness);
    // Android paints the browser chrome with theme-color: keep it black at night.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", night ? "#000000" : "#101b52");
    if (night) root.style.setProperty("--ast-parchment", ink);
    else root.style.removeProperty("--ast-parchment");
    map?.setTheme(night ? { ...THEMES.red, ink } : THEMES.day);
    space?.setTheme(night ? { ...THEMES.red, ink } : THEMES.day);
    space?.setMonochrome(night);
    writeSetting("asteria.night", night);
    writeSetting("asteria.nightBrightness", brightness);
  });

  $effect(() => {
    if (status !== "ready") return;
    map?.setLayers({ ...viewLayers.sky });
  });
  $effect(() => {
    space?.setLayers({ ...viewLayers.space });
  });
  $effect(() => {
    space?.setStyle(spaceStyle);
    if (urlStyle === null) writeSetting("asteria.spaceStyle", spaceStyle);
  });
  $effect(() => {
    space?.setSelection(selection);
  });
  $effect(() => {
    const sky = serializeLayers(viewLayers.sky);
    const earth = serializeLayers(viewLayers.space);
    if (urlLayers !== null) return; // capture state: never saved over the user's choice
    writeSetting(LAYERS_STORAGE_KEY.sky, sky);
    writeSetting(LAYERS_STORAGE_KEY.space, earth);
  });

  // Moon and planets are only computed within ±3000 years of J2000 (ephemeris-range.ts): beyond,
  // both views hide them, and their sheets close (#78).
  const ephemerisOk = $derived(ephemerisReliable(date));
  $effect(() => {
    if (ephemerisOk) return;
    const s = selection;
    if (s?.kind === "planet" || (s?.kind === "body" && s.body === "Moon")) selection = null;
  });
  // Planets follow the displayed date (≈ 0.3 ms for the seven on a desktop CPU).
  const planets = $derived(
    ephemerisOk ? PLANETS.map((name) => ({ name, ...bodyPosition(name, date, place) })) : null,
  );
  $effect(() => {
    if (status !== "ready") return;
    map?.setPlanets(planets);
  });
  $effect(() => {
    space?.setPlanets(planets);
  });
  $effect(() => {
    if (!showPlanets && selection?.kind === "planet") selection = null;
  });
  // Paths: ±6 months, recomputed only when the date leaves a 10-day window (the cache returns
  // the same objects otherwise, so these effects do not re-upload). Hidden on the 26 000-year
  // scale. The selected planet's path is shown with dated monthly marks, in both views.
  const pathCache = new PlanetPathCache();
  const pathsAllowed = $derived(showPlanets && range !== "26ky" && ephemerisOk);
  const selectedPath = $derived(
    selectedPlanet && pathsAllowed ? pathCache.path(selectedPlanet, date, place) : null,
  );
  $effect(() => {
    if (status !== "ready") return;
    map?.setSelectedPath(selectedPath);
  });
  $effect(() => {
    space?.setSelectedPath(selectedPath);
  });
  // Every planet's path at once (undated): the `allPaths` layer, off by default.
  const allPaths = $derived(
    viewLayers.sky.allPaths && pathsAllowed ? pathCache.get(date, place) : null,
  );
  $effect(() => {
    if (status !== "ready") return;
    map?.setPaths(allPaths);
  });

  // Sun and Moon follow the displayed date and place.
  const bodies = $derived.by(() => {
    const sun = bodyPosition("Sun", date, place);
    if (!ephemerisOk) return { sun, moon: null, phase: null };
    return { sun, moon: bodyPosition("Moon", date, place), phase: moonPhase(date) };
  });
  // Out of range both renderers hide the Moon themselves (same ephemerisReliable test): its slot
  // then holds the Sun's direction and is never drawn.
  const skyBodies = $derived({
    sun: bodies.sun,
    moon:
      bodies.moon && bodies.phase
        ? { ...bodies.moon, illumination: bodies.phase.illumination }
        : { ...bodies.sun, illumination: 0 },
  });
  $effect(() => {
    if (!space) return;
    space.setObserver(place);
    space.setDate(date);
    space.setBodies(skyBodies);
  });
  $effect(() => {
    if (status !== "ready") return;
    map?.setBodies(skyBodies);
  });

  // --- Info panels (star, Sun/Moon, planet): rows of label/value, labels from the catalogue.
  const KM_PER_AU = 149_597_870.7;
  const fixed = (x: number, digits: number) => x.toFixed(digits);
  const positionRows = (b: { altitude: number; azimuth: number; ra: number; dec: number }) => [
    { label: $_("body.altitude"), value: `${fixed(b.altitude, 1)}°` },
    { label: $_("body.azimuth"), value: `${fixed(b.azimuth, 1)}°` },
    { label: $_("data.ra"), value: formatRa(b.ra) },
    { label: $_("data.dec"), value: formatDec(b.dec) },
  ];

  /** The selected star's ICRS position at the displayed date (proper motion since J1991.25, #78). */
  const selectedNow = $derived(
    selected ? propagateStar(selected, yearsSinceHipparcos(date)) : null,
  );
  const starRows = $derived.by((): InfoRow[] => {
    if (!selected || !selectedNow) return [];
    // The map hands back the decoded catalogue records, which carry the reference distance (#75).
    const record = selected as CatalogRecord;
    const d = starDistance(record);
    const source = !d
      ? ""
      : record.distanceSource === "literature"
        ? (record.distanceReference ?? "")
        : record.distanceSource
          ? $_(`star.distanceSource.${record.distanceSource}`)
          : $_("star.distanceSource.hipparcos");
    const hint = d?.errorLy != null ? { err: d.errorLy, source } : null;
    const rows: InfoRow[] = [
      { label: $_("data.ra"), value: formatRa(selectedNow.ra) },
      { label: $_("data.dec"), value: formatDec(selectedNow.dec) },
      { label: $_("data.v"), value: fixed(selected.v, 2) },
    ];
    if (selected.bv !== undefined)
      rows.push({ label: $_("data.bv"), value: fixed(selected.bv, 2) });
    rows.push({
      label: $_("data.dist"),
      value: !d
        ? $_("star.unknownDistance")
        : d.approx
          ? $_("star.distanceApprox", { values: { ly: d.ly } })
          : $_("star.distance", { values: { ly: d.ly } }),
      title: hint
        ? $_(d?.approx ? "star.distanceApprox.hint" : "star.distance.hint", { values: hint })
        : d
          ? source
          : (selected.plx ?? 0) > 0
            ? $_("star.unknownDistance.hint")
            : undefined,
    });
    return rows;
  });

  const bodyInfo = $derived.by(() => {
    if (!selectedBody) return null;
    const b = selectedBody === "Sun" ? bodies.sun : bodies.moon;
    if (!b) return null;
    return {
      name: $_(`body.${selectedBody}` as `body.${BodyName}`),
      rows: [
        ...positionRows(b),
        {
          label: $_("data.dist"),
          value:
            selectedBody === "Sun"
              ? $_("body.distanceAu", {
                  values: { au: Math.round((b.distanceKm / KM_PER_AU) * 1000) / 1000 },
                })
              : $_("body.distance", { values: { km: Math.round(b.distanceKm) } }),
        },
      ],
    };
  });

  const LIGHT_KM_PER_MIN = 299_792.458 * 60;
  const planetInfo = $derived.by(() => {
    if (!selectedPlanet) return null;
    const p = planets?.find((q) => q.name === selectedPlanet);
    if (!p) return null;
    const con = constellationOf(p.ra, p.dec);
    const minutes = Math.round(p.distanceKm / LIGHT_KM_PER_MIN);
    const light =
      minutes < 60
        ? $_("planet.lightTime", { values: { min: minutes } })
        : $_("planet.lightTimeHours", {
            values: { h: Math.floor(minutes / 60), min: minutes % 60 },
          });
    return {
      name: planetName(p.name),
      con: { abbr: con, name: names[con] ?? con, latin: CONSTELLATION_LATIN[con] ?? con },
      rows: [
        { label: $_("planet.magnitude"), value: fixed(p.magnitude, 1) },
        ...positionRows(p),
        {
          label: $_("data.dist"),
          value: $_("planet.distance", {
            values: { au: Math.round((p.distanceKm / KM_PER_AU) * 100) / 100 },
          }),
        },
        { label: "", value: light },
      ],
    };
  });

  const time = $derived.by(() => {
    if (range === "26ky") {
      const y = yearLabel(date.getUTCFullYear());
      return $_(y.key, { values: { year: y.year } });
    }
    return date.toLocaleString(lang, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  });
  const relative = $derived.by(() => {
    if (live) return "";
    const p = offsetParts(offset, range);
    if (p.years !== undefined)
      return $_("time.offset.years", { values: { sign: p.sign, y: p.years } });
    if (p.days) return $_("time.offset.days", { values: { sign: p.sign, d: p.days, h: p.hours } });
    return $_("time.offset.short", { values: { sign: p.sign, h: p.hours, m: p.minutes } });
  });
  const HINTS: Record<TimeRange, string> = {
    "48h": "time.hint.sidereal",
    "1y": "time.hint.year",
    "26ky": "time.hint.precession",
  };
  const hint = $derived(playing ? $_(HINTS[range]) : "");
  /** The selected star, Sun, Moon or planet is below the horizon (seen through the Earth, #65). */
  const belowHorizon = $derived.by(() => {
    if (selectedNow) return altitudeOf(selectedNow.ra, selectedNow.dec, date, place) < 0;
    if (selectedBody)
      return ((selectedBody === "Sun" ? bodies.sun : bodies.moon)?.altitude ?? 0) < 0;
    if (selectedPlanet) return (planets?.find((q) => q.name === selectedPlanet)?.altitude ?? 0) < 0;
    return false;
  });
  const coords = $derived(
    $_("geo.coords", {
      values: {
        lat: Math.abs(place.latitude).toFixed(2),
        ns: $_(place.latitude >= 0 ? "geo.n" : "geo.s"),
        lon: Math.abs(place.longitude).toFixed(2),
        ew: $_(place.longitude >= 0 ? "geo.e" : "geo.w"),
      },
    }),
  );
  const toastTop = $derived(`calc(max(16px, env(safe-area-inset-top)) + ${headerHeight + 16}px)`);
</script>

<!-- During a flight (#37) both views are shown: the map on top, fading, and not touchable. -->
<div
  class="view"
  class:hidden={mode !== "sky" && !flying}
  class:fading={flying !== null}
  bind:this={skyView}
>
  <canvas class="sky" bind:this={canvas}></canvas>
  <canvas class="overlay" bind:this={overlay}></canvas>
</div>
<div class="view" class:hidden={mode !== "space" && !flying}>
  <canvas class="sky" bind:this={spaceCanvas}></canvas>
  <canvas class="overlay" bind:this={spaceOverlay}></canvas>
</div>

<SkyHeader
  bind:element={header}
  bind:height={headerHeight}
  title={mode === "sky" ? `#02 // ${$_("map.title")}` : `#03 // ${$_("space.title")}`}
  loading={spaceLoading}
  place={place.name === "mine" ? $_("place.mine") : $_("place.paris")}
  {coords}
  {time}
  {live}
  {relative}
  {locating}
/>

<DialsColumn
  bind:element={compass}
  bind:height={dialsHeight}
  {mode}
  fullscreen={fullscreenAvailable ? fullscreenEnv.active : null}
  {locating}
  pointing={pointer.state === "on" || pointer.state === "waiting"}
  northDisabled={pointer.state === "on"}
  rotation={-viewAzimuth - viewRoll}
  realistic={spaceStyle === "realistic"}
  onfullscreen={toggleFullscreen}
  onview={toggleSpace}
  onlocate={locate}
  onnorth={faceNorth}
  onpoint={() => pointer.toggle()}
  onstyle={() => (spaceStyle = spaceStyle === "realistic" ? "engraving" : "realistic")}
/>

{#if globeLayer}
  <MiniGlobe
    hidden={!showGlobe}
    bind:element={globeButton}
    top={`calc(max(16px, env(safe-area-inset-top)) + ${dialsHeight + 12}px)`}
    images={globeImages}
    {place}
    sun={bodies.sun}
    {date}
    style={spaceStyle}
    theme={night
      ? { ink: nightInk(brightness), base: THEMES.red.ground }
      : {
          ink: THEMES.day.ink,
          base: THEMES.day.ground,
        }}
    monochrome={night}
    onopen={() => void flyToSpace()}
  />
{/if}

{#if pointer.state === "waiting"}
  <p class="hud toast" style:top={toastTop} role="status">{$_("pointing.hint")}</p>
{:else if pointer.state === "on" && pointer.relativeNotice}
  <button class="hud toast" style:top={toastTop} onclick={() => (pointer.relativeNotice = false)}>
    {$_("pointing.relative")}<span class="dismiss">{$_("pointing.dismiss")}</span>
  </button>
{:else if pointer.state === "failed" && pointer.error}
  <button
    class="hud toast"
    style:top={toastTop}
    aria-live="assertive"
    onclick={() => (pointer.state = "off")}
  >
    {$_(failureMessageKey(pointer.error, pointer.isBrave))}<span class="dismiss"
      >{$_("pointing.dismiss")}</span
    >
  </button>
{:else if spaceError}
  <div class="hud toast notice" style:top={toastTop} role="alert">
    <p>{$_("space.loadError")}</p>
    <div class="actions">
      <button class="action" onclick={toggleSpace}>{$_("app.retry")}</button>
      <button
        class="action"
        onclick={() => (spaceError = false)}
        aria-label={$_("star.close")}
        title={$_("star.close")}>×</button
      >
    </div>
  </div>
{/if}

{#if status !== "ready"}
  <div class="status" role={status === "error" ? "alert" : "status"}>
    <p>{status === "error" ? $_("map.error") : $_("map.loading")}</p>
    {#if status === "error"}
      <button class="action frame" onclick={retrySky}>{$_("app.retry")}</button>
    {/if}
  </div>
{/if}

{#if selected}
  <InfoPanel
    name={starLabel(selected)}
    {belowHorizon}
    constellation={{
      name: names[selected.con] ?? selected.con,
      latin: CONSTELLATION_LATIN[selected.con] ?? selected.con,
      onopen: () => (selection = { kind: "constellation", abbr: selected.con }),
    }}
    rows={starRows}
    bottom={aboveControls}
    onclose={() => (selection = null)}
  >
    {#snippet meta()}
      {#if selected.bayer}{`${hipLabel(selected.hip)} // `}<Designation
          text={selected.bayer}
        />{:else}{hipLabel(selected.hip)}{/if}
    {/snippet}
  </InfoPanel>
{/if}

{#if bodyInfo}
  <InfoPanel
    name={bodyInfo.name}
    {belowHorizon}
    rows={bodyInfo.rows}
    bottom={aboveControls}
    onclose={() => (selection = null)}
  >
    {#snippet meta()}
      {#if selectedBody === "Moon" && bodies.phase}
        {$_("moon.illumination", { values: { pct: Math.round(bodies.phase.illumination * 100) } })}
        · {bodies.phase.waxing ? $_("moon.waxing") : $_("moon.waning")}
      {:else}
        {$_("sun.kind")}
      {/if}
    {/snippet}
    {#if selectedBody === "Sun"}<p class="warn">{$_("sun.warning")}</p>{/if}
  </InfoPanel>
{/if}

{#if planetInfo}
  {@const info = planetInfo}
  <InfoPanel
    name={info.name}
    {belowHorizon}
    constellation={{
      name: info.con.name,
      latin: info.con.latin,
      onopen: () => (selection = { kind: "constellation", abbr: info.con.abbr }),
    }}
    rows={info.rows}
    bottom={aboveControls}
    onclose={() => (selection = null)}
  >
    {#snippet meta()}{$_("planet.kind")}{/snippet}
  </InfoPanel>
{/if}

{#if constellationInfo}
  {@const info = constellationInfo}
  {#key info.abbr}
    <ConstellationSheet
      abbr={info.abbr}
      name={info.name}
      latin={info.latin}
      brightest={info.brightest}
      visibility={info.visibility}
      daylight={bodies.sun.altitude > -6}
      top={`calc(max(16px, env(safe-area-inset-top)) + ${Math.max(headerHeight, dialsHeight) + 8}px)`}
      bottom={aboveControls}
      onclose={() => (selection = null)}
      onstar={info.star
        ? () => info.star && (selection = { kind: "star", star: info.star })
        : undefined}
      on3d={() => open3d(info.abbr)}
    />
  {/key}
{/if}

{#if view3d && Constellation3D}
  {@const v = view3d}
  <Constellation3D
    abbr={v.abbr}
    name={names[v.abbr] ?? v.abbr}
    stars={v.stars}
    lines={v.lines}
    {date}
    observer={place}
    startView={v.view}
    theme={night ? { ink: nightInk(brightness), sky: THEMES.red.sky } : THEMES.day}
    monochrome={night}
    onclose={close3d}
  />
{/if}

{#if creditsOpen}
  <!-- Loaded on demand: the credits table stays out of the start-up bundle (#66). -->
  {#await import("./components/Credits.svelte") then { default: Credits }}
    <Credits
      onclose={() => {
        creditsOpen = false;
        layersButton?.focus();
      }}
    />
  {/await}
{/if}

<nav
  class="hud bottom"
  bind:this={bottomNav}
  style:--controls-h={`${controlsHeight}px`}
  style:--dials-h={`${dialsHeight}px`}
>
  {#if layersOpen}
    <LayersPanel
      view={mode}
      layers={viewLayers[mode]}
      onchange={setLayer}
      onclose={() => (layersOpen = false)}
      oncredits={() => {
        layersOpen = false;
        creditsOpen = true;
      }}
      toggle={layersButton}
    />
  {/if}
  <div class="controls" bind:clientHeight={controlsHeight}>
    <!-- Shown during playback, when the scrubber's bubble rises above it: kept clear (#80). -->
    {#if hint}<p class="hint" style:margin-bottom={`${BUBBLE_RISE - 8}px`}>{hint}</p>{/if}
    <TimeScrubber
      {range}
      {offset}
      {playing}
      {relative}
      target={time}
      speedKey={RANGES[range].speeds[speedIndex]!.key}
      onscrub={setOffset}
      ontoggle={togglePlay}
      onspeed={cycleSpeed}
    />
    <div class="row">
      <div class="group frame">
        <button onclick={cycleRange} title={$_("time.rangeChange")}
          ><Icon name="range" />{$_(`time.range.${range}`)}</button
        >
        <button aria-pressed={live} onclick={goLive} title={$_("time.backToNow")}
          ><Icon name="now" />{$_("time.now")}</button
        >
      </div>
      <div class="group frame">
        <button
          bind:this={layersButton}
          aria-expanded={layersOpen}
          aria-controls="layers-panel"
          onclick={() => (layersOpen = !layersOpen)}
          class="icon"
          aria-label={$_("layers.open")}
          title={$_("layers.open")}><Icon name="layers" size={18} /></button
        >

        <button
          aria-pressed={night}
          onclick={() => (night = !night)}
          class="icon"
          aria-label={$_("night.toggle")}
          title={$_("night.toggle")}><Icon name="night" size={18} /></button
        >
      </div>
    </div>
    {#if night}
      <label class="group frame dim">
        <span>{$_("night.brightness")}</span>
        <input
          class="slider"
          type="range"
          min={MIN_DIM}
          max="1"
          step="0.05"
          bind:value={brightness}
        />
      </label>
    {/if}
  </div>
</nav>

<style>
  canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  .overlay {
    pointer-events: none;
  }
  .hud {
    position: fixed;
    z-index: 2;
  }
  .warn {
    margin: 8px 0 0;
    font-size: 10px;
    line-height: 1.5;
    color: var(--ast-fg);
  }
  /* Hidden but laid out: a view keeps its size and drawing buffer, so the Earth view is ready
     (sized, compiled) before a flight shows it (#37). Hidden elements take no input. */
  .view.hidden {
    visibility: hidden;
  }
  /* Above the Earth view while it fades (canvases are fixed: stacked by this context). */
  .view.fading {
    position: relative;
    z-index: 1;
    pointer-events: none;
  }
  /* Left of the dials column (44 px + 12 px gap), below the header. */
  .toast {
    left: max(16px, env(safe-area-inset-left));
    right: calc(max(16px, env(safe-area-inset-right)) + 56px);
    margin: 0 auto;
    max-width: 320px;
    padding: 10px 12px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 88%, transparent);
    font: 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg);
    text-align: center;
    text-transform: none;
    letter-spacing: 0;
    height: auto;
    display: block;
  }
  .toast .dismiss {
    display: block;
    margin-top: 6px;
    font-size: 10px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .notice p {
    margin: 0 0 8px;
  }
  .notice .actions {
    display: flex;
    justify-content: center;
    gap: 6px;
  }
  .action {
    border: 1px solid var(--ast-hairline);
    color: var(--ast-fg);
    justify-content: center;
    min-width: 44px;
  }
  .status {
    position: fixed;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    margin: 0;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .status p {
    margin: 0;
  }
  .bottom {
    left: max(16px, env(safe-area-inset-left));
    right: max(16px, env(safe-area-inset-right));
    bottom: max(16px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .group {
    display: flex;
    flex-wrap: wrap;
    max-width: 100%;
  }
  button {
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 0;
    border-right: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 14px;
    cursor: pointer;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
    max-width: 420px;
    justify-content: space-between;
  }
  .row .group {
    flex-wrap: nowrap;
  }
  .row button {
    padding: 0 7px;
    white-space: nowrap;
  }
  /* Icon-only toggles: 44 × 44 px touch targets */
  .row button.icon {
    padding: 0;
    min-width: 44px;
    justify-content: center;
  }
  .row button.icon:not([aria-pressed="true"], [aria-expanded="true"]) {
    color: var(--ast-fg);
  }
  .hint {
    max-width: 420px;
    margin: 0;
    padding: 8px 12px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 85%, transparent);
    font: 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .dim {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  /* Fully themed slider: native tracks are white/grey, which would break night vision */
  .slider {
    appearance: none;
    width: 100px;
    height: 20px;
    background: transparent;
  }
  .slider::-webkit-slider-runnable-track {
    height: 1px;
    background: var(--ast-fg);
  }
  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -6px;
    border: 0;
    border-radius: 0;
    background: var(--ast-fg);
  }
  .slider::-moz-range-track {
    height: 1px;
    background: var(--ast-fg);
  }
  .slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: 0;
    border-radius: 0;
    background: var(--ast-fg);
  }
  .group button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .group button:last-child {
    border-right: 0;
  }
  button[aria-pressed="true"],
  button[aria-expanded="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
</style>
