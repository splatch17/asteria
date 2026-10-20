<script lang="ts">
  // « Relie les étoiles » (#164): a constellation's star field on the real sky (games' SkyMap,
  // no lines, no names), and the player traces the figure from star to star, by tapping one star
  // then the next or by dragging from one to the other. Touches snap to the nearest star drawn
  // (generous radius). Drawn over the map on a canvas of the game's own:
  //  - found segments stay in ink; a wrong one flashes dashed and fades;
  //  - the star picked is ringed; Découverte rings the figure's stars lightly;
  //  - a hint (button, or after a few misses in a row) rings the star to start from and makes
  //    the next one blink.
  // Once every segment is found, or on « Solution », the map shows the figure itself (lines,
  // name, and the illustrated figure in Découverte).
  // The overlay is redrawn on events only, and every frame only while something animates.
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { _ } from "@asteria/ui";
  import { unitVector } from "@asteria/astro-core";
  import {
    limitingMagnitude,
    type CatalogStar,
    type FigureLevel,
    type SkyMap,
    type SkyTheme,
  } from "@asteria/sky-renderer";
  import {
    attempt,
    isComplete,
    needsHint,
    newTrace,
    nextHint,
    segmentKey,
    snap,
    traceFov,
    withHint,
    withSolution,
    type ScreenStar,
    type Segment,
    type Trace,
  } from "../lib/games/connect-stars";
  import { createGameSky, gameTheme, showFigure } from "../lib/games/game-sky";
  import { angleBetween, type ConstellationShape } from "../lib/games/geometry";
  import type { ItemResult } from "../lib/games/results";
  import GameHeader from "./GameHeader.svelte";
  import Icon from "./Icon.svelte";
  import SeriesEnd from "./SeriesEnd.svelte";

  let {
    series,
    stars,
    lines,
    names,
    figures,
    shapes,
    level,
    theme,
    figureSet,
    date,
    onresult,
    onfinish,
    onreplay,
    onquit,
  }: {
    /** Abbreviations of the constellations to trace. */
    series: string[];
    stars: CatalogStar[];
    lines: Record<string, number[][]>;
    names: Readonly<Record<string, string>>;
    figures: Readonly<Record<string, readonly Segment[]>>;
    shapes: Readonly<Record<string, ConstellationShape>>;
    level: FigureLevel;
    theme: SkyTheme;
    figureSet: string;
    date: Date;
    /** Records a finished figure, returns what it changed. */
    onresult: (abbr: string, trace: Trace) => ItemResult;
    onfinish: (score: number) => number;
    onreplay: () => void;
    onquit: () => void;
  } = $props();

  /** Touch radius (CSS px) around a star: larger for small fingers in Découverte. */
  const SNAP_PX = untrack(() => (level === "discovery" ? 34 : 28));
  /** A drag starts beyond this many px; below it, the touch is a tap. */
  const DRAG_PX = 10;
  const FLASH_MS = 700;
  const CAPTURE = new URLSearchParams(location.search).has("seed");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nameOf = (abbr: string) => names[abbr] ?? abbr;

  let index = $state(0);
  let results = $state.raw<(ItemResult & { trace: Trace })[]>([]);
  let trace = $state.raw<Trace>(newTrace([]));
  /** The figure is finished (traced or shown) and waits for « Suivante ». */
  let finished = $state(false);
  let done = $state(false);
  let previousBest = $state(0);
  /** Short feedback under the name (aria-live). */
  let status = $state("");
  const abbr = $derived(series[index] ?? "");
  const score = $derived(results.filter((r) => r.correct).length);

  let stage: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let game: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let map: SkyMap | undefined;
  let hidden = $state(false);
  let nextButton = $state<HTMLButtonElement>();
  let hintButton = $state<HTMLButtonElement>();

  // --- stars on screen

  /** Stars a touch may land on: those the map draws around the figure, and the figure's own. */
  let candidates: number[] = [];
  let figureStars = new Set<number>();
  let onScreen: ScreenStar[] = [];
  // Read by the canvas drawing only, never by the markup: no reactivity needed.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pos = new Map<number, [number, number]>();
  let fov = 60;

  function prepare() {
    const shape = shapes[abbr];
    const segs = figures[abbr] ?? [];
    figureStars = new Set(segs.flat());
    if (!shape) return;
    const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
    fov = traceFov(shape.radius, aspect);
    const limit = limitingMagnitude(fov);
    const reach = fov * 0.9;
    candidates = stars
      .filter(
        (s) =>
          figureStars.has(s.hip) ||
          (s.v <= limit && angleBetween(shape.centre, unitVector(s.ra, s.dec)) < reach),
      )
      .map((s) => s.hip);
    if (map) showFigure(map, shape, date, fov);
  }

  /** Screen positions of the candidates, after each map frame (view, size, figure reveal). */
  function project() {
    if (!map) return;
    pos.clear();
    onScreen = [];
    for (const hip of candidates) {
      const p = map.projectStar(hip);
      if (!p) continue;
      pos.set(hip, p);
      onScreen.push({ hip, x: p[0], y: p[1] });
    }
    sizeGame();
    draw();
    // Captures (`?seed=`): where the figure's segments are, for the scripted touches.
    if (CAPTURE)
      game.dataset.segments = JSON.stringify(
        (figures[abbr] ?? []).map(([a, b]) => [pos.get(a), pos.get(b)]),
      );
  }

  function sizeGame() {
    const w = game.clientWidth;
    const h = game.clientHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    if (game.width !== Math.round(w * dpr) || game.height !== Math.round(h * dpr)) {
      game.width = Math.round(w * dpr);
      game.height = Math.round(h * dpr);
    }
    ctx = game.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // --- interaction state

  /** The star picked (first of a stroke), or null. */
  let selected = $state<number | null>(null);
  /** A drag from a star: where the finger is now. */
  let drag: {
    from: number;
    /** Where the finger went down, and where it is. */
    sx: number;
    sy: number;
    x: number;
    y: number;
    moved: boolean;
    id: number;
  } | null = null;
  let flash: { a: number; b: number; start: number } | null = null;
  let hint: { from: number; to: number; start: number } | null = null;
  let raf = 0;

  function animate() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      draw();
      const now = performance.now();
      if (flash && now - flash.start > FLASH_MS) flash = null;
      if (flash || (hint && !reduceMotion) || drag?.moved) animate();
      else draw();
    });
  }

  function point(e: PointerEvent): [number, number] {
    const r = game.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function onpointerdown(e: PointerEvent) {
    if (finished || drag) return;
    const [x, y] = point(e);
    const hip = snap(x, y, onScreen, SNAP_PX);
    if (hip === null) {
      selected = null;
      draw();
      return;
    }
    game.setPointerCapture(e.pointerId);
    drag = { from: hip, sx: x, sy: y, x, y, moved: false, id: e.pointerId };
  }

  function onpointermove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const [x, y] = point(e);
    if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > DRAG_PX) {
      drag.moved = true;
      animate();
    }
    drag.x = x;
    drag.y = y;
  }

  function onpointerup(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved) {
      // Released on another star: a stroke; nowhere: nothing; on the same star: a tap.
      const to = snap(d.x, d.y, onScreen, SNAP_PX);
      if (to !== d.from) {
        if (to !== null) join(d.from, to);
        draw();
        return;
      }
    }
    // A tap: pick, unpick, or join to the star picked before.
    if (selected === null) selected = d.from;
    else if (selected === d.from) selected = null;
    else join(selected, d.from);
    draw();
  }

  function onpointercancel() {
    drag = null;
    draw();
  }

  function join(a: number, b: number) {
    const r = attempt(trace, a, b);
    trace = r.trace;
    if (r.result === "found") {
      status = $_("connect.found");
      selected = b; // the trace goes on from there
      if (hint && segmentKey(hint.from, hint.to) === segmentKey(a, b)) hint = null;
      if (isComplete(trace)) void complete();
    } else if (r.result === "again") {
      status = $_("connect.again");
      selected = b;
    } else if (r.result === "wrong") {
      status = $_("connect.wrong");
      selected = a;
      flash = { a, b, start: performance.now() };
      if (needsHint(trace)) giveHint();
      animate();
    }
    draw();
  }

  function giveHint() {
    const h = nextHint(trace, selected);
    if (!h) return;
    trace = withHint(trace);
    hint = { ...h, start: performance.now() };
    selected = h.from;
    status = $_("connect.hintGiven");
    animate();
  }

  async function complete(solution = false) {
    if (solution) trace = withSolution(trace);
    finished = true;
    selected = null;
    hint = null;
    flash = null;
    status = solution ? $_("connect.shown") : $_("connect.done");
    const result = onresult(abbr, trace);
    results = [...results, { ...result, trace }];
    reveal(true);
    draw();
    await tick();
    nextButton?.focus();
  }

  /** The map shows the figure itself: lines, name, and the drawing in Découverte. */
  function reveal(on: boolean) {
    if (!map) return;
    map.setLayers({
      constellationLines: on,
      constellationFigures: on && level === "discovery",
    });
    map.setSelectedConstellation(on ? abbr : null);
    map.setSelectedNameShown(on);
  }

  function start() {
    trace = newTrace(figures[abbr] ?? []);
    finished = false;
    selected = null;
    hint = null;
    flash = null;
    status = $_("connect.start");
    reveal(false);
    prepare();
    project();
  }

  async function next() {
    if (!finished) return;
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
    start();
    hidden = false;
    await tick();
    hintButton?.focus();
  }

  // --- drawing

  function draw() {
    if (!ctx) return;
    const w = game.clientWidth;
    const h = game.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (finished) return; // the map draws the figure
    const ink = theme.ink;
    const now = performance.now();
    ctx.lineCap = "round";
    // Découverte: a light ring around each star of the figure.
    if (level === "discovery") {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      for (const hip of figureStars) ring(hip, 8);
    }
    // Found segments, in ink, stopping short of the stars.
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = ink;
    ctx.setLineDash([]);
    for (const [a, b] of trace.segments) if (trace.found.has(segmentKey(a, b))) stroke(a, b);
    // A wrong segment: dashed, fading out.
    if (flash) {
      const t = Math.min(1, (now - flash.start) / FLASH_MS);
      ctx.globalAlpha = 1 - t;
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.5;
      stroke(flash.a, flash.b);
      ctx.setLineDash([]);
      const pa = pos.get(flash.a);
      const pb = pos.get(flash.b);
      if (pa && pb) cross((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2);
    }
    // A drag under way: a dashed line to the finger, the star it would land on ringed.
    if (drag?.moved) {
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      const p = pos.get(drag.from);
      if (p) {
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(drag.x, drag.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const target = snap(drag.x, drag.y, onScreen, SNAP_PX);
      if (target !== null && target !== drag.from) ring(target, 10);
    }
    // The star picked (or dragged from): a ring with four ticks.
    const picked = drag?.from ?? selected;
    if (picked !== null) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ring(picked, 11);
      ticks(picked, 11);
    }
    // Hint: the star to reach blinks (converging rings).
    if (hint) {
      const t = reduceMotion ? 0.5 : ((now - hint.start) % 1200) / 1200;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 1 - t * 0.7;
      ring(hint.to, 22 - 12 * t);
      ctx.globalAlpha = 1;
      ctx.setLineDash([2, 3]);
      ring(hint.to, 9);
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  function ring(hip: number, r: number) {
    const p = pos.get(hip);
    if (!p || !ctx) return;
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function ticks(hip: number, r: number) {
    const p = pos.get(hip);
    if (!p || !ctx) return;
    ctx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      ctx.moveTo(p[0] + dx * (r + 2), p[1] + dy * (r + 2));
      ctx.lineTo(p[0] + dx * (r + 7), p[1] + dy * (r + 7));
    }
    ctx.stroke();
  }

  /** A line between two stars, cleared of a few px around each. */
  function stroke(a: number, b: number) {
    const pa = pos.get(a);
    const pb = pos.get(b);
    if (!pa || !pb || !ctx) return;
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    const len = Math.hypot(dx, dy);
    const gap = Math.min(6, len / 3);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    ctx.beginPath();
    ctx.moveTo(pa[0] + ux * gap, pa[1] + uy * gap);
    ctx.lineTo(pb[0] - ux * gap, pb[1] - uy * gap);
    ctx.stroke();
  }

  function cross(x: number, y: number) {
    if (!ctx) return;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 5);
    ctx.lineTo(x + 5, y + 5);
    ctx.moveTo(x + 5, y - 5);
    ctx.lineTo(x - 5, y + 5);
    ctx.stroke();
  }

  // --- life cycle

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
      layers: { constellationLines: false, constellationFigures: false },
      onViewChange: () => project(),
    });
    start();
    const resize = new ResizeObserver(() => {
      prepare();
      project();
    });
    resize.observe(stage);
    return () => resize.disconnect();
  });
  onDestroy(() => {
    cancelAnimationFrame(raf);
    map?.dispose();
  });

  $effect(() => {
    map?.setTheme(gameTheme(theme));
    draw();
  });

  // A new series (Rejouer): back to its first figure.
  let shown: string[] | null = null;
  $effect(() => {
    if (series === shown) return;
    const first = shown === null;
    shown = series;
    if (first) return;
    index = 0;
    results = [];
    done = false;
    void tick().then(() => {
      start();
      hintButton?.focus();
    });
  });

  function detail(i: number): string {
    const t = results[i]?.trace;
    if (!t) return "";
    if (t.revealed) return $_("connect.revealed");
    const parts = [$_("connect.errors", { values: { count: t.errors } })];
    if (t.hints) parts.push($_("connect.hints", { values: { count: t.hints } }));
    return parts.join(" · ");
  }
</script>

<div class="connect">
  <GameHeader
    meta={`#02 // ${$_("games.connectStars.title")}`}
    results={results.map((r) => r.correct)}
    total={series.length}
    {index}
    {done}
    progressLabel={$_("connect.progress", {
      values: { n: Math.min(index + 1, series.length), total: series.length },
    })}
    {onquit}
  />

  <div
    class="stage"
    class:hidden
    class:gone={done}
    role="img"
    aria-label={$_("connect.sky")}
    bind:this={stage}
  >
    <canvas bind:this={canvas} class="sky" aria-hidden="true"></canvas>
    <canvas bind:this={overlay} class="sky" aria-hidden="true"></canvas>
    <canvas
      bind:this={game}
      class="game"
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      {onpointercancel}
    ></canvas>
  </div>

  {#if done}
    <SeriesEnd
      {score}
      total={series.length}
      {previousBest}
      {results}
      {nameOf}
      {detail}
      {onreplay}
      {onquit}
    />
  {:else}
    <section class="panel" aria-labelledby="connect-name">
      <div class="row">
        <span class="label">{$_("connect.label")}</span>
        <span class="count"
          >{$_("connect.count", {
            values: { found: trace.found.size, total: trace.segments.length },
          })}</span
        >
      </div>
      <h2 id="connect-name" class="name">{nameOf(abbr)}</h2>
      <p class="status" role="status">{status}</p>
      {#if finished}
        <button class="next primary" bind:this={nextButton} onclick={next}>
          {index + 1 >= series.length ? $_("quiz.result") : $_("quiz.next")}
          <Icon name="play" size={10} />
        </button>
      {:else}
        <div class="actions">
          <button bind:this={hintButton} onclick={giveHint}>{$_("connect.hint")}</button>
          <button
            onclick={() => complete(true)}
            aria-label={$_("connect.solution.label")}
            title={$_("connect.solution.label")}>{$_("connect.solution")}</button
          >
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .connect {
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
  @media (prefers-reduced-motion: reduce) {
    .stage::after {
      transition: none;
    }
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  .sky {
    pointer-events: none;
  }
  .game {
    touch-action: none;
    cursor: crosshair;
  }
  .panel {
    flex: none;
    padding: 10px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
    border-top: 1px solid var(--ast-hairline);
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .count {
    color: var(--ast-fg);
  }
  .name {
    margin: 2px 0 0;
    font: 700 26px/1.05 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .status {
    margin: 6px 0 10px;
    min-height: 1.5em;
    font: 400 12px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
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
  button:hover {
    border-color: var(--ast-fg);
  }
  button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .next {
    width: 100%;
  }
  .primary {
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
</style>
