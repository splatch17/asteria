<script lang="ts">
  // « Selon la latitude » (#188): which constellations a latitude sees. A latitude control (from
  // pole to pole, starting at the player's place, else Paris, or at `latitude` when a caller such
  // as the games' « visible from home » setting opens it there), the celestial sphere seen from
  // outside with the observer's horizon and the sky turning about the tilted axis
  // (LatitudeSphere), the flat map of the whole sky with the three zones as bands
  // (LatitudeMap), the counts and lists of the constellations always seen, seen part of the year
  // and never seen (astro-core latitude-visibility.ts), and an explanation by level. A tap on a
  // constellation (lists, map, sphere) shows it on both drawings.
  // Motion: tweens to a preset and the « play » sweep (90° cos t, slow at the poles); with
  // reduced motion, no tween, a still sky and a play that steps through notable latitudes.
  import { onMount, untrack } from "svelte";
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
    presetLatitude,
    tweenLatitude,
    type ListedConstellation,
    type Preset,
  } from "../lib/latitude";
  import { figureStars } from "../lib/games/geometry";
  import { HOME_MIN_ALTITUDE, HOME_MIN_SHARE, visibleFromLatitude } from "../lib/games/visibility";
  import { LEVEL_STORAGE_KEY, isLevel } from "../lib/layers";
  import { readSetting, writeSetting } from "../lib/storage";
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
  const urlLevel = params.get("level");
  let level = $state<FigureLevel>(
    isLevel(urlLevel) ? urlLevel : readSetting(LEVEL_STORAGE_KEY, "amateur", isLevel),
  );
  function chooseLevel(l: FigureLevel) {
    level = l;
    if (!isLevel(urlLevel)) writeSetting(LEVEL_STORAGE_KEY, l);
  }

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
  let lst = untrack(() => greenwichMeanSiderealTime(date) + observer.longitude);

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
  $effect(() => {
    const t = { ink: theme.ink, sky: theme.sky };
    sphere?.setTheme(t);
    map?.setTheme(t);
    sphereDirty = mapDirty = true;
  });
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
    if (sphere && sphereDirty) {
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
    }
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
  let closeButton: HTMLButtonElement;
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.focus();
    sphere = new LatitudeSphere(sphereCanvas);
    map = new LatitudeMap(mapCanvas);
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
      previous?.focus?.();
    };
  });

  /** Escape closes; Tab cycles inside the dialog. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input")];
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
  <header class="head">
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
    <section class="stage" aria-label={$_("latitude.slider")}>
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
      <section class="map-block" aria-labelledby="latitude-map">
        <h2 class="group-title" id="latitude-map">{$_("latitude.map.title")}</h2>
        <div
          class="map"
          bind:this={mapBox}
          onpointerdown={mapTap.down}
          onpointerup={mapTap.up}
          role="presentation"
        >
          <canvas bind:this={mapCanvas} aria-hidden="true"></canvas>
          <p class="sr-only">{$_("latitude.map.label", { values: { lat: fmtLatLong(lat) } })}</p>
        </div>
      </section>

      <dl class="counts">
        {#each ZONES as z (z)}
          <div class="count">
            <dt>
              <span class={`swatch ${z}`} aria-hidden="true"></span>{$_(`latitude.zone.short.${z}`)}
            </dt>
            <dd>
              <strong>{lists[z].length}</strong>
              {#if level === "expert"}<small
                  >{$_("latitude.share", { values: { share: pct(shares[z]) } })}</small
                >{/if}
            </dd>
          </div>
        {/each}
      </dl>

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
    border: 1px solid var(--ast-hairline);
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
    border: 1px solid var(--ast-hairline);
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
  .map {
    aspect-ratio: 2 / 1;
    box-shadow: 0 0 0 1px var(--ast-hairline);
    touch-action: manipulation;
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 14px 0 0;
  }
  .count {
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
  }
  .count dd {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }
  .count strong {
    font: 700 32px/1 var(--ast-font-display);
    font-variant-numeric: tabular-nums;
  }
  .count small {
    font: 500 9px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .count dt {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font: 500 9px/1.25 var(--ast-font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  /* Zone swatches: the drawings' patterns (dots: always up; hatching: never up; clear). */
  .swatch {
    flex: none;
    width: 11px;
    height: 11px;
    box-sizing: border-box;
    border: 1px solid var(--ast-fg-muted);
  }
  .swatch.always,
  .mark.always {
    background: conic-gradient(from 270deg at 1px 1px, var(--ast-fg) 25%, transparent 0) 0 0 / 2px
      2px;
  }
  .swatch.never,
  .mark.never {
    background: repeating-linear-gradient(
      -45deg,
      var(--ast-fg) 0 0.75px,
      transparent 0.75px 2.83px
    );
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
    border: 1px solid var(--ast-hairline);
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
  .chip[aria-pressed="true"] .mark.always {
    background: conic-gradient(from 270deg at 1px 1px, var(--ast-bg) 25%, transparent 0) 0 0 / 2px
      2px;
  }
  .chip[aria-pressed="true"] .mark.never {
    background: repeating-linear-gradient(
      -45deg,
      var(--ast-bg) 0 0.75px,
      transparent 0.75px 2.83px
    );
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
    border: 1px solid var(--ast-hairline);
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
  @media (prefers-reduced-motion: reduce) {
    .latitude {
      animation: none;
    }
  }
</style>
