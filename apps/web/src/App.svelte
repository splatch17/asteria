<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import { SkyMap, type BodyName, type SkySelection } from "@asteria/sky-renderer";
  import { bodyPosition, moonPhase } from "@asteria/astro-core";
  import { CONSTELLATION_LATIN, constellationNames } from "@asteria/content";
  import { decodeStarCatalog } from "@asteria/catalog";
  import { formatDec, formatRa, parallaxToLightYears } from "./lib/format";
  import { MIN_DIM, nightInk } from "./lib/night";
  import { readSetting, writeSetting } from "./lib/storage";
  import { devicePointing, pointingToView, smooth } from "./lib/orientation";
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
  let status = $state<"loading" | "ready" | "error">("loading");
  const isBool = (v: unknown): v is boolean => typeof v === "boolean";
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  let night = $state(readSetting("asteria.night", false, isBool));
  let brightness = $state(readSetting("asteria.nightBrightness", 0.7, isNum));
  let lines = $state(true);
  let selection = $state<SkySelection | null>(null);
  const selected = $derived(selection?.kind === "star" ? selection.star : null);
  const selectedBody = $derived(selection?.kind === "body" ? selection.body : null);
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
  let pointing = $state<"off" | "waiting" | "on" | "unavailable">("off");
  let place = $state(loadPlace());
  let locating = $state<"idle" | "busy" | "error">("idle");
  let clock: ReturnType<typeof setInterval>;
  const names = constellationNames("fr");

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

  // --- Sensor pointing (DeviceOrientation, needs HTTPS)
  let smoothed: { forward: [number, number, number]; up: [number, number, number] } | null = null;
  let pointingTimeout: ReturnType<typeof setTimeout>;

  function onOrientation(e: DeviceOrientationEvent) {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    // Only an absolute (north-referenced) heading is usable for the sky.
    if (e.type === "deviceorientation" && !e.absolute) return;
    const raw = devicePointing(e.alpha, e.beta, e.gamma, screen.orientation?.angle ?? 0);
    smoothed = {
      forward: smooth(smoothed?.forward ?? null, raw.forward, 0.25),
      up: smooth(smoothed?.up ?? null, raw.up, 0.25),
    };
    pointing = "on";
    clearTimeout(pointingTimeout);
    map?.setView(pointingToView(smoothed.forward, smoothed.up));
  }

  // "deviceorientationabsolute" is not in lib.dom's event map: listen through a generic handler.
  const onOrientationEvent = (e: Event) => onOrientation(e as DeviceOrientationEvent);

  async function togglePointing() {
    if (pointing === "on" || pointing === "waiting") return stopPointing();
    // iOS Safari asks for permission; Android Chrome does not.
    const request = (
      DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    ).requestPermission;
    if (request && (await request().catch(() => "denied")) !== "granted") {
      pointing = "unavailable";
      return;
    }
    smoothed = null;
    pointing = "waiting";
    map?.setPointing(true);
    addEventListener("deviceorientationabsolute", onOrientationEvent);
    addEventListener("deviceorientation", onOrientationEvent);
    pointingTimeout = setTimeout(() => {
      if (pointing === "waiting") {
        stopPointing();
        pointing = "unavailable";
      }
    }, 2000);
  }

  function stopPointing() {
    clearTimeout(pointingTimeout);
    removeEventListener("deviceorientationabsolute", onOrientationEvent);
    removeEventListener("deviceorientation", onOrientationEvent);
    map?.setPointing(false);
    pointing = "off";
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
      const [catalog, strings, constellationLines] = await Promise.all([
        load("stars.bin").then((r) => r.arrayBuffer()),
        load("star-strings.json").then((r) => r.json()),
        load("constellation-lines.json").then((r) => r.json()),
      ]);
      const stars = decodeStarCatalog(catalog, strings);
      map = new SkyMap({
        canvas,
        overlay,
        stars,
        lines: constellationLines,
        constellationNames: names,
        cardinals: $_("map.cardinals").split(","),
        theme: THEMES.day,
        bodyNames: { Sun: $_("body.Sun"), Moon: $_("body.Moon") },
        onSelect: (s) => (selection = s),
        onViewChange: (v) => {
          viewAzimuth = v.azimuth;
          viewRoll = v.roll ?? 0;
        },
        describeTarget: (t) =>
          t.kind === "body"
            ? $_(`body.${t.body}` as `body.${BodyName}`)
            : (t.star.name ?? t.star.bayer ?? `HIP ${t.star.hip}`),
      });
      map.setObserver(place);
      status = "ready";
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
      clock = setInterval(() => {
        if (live) goLive();
      }, 30_000);
    } catch (e) {
      console.error(e);
      status = "error";
    }
  });

  onDestroy(() => {
    stopPointing();
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
    writeSetting("asteria.night", night);
    writeSetting("asteria.nightBrightness", brightness);
  });

  $effect(() => {
    map?.setLinesVisible(lines);
  });

  // Sun and Moon follow the displayed date and place.
  const bodies = $derived.by(() => {
    const sun = bodyPosition("Sun", date, place);
    const moon = bodyPosition("Moon", date, place);
    return { sun, moon, phase: moonPhase(date) };
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

<canvas class="sky" bind:this={canvas}></canvas>
<canvas class="overlay" bind:this={overlay}></canvas>

<header class="hud top">
  <p class="meta">#02 // {$_("map.title")}</p>
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

<div class="hud compass">
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
</div>
{#if pointing === "waiting"}
  <p class="hud toast">{$_("pointing.hint")}</p>
{:else if pointing === "unavailable"}
  <button class="hud toast" onclick={() => (pointing = "off")}>{$_("pointing.unavailable")}</button>
{/if}

{#if status !== "ready"}
  <p class="status">{status === "error" ? $_("map.error") : $_("map.loading")}</p>
{/if}

{#if selected}
  <aside class="hud panel">
    <p class="meta">HIP {selected.hip}{selected.bayer ? ` // ${selected.bayer}` : ""}</p>
    <p class="name">{selected.name ?? selected.bayer ?? `HIP ${selected.hip}`}</p>
    <p class="con">{names[selected.con]} · <i>{CONSTELLATION_LATIN[selected.con]}</i></p>
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
    <pre class="data">{bodyInfo.lines}</pre>
    {#if selectedBody === "Sun"}<p class="warn">{$_("sun.warning")}</p>{/if}
    <button class="close" onclick={() => (selection = null)} aria-label={$_("star.close")}>×</button
    >
  </aside>
{/if}

<nav class="hud bottom">
  {#if hint}<p class="hint">{hint}</p>{/if}
  <div class="group time">
    <button
      class="play"
      onclick={togglePlay}
      aria-label={playing ? $_("time.pause") : $_("time.play")}
      aria-pressed={playing}>{playing ? "❚❚" : "▶"}</button
    >
    <input
      class="slider scrub"
      type="range"
      aria-label={$_("time.scrub")}
      min={-RANGES[range].half}
      max={RANGES[range].half}
      step={RANGES[range].step}
      value={offset}
      oninput={(e) => setOffset(Number(e.currentTarget.value))}
    />
    <button class="speed" onclick={cycleSpeed}>{$_(RANGES[range].speeds[speedIndex]!.key)}</button>
  </div>
  <div class="row">
    <div class="group">
      <button onclick={cycleRange}>{$_(`time.range.${range}`)}</button>
      <button aria-pressed={live} onclick={goLive}>{$_("time.now")}</button>
    </div>
    <div class="group">
      <button aria-pressed={lines} onclick={() => (lines = !lines)}>{$_("map.lines")}</button>
      <button aria-pressed={night} onclick={() => (night = !night)} aria-label={$_("night.toggle")}
        >{$_("night.short")}</button
      >
    </div>
  </div>
  {#if night}
    <label class="group dim">
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
  .top {
    top: max(16px, env(safe-area-inset-top));
    left: 16px;
    right: 16px;
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
    margin: -4px 0 8px;
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
  .compass {
    top: max(16px, env(safe-area-inset-top));
    right: 16px;
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
  .toast {
    top: calc(max(16px, env(safe-area-inset-top)) + 110px);
    left: 16px;
    right: 16px;
    margin: 0 auto;
    max-width: 320px;
    padding: 10px 12px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 88%, transparent);
    font: 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg);
    text-align: center;
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
    left: 16px;
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .group {
    display: flex;
    flex-wrap: wrap;
    max-width: 100%;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 70%, transparent);
    backdrop-filter: blur(4px);
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
    padding: 13px 14px;
    cursor: pointer;
  }
  .time {
    width: 100%;
    max-width: 420px;
    flex-wrap: nowrap;
  }
  .time {
    align-items: center;
  }
  .time .play {
    width: 44px;
    flex: none;
  }
  .time .speed {
    flex: none;
    min-width: 108px;
    text-transform: none; /* "1 s = 10 min": unit symbols stay lower-case */
  }
  .scrub {
    flex: 1;
    min-width: 0;
    margin: 0 12px;
  }
  .row {
    display: flex;
    gap: 8px;
    width: 100%;
    max-width: 420px;
    justify-content: space-between;
  }
  .row .group {
    flex-wrap: nowrap;
  }
  .row button {
    padding: 13px 10px;
    white-space: nowrap;
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
  .group button:last-child {
    border-right: 0;
  }
  button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .panel {
    left: 16px;
    right: 16px;
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
