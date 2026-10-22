<script lang="ts">
  // « Où est-elle ? » (#184): a constellation is named (with its figure on a small card in
  // Découverte and Amateur) and the player taps its area on the sky as fast as possible. The sky
  // is the games' SkyMap (same stars, lines and highlight as the map), panned and zoomed with
  // the fingers over the whole sky: the made-up observer's zenith follows the view centre
  // (recentre), so the horizon never shows. Areas are the IAU boundaries (astro-core,
  // constellationAt), drawn by this component on a canvas of its own over the map:
  //  - Découverte and Amateur: figure lines and faint boundaries; Expert: the stars only;
  //  - right: the area lights up (1-bit dither) with its name, points for speed;
  //  - wrong: the area tapped is named (dashed), the view flies to show the right one lit.
  // Areas are redrawn after each map frame only (the map renders on demand).
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { _, locale } from "@asteria/ui";
  import {
    areaPlace,
    boundsOutline,
    constellationAt,
    distanceToOutline,
    j2000ToHorizontalMatrix,
    loadConstellationBounds,
    unitVector,
    type AreaPlace,
    type ConstellationBounds,
    type Observer,
    type Vec3,
  } from "@asteria/astro-core";
  import {
    fovForCornerAngle,
    inkPattern,
    type CatalogStar,
    type FigureLevel,
    type SkyMap,
    type SkyTheme,
  } from "@asteria/sky-renderer";
  import { ZENITH_REACH, aimAt, createGameSky, gameTheme, recentre } from "../lib/games/game-sky";
  import { angleBetween, framingFov } from "../lib/games/geometry";
  import type { ItemResult } from "../lib/games/results";
  import type { Grade } from "../lib/games/srs";
  import {
    MAX_SCORE,
    TIMING,
    gradeFor,
    judge,
    pointsFor,
    silhouette,
    slerp,
    slopDegrees,
  } from "../lib/games/where-is-it";
  import GameHeader from "./GameHeader.svelte";
  import Icon from "./Icon.svelte";
  import SeriesEnd from "./SeriesEnd.svelte";

  let {
    series,
    stars,
    lines,
    names,
    level,
    theme,
    figureSet,
    date,
    observer,
    onresult,
    onfinish,
    onreplay,
    onquit,
  }: {
    /** Abbreviations of the constellations to find. */
    series: string[];
    stars: CatalogStar[];
    lines: Record<string, number[][]>;
    names: Readonly<Record<string, string>>;
    level: FigureLevel;
    theme: SkyTheme;
    figureSet: string;
    date: Date;
    /** The player's place: the first view is their zenith at the app's date. */
    observer: Observer;
    /** Records a round, returns what it changed. */
    onresult: (abbr: string, grade: Grade) => ItemResult;
    /** Records the finished series, returns the record before it. */
    onfinish: (score: number) => number;
    onreplay: () => void;
    onquit: () => void;
  } = $props();

  /** Field of a new question (degrees), at most; the narrowest the player may zoom to. */
  const START_FOV = 110;
  const MIN_FOV = 8;
  /** Widest field: the screen's corners stay within ZENITH_REACH of the zenith (#183). */
  let maxFov = 140;
  function setLimits() {
    if (!map) return;
    const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
    maxFov = fovForCornerAngle(ZENITH_REACH, aspect);
    map.setViewLimits({ minFov: MIN_FOV, maxFov });
  }
  /** A tap: one finger, moved less than this (px), lifted within TAP_MS. */
  const TAP_PX = 8;
  const TAP_MS = 600;
  /** A right answer moves on by itself after this long. */
  const NEXT_MS = 1300;
  const FLIGHT_MS = 700;
  const CAPTURE = new URLSearchParams(location.search).has("seed");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nameOf = (abbr: string) => names[abbr] ?? abbr;
  const timing = untrack(() => TIMING[level]);

  interface Round extends ItemResult {
    points: number;
    ms: number;
    tapped: string | null;
    edge: boolean;
    gaveUp: boolean;
  }

  let index = $state(0);
  let rounds = $state.raw<Round[]>([]);
  /** The current round once answered, null while asked. */
  let current = $state.raw<Round | null>(null);
  let done = $state(false);
  let previousBest = $state(0);
  let status = $state("");
  let loadError = $state(false);
  let bounds = $state.raw<ConstellationBounds | null>(null);
  const target = $derived(series[index] ?? "");
  const score = $derived(rounds.reduce((s, r) => s + r.points, 0));
  /** The timer bar restarts with each question (keyed on it). */
  let asked = $state(0);

  let stage: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let areas: HTMLCanvasElement;
  let card = $state<HTMLCanvasElement>();
  let ctx: CanvasRenderingContext2D | null = null;
  let map: SkyMap | undefined;
  let hidden = $state(false);
  let nextButton = $state<HTMLButtonElement>();
  let giveUpButton = $state<HTMLButtonElement>();

  // --- areas: outlines as flat J2000 vectors, projected after each frame

  /** Faint outlines of all the areas (2° steps), and their screen positions. */
  let allDirs: Float64Array = new Float64Array(0);
  let allScreen: Float32Array = new Float32Array(0);
  /** Start index (in points) of each ring in allDirs. */
  let allRings: number[] = [];
  // A cache read by the drawing only: no reactivity needed.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const places = new Map<string, AreaPlace>();
  function place(abbr: string): AreaPlace | null {
    if (!bounds) return null;
    let p = places.get(abbr);
    if (!p) places.set(abbr, (p = areaPlace(bounds, abbr)));
    return p;
  }
  function flatten(rings: Vec3[][]): { dirs: Float64Array; starts: number[] } {
    const total = rings.reduce((s, r) => s + r.length, 0);
    const dirs = new Float64Array(total * 3);
    const starts: number[] = [];
    let k = 0;
    for (const ring of rings) {
      starts.push(k);
      for (const p of ring) dirs.set(p, 3 * k++);
    }
    starts.push(k);
    return { dirs, starts };
  }

  /** What the answer shows: the right area, the one tapped (wrong), the tap itself. */
  let shown: {
    right: { dirs: Float64Array; starts: number[]; screen: Float32Array; inner: Vec3 };
    wrong: { dirs: Float64Array; starts: number[]; screen: Float32Array; inner: Vec3 } | null;
    tap: Vec3 | null;
  } | null = null;
  function areaShape(abbr: string) {
    const p = place(abbr)!;
    const { dirs, starts } = flatten(p.outline);
    return { dirs, starts, screen: new Float32Array((dirs.length / 3) * 2), inner: p.inner };
  }

  let pattern: { ink: string; pattern: CanvasPattern | null } | null = null;
  const xy = new Float64Array(2);
  function screenOf(dir: Vec3): [number, number] | null {
    if (!map) return null;
    map.projectDirections(dir, xy);
    return Number.isFinite(xy[0]) ? [xy[0]!, xy[1]!] : null;
  }

  /** Traces rings (screen points) as one path, broken where a point is behind the view. */
  function trace(screen: Float32Array, starts: number[], w: number, h: number) {
    if (!ctx) return;
    const jump = 2 * Math.max(w, h);
    for (let r = 0; r + 1 < starts.length; r++) {
      let pen = false;
      let [px, py] = [0, 0];
      for (let i = starts[r]!; i < starts[r + 1]!; i++) {
        const x = screen[2 * i]!;
        const y = screen[2 * i + 1]!;
        if (!Number.isFinite(x) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5) {
          pen = false;
          continue;
        }
        if (pen && Math.hypot(x - px, y - py) < jump) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        pen = true;
        [px, py] = [x, y];
      }
    }
  }
  const allFinite = (screen: Float32Array) => screen.every((v) => Number.isFinite(v));

  function draw() {
    if (!ctx || !map) return;
    const w = areas.clientWidth;
    const h = areas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const ink = theme.ink;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineJoin = "round";
    // Faint boundaries of every area (not in Expert: the stars only).
    if (level !== "expert" && allDirs.length) {
      map.projectDirections(allDirs, allScreen);
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      trace(allScreen, allRings, w, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (shown) {
      const { right, wrong, tap } = shown;
      if (wrong) {
        map.projectDirections(wrong.dirs, wrong.screen);
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        trace(wrong.screen, wrong.starts, w, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      map.projectDirections(right.dirs, right.screen);
      ctx.beginPath();
      trace(right.screen, right.starts, w, h);
      // The lit area: a 1-bit checkerboard of the ink (DA), only when wholly in front.
      if (allFinite(right.screen)) {
        pattern = inkPattern(ctx, ink, pattern);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = pattern.pattern ?? ink;
        ctx.fill("evenodd");
        ctx.fillStyle = ink;
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (tap) {
        const p = screenOf(tap);
        if (p) cross(p[0], p[1]);
      }
      label(right.inner, nameOf(target), true);
      if (wrong && current?.tapped) label(wrong.inner, nameOf(current.tapped), false);
    }
    ctx.globalAlpha = 1;
  }

  function cross(x: number, y: number) {
    if (!ctx) return;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 6);
    ctx.lineTo(x + 6, y + 6);
    ctx.moveTo(x + 6, y - 6);
    ctx.lineTo(x - 6, y + 6);
    ctx.stroke();
  }

  /** A name on the map: the right one in the display face, the wrong one in mono. */
  function label(dir: Vec3, text: string, strong: boolean) {
    const p = screenOf(dir);
    if (!ctx || !p) return;
    ctx.globalAlpha = strong ? 1 : 0.85;
    ctx.font = strong
      ? "700 20px 'Big Shoulders Display', sans-serif"
      : "500 11px 'JetBrains Mono', monospace";
    const t = strong ? text.toUpperCase() : text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // A plate of the sky colour keeps the name readable over the lines.
    const width = ctx.measureText(t).width;
    const hgt = strong ? 22 : 14;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = theme.sky;
    ctx.fillRect(p[0] - width / 2 - 4, p[1] - hgt / 2, width + 8, hgt);
    ctx.restore();
    ctx.fillText(t, p[0], p[1] + 1);
  }

  function sizeAreas() {
    const w = areas.clientWidth;
    const h = areas.clientHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    if (areas.width !== Math.round(w * dpr) || areas.height !== Math.round(h * dpr)) {
      areas.width = Math.round(w * dpr);
      areas.height = Math.round(h * dpr);
      pattern = null;
    }
    ctx = areas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** After each map frame: keep the zenith at the centre, bound the field, redraw the areas. */
  function onView() {
    if (!map) return;
    if (!flight && map.view.altitude < 89.5)
      recentre(map, date, stage.clientWidth, stage.clientHeight);
    draw();
    if (CAPTURE) exposeTarget();
  }

  /** Captures (`?seed=`): where the target's inner point and another area are, for the script. */
  function exposeTarget() {
    if (!bounds || !target) return;
    const p = screenOf(place(target)!.inner);
    areas.dataset.target = JSON.stringify(p);
    const other = bounds.abbrs.find((a) => a !== target && screenOf(place(a)!.inner) !== null);
    if (other) {
      const q = screenOf(place(other)!.inner)!;
      if (q[0] > 20 && q[1] > 20 && q[0] < stage.clientWidth - 20)
        areas.dataset.other = JSON.stringify(q);
    }
  }

  // --- camera flight to an area (answer shown)

  let flight: number | null = null;
  function flyTo(centre: Vec3, fov: number) {
    if (!map) return;
    recentre(map, date, stage.clientWidth, stage.clientHeight);
    const from = map.directionAt(stage.clientWidth / 2, stage.clientHeight / 2);
    const roll0 = map.view.roll ?? 0;
    const fov0 = map.view.fov;
    if (flight !== null) cancelAnimationFrame(flight);
    const start = performance.now();
    const duration = reduceMotion ? 0 : FLIGHT_MS;
    const step = () => {
      const t = duration > 0 ? Math.min(1, (performance.now() - start) / duration) : 1;
      const e = 1 - (1 - t) ** 3;
      aimAt(map!, slerp(from, centre, e), date, roll0 * (1 - e), fov0 + (fov - fov0) * e);
      flight = t < 1 ? requestAnimationFrame(step) : null;
    };
    step();
  }

  /** Frames the right area (and the tap, on a miss) when it is not already well in view. */
  function showAnswer(tap: Vec3 | null) {
    const p = place(target);
    if (!p || !map) return;
    const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
    let centre = p.inner;
    let radius = p.radius + angleBetween(p.inner, p.centre);
    if (tap) {
      centre = slerp(p.inner, tap, 0.5);
      radius = Math.max(
        angleBetween(centre, tap) + 3,
        ...p.outline.flat().map((q) => angleBetween(centre, q)),
      );
    }
    const fov = Math.min(maxFov, Math.max(30, framingFov(radius, aspect, 0.85, 30)));
    flyTo(centre, fov);
  }

  // --- rounds

  let askedAt = 0;
  let autoNext: ReturnType<typeof setTimeout> | null = null;

  function ask() {
    current = null;
    shown = null;
    map?.setSelectedConstellation(null);
    map?.setSelectedNameShown(false);
    if (map && map.view.fov < Math.min(START_FOV, maxFov))
      map.setView({ fov: Math.min(START_FOV, maxFov) });
    status = bounds ? $_("where.ask") : loadError ? $_("where.loadError") : $_("where.loading");
    askedAt = performance.now();
    asked++;
    drawCard();
    draw();
  }

  async function answer(tapDir: Vec3 | null) {
    if (current || !bounds || done) return;
    const ms = performance.now() - askedAt;
    const gaveUp = tapDir === null;
    const tapped = tapDir ? constellationAt(bounds, tapDir) : null;
    const distance = tapDir ? distanceToOutline(place(target)!.outline, tapDir) : Infinity;
    const slop = map ? slopDegrees(map.view.fov, stage.clientHeight) : 0;
    const { correct, edge } = tapDir
      ? judge(target, { tapped, distance }, slop)
      : { correct: false, edge: false };
    const points = correct ? pointsFor(ms, level) : 0;
    const result = onresult(target, gradeFor(correct, ms, level, edge));
    current = { ...result, points, ms, tapped, edge, gaveUp };
    rounds = [...rounds, current];
    shown = {
      right: areaShape(target),
      wrong: !correct && tapped && tapped !== target ? areaShape(tapped) : null,
      tap: correct ? null : tapDir,
    };
    map?.setSelectedConstellation(target);
    map?.setSelectedNameShown(false);
    if (correct)
      status = edge
        ? $_("where.edge", { values: { points } })
        : $_("where.right", { values: { points } });
    else if (gaveUp) status = $_("where.shown", { values: { name: nameOf(target) } });
    else
      status = $_("where.wrong", {
        values: { tapped: tapped ? nameOf(tapped) : "?", name: nameOf(target) },
      });
    if (!correct) showAnswer(tapDir);
    draw();
    await tick();
    nextButton?.focus();
    if (correct && !CAPTURE) autoNext = setTimeout(() => void next(), NEXT_MS);
  }

  async function next() {
    if (autoNext) clearTimeout(autoNext);
    autoNext = null;
    if (!current) return;
    if (index + 1 >= series.length) {
      previousBest = onfinish(score);
      done = true;
      return;
    }
    if (!reduceMotion) {
      hidden = true;
      await new Promise((r) => setTimeout(r, 140));
    }
    index++;
    ask();
    hidden = false;
    await tick();
    giveUpButton?.focus();
  }

  // --- taps (the map pans and zooms by itself; a short still touch is a tap)

  // Pointer bookkeeping, never read by the markup.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const touches = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  let multi = false;
  function point(e: PointerEvent): [number, number] {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function onpointerdown(e: PointerEvent) {
    const [x, y] = point(e);
    touches.set(e.pointerId, { x, y, t: performance.now(), moved: false });
    if (touches.size > 1) multi = true;
  }
  function onpointermove(e: PointerEvent) {
    const t = touches.get(e.pointerId);
    if (!t) return;
    const [x, y] = point(e);
    if (Math.hypot(x - t.x, y - t.y) > TAP_PX) t.moved = true;
  }
  function onpointerup(e: PointerEvent) {
    const t = touches.get(e.pointerId);
    touches.delete(e.pointerId);
    if (!t) return;
    const tap = !multi && !t.moved && performance.now() - t.t < TAP_MS;
    if (touches.size === 0) multi = false;
    if (!tap || !map || current || !bounds) return;
    const [x, y] = point(e);
    void answer(map.directionAt(x, y));
  }
  function onpointercancel(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (touches.size === 0) multi = false;
  }

  // --- silhouette card (Découverte, Amateur)

  const byHip = untrack(() => new Map(stars.map((s) => [s.hip, s])));
  function drawCard() {
    if (!card || level === "expert") return;
    const c = card.getContext("2d");
    if (!c) return;
    const size = card.clientWidth;
    const dpr = Math.min(devicePixelRatio, 2);
    card.width = card.height = Math.round(size * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    const polys = lines[target] ?? [];
    const dirs = polys.flat().map((hip) => byHip.get(hip));
    const known = dirs.filter((s) => s !== undefined).map((s) => unitVector(s.ra, s.dec));
    if (!known.length) return;
    const sum = known.reduce<Vec3>((a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0]);
    const n = Math.hypot(...sum) || 1;
    const sketch = silhouette(
      polys,
      (hip) => {
        const s = byHip.get(hip);
        return s && { dir: unitVector(s.ra, s.dec), v: s.v };
      },
      [sum[0] / n, sum[1] / n, sum[2] / n],
    );
    const pad = 7;
    const span = size - 2 * pad;
    c.strokeStyle = c.fillStyle = theme.ink;
    c.lineWidth = 1.2;
    c.lineCap = "round";
    c.beginPath();
    for (const [x0, y0, x1, y1] of sketch.segments) {
      c.moveTo(pad + x0 * span, pad + y0 * span);
      c.lineTo(pad + x1 * span, pad + y1 * span);
    }
    c.stroke();
    for (const [x, y, v] of sketch.stars) {
      const r = Math.max(1, Math.min(3, 2.6 - v * 0.4));
      c.beginPath();
      c.arc(pad + x * span, pad + y * span, r + 1.2, 0, Math.PI * 2);
      c.fillStyle = theme.sky;
      c.fill();
      c.beginPath();
      c.arc(pad + x * span, pad + y * span, r, 0, Math.PI * 2);
      c.fillStyle = theme.ink;
      c.fill();
    }
  }

  // --- life cycle

  async function load() {
    loadError = false;
    try {
      bounds = await loadConstellationBounds();
      const { dirs, starts } = flatten(bounds.abbrs.flatMap((a) => boundsOutline(bounds!, a, 2)));
      allDirs = dirs;
      allRings = starts;
      allScreen = new Float32Array((dirs.length / 3) * 2);
    } catch (e) {
      console.error(e);
      loadError = true;
    }
    if (!done && !current) ask();
  }

  onMount(() => {
    map = createGameSky({
      canvas,
      overlay,
      stars,
      lines,
      names,
      theme,
      figureSet,
      date,
      level,
      layers: {
        constellationLines: level !== "expert",
        constellationFigures: false,
      },
      onViewChange: () => onView(),
    });
    sizeAreas();
    setLimits();
    if (map) {
      // The player's zenith at the app's date: the sky they know, to start from.
      const m = j2000ToHorizontalMatrix(date, observer);
      aimAt(map, [m[6], m[7], m[8]], date, 0, Math.min(START_FOV, maxFov));
    }
    ask();
    void load();
    const resize = new ResizeObserver(() => {
      sizeAreas();
      setLimits();
      draw();
    });
    resize.observe(stage);
    return () => resize.disconnect();
  });
  onDestroy(() => {
    if (autoNext) clearTimeout(autoNext);
    if (flight !== null) cancelAnimationFrame(flight);
    map?.dispose();
  });

  $effect(() => {
    map?.setTheme(gameTheme(theme));
    pattern = null;
    draw();
    drawCard();
  });

  // A new series (Rejouer): back to its first constellation.
  let playedSeries: string[] | null = null;
  $effect(() => {
    if (series === playedSeries) return;
    const first = playedSeries === null;
    playedSeries = series;
    if (first) return;
    index = 0;
    rounds = [];
    done = false;
    void tick().then(() => {
      ask();
      giveUpButton?.focus();
    });
  });

  const fmt = $derived(new Intl.NumberFormat($locale ?? "fr"));
  function detail(i: number): string {
    const r = rounds[i];
    if (!r) return "";
    const seconds = $_("where.seconds", { values: { s: Math.round(r.ms / 100) / 10 } });
    if (r.correct) return `${seconds} · ${$_("where.points", { values: { points: r.points } })}`;
    if (r.gaveUp) return $_("where.gaveUp");
    return $_("where.tapped", { values: { name: r.tapped ? nameOf(r.tapped) : "?" } });
  }
</script>

<div class="where">
  <GameHeader
    meta={$_("games.whereIsIt.title")}
    results={rounds.map((r) => r.correct)}
    total={series.length}
    {index}
    {done}
    progressLabel={$_("where.progress", {
      values: { n: Math.min(index + 1, series.length), total: series.length },
    })}
    {onquit}
  />

  <div
    class="stage"
    class:hidden
    class:gone={done}
    role="img"
    aria-label={$_("where.sky")}
    bind:this={stage}
  >
    <canvas
      bind:this={canvas}
      class="sky"
      aria-hidden="true"
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      {onpointercancel}
    ></canvas>
    <canvas bind:this={overlay} class="layer" aria-hidden="true"></canvas>
    <canvas bind:this={areas} class="layer" aria-hidden="true"></canvas>
    {#if !current && bounds && !done}
      {#key asked}
        <div
          class="timer"
          style:--grace={`${timing.grace}ms`}
          style:--window={`${timing.window}ms`}
          aria-hidden="true"
        ></div>
      {/key}
    {/if}
  </div>

  {#if done}
    <SeriesEnd
      {score}
      total={series.length}
      {previousBest}
      results={rounds}
      {nameOf}
      {detail}
      of={$_("where.end.of", { values: { max: fmt.format(MAX_SCORE) } })}
      scoreLabel={$_("where.end.score", {
        values: { score, right: rounds.filter((r) => r.correct).length, total: series.length },
      })}
      recordLabel={$_("where.end.best", { values: { best: fmt.format(previousBest) } })}
      {onreplay}
      {onquit}
    />
  {:else}
    <section class="panel" aria-labelledby="where-name">
      <div class="row">
        <div class="text">
          <span class="label">{$_("where.label")}</span>
          <h2 id="where-name" class="name">{nameOf(target)}</h2>
        </div>
        {#if level !== "expert"}
          <div
            class="card"
            role="img"
            aria-label={$_("where.card", { values: { name: nameOf(target) } })}
          >
            <canvas bind:this={card} aria-hidden="true"></canvas>
          </div>
        {/if}
      </div>
      <p class="status" role="status" class:right={current?.correct}>{status}</p>
      <div class="actions">
        <span class="total">{$_("where.score", { values: { score: fmt.format(score) } })}</span>
        {#if current}
          <button class="primary" bind:this={nextButton} onclick={next}>
            {index + 1 >= series.length ? $_("quiz.result") : $_("quiz.next")}
            <Icon name="play" size={10} />
          </button>
        {:else}
          <button bind:this={giveUpButton} disabled={!bounds} onclick={() => answer(null)}
            >{$_("where.giveUp")}</button
          >
        {/if}
      </div>
      {#if loadError}
        <button class="retry" onclick={load}>{$_("where.retry")}</button>
      {/if}
    </section>
  {/if}
</div>

<style>
  .where {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 200px;
    overflow: hidden;
  }
  /* Between two rounds a veil of the background covers the sky: the canvases themselves are
     never made transparent (Chromium may then keep presenting their previous frame). */
  .stage::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--ast-bg);
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms var(--ast-ease-out);
  }
  .stage.hidden::after {
    opacity: 1;
  }
  .stage.gone {
    display: none;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  .sky {
    touch-action: none;
    cursor: crosshair;
  }
  .layer {
    pointer-events: none;
  }
  /* Points still to win: full during the grace time, then running down (CSS only). */
  .timer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--ast-fg);
    transform-origin: left;
    pointer-events: none;
    animation: drain var(--window) linear var(--grace) forwards;
  }
  @keyframes drain {
    to {
      transform: scaleX(0.1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stage::after {
      transition: none;
    }
    .timer {
      animation: none;
    }
  }
  .panel {
    flex: none;
    padding: 10px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
    border-top: 1px solid var(--ast-hairline);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .label {
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .name {
    margin: 2px 0 0;
    font: 700 28px/1.05 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  /* The figure on a small collection card: checkerboard frame (DA §3). */
  .card {
    position: relative;
    flex: none;
    width: 60px;
    height: 60px;
    padding: 3px;
    box-sizing: content-box;
    background:
      linear-gradient(var(--ast-bg), var(--ast-bg)) content-box,
      repeating-conic-gradient(var(--ast-fg) 0 25%, transparent 0 50%) 0 0 / 6px 6px;
  }
  .card canvas {
    inset: 3px;
    width: 60px;
    height: 60px;
  }
  .status {
    margin: 6px 0 10px;
    min-height: 1.5em;
    font: 400 12px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .status.right {
    color: var(--ast-fg);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .total {
    flex: 1;
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 16px;
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
    background: transparent;
    border: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button:hover:not(:disabled) {
    border-color: var(--ast-fg);
  }
  button:disabled {
    color: var(--ast-fg-muted);
    cursor: default;
  }
  button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .primary {
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .retry {
    width: 100%;
    margin-top: 8px;
  }
</style>
