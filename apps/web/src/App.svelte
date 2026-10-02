<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import {
    SkyMap,
    SpaceView,
    type BodyName,
    type CatalogStar,
    type SkyLayers,
    type SkySelection,
    type SpaceStyle,
    isSpaceStyle,
    DEFAULT_SKY_LAYERS,
    DEFAULT_SPACE_LAYERS,
  } from "@asteria/sky-renderer";
  import {
    PLANETS,
    bodyPosition,
    constellationOf,
    moonPhase,
    type Planet,
  } from "@asteria/astro-core";
  import { CONSTELLATION_LATIN, constellationNames, localizeStarStrings } from "@asteria/content";
  import { decodeCoastlines, decodeStarCatalog } from "@asteria/catalog";
  import { formatDec, formatRa, parallaxToLightYears } from "./lib/format";
  import { MIN_DIM, nightInk } from "./lib/night";
  import { readSetting, writeSetting } from "./lib/storage";
  import { PlanetPathCache } from "./lib/planet-paths";
  import {
    devicePointing,
    pointingToView,
    quaternionPointing,
    smooth,
    type SkyPointing,
  } from "./lib/orientation";
  import {
    absoluteAlpha,
    classifyOrientationEvent,
    decide,
    failureMessageKey,
    newProbe,
    querySensorPermissions,
    preflight,
    recordReading,
    wrap360,
    type OrientationLike,
    type PointingFailure,
    type PointingMode,
    type ProbeState,
  } from "./lib/sensors";
  import {
    FULLSCREEN_STORAGE_KEY,
    enterFullscreen,
    exitFullscreen,
    readFullscreenEnvironment,
    shouldRestoreFullscreen,
    showFullscreenButton,
  } from "./lib/fullscreen";
  import Icon from "./components/Icon.svelte";
  import TimeScrubber from "./components/TimeScrubber.svelte";
  import LayersPanel from "./components/LayersPanel.svelte";
  import ConstellationSheet from "./components/ConstellationSheet.svelte";
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
    clampOffset,
    dateAt,
    offsetParts,
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
  let space = $state<SpaceView | undefined>();
  let mode = $state<"sky" | "space">("sky");
  let spaceLoading = $state(false);
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
  let viewAzimuth = $state(180);
  let viewRoll = $state(0);
  let pointing = $state<"off" | "waiting" | "on" | "failed">("off");
  let place = $state(loadPlace());
  let locating = $state<"idle" | "busy" | "error">("idle");
  let clock: ReturnType<typeof setInterval>;
  const names = constellationNames("fr");
  // One formatter for the ~80 path marks (toLocaleDateString builds a new one on each call).
  const pathMarkFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const planetName = (p: Planet) => $_(`planet.${p}`);
  const planetNames = () =>
    Object.fromEntries(PLANETS.map((p) => [p, planetName(p)])) as Record<Planet, string>;

  const PLACE_KEY = "asteria.place";

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
  }

  function togglePlay() {
    if (playing) return stopPlaying();
    if (offset >= RANGES[range].half) setOffset(-RANGES[range].half); // restart from the beginning
    playing = true;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); // cap: a background tab must not jump
      last = now;
      setOffset(offset + RANGES[range].speeds[speedIndex]!.value * dt);
      if (offset >= RANGES[range].half) return stopPlaying();
      playFrame = requestAnimationFrame(tick);
    };
    playFrame = requestAnimationFrame(tick);
  }

  function stopPlaying() {
    cancelAnimationFrame(playFrame);
    playing = false;
  }

  // --- Sensor pointing (#45, #59): sources and failure causes in lib/sensors.ts and ADR-0003
  // (docs/adr/0003-visee-capteurs-web.md).
  type Vec = [number, number, number];
  let smoothed: { forward: Vec; up: Vec } | null = null;
  let pointingMode = $state<PointingMode>("absolute");
  let pointingError = $state<PointingFailure | null>(null);
  let relativeNotice = $state(false);
  /** Relative mode: degrees added to the sensor azimuth (NaN until the first reading). */
  let headingOffset = NaN;
  let probe: ProbeState | null = null;
  let probeTimer: ReturnType<typeof setInterval> | undefined;
  /** Which source drives the view once an absolute reading came in. */
  let lockedSource: "event" | "sensor" | null = null;
  let orientationSensor: GenericOrientationSensor | null = null;
  const isBrave = "brave" in navigator;
  const screenAngle = () => screen.orientation?.angle ?? 0;

  /** Generic Sensor API (Chromium), not in lib.dom. */
  interface GenericOrientationSensor extends EventTarget {
    quaternion: number[] | null;
    start(): void;
    stop(): void;
  }
  type SensorConstructor = new (options: {
    frequency: number;
    referenceFrame: "device" | "screen";
  }) => GenericOrientationSensor;

  function applyPointing(raw: { forward: Vec; up: Vec }) {
    smoothed = {
      forward: smooth(smoothed?.forward ?? null, raw.forward, 0.25),
      up: smooth(smoothed?.up ?? null, raw.up, 0.25),
    };
    const view: SkyPointing = pointingToView(smoothed.forward, smoothed.up);
    if (pointingMode === "relative") {
      // Keep the map's current heading when the relative mode starts; the finger shifts it.
      if (Number.isNaN(headingOffset)) headingOffset = viewAzimuth - view.azimuth;
      view.azimuth = wrap360(view.azimuth + headingOffset);
    }
    map?.setView(view);
  }

  function onOrientation(e: DeviceOrientationEvent) {
    const reading = e as unknown as OrientationLike;
    const kind = classifyOrientationEvent(reading);
    if (kind === "absolute") lockedSource ??= "event";
    if (pointing === "waiting" && probe) {
      recordReading(probe, kind, performance.now());
      evaluateProbe();
    }
    if (pointing !== "on" || lockedSource === "sensor" || kind === "empty") return;
    if (kind === "absolute" && pointingMode === "relative") {
      // A compass woke up late: switch to the true heading.
      pointingMode = "absolute";
      relativeNotice = false;
      smoothed = null;
    }
    if (pointingMode === "absolute" && kind !== "absolute") return;
    const alpha = kind === "absolute" ? absoluteAlpha(reading) : kind === "tilt" ? 0 : e.alpha!;
    applyPointing(devicePointing(alpha, e.beta!, e.gamma!, screenAngle()));
  }

  // "deviceorientationabsolute" is not in lib.dom's event map: listen through a generic handler.
  const onOrientationEvent = (e: Event) => onOrientation(e as DeviceOrientationEvent);

  /** AbsoluteOrientationSensor, when the browser has it: a second chance if events are empty. */
  function startOrientationSensor(): boolean {
    const Sensor = (window as unknown as { AbsoluteOrientationSensor?: SensorConstructor })
      .AbsoluteOrientationSensor;
    if (!Sensor || !probe) return false;
    try {
      const sensor = new Sensor({ frequency: 60, referenceFrame: "device" });
      sensor.addEventListener("reading", () => {
        if (!sensor.quaternion) return;
        lockedSource ??= "sensor";
        if (pointing === "waiting" && probe) {
          probe.sensor = "active";
          recordReading(probe, "absolute", performance.now());
          evaluateProbe();
        }
        if (pointing === "on" && lockedSource === "sensor")
          applyPointing(quaternionPointing(sensor.quaternion, screenAngle()));
      });
      sensor.addEventListener("error", (e) => {
        const name = (e as Event & { error?: DOMException }).error?.name ?? "Error";
        stopOrientationSensor();
        if (probe) {
          probe.sensor = "error";
          probe.sensorError = name;
          evaluateProbe();
        }
        if (pointing === "on" && lockedSource === "sensor")
          failPointing(name === "NotAllowedError" ? "denied" : "silent");
      });
      sensor.start();
      orientationSensor = sensor;
      return true;
    } catch (e) {
      // SecurityError (permissions policy) or ReferenceError: the events remain.
      probe.sensorError = e instanceof DOMException ? e.name : "Error";
      return false;
    }
  }

  function stopOrientationSensor() {
    orientationSensor?.stop();
    orientationSensor = null;
  }

  function evaluateProbe() {
    if (pointing !== "waiting" || !probe) return;
    const decision = decide(probe, performance.now());
    if (decision.kind === "wait") return;
    clearInterval(probeTimer);
    if (decision.kind === "fail") return failPointing(decision.reason);
    pointingMode = decision.mode;
    relativeNotice = decision.mode === "relative";
    if (decision.mode === "relative") lockedSource = "event";
    if (lockedSource === "event") stopOrientationSensor();
    probe = null;
    pointing = "on";
  }

  async function togglePointing() {
    if (pointing === "on" || pointing === "waiting") return stopPointing();
    pointingError = null;
    const early = preflight({
      secure: isSecureContext,
      orientationEvents: "DeviceOrientationEvent" in window,
      absoluteSensor: "AbsoluteOrientationSensor" in window,
    });
    if (early) return failPointing(early);
    // iOS Safari asks for permission; Android browsers do not.
    const request = (
      DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    ).requestPermission;
    if (request && (await request().catch(() => "denied")) !== "granted")
      return failPointing("denied");
    smoothed = null;
    headingOffset = NaN;
    lockedSource = null;
    pointingMode = "absolute";
    relativeNotice = false;
    const current = newProbe(performance.now());
    probe = current;
    pointing = "waiting";
    map?.setPointing(true);
    addEventListener("deviceorientationabsolute", onOrientationEvent);
    addEventListener("deviceorientation", onOrientationEvent);
    if (startOrientationSensor()) current.sensor = "starting";
    probeTimer = setInterval(evaluateProbe, 250);
    const verdict = await querySensorPermissions();
    if (probe === current && pointing === "waiting") {
      current.permission = verdict;
      evaluateProbe();
    }
  }

  function failPointing(reason: PointingFailure) {
    stopPointing();
    pointingError = reason;
    pointing = "failed";
  }

  function stopPointing() {
    clearInterval(probeTimer);
    removeEventListener("deviceorientationabsolute", onOrientationEvent);
    removeEventListener("deviceorientation", onOrientationEvent);
    stopOrientationSensor();
    probe = null;
    relativeNotice = false;
    map?.setPointing(false);
    pointing = "off";
  }

  /** Relative mode: a one-finger horizontal drag shifts the heading. */
  function onPointingDrag(deltaAzimuth: number) {
    if (pointing !== "on" || pointingMode !== "relative" || Number.isNaN(headingOffset)) return;
    headingOffset = wrap360(headingOffset + deltaAzimuth);
  }

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

  async function toggleSpace() {
    if (mode === "space") {
      mode = "sky";
      space?.stop();
      return;
    }
    if (pointing !== "off") stopPointing();
    if (!space && catalog) {
      spaceLoading = true;
      try {
        const base = import.meta.env.BASE_URL;
        const image = (file: string) =>
          fetch(`${base}data/earth/${file}`)
            .then((r) => r.blob())
            .then((b) => createImageBitmap(b));
        const [relief, lights, coast] = await Promise.all([
          image("relief.webp"),
          image("lights.webp"),
          fetch(`${base}data/earth/coastlines.bin`).then((r) => r.arrayBuffer()),
        ]);
        space = new SpaceView({
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
          style: spaceStyle,
          monochrome: night,
          loadTexture: (name) =>
            fetch(`${base}data/space/${name}.webp`)
              .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.statusText))))
              .then((b) => createImageBitmap(b)),
        });
      } catch (e) {
        console.error(e);
        return;
      } finally {
        spaceLoading = false;
      }
    }
    if (!space) return;
    space.setObserver(place);
    space.setDate(date);
    space.setBodies({
      sun: bodies.sun,
      moon: { ...bodies.moon, illumination: bodies.phase.illumination },
    });
    space.setPlanets(planets);
    space.setLayers({ ...viewLayers.space });
    space.setSelectedPath(selectedPath);
    space.focusObserver(4);
    mode = "space";
    space.start();
  }

  function faceNorth() {
    if (pointing === "on") return;
    map?.animateTo({ azimuth: 0 });
  }

  function locate() {
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

  onMount(async () => {
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
        onPointingDrag,
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
                : (t.star.name ?? t.star.bayer ?? `HIP ${t.star.hip}`),
      });
      map.setObserver(place);
      status = "ready";
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
      // Space view from the URL (captures): ?space=1&orbit=lon,lat,dist
      if (params.get("space") === "1") {
        await toggleSpace();
        const [lon = NaN, lat = NaN, dist = NaN] = (params.get("orbit") ?? "")
          .split(",")
          .map(Number);
        if ([lon, lat, dist].every(Number.isFinite)) space?.setOrbit({ lon, lat, dist });
      }
      clock = setInterval(() => {
        if (live) goLive();
      }, 30_000);
    } catch (e) {
      console.error(e);
      status = "error";
    }
  });

  // --- Constellation sheet (#61)
  /** Selects from the map; a constellation hidden under the sheet is brought above it. */
  function select(s: SkySelection | null) {
    selection = s;
    if (s?.kind !== "constellation" || !map || !catalog || pointing !== "off") return;
    const placement = placeFigure(
      figureDirections(catalog.stars, catalog.lines, s.abbr),
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
      figureDirections(catalog.stars, catalog.lines, abbr),
      date,
      place,
    );
    return {
      abbr,
      name: names[abbr] ?? abbr,
      latin: CONSTELLATION_LATIN[abbr] ?? abbr,
      star,
      brightest: star ? { label: star.name ?? star.bayer ?? `HIP ${star.hip}`, v: star.v } : null,
      visibility: placement?.visibility ?? null,
    };
  });
  $effect(() => {
    if (status !== "ready") return;
    map?.setSelectedConstellation(selectedConstellation);
  });

  // Grid and ecliptic graduations are not written under the HUD (header, dials, time controls).
  let header: HTMLElement;
  let compass: HTMLElement;
  let bottomNav: HTMLElement;
  let hudObserver: ResizeObserver | undefined;
  function updateGraduationExclusions() {
    const m = 4; // margin around each block, CSS px
    map?.setHudExclusions(
      [header, compass, bottomNav].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left - m, y: r.top - m, w: r.width + 2 * m, h: r.height + 2 * m };
      }),
    );
  }
  function observeHud() {
    hudObserver = new ResizeObserver(updateGraduationExclusions);
    for (const el of [header, compass, bottomNav]) hudObserver.observe(el);
    addEventListener("resize", updateGraduationExclusions);
  }
  let controlsHeight = $state(140);
  let dialsHeight = $state(148);
  let headerHeight = $state(90);

  onDestroy(() => {
    hudObserver?.disconnect();
    removeEventListener("resize", updateGraduationExclusions);
    space?.dispose();
    stopPointing();
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

  // Planets follow the displayed date (≈ 0.3 ms for the seven on a desktop CPU).
  const planets = $derived(PLANETS.map((name) => ({ name, ...bodyPosition(name, date, place) })));
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
  const pathsAllowed = $derived(showPlanets && range !== "26ky");
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
    const moon = bodyPosition("Moon", date, place);
    return { sun, moon, phase: moonPhase(date) };
  });
  $effect(() => {
    if (!space) return;
    space.setObserver(place);
    space.setDate(date);
    space.setBodies({
      sun: bodies.sun,
      moon: { ...bodies.moon, illumination: bodies.phase.illumination },
    });
  });
  $effect(() => {
    if (status !== "ready") return;
    map?.setBodies({
      sun: bodies.sun,
      moon: { ...bodies.moon, illumination: bodies.phase.illumination },
    });
  });
  const KM_PER_AU = 149_597_870.7;
  const bodyInfo = $derived.by(() => {
    if (!selectedBody) return null;
    const b = selectedBody === "Sun" ? bodies.sun : bodies.moon;
    return {
      name: $_(`body.${selectedBody}` as `body.${BodyName}`),
      lines: [
        `${$_("body.altitude").padEnd(8)} ${b.altitude.toFixed(1)}°`,
        `${$_("body.azimuth").padEnd(8)} ${b.azimuth.toFixed(1)}°`,
        `RA       ${formatRa(b.ra)}`,
        `DEC      ${formatDec(b.dec)}`,
        `DIST     ${
          selectedBody === "Sun"
            ? $_("body.distanceAu", {
                values: { au: Math.round((b.distanceKm / KM_PER_AU) * 1000) / 1000 },
              })
            : $_("body.distance", { values: { km: Math.round(b.distanceKm) } })
        }`,
      ].join("\n"),
    };
  });

  const LIGHT_KM_PER_MIN = 299_792.458 * 60;
  const planetInfo = $derived.by(() => {
    if (!selectedPlanet) return null;
    const p = planets.find((q) => q.name === selectedPlanet)!;
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
      con: { abbr: con, name: names[con], latin: CONSTELLATION_LATIN[con] },
      lines: [
        `${$_("planet.magnitude").padEnd(9)} ${p.magnitude.toFixed(1)}`,
        `${$_("body.altitude").padEnd(9)} ${p.altitude.toFixed(1)}°`,
        `${$_("body.azimuth").padEnd(9)} ${p.azimuth.toFixed(1)}°`,
        `RA        ${formatRa(p.ra)}`,
        `DEC       ${formatDec(p.dec)}`,
        `DIST      ${$_("planet.distance", {
          values: { au: Math.round((p.distanceKm / KM_PER_AU) * 100) / 100 },
        })}`,
        `          ${light}`,
      ].join("\n"),
    };
  });

  const time = $derived(
    range === "26ky"
      ? $_("time.year", { values: { year: date.getUTCFullYear() } })
      : date.toLocaleString("fr-FR", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
  );
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
  const distance = $derived(selected ? parallaxToLightYears(selected.plx) : null);
  /** The selected star, Sun, Moon or planet is below the horizon (seen through the Earth, #65). */
  const belowHorizon = $derived.by(() => {
    if (selected) return altitudeOf(selected.ra, selected.dec, date, place) < 0;
    if (selectedBody) return (selectedBody === "Sun" ? bodies.sun : bodies.moon).altitude < 0;
    if (selectedPlanet) return (planets.find((q) => q.name === selectedPlanet)?.altitude ?? 0) < 0;
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
</script>

<div class="view" class:hidden={mode !== "sky"}>
  <canvas class="sky" bind:this={canvas}></canvas>
  <canvas class="overlay" bind:this={overlay}></canvas>
</div>
<div class="view" class:hidden={mode !== "space"}>
  <canvas class="sky" bind:this={spaceCanvas}></canvas>
  <canvas class="overlay" bind:this={spaceOverlay}></canvas>
</div>

<header class="hud top" bind:this={header} bind:clientHeight={headerHeight}>
  <p class="meta">
    {mode === "sky" ? `#02 // ${$_("map.title")}` : `#03 // ${$_("space.title")}`}
    {#if spaceLoading}· {$_("space.loading")}{/if}
  </p>
  <button class="where" onclick={locate} title={$_("place.locate")}>
    {place.name === "mine" ? $_("place.mine") : $_("place.paris")} ⌖
  </button>
  <p class="when">
    {coords} · {time}
    {#if live}<span class="live">● {$_("time.live")}</span>{:else}<span class="live"
        >{relative}</span
      >{/if}
  </p>
  {#if locating !== "idle"}
    <p class="meta">{locating === "busy" ? $_("place.locating") : $_("place.locateError")}</p>
  {/if}
</header>

<div class="hud compass" bind:this={compass} bind:clientHeight={dialsHeight}>
  {#if fullscreenAvailable}
    <button
      class="dial"
      onclick={toggleFullscreen}
      aria-pressed={fullscreenEnv.active}
      aria-label={fullscreenEnv.active ? $_("fullscreen.exit") : $_("fullscreen.enter")}
      title={fullscreenEnv.active ? $_("fullscreen.exit") : $_("fullscreen.enter")}
    >
      <span class="dial-icon"
        ><Icon name={fullscreenEnv.active ? "fullscreenExit" : "fullscreen"} /></span
      >
    </button>
  {/if}
  <button
    class="dial"
    onclick={toggleSpace}
    aria-pressed={mode === "space"}
    aria-label={mode === "space" ? $_("space.toggleToSky") : $_("space.toggleToEarth")}
    title={mode === "space" ? $_("space.toggleToSky") : $_("space.toggleToEarth")}
  >
    <span class="dial-icon"><Icon name={mode === "space" ? "sky" : "earth"} /></span>
  </button>
  {#if mode === "sky"}
    <button
      class="dial"
      onclick={faceNorth}
      aria-label={$_("compass.north")}
      title={$_("compass.north")}
      disabled={pointing === "on"}
    >
      <svg viewBox="-20 -20 40 40" aria-hidden="true">
        <circle r="18" class="ring" />
        <g transform={`rotate(${-viewAzimuth - viewRoll})`}>
          <path d="M0 -15 L4 0 L0 3 L-4 0 Z" class="north" />
          <path d="M0 15 L4 0 L0 -3 L-4 0 Z" class="south" />
          <text y="-7" text-anchor="middle" class="n">N</text>
        </g>
      </svg>
    </button>
    <button
      class="dial"
      onclick={togglePointing}
      aria-pressed={pointing === "on" || pointing === "waiting"}
      aria-label={$_("pointing.toggle")}
      title={$_("pointing.toggle")}
    >
      <svg viewBox="-20 -20 40 40" aria-hidden="true">
        <circle r="9" class="ring" />
        <path d="M0 -18 V-12 M0 12 V18 M-18 0 H-12 M12 0 H18" class="ring" />
        <circle r="2" class="north" />
      </svg>
    </button>
  {:else}
    <button
      class="dial"
      onclick={() => (spaceStyle = spaceStyle === "realistic" ? "engraving" : "realistic")}
      aria-pressed={spaceStyle === "realistic"}
      aria-label={$_("space.realistic")}
      title={$_("space.realistic")}
    >
      <span class="dial-icon"><Icon name="realistic" /></span>
    </button>
  {/if}
</div>
{#if pointing === "waiting"}
  <p class="hud toast" role="status">{$_("pointing.hint")}</p>
{:else if pointing === "on" && relativeNotice}
  <button class="hud toast" onclick={() => (relativeNotice = false)}>
    {$_("pointing.relative")}<span class="dismiss">{$_("pointing.dismiss")}</span>
  </button>
{:else if pointing === "failed" && pointingError}
  <button class="hud toast" aria-live="assertive" onclick={() => (pointing = "off")}>
    {$_(failureMessageKey(pointingError, isBrave))}<span class="dismiss"
      >{$_("pointing.dismiss")}</span
    >
  </button>
{/if}

{#if status !== "ready"}
  <p class="status">{status === "error" ? $_("map.error") : $_("map.loading")}</p>
{/if}

{#if selected}
  <aside class="hud panel">
    <p class="meta">HIP {selected.hip}{selected.bayer ? ` // ${selected.bayer}` : ""}</p>
    <p class="name">{selected.name ?? selected.bayer ?? `HIP ${selected.hip}`}</p>
    {#if belowHorizon}<p class="meta">{$_("sky.belowHorizon")}</p>{/if}
    <button
      class="con"
      onclick={() => (selection = { kind: "constellation", abbr: selected.con })}
      aria-label={$_("constellation.open", { values: { name: names[selected.con] } })}
      >{names[selected.con]} · <i>{CONSTELLATION_LATIN[selected.con]}</i> ›</button
    >
    <pre class="data">RA   {formatRa(selected.ra)}
DEC  {formatDec(selected.dec)}
V    {selected.v.toFixed(2)}{selected.bv !== undefined ? `\nB−V  ${selected.bv.toFixed(2)}` : ""}
DIST {distance
        ? $_("star.distance", { values: { ly: Math.round(distance) } })
        : $_("star.unknownDistance")}</pre>
    <button class="close" onclick={() => (selection = null)} aria-label={$_("star.close")}>×</button
    >
  </aside>
{/if}

{#if bodyInfo}
  <aside class="hud panel">
    <p class="meta">
      {#if selectedBody === "Moon"}
        {$_("moon.illumination", { values: { pct: Math.round(bodies.phase.illumination * 100) } })}
        · {bodies.phase.waxing ? $_("moon.waxing") : $_("moon.waning")}
      {:else}
        G2V
      {/if}
    </p>
    <p class="name">{bodyInfo.name}</p>
    {#if belowHorizon}<p class="meta">{$_("sky.belowHorizon")}</p>{/if}
    <pre class="data">{bodyInfo.lines}</pre>
    {#if selectedBody === "Sun"}<p class="warn">{$_("sun.warning")}</p>{/if}
    <button class="close" onclick={() => (selection = null)} aria-label={$_("star.close")}>×</button
    >
  </aside>
{/if}

{#if planetInfo}
  <aside class="hud panel">
    <p class="meta">{$_("planet.kind")}</p>
    <p class="name">{planetInfo.name}</p>
    {#if belowHorizon}<p class="meta">{$_("sky.belowHorizon")}</p>{/if}
    <button
      class="con"
      onclick={() => (selection = { kind: "constellation", abbr: planetInfo.con.abbr })}
      aria-label={$_("constellation.open", { values: { name: planetInfo.con.name } })}
      >{planetInfo.con.name} · <i>{planetInfo.con.latin}</i> ›</button
    >
    <pre class="data">{planetInfo.lines}</pre>
    <button class="close" onclick={() => (selection = null)} aria-label={$_("star.close")}>×</button
    >
  </aside>
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
      top={`calc(max(16px, env(safe-area-inset-top)) + ${Math.max(headerHeight, mode === "sky" ? dialsHeight : 0) + 8}px)`}
      bottom={`calc(max(16px, env(safe-area-inset-bottom)) + ${controlsHeight + 8}px)`}
      onclose={() => (selection = null)}
      onstar={info.star
        ? () => info.star && (selection = { kind: "star", star: info.star })
        : undefined}
    />
  {/key}
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
    {#if hint}<p class="hint">{hint}</p>{/if}
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
        <button onclick={cycleRange}><Icon name="range" />{$_(`time.range.${range}`)}</button>
        <button aria-pressed={live} onclick={goLive}><Icon name="now" />{$_("time.now")}</button>
      </div>
      <div class="group frame">
        <button
          bind:this={layersButton}
          aria-expanded={layersOpen}
          aria-controls="layers-panel"
          onclick={() => (layersOpen = !layersOpen)}
          class="icon"
          aria-label={$_("layers.open")}
          title={$_("layers.open")}><Icon name="layers" /></button
        >

        <button
          aria-pressed={night}
          onclick={() => (night = !night)}
          class="icon"
          aria-label={$_("night.toggle")}><Icon name="night" /></button
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
  /* Stops short of the dials column (44 px + 12 px gap) so the date never runs under it. */
  .top {
    top: max(16px, env(safe-area-inset-top));
    left: max(16px, env(safe-area-inset-left));
    right: calc(max(16px, env(safe-area-inset-right)) + 56px);
    pointer-events: none;
  }
  .meta,
  .where,
  .when {
    margin: 0;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .meta {
    color: var(--ast-fg-muted);
  }
  .where {
    display: block;
    pointer-events: auto;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ast-fg);
    cursor: pointer;
    text-transform: uppercase;
    margin-top: 6px;
    font-family: var(--ast-font-display);
    font-weight: 700;
    font-size: 28px;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  .when {
    margin-top: 4px;
    color: var(--ast-fg-muted);
  }
  .live {
    white-space: nowrap;
    margin-left: 6px;
    color: var(--ast-fg);
  }
  .con {
    display: block;
    height: auto;
    min-height: 32px;
    padding: 0;
    border: 0;
    text-align: left;
    margin: -4px 0 4px;
    line-height: 1.4;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .con i {
    font-family: var(--ast-font-serif);
    font-size: 15px;
    letter-spacing: 0;
    text-transform: none;
  }
  .warn {
    margin: 8px 0 0;
    font-size: 10px;
    line-height: 1.5;
    color: var(--ast-fg);
  }
  .view.hidden {
    display: none;
  }
  .dial-icon {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--ast-fg);
  }
  .dial[aria-pressed="true"] .dial-icon {
    color: var(--ast-bg);
  }
  .compass {
    top: max(16px, env(safe-area-inset-top));
    right: max(16px, env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dial {
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--ast-hairline);
    border-radius: 50%;
    background: color-mix(in srgb, var(--ast-bg) 70%, transparent);
    backdrop-filter: blur(4px);
  }
  .dial[aria-pressed="true"] {
    background: var(--ast-fg);
  }
  .dial:disabled {
    opacity: 0.5;
  }
  .dial svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .dial .ring {
    fill: none;
    stroke: var(--ast-fg-muted);
    stroke-width: 1;
  }
  .dial .north {
    fill: var(--ast-fg);
  }
  .dial .south {
    fill: none;
    stroke: var(--ast-fg-muted);
    stroke-width: 1;
  }
  .dial .n {
    font: 700 6px var(--ast-font-mono);
    fill: var(--ast-fg);
  }
  .dial[aria-pressed="true"] .ring,
  .dial[aria-pressed="true"] .north {
    stroke: var(--ast-bg);
    fill: var(--ast-bg);
  }
  .dial[aria-pressed="true"] .ring {
    fill: none;
  }
  /* Left of the dials column (44 px + 12 px gap), below the header. */
  .toast {
    top: calc(max(16px, env(safe-area-inset-top)) + 110px);
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
  .status {
    position: fixed;
    inset: 0;
    display: grid;
    place-content: center;
    margin: 0;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
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
  .panel {
    left: max(16px, env(safe-area-inset-left));
    right: max(16px, env(safe-area-inset-right));
    bottom: calc(max(16px, env(safe-area-inset-bottom)) + 116px);
    max-width: 300px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 85%, transparent);
    backdrop-filter: blur(6px);
    padding: 12px 14px;
  }
  .name {
    margin: 4px 0 8px;
    font-family: var(--ast-font-display);
    font-weight: 700;
    font-size: 30px;
    line-height: 1;
    text-transform: uppercase;
  }
  .data {
    margin: 0;
    font: 11px/1.7 var(--ast-font-mono);
    letter-spacing: 0.06em;
    color: var(--ast-fg-muted);
  }
  .close {
    position: absolute;
    top: 4px;
    right: 4px;
    border: 0;
    padding: 8px 10px;
    font-size: 16px;
  }
</style>
