<script lang="ts">
  // A constellation's page in the catalogue (#170): the real sky drawn by the sky map (same stars,
  // lines and illustrated figure as the map), the figure at the zenith of a made-up observer,
  // north up, as in the quiz (#163). A tap on a star shows its name and a few data in a small
  // panel; the main stars below do the same. Then the facts (best evening period, how high it
  // climbs from the user's place, tonight), the story and anecdotes when written (#61, #172), and
  // the sources. The picture takes no pan or zoom: the page scrolls over it.
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { _ } from "@asteria/ui";
  import {
    applyMat3,
    j2000ToHorizontalMatrix,
    propagateStar,
    unitVector,
    yearsSinceHipparcos,
  } from "@asteria/astro-core";
  import { loadConstellationStory, type ConstellationStory } from "@asteria/content";
  import {
    SkyMap,
    type CatalogStar,
    type FigureLevel,
    type SkyLayers,
    type SkyTheme,
    type ViewState,
  } from "@asteria/sky-renderer";
  import {
    bestMonth,
    centreRaDec,
    mainStars,
    figureObservability,
    pickStar,
    tappableStars,
  } from "../lib/catalogue";
  import { screenFraction } from "../lib/constellation";
  import { starDistance, type StarDistanceFields } from "../lib/format";
  import { framingFov, zenithObserver, type ConstellationShape } from "../lib/games/geometry";
  import Designation from "./Designation.svelte";
  import Icon from "./Icon.svelte";
  import StoryPanels from "./StoryPanels.svelte";

  let {
    abbr,
    name,
    latin,
    names,
    stars,
    lines,
    shape,
    level,
    theme,
    figureSet,
    date,
    latitude,
    placeName,
    tonight,
    initialStar = null,
    onback,
    onclose,
  }: {
    abbr: string;
    name: string;
    latin: string;
    /** French constellation names, for a star of a neighbouring constellation. */
    names: Readonly<Record<string, string>>;
    stars: CatalogStar[];
    lines: Record<string, number[][]>;
    shape: ConstellationShape;
    level: FigureLevel;
    theme: SkyTheme;
    figureSet: string;
    date: Date;
    /** The user's place: how high the figure climbs there. */
    latitude: number;
    placeName: string;
    /** Up in the dark hours of tonight (lib/games/visibility). */
    tonight: boolean;
    /** HIP of a star to show at once (coming from its sheet on the map). */
    initialStar?: number | null;
    onback: () => void;
    onclose: () => void;
  } = $props();

  const titleId = $derived(`page-title-${abbr}`);
  const starLabel = (s: CatalogStar) =>
    s.name ?? s.bayer ?? $_("star.hip", { values: { hip: s.hip } });
  // Fixed for the page's life (it is keyed by constellation): the catalogue does not change.
  const listed = untrack(() => mainStars(stars, lines, abbr));
  const tappable = untrack(() => tappableStars(stars, lines, abbr));
  const { ra, dec } = untrack(() => centreRaDec(shape));
  const month = $derived(
    new Intl.DateTimeFormat("fr", { month: "long", timeZone: "UTC" }).format(
      Date.UTC(2026, bestMonth(ra), 15),
    ),
  );
  // How high the figure climbs from the user's place: its stars' declinations (J2000 is plenty).
  const figureDecs = untrack(() => {
    const hips = new Set((lines[abbr] ?? []).flat());
    return stars.filter((s) => hips.has(s.hip)).map((s) => s.dec);
  });
  const height = $derived(figureObservability(figureDecs.length ? figureDecs : [dec], latitude));

  let story = $state<ConstellationStory | null>(null);
  $effect(() => {
    let alive = true;
    loadConstellationStory("fr", abbr).then(
      (s) => alive && (story = s),
      () => {}, // offline before the chunk was cached: the page keeps its facts
    );
    return () => (alive = false);
  });

  // Focus starts on « back »: Escape and Tab stay inside the dialog.
  let backButton: HTMLButtonElement;

  // --- The sky picture
  let stage: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let map: SkyMap | undefined;
  let noSky = $state(false);
  let showFigure = $state(untrack(() => level === "discovery"));
  let selected = $state.raw<CatalogStar | null>(null);
  let view: ViewState = { azimuth: 180, altitude: 90, roll: 0, fov: 60 };
  const observer = untrack(() => zenithObserver(shape.centre, date));

  function layers(): Partial<SkyLayers> {
    return {
      constellationLines: true,
      constellationFigures: showFigure,
      constellationNames: false,
    };
  }

  function frame() {
    if (!map) return;
    const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
    view = { azimuth: 180, altitude: 90, roll: 0, fov: framingFov(shape.radius, aspect, 0.82) };
    map.setView(view);
  }

  onMount(() => {
    backButton.focus({ preventScroll: true });
    try {
      map = new SkyMap({
        canvas,
        overlay,
        stars,
        lines,
        constellationNames: names as Record<string, string>,
        theme: { ...theme, daySky: theme.sky, ground: theme.sky },
        figureSet,
        layers: {
          starNames: true,
          planets: false,
          allPaths: false,
          equatorialGrid: false,
          azimuthalGrid: false,
          ecliptic: false,
          seeThroughGround: true,
          deepSky: false,
          milkyWay: false,
          ...layers(),
        },
      });
    } catch (e) {
      console.error(e); // no WebGL: the page keeps its text
      noSky = true;
      return;
    }
    map.setDate(date);
    map.setObserver(observer);
    map.figureLayer.setLevel(level);
    map.setSelectedConstellation(abbr);
    frame();
    const first = initialStar ? stars.find((s) => s.hip === initialStar) : undefined;
    if (first) showStar(first);
    const resize = new ResizeObserver(() => frame());
    resize.observe(stage);
    return () => resize.disconnect();
  });
  onDestroy(() => map?.dispose());

  $effect(() => {
    map?.setTheme({ ...theme, daySky: theme.sky, ground: theme.sky });
  });

  function toggleFigure() {
    showFigure = !showFigure;
    map?.setLayers(layers());
  }

  /** Marks a star on the picture (reticle), the figure staying highlighted. */
  function showStar(s: CatalogStar | null) {
    selected = s;
    map?.setSelection(s ? { kind: "star", star: s } : null);
    map?.setSelectedConstellation(abbr);
  }

  /** The star under a tap: the touchable stars projected as the map draws them. */
  function ontap(e: MouseEvent) {
    if (!map) return;
    const rect = stage.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const m = j2000ToHorizontalMatrix(date, observer);
    const years = yearsSinceHipparcos(date);
    const points = tappable.flatMap((s) => {
      const p = propagateStar(s, years);
      const f = screenFraction(applyMat3(m, unitVector(p.ra, p.dec)), view, aspect);
      return f ? [{ star: s, v: s.v, x: f[0] * rect.width, y: f[1] * rect.height }] : [];
    });
    const hit = pickStar({ x: e.clientX - rect.left, y: e.clientY - rect.top }, points);
    showStar(hit?.star ?? null);
  }

  async function fromList(s: CatalogStar) {
    showStar(s);
    await tick();
    stage.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const distance = $derived.by(() => {
    if (!selected) return null;
    const d = starDistance(selected as StarDistanceFields);
    if (!d) return $_("star.unknownDistance");
    return d.approx
      ? $_("star.distanceApprox", { values: { ly: d.ly } })
      : $_("star.distance", { values: { ly: d.ly } });
  });
</script>

<div class="page">
  <header class="head">
    <button
      class="icon"
      bind:this={backButton}
      onclick={onback}
      aria-label={$_("catalogue.back")}
      title={$_("catalogue.back")}>←</button
    >
    <div class="titles">
      <!-- Names the Apprendre dialog (aria-labelledby). -->
      <h1 id="games-title">{name}</h1>
      <p class="latin"><i lang="la">{latin}</i></p>
    </div>
    <button
      class="icon"
      onclick={onclose}
      aria-label={$_("catalogue.close")}
      title={$_("catalogue.close")}>×</button
    >
  </header>

  <div class="scroll">
    <!-- The picture: taps only (the canvases take no input), so the page scrolls over it. The
         same stars are buttons in « Étoiles principales » for the keyboard and screen readers. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div
      class="stage"
      class:gone={noSky}
      bind:this={stage}
      onclick={ontap}
      role="group"
      aria-label={$_("catalogue.sky", { values: { name } })}
    >
      <canvas bind:this={canvas} aria-hidden="true"></canvas>
      <canvas bind:this={overlay} class="overlay" aria-hidden="true"></canvas>
      <button
        class="chip"
        aria-pressed={showFigure}
        title={$_("catalogue.figure.hint")}
        onclick={(e) => {
          e.stopPropagation();
          toggleFigure();
        }}><Icon name="figures" size={14} />{$_("catalogue.figure")}</button
      >
    </div>
    {#if !noSky}
      <div class="slot" role="status">
        {#if selected}
          {@const s = selected}
          <!-- The star touched: a small panel under the picture, in the place of the hint. -->
          <div class="star panel-block">
            <p class="s-meta">
              {#if s.bayer}<Designation text={s.bayer} /> ·
              {/if}{$_("star.hip", {
                values: { hip: s.hip },
              })}{#if s.con !== abbr}
                · {$_("catalogue.star.in", { values: { name: names[s.con] ?? s.con } })}{/if}
            </p>
            <p class="s-name"><Designation text={starLabel(s)} /></p>
            <dl>
              <dt>{$_("data.v")}</dt>
              <dd>{s.v.toFixed(2)}</dd>
              <dt>{$_("data.dist")}</dt>
              <dd>{distance}</dd>
            </dl>
            <button
              class="s-close"
              onclick={() => showStar(null)}
              aria-label={$_("catalogue.star.close")}
              title={$_("catalogue.star.close")}>×</button
            >
          </div>
        {:else}
          <p class="hint">{$_("catalogue.tapHint")}</p>
        {/if}
      </div>
    {/if}

    <section class="panel-block" aria-labelledby={`${titleId}-facts`}>
      <h2 class="panel-title" id={`${titleId}-facts`}>{$_("catalogue.facts")}</h2>
      <dl class="facts">
        <dt>{$_("catalogue.best")}</dt>
        <dd>{$_("catalogue.bestValue", { values: { month } })}</dd>
        <dt>{$_("catalogue.height", { values: { place: placeName } })}</dt>
        <dd>
          {$_(`catalogue.height.${height.kind}`, {
            values: { alt: Math.round(height.maxAltitude) },
          })}
        </dd>
        {#if height.kind !== "never"}
          <dt>{$_("catalogue.tonight")}</dt>
          <dd>{tonight ? $_("catalogue.tonight.yes") : $_("catalogue.tonight.no")}</dd>
        {/if}
        <dt>{$_("constellation.abbr")}</dt>
        <dd>{abbr}</dd>
      </dl>
    </section>

    <section class="panel-block" aria-labelledby={`${titleId}-stars`}>
      <h2 class="panel-title" id={`${titleId}-stars`}>{$_("catalogue.stars")}</h2>
      <ul class="stars">
        {#each listed as s (s.hip)}
          <li>
            <button
              class="s-row"
              aria-pressed={selected?.hip === s.hip}
              onclick={() => fromList(s)}
            >
              <span class="s-label"><Designation text={starLabel(s)} /></span>
              {#if s.name && s.bayer}<span class="s-bayer"><Designation text={s.bayer} /></span
                >{/if}
              <span class="s-v">V {s.v.toFixed(1)}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>

    {#if story}
      <StoryPanels {story} heading="h2" />
    {/if}
    <p class="data-sources">{$_("catalogue.dataSources")}</p>
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }
  .head,
  .scroll {
    box-sizing: border-box;
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
  .head {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-top: max(10px, env(safe-area-inset-top));
    padding-bottom: 8px;
    border-bottom: 1px solid var(--ast-hairline);
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font: 700 28px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }
  .latin {
    margin: 2px 0 0;
    font: 500 italic 16px/1.1 var(--ast-font-serif);
    color: var(--ast-fg-muted);
  }
  button {
    font: 500 11px/1 var(--ast-font-mono);
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
  .icon {
    flex: none;
    width: 44px;
    height: 44px;
    font: 400 22px/1 var(--ast-font-mono);
  }
  .icon:focus-visible {
    outline-offset: -6px;
  }
  .head .icon:first-child {
    margin-left: -12px;
  }
  .head .icon:last-child {
    margin-right: -10px;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-top: 12px;
    padding-bottom: max(20px, env(safe-area-inset-bottom));
  }
  .stage {
    position: relative;
    height: clamp(240px, 50vh, 460px);
    border: 1px solid var(--ast-panel-border);
    overflow: hidden;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
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
    /* A still picture: taps go to the stage, scrolling to the page. */
    pointer-events: none;
  }
  .chip {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 10px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 80%, transparent);
    color: var(--ast-fg-muted);
    font-size: 10px;
  }
  .chip[aria-pressed="true"] {
    color: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  /* Under the picture: the hint, or the star touched. */
  .slot {
    position: relative;
    margin-top: 8px;
  }
  .star {
    position: relative;
    --ast-panel-pad: 10px 12px;
    animation: rise 140ms var(--ast-ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .star {
      animation: none;
    }
  }
  .s-meta {
    margin: 0;
    padding-right: 32px;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .s-name {
    margin: 2px 0 6px;
    padding-right: 32px;
    font: 700 24px/1 var(--ast-font-display);
    text-transform: uppercase;
  }
  .star dl {
    display: flex;
    flex-wrap: wrap;
    gap: 0 10px;
    margin: 0;
    font: 11px/1.6 var(--ast-font-mono);
    letter-spacing: 0.06em;
    color: var(--ast-fg-muted);
  }
  .star dd {
    margin: 0 8px 0 0;
    color: var(--ast-fg);
    font-variant-numeric: tabular-nums;
  }
  .s-close {
    position: absolute;
    top: 0;
    right: 0;
    width: 44px;
    height: 44px;
    font-size: 16px;
  }
  .hint {
    margin: 0;
    padding: 4px 0;
    font: 400 11px/1.4 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 14px;
    margin: 0;
    font: 12px/1.45 var(--ast-font-mono);
  }
  .facts dt {
    font-size: 10px;
    line-height: 1.75;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .facts dd {
    margin: 0;
  }
  .stars {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .stars li + li {
    border-top: 1px solid var(--ast-hairline);
  }
  .s-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 12px 0;
    text-align: left;
    text-transform: none;
    letter-spacing: 0;
    font: 500 13px/1.2 var(--ast-font-mono);
  }
  .s-row[aria-pressed="true"] .s-label {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .s-label {
    flex: 1;
    min-width: 0;
  }
  .s-bayer,
  .s-v {
    flex: none;
    font-size: 11px;
    color: var(--ast-fg-muted);
  }
  .s-v {
    width: 44px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .data-sources {
    margin: 14px 0 0;
    font: 400 10px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .panel-block {
    margin-top: var(--ast-panel-gap);
  }
  .slot .star.panel-block {
    margin-top: 0;
  }
</style>
