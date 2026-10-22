<script lang="ts">
  // « Quelle constellation ? » (#163): a series of questions, each a constellation on the real
  // sky, drawn by the sky map itself (SkyMap: same stars, lines, figures and highlight as the
  // map), with 4 names to choose from. The figure is put at the zenith of a made-up observer
  // (zenithObserver), north up, framed with a little sky around it; its stars stand out (larger,
  // in an ink halo). Expert turns it by the question's random angle (#183), kept once answered.
  //  - Découverte: lines and the illustrated figure; Amateur: lines; Expert: its stars only.
  //  - Zoom (#183): pinch or scroll out, and pan, to see where the figure lies; « Recentrer »
  //    and the next question come back to the framing. Not while an Expert question is asked:
  //    the neighbouring figures would give it away.
  //  - After the answer: lines, figure and its name (no other name) revealed, right answer
  //    inked, then « Suivante ».
  // Then the end screen: score, record, and what each answer changed.
  import { onDestroy, onMount, tick } from "svelte";
  import { _ } from "@asteria/ui";
  import type {
    CatalogStar,
    FigureLevel,
    SkyLayers,
    SkyMap,
    SkyTheme,
    ViewState,
  } from "@asteria/sky-renderer";
  import {
    createGameSky,
    gameTheme,
    showFigure,
    viewMoved,
    zoomLimits,
  } from "../lib/games/game-sky";
  import { framingFov, type ConstellationShape } from "../lib/games/geometry";
  import { FRAMING_FILL, type Answer, type Question } from "../lib/games/which-constellation";
  import GameHeader from "./GameHeader.svelte";
  import GameRecentre from "./GameRecentre.svelte";
  import Icon from "./Icon.svelte";
  import SeriesEnd from "./SeriesEnd.svelte";

  let {
    series,
    stars,
    lines,
    names,
    latin,
    level,
    theme,
    figureSet,
    date,
    shapes,
    onanswer,
    onfinish,
    onreplay,
    onquit,
  }: {
    series: Question[];
    stars: CatalogStar[];
    lines: Record<string, number[][]>;
    names: Readonly<Record<string, string>>;
    latin: Readonly<Record<string, string>>;
    level: FigureLevel;
    theme: SkyTheme;
    figureSet: string;
    date: Date;
    shapes: Readonly<Record<string, ConstellationShape>>;
    /** Records the answer, returns what it changed. */
    onanswer: (question: Question, chosen: string) => Answer;
    /** Records the finished series, returns the record before it. */
    onfinish: (score: number) => number;
    onreplay: () => void;
    onquit: () => void;
  } = $props();

  const nameOf = (abbr: string) => names[abbr] ?? abbr;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = $state(0);
  let answers = $state.raw<Answer[]>([]);
  /** The current question's answer, null while it is asked. */
  let current = $state.raw<Answer | null>(null);
  let done = $state(false);
  let previousBest = $state(0);
  const question = $derived(series[index]);
  const score = $derived(answers.filter((a) => a.correct).length);

  let stage: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let map: SkyMap | undefined;
  let hidden = $state(false);
  let nextButton = $state<HTMLButtonElement>();
  /** The question's framing, where « Recentrer » goes back to. */
  let framed: ViewState | null = null;
  /** The player has moved the view away from the framing. */
  let moved = $state(false);
  /** Zoom and pan: always but while an Expert question is asked. */
  const free = $derived(level !== "expert" || current !== null);
  let choiceList = $state<HTMLElement>();

  /** Layers of the question (by level) and of the answer (everything revealed). */
  function layersFor(revealed: boolean): Partial<SkyLayers> {
    return {
      constellationLines: revealed || level !== "expert",
      constellationFigures: revealed || level === "discovery",
      // Only the answer's name is written (setSelectedNameShown), not its neighbours'.
      constellationNames: false,
    };
  }

  /**
   * Frames the current question's figure: at the zenith, turned by the question's angle, with a
   * little sky around it, and bounds the player's zoom around that framing. `keep`: only the
   * framing and the bounds follow (the stage was resized while the player looks around).
   */
  function frame(keep = false) {
    const q = question;
    const shape = q && shapes[q.answer];
    if (!map || !q || !shape || !stage.clientWidth || !stage.clientHeight) return;
    const aspect = stage.clientWidth / stage.clientHeight;
    const fov = framingFov(shape.radius, aspect, FRAMING_FILL);
    map.setViewLimits(zoomLimits(fov, aspect));
    if (keep && framed) {
      framed = { ...framed, fov };
      return;
    }
    framed = showFigure(map, shape, date, fov, q.roll);
    moved = false;
  }

  function recentre() {
    if (!map || !framed) return;
    if (reduceMotion) map.setView(framed);
    else map.animateTo(framed, 450);
  }

  function showQuestion() {
    if (!map || !question) return;
    map.setLayers(layersFor(false));
    map.setSelectedNameShown(false);
    map.setSelectedConstellation(question.answer);
    frame();
  }

  onMount(() => {
    // No WebGL: map stays undefined and the names stay playable, without the sky.
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
      layers: layersFor(false),
      onViewChange: (view) => {
        const m = framed !== null && viewMoved(view, framed);
        if (m !== moved) moved = m;
      },
    });
    if (!map) return;
    map.setSelectedStarsEmphasis(true);
    showQuestion();
    const resize = new ResizeObserver(() => frame(moved));
    resize.observe(stage);
    return () => resize.disconnect();
  });
  onDestroy(() => map?.dispose());

  $effect(() => {
    map?.setTheme(gameTheme(theme));
  });

  // A new series (Rejouer): back to its first question.
  let shown: Question[] | null = null;
  $effect(() => {
    if (series === shown) return;
    const first = shown === null;
    shown = series;
    if (first) return;
    index = 0;
    answers = [];
    current = null;
    done = false;
    void tick().then(() => {
      showQuestion();
      choiceList?.querySelector<HTMLElement>("button")?.focus();
    });
  });

  async function choose(abbr: string) {
    if (current || !question) return;
    current = onanswer(question, abbr);
    answers = [...answers, current];
    map?.setLayers(layersFor(true));
    map?.setSelectedNameShown(true);
    await tick();
    nextButton?.focus();
  }

  async function next() {
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
    current = null;
    showQuestion();
    hidden = false;
    await tick();
    choiceList?.querySelector<HTMLElement>("button")?.focus();
  }

  /** Keys 1–4 answer, as the numbers printed on the choices. */
  function onkeydown(e: KeyboardEvent) {
    if (done || current || e.altKey || e.ctrlKey || e.metaKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= (question?.choices.length ?? 0)) {
      e.preventDefault();
      void choose(question!.choices[n - 1]!);
    }
  }

  function choiceState(abbr: string): "right" | "wrong" | "other" | null {
    if (!current) return null;
    if (abbr === current.answer) return "right";
    return abbr === current.chosen ? "wrong" : "other";
  }
</script>

<svelte:window {onkeydown} />

<div class="quiz">
  <GameHeader
    meta={$_("games.whichConstellation.title")}
    results={answers.map((a) => a.correct)}
    total={series.length}
    {index}
    {done}
    progressLabel={$_("quiz.progress", {
      values: { n: Math.min(index + 1, series.length), total: series.length },
    })}
    {onquit}
  />

  <div class="stage" class:hidden class:gone={done} class:free bind:this={stage}>
    <div class="sky" role="img" aria-label={$_("quiz.sky")}>
      <canvas bind:this={canvas} aria-hidden="true"></canvas>
      <canvas bind:this={overlay} class="overlay" aria-hidden="true"></canvas>
    </div>
    <GameRecentre shown={moved && !done} onrecentre={recentre} />
  </div>

  {#if done}
    <SeriesEnd
      {score}
      total={series.length}
      {previousBest}
      results={answers.map((a) => ({ ...a, item: a.answer }))}
      {nameOf}
      {onreplay}
      {onquit}
    />
  {:else if question}
    <section class="panel" aria-labelledby="quiz-question">
      <p id="quiz-question" class="prompt" role="status" class:right={current?.correct}>
        {#if !current}
          {$_("quiz.question")}
        {:else if current.correct}
          {$_("quiz.right")}
        {:else}
          {$_("quiz.wrong", { values: { name: nameOf(current.answer) } })}
        {/if}
      </p>
      <div class="choices" role="group" aria-labelledby="quiz-question" bind:this={choiceList}>
        {#each question.choices as abbr, i (abbr)}
          {@const state = choiceState(abbr)}
          <button
            class={`choice ${state ?? ""}`}
            aria-disabled={current !== null}
            onclick={() => choose(abbr)}
          >
            <span class="n" aria-hidden="true">{i + 1}</span>
            <span class="c-name">{nameOf(abbr)}</span>
            {#if state === "right" && level !== "discovery"}
              <span class="latin">{latin[abbr] ?? abbr}</span>
            {/if}
            {#if state === "right"}<span class="sr-only">✓</span>{/if}
          </button>
        {/each}
      </div>
      <button
        class="next"
        class:shown={current !== null}
        bind:this={nextButton}
        disabled={current === null}
        onclick={next}
      >
        {index + 1 >= series.length ? $_("quiz.result") : $_("quiz.next")}
        <Icon name="play" size={10} />
      </button>
    </section>
  {/if}
</div>

<style>
  .quiz {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
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
  .stage {
    position: relative;
    flex: 1;
    min-height: 160px;
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
  .sky {
    position: absolute;
    inset: 0;
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
    /* A still picture while an Expert question is asked; never a pick (no onSelect). */
    pointer-events: none;
  }
  /* Pinch, scroll and pan (#183), on the map's canvas (the labels' one stays above, inert). */
  .free canvas:not(.overlay) {
    pointer-events: auto;
  }
  .panel {
    flex: none;
    padding: 10px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
    border-top: 1px solid var(--ast-hairline);
  }
  .prompt {
    margin: 0 0 10px;
    min-height: 1.3em;
    font: 700 20px/1.15 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .choices {
    display: grid;
    gap: 6px;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 0 12px;
    border: 1px solid var(--ast-hairline);
    text-align: left;
    font: 500 14px/1.2 var(--ast-font-mono);
    letter-spacing: 0.02em;
    text-transform: none;
  }
  .choice:hover:not([aria-disabled="true"]) {
    border-color: var(--ast-fg);
  }
  .choice[aria-disabled="true"] {
    cursor: default;
  }
  .n {
    flex: none;
    width: 16px;
    font-size: 10px;
    color: var(--ast-fg-muted);
  }
  .c-name {
    flex: 1;
    min-width: 0;
  }
  .latin {
    flex: none;
    font: 500 italic 15px/1 var(--ast-font-serif);
    letter-spacing: 0;
  }
  .choice.right {
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .choice.right .n {
    color: inherit;
  }
  .choice.wrong {
    border-color: var(--ast-fg-muted);
    color: var(--ast-fg-muted);
  }
  .choice.wrong .c-name {
    text-decoration: line-through;
  }
  .choice.other {
    color: var(--ast-fg-muted);
    border-color: color-mix(in srgb, var(--ast-fg) 10%, transparent);
  }
  .next {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    margin-top: 10px;
    border: 1px solid var(--ast-fg);
    visibility: hidden;
  }
  .next.shown {
    visibility: visible;
  }
  /* End screen */
  .stage.gone {
    display: none;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
