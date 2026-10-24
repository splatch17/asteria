<script lang="ts">
  // A constellation's card in the catalogue deck (#170, #196): the real sky (same stars, lines and
  // illustrated figure as the map), the figure at the zenith of a made-up observer, north up, as
  // in the quiz (#163). A tap on a star shows its name and a few data in a small panel; the main
  // stars below do the same. Then the facts (best evening period, how high it climbs from the
  // user's place, tonight), the story and anecdotes when written (#61, #172), and the sources.
  // The card scrolls vertically inside the deck (CatalogueDeck), which turns the cards sideways.
  // The sky is the deck's (lib/deck-sky): live while the card is centred, a still picture or a
  // sketch (lib/card-sketch) otherwise.
  import { onMount, tick, untrack } from "svelte";
  import { _, locale } from "@asteria/ui";
  import {
    applyMat3,
    j2000ToHorizontalMatrix,
    propagateStar,
    type Vec3,
    unitVector,
    yearsSinceHipparcos,
  } from "@asteria/astro-core";
  import { loadConstellationStory, type ConstellationStory } from "@asteria/content";
  import type { CatalogStar, SkyTheme, ViewState } from "@asteria/sky-renderer";
  import {
    bestMonth,
    centreRaDec,
    mainStars,
    figureObservability,
    pickStar,
    tappableStars,
  } from "../lib/catalogue";
  import { drawSketch, type SketchStar } from "../lib/card-sketch";
  import { screenFraction } from "../lib/constellation";
  import type { CardSky, DeckSky } from "../lib/deck-sky";
  import { clockParts, formatNumber, starDistance, type StarDistanceFields } from "../lib/format";
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
    date,
    latitude,
    placeName,
    tonight,
    initialStar = null,
    sky,
    current,
    figures,
    onfigures,
  }: {
    abbr: string;
    name: string;
    latin: string;
    /** French constellation names, for a star of a neighbouring constellation. */
    names: Readonly<Record<string, string>>;
    stars: CatalogStar[];
    lines: Record<string, number[][]>;
    shape: ConstellationShape;
    date: Date;
    /** The user's place: how high the figure climbs there. */
    latitude: number;
    placeName: string;
    /**
     * When it is up in the dark hours of tonight (lib/games/visibility tonightWindow), null when
     * it is not: the hours, so that a star of the figure still under the horizon does not seem
     * to contradict a bare « visible » (#198).
     */
    tonight: { from: Date; to: Date; now: boolean } | null;
    /** HIP of a star to show at once (coming from its sheet on the map). */
    initialStar?: number | null;
    /** The deck's shared sky. */
    sky: DeckSky;
    /** The card centred in the deck: its title names the dialog. */
    current: boolean;
    /** Illustrated figures shown (the same on every card). */
    figures: boolean;
    onfigures: () => void;
  } = $props();

  const titleId = $derived(`page-title-${abbr}`);
  /** « 0 h 35 », rounded to 5 minutes (the hours of a window, not a timetable). */
  const clock = (d: Date) =>
    $_("time.clock", {
      values: clockParts(new Date(Math.round(d.getTime() / 300_000) * 300_000), $locale ?? "fr"),
    });
  const starLabel = (s: CatalogStar) =>
    s.name ?? s.bayer ?? $_("star.hip", { values: { hip: s.hip } });
  // Fixed for the card's life (it is keyed by constellation): the catalogue does not change.
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
      () => {}, // offline before the chunk was cached: the card keeps its facts
    );
    return () => (alive = false);
  });

  // --- The sky picture
  let stage: HTMLDivElement;
  let still: HTMLCanvasElement;
  let selected = $state.raw<CatalogStar | null>(null);
  let view: ViewState = { azimuth: 180, altitude: 90, roll: 0, fov: 60 };
  const observer = untrack(() => zenithObserver(shape.centre, date));

  /** What the deck's sky draws for this card. */
  const cardSky = (): CardSky => ({ abbr, observer, fov: view.fov, figures, star: selected });

  /** Frames the figure for the picture's shape. */
  function frame() {
    const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
    view = { azimuth: 180, altitude: 90, roll: 0, fov: framingFov(shape.radius, aspect, 0.82) };
  }

  /** The touchable stars where the map draws them (CSS px in the picture). */
  function projected(width: number, height: number): SketchStar[] {
    const m = j2000ToHorizontalMatrix(date, observer);
    const years = yearsSinceHipparcos(date);
    return tappable.flatMap((s) => {
      const p = propagateStar(s, years);
      const f = screenFraction(applyMat3(m, unitVector(p.ra, p.dec)), view, width / height);
      return f ? [{ hip: s.hip, v: s.v, x: f[0] * width, y: f[1] * height }] : [];
    });
  }

  /** Stars of the field around the figure (J2000 directions), for the sketch: found once. */
  let around: { hip: number; v: number; dir: Vec3 }[] | null = null;
  function fieldStars(width: number, height: number): SketchStar[] {
    if (!around) {
      // Within the picture's half-diagonal of the figure's centre, down to the map's faint stars.
      const reach = Math.cos(((view.fov / 2) * Math.SQRT2 * Math.PI) / 180);
      const c = shape.centre;
      around = stars.flatMap((s) => {
        if (s.v > 6.5) return [];
        const dir = unitVector(s.ra, s.dec);
        return dir[0] * c[0] + dir[1] * c[1] + dir[2] * c[2] >= reach
          ? [{ hip: s.hip, v: s.v, dir }]
          : [];
      });
    }
    const m = j2000ToHorizontalMatrix(date, observer);
    return around.flatMap((s) => {
      const f = screenFraction(applyMat3(m, s.dir), view, width / height);
      return f ? [{ hip: s.hip, v: s.v, x: f[0] * width, y: f[1] * height }] : [];
    });
  }

  /** The field and the figure in 2D, until the deck's sky draws the card. */
  function sketch(theme: SkyTheme) {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(devicePixelRatio, 2);
    still.width = Math.floor(w * ratio);
    still.height = Math.floor(h * ratio);
    const ctx = still.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawSketch(ctx, w, h, projected(w, h), lines[abbr] ?? [], theme, fieldStars(w, h));
    delete still.dataset.picture;
  }

  onMount(() => {
    frame();
    const first = initialStar ? stars.find((s) => s.hip === initialStar) : undefined;
    if (first) selected = first;
    const unregister = sky.register(abbr, { sky: cardSky, stage, still, sketch });
    let size = `${stage.clientWidth}x${stage.clientHeight}`;
    const resize = new ResizeObserver(() => {
      const now = `${stage.clientWidth}x${stage.clientHeight}`;
      if (now === size) return;
      size = now;
      frame();
      sketch(sky.currentTheme);
      sky.refresh(abbr);
    });
    resize.observe(stage);
    return () => {
      resize.disconnect();
      unregister();
    };
  });

  // The figure shown or hidden on every card: the live one follows at once.
  $effect(() => {
    void figures;
    untrack(() => sky.refresh(abbr));
  });

  /** Marks a star on the picture (reticle), the figure staying highlighted. */
  function showStar(s: CatalogStar | null) {
    selected = s;
    sky.refresh(abbr);
  }

  /** The star under a tap: the touchable stars projected as the map draws them. */
  function ontap(e: MouseEvent) {
    const rect = stage.getBoundingClientRect();
    const hit = pickStar(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      projected(rect.width, rect.height),
    );
    showStar(hit ? (tappable.find((s) => s.hip === hit.hip) ?? null) : null);
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

<div class="card">
  <header class="head">
    <div class="titles">
      <!-- The centred card's title names the Apprendre dialog (aria-labelledby). -->
      <h1 id={current ? "games-title" : undefined}>{name}</h1>
      <p class="latin"><i lang="la">{latin}</i></p>
    </div>
    <p class="corner" aria-hidden="true">{abbr}</p>
  </header>

  <!-- The picture: taps only (the canvases take no input), so the card scrolls over it. The same
     stars are buttons in « Étoiles principales » for the keyboard and screen readers. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <div
    class="stage"
    bind:this={stage}
    onclick={ontap}
    role="group"
    aria-label={$_("catalogue.sky", { values: { name } })}
  >
    <canvas bind:this={still} aria-hidden="true"></canvas>
    <button
      class="chip"
      aria-pressed={figures}
      title={$_("catalogue.figure.hint")}
      onclick={(e) => {
        e.stopPropagation();
        onfigures();
      }}><Icon name="figures" size={14} />{$_("catalogue.figure")}</button
    >
  </div>
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
          <dd>{formatNumber(s.v, 2, $locale ?? "fr")}</dd>
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
        <dd>
          {#if !tonight}{$_("catalogue.tonight.no")}{:else if tonight.now}{$_(
              "catalogue.tonight.now",
              { values: { to: clock(tonight.to) } },
            )}{:else}{$_("catalogue.tonight.window", {
              values: { from: clock(tonight.from), to: clock(tonight.to) },
            })}{/if}
        </dd>
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
          <button class="s-row" aria-pressed={selected?.hip === s.hip} onclick={() => fromList(s)}>
            <span class="s-label"><Designation text={starLabel(s)} /></span>
            {#if s.name && s.bayer}<span class="s-bayer"><Designation text={s.bayer} /></span>{/if}
            <span class="s-v">V {formatNumber(s.v, 1, $locale ?? "fr")}</span>
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

<style>
  .card {
    padding: 14px var(--card-pad, 14px) 18px;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding-bottom: 12px;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font: 700 30px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }
  .latin {
    margin: 2px 0 0;
    font: 500 italic 16px/1.1 var(--ast-font-serif);
    color: var(--ast-fg-muted);
  }
  /* The card's index, in its corner as on a playing card: the IAU abbreviation. */
  .corner {
    flex: none;
    margin: 2px 0 0;
    padding: 3px 5px 2px;
    font: 600 10px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-bg);
    background: var(--ast-fg);
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
  /* The card's picture, edge to edge: a neighbour peeking at the side shows its sky. */
  .stage {
    position: relative;
    height: clamp(220px, 46vh, 440px);
    margin: 0 calc(-1 * var(--card-pad, 14px));
    border-top: 1px solid var(--ast-panel-border);
    border-bottom: 1px solid var(--ast-panel-border);
    background: var(--ast-bg);
    overflow: hidden;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    /* A still picture: taps go to the stage, scrolling to the card. */
    pointer-events: none;
  }
  .chip {
    position: absolute;
    z-index: 1;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 10px;
    border: 1px solid var(--ast-control-border);
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
