<script lang="ts">
  // « Selon la latitude » (#188): which constellations a latitude sees. A latitude control (from
  // pole to pole, starting at the player's place, else Paris, or at `latitude` when a caller such
  // as the games' « visible from home » setting opens it there), the celestial sphere seen from
  // outside with the observer's horizon and the sky turning about the tilted axis
  // (LatitudeSphere), the flat map of the whole sky with the three zones as bands
  // (LatitudeMap) with each band's count of constellations written on it, the lists of the
  // constellations always seen, seen part of the year and never seen (astro-core
  // latitude-visibility.ts), and an explanation by level. A tap on a constellation (lists, map,
  // sphere) shows it on both drawings. The zones are translucent washes (#197, tokens
  // --ast-zone-*), and the map can be enlarged to the whole screen, turned and zoomed.
  // Motion: tweens to a preset and the « play » sweep (90° cos t, slow at the poles); with
  // reduced motion, no tween, a still sky and a play that steps through notable latitudes.
  import { onMount, tick, untrack } from "svelte";
  import { _, locale } from "@asteria/ui";
  import {
    areaSamplesOf,
    boundsOutline,
    constellationAt,
    culmination,
    declinationRanges,
    greenwichMeanSiderealTime,
    loadConstellationBounds,
    precessionMatrix,
    unitVector,
    zoneLimits,
    zoneShares,
    zoneSharesOf,
    type ConstellationBounds,
    type DecRange,
    type Observer,
    type SkyZone,
    type Vec3,
  } from "@asteria/astro-core";
  import type { CatalogStar, FigureLevel } from "@asteria/sky-renderer";
  import {
    LatitudeMap,
    LatitudeSphere,
    MAP_MAX_ZOOM,
    phaseOf,
    sweepLatitude,
    type LatitudeTheme,
  } from "@asteria/sky-renderer/latitude";
  import {
    PRESETS,
    SKY_TURN_MS,
    STEP_MS,
    SWEEP_PERIOD_MS,
    TROPIC,
    POLAR_CIRCLE,
    ZONES,
    classesKey,
    classifyFigures,
    formatDeclination,
    latitudeParts,
    listsByZone,
    nextStep,
    numberFormat,
    placeBandLabels,
    presetLatitude,
    tweenLatitude,
    washFrom,
    zoneBands,
    type ListedConstellation,
    type Preset,
    type ZoneBand,
  } from "../lib/latitude";
  import { figureStars } from "../lib/games/geometry";
  import { HOME_MIN_ALTITUDE, HOME_MIN_SHARE, visibleFromLatitude } from "../lib/games/visibility";
  import { level as levelPref } from "../lib/level-store.svelte";
  import Icon from "./Icon.svelte";

  let {
    stars,
    lines,
    names,
    date,
    observer,
    placeName,
    latitude: startLatitude = null,
    theme,
    onclose,
  }: {
    stars: readonly CatalogStar[];
    lines: Readonly<Record<string, number[][]>>;
    /** Constellation names (French), by IAU abbreviation. */
    names: Readonly<Record<string, string>>;
    /** The app's date (precession of date) and place (the player's latitude, else Paris). */
    date: Date;
    observer: Observer;
    placeName: string;
    /** Latitude to open at (degrees, north positive); null: the player's place. */
    latitude?: number | null;
    theme: LatitudeTheme;
    onclose: () => void;
  } = $props();

  const LEVELS: readonly FigureLevel[] = ["discovery", "amateur", "expert"];
  const params = new URLSearchParams(location.search);
  // The app's level (#201): this control is a shortcut to the one of Menu › Réglages.
  const level = $derived<FigureLevel>(levelPref.value);
  const chooseLevel = (l: FigureLevel) => levelPref.set(l);

  const home = untrack(() => observer.latitude);
  // Captures: ?lat= opens at a latitude.
  const urlLat = Number(params.get("lat"));
  let lat = $state(
    untrack(() =>
      params.has("lat") && Number.isFinite(urlLat)
        ? Math.max(-90, Math.min(90, urlLat))
        : (startLatitude ?? home),
    ),
  );

  // --- The sky of the date: stars, figures, boundaries (loaded on demand, ≈ 6 kB gzip).
  const precession = untrack(() => precessionMatrix(date));
  const skyStars = untrack(() =>
    stars.filter((s) => s.v <= 4.5).map((s) => ({ dir: unitVector(s.ra, s.dec), v: s.v })),
  );
  const segments: Record<string, [Vec3, Vec3][]> = untrack(() => {
    const byHip = new Map(stars.map((s) => [s.hip, s]));
    const out: Record<string, [Vec3, Vec3][]> = {};
    for (const [abbr, polys] of Object.entries(lines)) {
      const segs: [Vec3, Vec3][] = [];
      for (const poly of polys)
        for (let i = 0; i + 1 < poly.length; i++) {
          const a = byHip.get(poly[i]!);
          const b = byHip.get(poly[i + 1]!);
          if (a && b) segs.push([unitVector(a.ra, a.dec), unitVector(b.ra, b.dec)]);
        }
      out[abbr] = segs;
    }
    return out;
  });
  let bounds = $state.raw<ConstellationBounds | null>(null);
  let ranges = $state.raw<Record<string, DecRange>>({});
  let outlines: Record<string, Vec3[][]> = {};
  let failed = $state(false);

  // The lists' classes, on the figures, with the games' rule (#187): same counts in both.
  const figures = untrack(() => figureStars(stars, lines));
  const classes = $derived(
    classifyFigures(
      figures,
      visibleFromLatitude(figures, lat, date),
      lat,
      precession,
      HOME_MIN_ALTITUDE,
      HOME_MIN_SHARE,
    ),
  );
  // The lists change only when a constellation changes class: not on every frame of a sweep.
  const key = $derived(classesKey(classes));
  const lists = $derived.by(() => {
    void key;
    return untrack(() => listsByZone(classes, names, $locale ?? "fr"));
  });
  const shares = $derived(zoneShares(lat));
  const limits = $derived(zoneLimits(lat));

  // --- Selection.
  let selected = $state<string | null>(null);
  const selectedRange = $derived(selected ? ranges[selected] : undefined);
  /** Area samples of the selected constellation (Expert: share of each zone), computed once. */
  // A cache, not state: filled while deriving, never read by the template.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const samples = new Map<string, Vec3[]>();
  const selectedShares = $derived.by(() => {
    if (!selected || !bounds || level !== "expert") return null;
    let s = samples.get(selected);
    if (!s) samples.set(selected, (s = areaSamplesOf(bounds, selected)));
    return zoneSharesOf(s, lat, date, precession);
  });
  function select(abbr: string | null) {
    selected = abbr === selected ? null : abbr;
  }

  // --- Formatting.
  const fmtLat = (l: number) => {
    const p = latitudeParts(l, $locale ?? "fr");
    return $_("latitude.value", { values: { value: p.value, hemisphere: p.hemisphere } });
  };
  const fmtLatLong = (l: number) => {
    const p = latitudeParts(l, $locale ?? "fr");
    return $_("latitude.valueLong", { values: { value: p.value, hemisphere: p.hemisphere } });
  };
  const pct = (x: number) =>
    numberFormat($locale ?? "fr", { style: "percent", maximumFractionDigits: 0 }).format(x);
  /** A name for the latitude when it sits on a notable one. */
  const place = $derived.by(() => {
    const near = (a: number) => Math.abs(lat - a) < 0.05;
    if (near(home)) return placeName;
    if (near(90)) return $_("latitude.preset.northPole");
    if (near(-90)) return $_("latitude.preset.southPole");
    if (near(0)) return $_("latitude.preset.equator");
    if (near(TROPIC) || near(-TROPIC)) return $_("latitude.tick.tropic");
    if (near(POLAR_CIRCLE) || near(-POLAR_CIRCLE)) return $_("latitude.tick.polar");
    return "";
  });

  // --- Motion.
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let playing = $state(false);
  let tween: { from: number; to: number; start: number } | null = null;
  let phase = 0;
  let stepTimer: ReturnType<typeof setInterval> | undefined;
  let stepSouth = true;
  /** Local sidereal time of the app's date and place: the right ascension on the meridian. */
  const lst0 = untrack(() => greenwichMeanSiderealTime(date) + observer.longitude);
  let lst = lst0;

  function goTo(target: number) {
    stop();
    if (reduced) lat = target;
    else tween = { from: lat, to: target, start: performance.now() };
  }
  function stop() {
    playing = false;
    tween = null;
    clearInterval(stepTimer);
  }
  function togglePlay() {
    if (playing) return stop();
    tween = null;
    playing = true;
    // From a pole, head for the other one; otherwise carry on south.
    stepSouth = lat > -89.95;
    if (reduced) {
      stepTimer = setInterval(() => {
        const n = nextStep(lat, stepSouth);
        lat = n.lat;
        stepSouth = n.south;
      }, STEP_MS);
    } else phase = phaseOf(lat, stepSouth);
  }
  function onslider(e: Event) {
    stop();
    lat = Number((e.currentTarget as HTMLInputElement).value);
  }

  // --- Drawings.
  let sphereCanvas: HTMLCanvasElement;
  let mapCanvas: HTMLCanvasElement;
  let sphereBox: HTMLDivElement;
  let mapBox: HTMLDivElement;
  let sphere: LatitudeSphere | undefined;
  let map: LatitudeMap | undefined;
  let mapDirty = true;
  let sphereDirty = true;
  /** ?perf=1 (measures): cost of each drawn frame, ms. */
  const perf = params.get("perf") === "1" ? { sphere: [] as number[], map: [] as number[] } : null;
  if (perf) (window as unknown as { __latitudePerf: typeof perf }).__latitudePerf = perf;

  const sphereLabels = $derived({
    north: $_("latitude.cardinal.north"),
    south: $_("latitude.cardinal.south"),
    east: $_("latitude.cardinal.east"),
    west: $_("latitude.cardinal.west"),
    pole: $_(lat >= 0 ? "latitude.sphere.poleNorth" : "latitude.sphere.poleSouth"),
    ...(level !== "discovery" && { equator: $_("latitude.sphere.equator") }),
    angle: `${latitudeParts(lat, $locale ?? "fr").value}°`,
    always: $_("latitude.zone.short.always").toUpperCase(),
    never: $_("latitude.zone.short.never").toUpperCase(),
  });
  const mapLabels = $derived({
    ...(level !== "discovery" && {
      upperLimit: formatDeclination(limits.limit, $locale ?? "fr"),
      lowerLimit: formatDeclination(-limits.limit, $locale ?? "fr"),
      zenith: $_("latitude.map.zenith"),
      decTicks: [60, 30, -30, -60].map((d) => ({
        dec: d,
        text: formatDeclination(d, $locale ?? "fr").replace(/[.,]0°$/, "°"),
      })),
    }),
    ...(level === "expert" && {
      hourTicks: [18, 12, 6].map((h) => ({
        ra: h * 15,
        text: $_("latitude.map.hour", { values: { hour: h } }),
      })),
    }),
    ...(selected && { selected: names[selected] ?? selected }),
  });

  // Values read before the drawings exist too, so that the effects track them.
  $effect(() => {
    const [s, m] = [sphereLabels, mapLabels];
    sphere?.setLabels(s);
    map?.setLabels(m);
    sphereDirty = mapDirty = true;
  });
  // The zones' washes come from the tokens (--ast-zone-*, red at night): read on the next frame,
  // once the root's night variables are in place.
  let themeDirty = true;
  $effect(() => {
    void theme.ink;
    void theme.sky;
    themeDirty = true;
  });
  function applyTheme() {
    themeDirty = false;
    const style = getComputedStyle(document.documentElement);
    const get = (name: string) => style.getPropertyValue(name);
    const always = washFrom(get, "always");
    const never = washFrom(get, "never");
    const t: LatitudeTheme = {
      ink: theme.ink,
      sky: theme.sky,
      ...(always && { always }),
      ...(never && { never }),
    };
    sphere?.setTheme(t);
    map?.setTheme(t);
    sphereDirty = mapDirty = true;
  }
  $effect(() => {
    const abbr = selected;
    void bounds;
    sphere?.setHighlight(
      abbr && outlines[abbr] ? { outline: outlines[abbr]!, segments: segments[abbr] ?? [] } : null,
    );
    map?.setSelected(abbr);
    sphereDirty = mapDirty = true;
  });
  $effect(() => {
    void lat;
    sphereDirty = mapDirty = true;
  });

  function draw(now: number, dt: number) {
    if (themeDirty) applyTheme();
    if (tween) {
      lat = tweenLatitude(tween.from, tween.to, now - tween.start);
      if (now - tween.start >= 700) tween = null;
    } else if (playing && !reduced) {
      phase += (dt * 2 * Math.PI) / SWEEP_PERIOD_MS;
      lat = sweepLatitude(phase);
    }
    if (!reduced) {
      lst += (dt * 360) / SKY_TURN_MS;
      sphereDirty = true;
    }
    // Under the enlarged map the sphere is hidden: not drawn.
    if (sphere && sphereDirty && !expanded) {
      sphere.setLatitude(lat);
      sphere.setSiderealTime(lst);
      const ms = sphere.draw();
      perf?.sphere.push(ms);
      sphereDirty = false;
    }
    if (map && mapDirty) {
      map.setLatitude(lat);
      const ms = map.draw();
      perf?.map.push(ms);
      mapDirty = false;
      const m = map;
      const next = zoneBands(lat, (d) => m.screenY(d), mapH);
      // The labels move with the bands: only when they move by a quarter pixel or more.
      if (
        next.length !== bands.length ||
        next.some(
          (b, i) =>
            b.zone !== bands[i]!.zone ||
            Math.abs(b.top - bands[i]!.top) > 0.25 ||
            Math.abs(b.bottom - bands[i]!.bottom) > 0.25,
        )
      )
        bands = next;
    }
  }

  // --- The bands' labels on the map: each count with its zone, on its band (#197).
  let mapH = $state(0);
  let bands = $state.raw<ZoneBand[]>([]);
  const labelH = $state<Record<SkyZone, number>>({ always: 0, sometimes: 0, never: 0 });
  const bandTops = $derived(
    placeBandLabels(
      bands,
      bands.map((b) => labelH[b.zone] || 28),
      mapH,
      4,
    ),
  );

  // --- The enlarged map (#197): the whole screen, turned by a drag, zoomed by a pinch.
  let expanded = $state(false);
  let zoom = $state(1);
  let expandButton = $state<HTMLButtonElement>();
  let collapseButton = $state<HTMLButtonElement>();
  async function expandMap() {
    stopGesture();
    expanded = true;
    // Centred on the constellation picked, else on the sky of the meridian at the app's time.
    map?.resetView(map.selectedRa() ?? ((lst0 % 360) + 360) % 360);
    zoom = 1;
    mapDirty = true;
    await tick();
    collapseButton?.focus();
  }
  async function collapseMap() {
    stopGesture();
    expanded = false;
    map?.resetView();
    zoom = 1;
    mapDirty = true;
    await tick();
    expandButton?.focus();
  }
  function zoomBy(factor: number) {
    if (!map) return;
    map.zoomAt(factor, mapBox.clientWidth / 2, mapBox.clientHeight / 2);
    zoom = map.view.zoom;
    mapDirty = true;
  }
  function panBy(dx: number, dy: number) {
    map?.panBy(dx, dy);
    mapDirty = true;
  }
  /** Pointers on the enlarged map: one drags, two pinch; a tap still picks. */
  // Gesture bookkeeping, never read by the template.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { moved: number; multi: boolean } | null = null;
  /** While a finger or the wheel moves the map, its layer is moved, not redrawn. */
  function interacting(on: boolean) {
    map?.setInteracting(on);
    if (!on) mapDirty = true; // redrawn sharp at the final zoom
  }
  function stopGesture() {
    pointers.clear();
    gesture = null;
    interacting(false);
  }
  function mapDown(e: PointerEvent) {
    if (!expanded) return mapTap.down(e);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) gesture = { moved: 0, multi: false };
    else if (gesture) gesture.multi = true;
    interacting(true);
  }
  function mapMove(e: PointerEvent) {
    const old = pointers.get(e.pointerId);
    if (!expanded || !old || !map) return;
    if (pointers.size === 1) {
      panBy(e.clientX - old.x, e.clientY - old.y);
      if (gesture) gesture.moved += Math.hypot(e.clientX - old.x, e.clientY - old.y);
    } else if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)![1];
      const rect = mapBox.getBoundingClientRect();
      const d0 = Math.hypot(old.x - other.x, old.y - other.y);
      const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const [mx0, my0] = [(old.x + other.x) / 2, (old.y + other.y) / 2];
      const [mx1, my1] = [(e.clientX + other.x) / 2, (e.clientY + other.y) / 2];
      if (d0 > 4) map.zoomAt(d1 / d0, mx1 - rect.left, my1 - rect.top);
      map.panBy(mx1 - mx0, my1 - my0);
      zoom = map.view.zoom;
      mapDirty = true;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function mapUp(e: PointerEvent) {
    if (!expanded) return mapTap.up(e);
    if (!pointers.delete(e.pointerId)) return;
    if (!pointers.size) {
      if (gesture && !gesture.multi && gesture.moved < 8 && bounds && map) {
        const rect = mapBox.getBoundingClientRect();
        select(constellationAt(bounds, map.pick(e.clientX - rect.left, e.clientY - rect.top)));
      }
      gesture = null;
      interacting(false);
    }
  }
  function mapCancel(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size) return;
    gesture = null;
    interacting(false);
  }
  /** The enlarged map from the keyboard: arrows turn and tilt it, + and − zoom. */
  function mapKey(e: KeyboardEvent) {
    if (!expanded) return;
    const step = 48;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[e.key]) panBy(...moves[e.key]!);
    else if (e.key === "+" || e.key === "=") zoomBy(1.5);
    else if (e.key === "-") zoomBy(1 / 1.5);
    else return;
    e.preventDefault();
  }

  /** A tap (not a drag) on a drawing picks the constellation under it. */
  function tapper(pick: (x: number, y: number) => Vec3 | null) {
    let down: { x: number; y: number; id: number } | null = null;
    return {
      down(e: PointerEvent) {
        down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      },
      up(e: PointerEvent) {
        if (!down || down.id !== e.pointerId || !bounds) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        down = null;
        if (moved > 8) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const dir = pick(e.clientX - rect.left, e.clientY - rect.top);
        if (dir) select(constellationAt(bounds, dir));
      },
    };
  }
  const sphereTap = tapper((x, y) => sphere?.pick(x, y) ?? null);
  const mapTap = tapper((x, y) => map?.pick(x, y) ?? null);

  let dialog: HTMLElement;
  let mapBlock: HTMLElement;
  let closeButton: HTMLButtonElement;
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.focus();
    sphere = new LatitudeSphere(sphereCanvas);
    map = new LatitudeMap(mapCanvas);
    if (perf) (window as unknown as { __latitudeMap: LatitudeMap }).__latitudeMap = map;
    sphere.setPrecession(precession);
    sphere.setStars(skyStars);
    sphere.setTheme(theme);
    sphere.setLabels(sphereLabels);
    map.setTheme(theme);
    map.setLabels(mapLabels);
    map.setSky({ outlines: {}, segments, stars: skyStars }, precession);
    const dpr = () => window.devicePixelRatio || 1;
    const resize = new ResizeObserver(() => {
      sphere?.resize(sphereBox.clientWidth, sphereBox.clientHeight, dpr());
      map?.resize(mapBox.clientWidth, mapBox.clientHeight, dpr());
      // In the page the map is the whole sky, 0 h on the right edge.
      if (!expanded) map?.resetView();
      if (map) zoom = map.view.zoom;
      mapH = mapBox.clientHeight;
      sphereDirty = mapDirty = true;
    });
    resize.observe(sphereBox);
    resize.observe(mapBox);

    loadConstellationBounds().then(
      (b) => {
        outlines = Object.fromEntries(b.abbrs.map((a) => [a, boundsOutline(b, a, 1)]));
        ranges = declinationRanges(b, date);
        bounds = b;
        map?.setSky({ outlines, segments, stars: skyStars }, precession);
        const want = params.get("select");
        if (want && outlines[want]) selected = want;
        mapDirty = true;
      },
      (e: unknown) => {
        console.warn("Constellation boundaries unavailable", e);
        failed = true;
      },
    );
    if (params.get("play") === "1") togglePlay();
    // Captures: ?map=full opens the enlarged map, ?mapZoom= zooms it.
    if (params.get("map") === "full")
      void expandMap().then(() => {
        const z = Number(params.get("mapZoom"));
        // Once the boundaries are in, on the constellation picked by ?select=.
        if (z > 1)
          setTimeout(() => {
            zoomBy(z);
            if (map?.centreOnSelected()) mapDirty = true;
          }, 1200);
      });
    let wheelEnd: ReturnType<typeof setTimeout> | undefined;
    const wheel = (e: WheelEvent) => {
      if (!expanded || !map) return;
      e.preventDefault();
      interacting(true);
      clearTimeout(wheelEnd);
      wheelEnd = setTimeout(() => interacting(false), 160);
      const rect = mapBox.getBoundingClientRect();
      map.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
      zoom = map.view.zoom;
      mapDirty = true;
    };
    mapBox.addEventListener("wheel", wheel, { passive: false });
    // Captures: ?phase= freezes the sweep at a phase (radians).
    const frozen = Number(params.get("phase"));

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (params.has("phase") && Number.isFinite(frozen)) {
        lat = sweepLatitude(frozen);
        playing = true;
      }
      if (!document.hidden) draw(now, dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(stepTimer);
      resize.disconnect();
      mapBox.removeEventListener("wheel", wheel);
      previous?.focus?.();
    };
  });

  /** Escape reduces the enlarged map, else closes; Tab cycles inside the dialog (or the map). */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (expanded) void collapseMap();
      else onclose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [
      ...(expanded ? mapBlock : dialog).querySelectorAll<HTMLElement>(
        "button:not(:disabled), input, [tabindex='0']",
      ),
    ];
    const first = focusable[0];
    const lastEl = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastEl?.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      first?.focus();
    }
  }

  const presetLabel = (p: Preset) =>
    p === "home"
      ? $_("latitude.preset.home", { values: { place: placeName } })
      : $_(`latitude.preset.${p}`);
  /** Slider position (%) of a latitude: north on the left. */
  const at = (l: number) => `${((90 - l) / 180) * 100}%`;
  const zoneOfSelected = $derived<SkyZone | null>(
    selected ? (classes[selected]?.zone ?? null) : null,
  );
  const dateText = $derived(
    date.toLocaleDateString($locale ?? "fr", { day: "numeric", month: "long", year: "numeric" }),
  );
</script>

<div
  class="latitude"
  role="dialog"
  aria-modal="true"
  aria-labelledby="latitude-title"
  tabindex="-1"
  bind:this={dialog}
  {onkeydown}
>
  <header class="head" inert={expanded}>
    <div>
      <h1 id="latitude-title">{$_("latitude.title")}</h1>
      <p class="subtitle">{$_("latitude.subtitle")}</p>
    </div>
    <button
      class="close"
      bind:this={closeButton}
      onclick={onclose}
      aria-label={$_("latitude.close")}
      title={$_("latitude.close")}>×</button
    >
  </header>

  <div class="body">
    <section class="stage" aria-label={$_("latitude.slider")} inert={expanded}>
      <div
        class="sphere"
        bind:this={sphereBox}
        onpointerdown={sphereTap.down}
        onpointerup={sphereTap.up}
        role="presentation"
      >
        <canvas bind:this={sphereCanvas} aria-hidden="true"></canvas>
        <p class="sr-only">{$_("latitude.sphere.label", { values: { lat: fmtLatLong(lat) } })}</p>
        <p class="readout" aria-hidden="true">
          <strong>{fmtLat(lat)}</strong>
          {#if place}<span>{place}</span>{/if}
        </p>
      </div>
      {#if selected}
        {@const range = selectedRange}
        <div class="picked">
          <p>
            <strong>{names[selected] ?? selected}</strong>
            {#if zoneOfSelected}<span>{$_(`latitude.detail.zone.${zoneOfSelected}`)}</span>{/if}
            {#if range && level !== "discovery" && zoneOfSelected !== "never"}
              {@const c = culmination(range, lat)}
              <span
                >{$_("latitude.detail.culmination", {
                  values: { side: c.side, altitude: Math.round(c.altitude) },
                })}</span
              >
            {/if}
            {#if range && level === "expert"}
              <span class="data"
                >{$_("latitude.detail.dec", {
                  values: {
                    min: formatDeclination(range.min, $locale ?? "fr"),
                    max: formatDeclination(range.max, $locale ?? "fr"),
                  },
                })}{#if selectedShares}{#if selectedShares.always > 0 && selectedShares.always < 0.995}
                    · {$_("latitude.detail.shareAlways", {
                      values: { share: pct(selectedShares.always) },
                    })}{/if}{#if selectedShares.never > 0 && selectedShares.never < 0.995}
                    · {$_("latitude.detail.shareNever", {
                      values: { share: pct(selectedShares.never) },
                    })}{/if}{/if}</span
              >
            {/if}
          </p>
          <button
            class="clear"
            onclick={() => (selected = null)}
            aria-label={$_("latitude.detail.clear", {
              values: { name: names[selected] ?? selected },
            })}>×</button
          >
        </div>
      {/if}

      {@render latitudeControls()}
      <div class="presets" role="group" aria-label={$_("latitude.presets")}>
        {#each PRESETS as p (p)}
          {@const target = presetLatitude(p, home)}
          <button
            aria-pressed={Math.abs(lat - target) < 0.05}
            onclick={() => goTo(target)}
            class:home={p === "home"}>{presetLabel(p)}</button
          >
        {/each}
      </div>
    </section>

    <div class="scroll">
      <section
        class="map-block"
        class:expanded
        aria-labelledby="latitude-map"
        bind:this={mapBlock}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded ? "true" : undefined}
      >
        <div class="map-head">
          <h2 class="group-title" id="latitude-map">{$_("latitude.map.title")}</h2>
          {#if expanded}
            <button
              class="expand"
              bind:this={collapseButton}
              onclick={collapseMap}
              aria-label={$_("latitude.map.collapse")}
              title={$_("latitude.map.collapse")}
            >
              <Icon name="fullscreenExit" size={18} />
            </button>
          {:else}
            <button
              class="expand"
              bind:this={expandButton}
              onclick={expandMap}
              aria-label={$_("latitude.map.expand")}
              title={$_("latitude.map.expand")}
            >
              <Icon name="fullscreen" size={14} /><span>{$_("latitude.map.expandShort")}</span>
            </button>
          {/if}
        </div>
        <!-- Focusable only when enlarged, as an application (arrows, + and −): the role is dynamic. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="map"
          bind:this={mapBox}
          onpointerdown={mapDown}
          onpointermove={mapMove}
          onpointerup={mapUp}
          onpointercancel={mapCancel}
          onkeydown={mapKey}
          role={expanded ? "application" : "presentation"}
          tabindex={expanded ? 0 : undefined}
          aria-label={expanded
            ? $_("latitude.map.expanded", { values: { lat: fmtLatLong(lat) } })
            : undefined}
        >
          <canvas bind:this={mapCanvas} aria-hidden="true"></canvas>
          <p class="sr-only">{$_("latitude.map.label", { values: { lat: fmtLatLong(lat) } })}</p>
          <!-- Each zone's count and name on its band: what the numbers are is read on the map. -->
          <ol class="bands">
            {#each bands as b, i (b.zone)}
              <li
                class={`band ${b.zone}`}
                style:transform={`translateY(${bandTops[i] ?? 0}px)`}
                bind:clientHeight={labelH[b.zone]}
              >
                <span class={`swatch ${b.zone}`} aria-hidden="true"></span>
                <strong>{lists[b.zone].length}</strong>
                <span class="what"
                  >{$_(`latitude.band.${b.zone}`, { values: { count: lists[b.zone].length } })}
                  {#if level === "expert"}<small
                      >{$_("latitude.share", { values: { share: pct(shares[b.zone]) } })}</small
                    >{/if}</span
                >
              </li>
            {/each}
          </ol>
        </div>
        {#if expanded}
          <!-- Under the map: the latitude and the picked constellation (or how to move the map),
               the zoom, then the latitude controls, to watch the sweep on the large map. -->
          <div class="map-bottom">
            <div class="map-foot">
              <div class="map-info">
                <p class="map-readout">
                  <strong>{fmtLat(lat)}</strong>{#if place}<span>{place}</span>{/if}
                </p>
                {#if selected}
                  <p class="map-picked">
                    <strong>{names[selected] ?? selected}</strong>
                    {#if zoneOfSelected}<span>{$_(`latitude.detail.zone.${zoneOfSelected}`)}</span
                      >{/if}
                  </p>
                {:else}
                  <p class="gestures">{$_("latitude.map.gestures")}</p>
                {/if}
              </div>
              <div class="zoom" role="group" aria-label={$_("latitude.map.titleShort")}>
                <button
                  onclick={() => zoomBy(1 / 1.6)}
                  disabled={zoom <= 1 + 1e-6}
                  aria-label={$_("latitude.map.zoomOut")}
                  title={$_("latitude.map.zoomOut")}>−</button
                >
                <button
                  onclick={() => zoomBy(1.6)}
                  disabled={zoom >= MAP_MAX_ZOOM - 1e-6}
                  aria-label={$_("latitude.map.zoomIn")}
                  title={$_("latitude.map.zoomIn")}>+</button
                >
              </div>
            </div>
            <div class="map-controls">{@render latitudeControls()}</div>
          </div>
        {/if}
      </section>

      <div class="rest" inert={expanded}>
        <p class="lead">{$_(`latitude.lead.${level}`)}</p>

        {#if failed}
          <p class="note">{$_("latitude.failed")}</p>
        {/if}

        <section class="lists" aria-labelledby="latitude-lists">
          <h2 class="sr-only" id="latitude-lists">{$_("latitude.lists.title")}</h2>
          {#each ZONES as z (z)}
            <div class="list">
              <h3 class="group-title">
                <span class={`swatch ${z}`} aria-hidden="true"></span>{$_(`latitude.zone.${z}`)}
                <span class="n">{lists[z].length}</span>
              </h3>
              {#if level !== "discovery"}<p class="hint">{$_(`latitude.zone.hint.${z}`)}</p>{/if}
              {#if lists[z].length}
                <ul class="chips">
                  {#each lists[z] as c (c.abbr)}
                    {@render chip(c, z)}
                  {/each}
                </ul>
              {:else}
                <p class="empty">{$_("latitude.zone.empty")}</p>
              {/if}
            </div>
          {/each}
          {#if level !== "discovery" && lists.sometimes.some((c) => c.partlyAlways || c.partlyHidden)}
            <p class="legend">
              <span class="mark always" aria-hidden="true"></span>{$_("latitude.mark.partlyAlways")}
              <span class="mark never" aria-hidden="true"></span>{$_("latitude.mark.partlyHidden")}
            </p>
          {/if}
        </section>

        {#if level !== "discovery"}
          <section class="panel-block definition" aria-labelledby="latitude-def">
            <h2 class="panel-title" id="latitude-def">{$_("latitude.definition.title")}</h2>
            <p>{$_("latitude.definition.amateur")}</p>
            {#if level === "expert"}<p>
                {$_("latitude.definition.expert", { values: { date: dateText } })}
              </p>{/if}
          </section>
        {/if}

        <div class="levels" role="group" aria-label={$_("latitude.level")}>
          {#each LEVELS as l (l)}
            <button aria-pressed={level === l} onclick={() => chooseLevel(l)}
              >{$_(`level.${l}`)}</button
            >
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

{#snippet latitudeControls()}
  <div class="controls">
    <button
      class="play"
      aria-pressed={playing}
      onclick={togglePlay}
      aria-label={playing ? $_("latitude.pause") : $_("latitude.play")}
      title={playing ? $_("latitude.pause") : $_("latitude.play")}
    >
      <Icon name={playing ? "pause" : "play"} size={16} />
    </button>
    <div class="slider">
      <div class="ticks" aria-hidden="true">
        {#each [90, POLAR_CIRCLE, TROPIC, 0, -TROPIC, -POLAR_CIRCLE, -90] as t (t)}
          <i class:major={t === 0 || Math.abs(t) === 90} style:left={at(t)}></i>
        {/each}
        <b class="home" style:left={at(home)} title={$_("latitude.home")}></b>
      </div>
      <input
        type="range"
        dir="rtl"
        min="-90"
        max="90"
        step="0.1"
        value={lat}
        oninput={onslider}
        aria-label={$_("latitude.slider")}
        aria-valuetext={fmtLatLong(lat)}
      />
      <div class="ends" aria-hidden="true">
        <span>{fmtLat(90)}</span><span>{fmtLat(0)}</span><span>{fmtLat(-90)}</span>
      </div>
    </div>
  </div>
{/snippet}

{#snippet chip(c: ListedConstellation, z: SkyZone)}
  <li>
    <button
      class="chip"
      aria-pressed={selected === c.abbr}
      onclick={() => select(c.abbr)}
      aria-label={[
        $_("latitude.chip", { values: { name: c.name, zone: $_(`latitude.zone.${z}`) } }),
        c.partlyAlways ? $_("latitude.mark.partlyAlways") : "",
        c.partlyHidden ? $_("latitude.mark.partlyHidden") : "",
      ]
        .filter(Boolean)
        .join(", ")}
    >
      {c.name}
      {#if level !== "discovery" && (c.partlyAlways || c.partlyHidden)}
        <span class="marks" aria-hidden="true">
          {#if c.partlyAlways}<span class="mark always"></span>{/if}
          {#if c.partlyHidden}<span class="mark never"></span>{/if}
        </span>
      {/if}
    </button>
  </li>
{/snippet}

<style>
  .latitude {
    position: fixed;
    inset: 0;
    z-index: 11;
    display: flex;
    flex-direction: column;
    background: var(--ast-bg);
    color: var(--ast-fg);
    outline: none;
    animation: fade 160ms var(--ast-ease-out);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .head,
  .body {
    width: 100%;
    max-width: 1080px;
    margin: 0 auto;
    box-sizing: border-box;
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding-top: max(14px, env(safe-area-inset-top));
    padding-bottom: 10px;
    border-bottom: 1px solid var(--ast-hairline);
  }
  h1 {
    margin: 0;
    font: 700 28px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .subtitle {
    margin: 4px 0 0;
    font: 400 11px/1.3 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  button {
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .close {
    flex: none;
    width: 44px;
    height: 44px;
    margin: -6px -10px 0 0;
    font: 400 24px/1 var(--ast-font-mono);
  }
  .close:focus-visible {
    outline-offset: -6px;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .stage {
    flex: none;
    padding-top: 8px;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: max(24px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--ast-hairline);
  }

  /* The sphere, with the latitude written over its top-left corner. */
  .sphere {
    position: relative;
    height: clamp(190px, 31vh, 300px);
    touch-action: manipulation;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .readout {
    position: absolute;
    top: 2px;
    left: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    pointer-events: none;
  }
  .readout strong {
    font: 700 30px/1 var(--ast-font-display);
    letter-spacing: 0.01em;
    font-variant-numeric: tabular-nums;
  }
  .readout span {
    font: 500 9px/1.2 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  /* The constellation picked (lists, map, sphere): a slim panel under the sphere. */
  .picked {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
    border: 1px solid var(--ast-panel-border);
    border-left: 2px solid var(--ast-fg);
    background: var(--ast-panel-bg);
  }
  .picked p {
    margin: 0;
    padding: 6px 0 6px 10px;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    min-width: 0;
    font: 400 10px/1.35 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .picked strong {
    font: 700 16px/1 var(--ast-font-display);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ast-fg);
  }
  .picked .data {
    flex-basis: 100%;
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .clear {
    flex: none;
    width: 44px;
    height: 44px;
    font: 400 20px/1 var(--ast-font-mono);
  }

  /* Latitude: play, then the slider, north on the left as on the sphere. */
  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }
  .play {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--ast-control-border);
  }
  .play[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .slider {
    position: relative;
    flex: 1;
    min-width: 0;
    padding-top: 6px;
  }
  .ticks {
    position: absolute;
    inset: 6px 10px auto;
    height: 28px;
    pointer-events: none;
  }
  .ticks i {
    position: absolute;
    top: 8px;
    width: 1px;
    height: 12px;
    background: var(--ast-fg-muted);
    transform: translateX(-0.5px);
  }
  .ticks i.major {
    top: 5px;
    height: 18px;
    background: var(--ast-fg);
  }
  .ticks .home {
    position: absolute;
    top: -3px;
    width: 0;
    height: 0;
    border: 4px solid transparent;
    border-top: 5px solid var(--ast-fg);
    transform: translateX(-4px);
  }
  input[type="range"] {
    display: block;
    width: 100%;
    height: 28px;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  input[type="range"]:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  input[type="range"]::-webkit-slider-runnable-track {
    height: 28px;
    background: linear-gradient(var(--ast-fg), var(--ast-fg)) center / 100% 1px no-repeat;
  }
  input[type="range"]::-moz-range-track {
    height: 1px;
    background: var(--ast-fg);
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 28px;
    background:
      linear-gradient(var(--ast-fg), var(--ast-fg)) center / 2px 100% no-repeat,
      var(--ast-bg);
    border: 1px solid var(--ast-fg);
    box-sizing: border-box;
    border-radius: 0;
  }
  input[type="range"]::-moz-range-thumb {
    width: 20px;
    height: 28px;
    background: var(--ast-bg);
    border: 1px solid var(--ast-fg);
    border-radius: 0;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
    font: 500 9px/1 var(--ast-font-mono);
    letter-spacing: 0.08em;
    color: var(--ast-fg-muted);
  }
  .presets {
    display: flex;
    gap: 6px;
    margin: 10px 0 10px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .presets button {
    flex: none;
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid var(--ast-control-border);
    color: var(--ast-fg-muted);
  }
  .presets button.home {
    color: var(--ast-fg);
  }
  .presets button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }

  /* Scrolled part: the map, the counts, the explanation, the lists. */
  .group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 18px 0 8px;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .group-title::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--ast-hairline);
  }
  .map-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .map-head .group-title {
    flex: 1;
    min-width: 0;
  }
  .expand {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    margin: 10px 0 0;
    padding: 0 10px;
    border: 1px solid var(--ast-control-border);
  }
  .map {
    aspect-ratio: 2 / 1;
    box-shadow: 0 0 0 1px var(--ast-hairline);
    touch-action: manipulation;
  }

  /* The enlarged map (#197): the whole screen, the map edge to edge between a slim head and
     the latitude controls, so that the sweep can be watched on it. */
  .map-block.expanded {
    position: fixed;
    inset: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    background: var(--ast-bg);
    padding-top: max(6px, env(safe-area-inset-top));
    padding-bottom: max(10px, env(safe-area-inset-bottom));
    animation: fade 160ms var(--ast-ease-out);
  }
  .expanded .map-head,
  .map-foot,
  .map-controls {
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
  .expanded .map-head .group-title {
    margin: 0;
  }
  .expanded .expand {
    width: 44px;
    height: 44px;
    margin: 0 -10px 0 0;
    justify-content: center;
    padding: 0;
    border: 0;
  }
  .map-readout {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0;
  }
  .map-readout strong {
    font: 700 20px/1 var(--ast-font-display);
    font-variant-numeric: tabular-nums;
  }
  .map-readout span {
    font: 500 9px/1 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .expanded .map {
    flex: 1;
    min-height: 0;
    aspect-ratio: auto;
    margin-top: 6px;
    box-shadow:
      0 1px 0 var(--ast-hairline),
      0 -1px 0 var(--ast-hairline);
    touch-action: none;
    cursor: grab;
    outline: none;
  }
  .expanded .map:focus-visible {
    box-shadow: inset 0 0 0 1px var(--ast-fg);
  }
  .expanded .band {
    left: max(8px, env(safe-area-inset-left));
  }
  .map-foot {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }
  .map-info {
    flex: 1;
    min-width: 0;
  }
  .zoom {
    flex: none;
    display: flex;
    border: 1px solid var(--ast-control-border);
  }
  .zoom button {
    width: 44px;
    height: 44px;
    font: 400 20px/1 var(--ast-font-mono);
  }
  .zoom button + button {
    border-left: 1px solid var(--ast-hairline);
  }
  .zoom button:disabled {
    color: var(--ast-fg-muted);
    opacity: 0.5;
    cursor: default;
  }
  .gestures,
  .map-picked {
    margin: 4px 0 0;
    font: 400 10px/1.4 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .map-picked {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
  }
  .map-picked strong {
    font: 700 15px/1 var(--ast-font-display);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ast-fg);
  }
  .map-controls :global(.controls) {
    margin-top: 4px;
  }
  /* The bands' labels (#197): a count and its zone, on a plate of the sky over the band's
     left edge, moved with the band; they let the taps through to the map. */
  .map {
    position: relative;
    overflow: hidden;
  }
  .bands {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    pointer-events: none;
  }
  .band {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: calc(100% - 72px);
    padding: 3px 8px 3px 6px;
    background: color-mix(in srgb, var(--ast-bg) 86%, transparent);
    box-shadow: inset 0 0 0 1px var(--ast-hairline);
    will-change: transform;
  }
  .band strong {
    font: 700 20px/1 var(--ast-font-display);
    font-variant-numeric: tabular-nums;
  }
  .band .what {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font: 500 9px/1.25 var(--ast-font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .band small {
    font: inherit;
    color: var(--ast-fg-muted);
  }
  /* Zone swatches: the drawings' washes (#197), always with their name next to them. */
  .swatch {
    flex: none;
    width: 11px;
    height: 11px;
    box-sizing: border-box;
    border: 1px solid var(--ast-fg-muted);
  }
  .swatch.always,
  .mark.always {
    background: var(--ast-zone-always-wash);
  }
  .swatch.never,
  .mark.never {
    background: var(--ast-zone-never-wash);
  }
  .lead {
    margin: 16px 0 0;
    font: 400 12px/1.6 var(--ast-font-mono);
    text-wrap: pretty;
  }
  .note,
  .empty,
  .hint {
    margin: 0 0 8px;
    font: 400 10px/1.45 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .list .group-title {
    margin-top: 20px;
    color: var(--ast-fg);
  }
  .list .n {
    font-variant-numeric: tabular-nums;
    color: var(--ast-fg-muted);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 9px;
    border: 1px solid var(--ast-control-border);
    font: 400 11px/1 var(--ast-font-mono);
    letter-spacing: 0;
    text-transform: none;
  }
  .chip[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .marks {
    display: inline-flex;
    gap: 2px;
  }
  .mark {
    display: inline-block;
    width: 7px;
    height: 7px;
    box-shadow: inset 0 0 0 1px currentColor;
  }
  .chip[aria-pressed="true"] .mark {
    box-shadow: inset 0 0 0 1px var(--ast-bg);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 10px 0 0;
    font: 400 10px/1.4 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .legend .mark + * {
    margin-right: 8px;
  }
  .legend .mark:not(:first-child) {
    margin-left: 8px;
  }
  .definition {
    margin-top: 18px;
  }
  .definition p {
    margin: 0;
    font: 400 10.5px/1.6 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .definition p + p {
    margin-top: 8px;
  }
  .levels {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 20px;
    border: 1px solid var(--ast-control-border);
  }
  .levels button {
    min-height: 40px;
    color: var(--ast-fg-muted);
  }
  .levels button + button {
    border-left: 1px solid var(--ast-hairline);
  }
  .levels button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Wide screens: the sphere and its controls on the left, the map and the lists on the right. */
  @media (min-width: 880px) {
    .body {
      flex-direction: row;
      gap: 32px;
    }
    .stage {
      flex: 0 0 44%;
      display: flex;
      flex-direction: column;
      padding-top: 16px;
    }
    .sphere {
      height: auto;
      flex: 1;
      min-height: 280px;
      max-height: 520px;
    }
    .readout strong {
      font-size: 40px;
    }
    .scroll {
      border-top: 0;
      padding-right: 4px;
    }
  }
  /* A large screen: the enlarged map's labels a size up. */
  @media (min-width: 880px) and (min-height: 600px) {
    .expanded .band strong {
      font-size: 26px;
    }
    .expanded .band .what {
      font-size: 10.5px;
    }
    .expanded .swatch {
      width: 13px;
      height: 13px;
    }
  }
  /* A phone on its side: the enlarged map takes all the height but one row, where the latitude,
     its controls and the zoom sit side by side; the reduce button floats over the map. */
  @media (orientation: landscape) and (max-height: 520px) {
    .map-block.expanded {
      padding-top: 0;
    }
    .expanded .map-head {
      position: absolute;
      top: max(6px, env(safe-area-inset-top));
      right: 0;
      z-index: 1;
      padding-left: 0;
    }
    .expanded .map-head .group-title {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .expanded .expand {
      margin: 0;
      background: color-mix(in srgb, var(--ast-bg) 80%, transparent);
      box-shadow: inset 0 0 0 1px var(--ast-hairline);
    }
    .expanded .map {
      margin-top: 0;
    }
    .map-bottom {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-left: max(16px, env(safe-area-inset-left));
      padding-right: max(16px, env(safe-area-inset-right));
    }
    .map-bottom .map-foot,
    .map-bottom .map-controls {
      display: contents;
    }
    .map-bottom .map-info {
      flex: 0 1 auto;
      order: 0;
      margin-top: 6px;
    }
    .map-bottom .gestures {
      display: none;
    }
    .map-bottom .map-picked {
      margin: 2px 0 0;
    }
    .map-bottom :global(.controls) {
      flex: 1;
      order: 1;
      min-width: 0;
    }
    .map-bottom .zoom {
      order: 2;
      margin-top: 6px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .latitude,
    .map-block.expanded {
      animation: none;
    }
  }
</style>
