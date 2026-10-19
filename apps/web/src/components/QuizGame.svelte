<script lang="ts">
  // « Quelle constellation ? » (#163): a series of questions, each a constellation on the real
  // sky, drawn by the sky map itself (SkyMap: same stars, lines, figures and highlight as the
  // map), with 4 names to choose from. The figure is put at the zenith of a made-up observer
  // (zenithObserver), north up, framed to fill the stage; the map takes no input there.
  //  - Découverte: lines and the illustrated figure; Amateur: lines; Expert: its stars only.
  //  - After the answer: lines, figure and its name (no other name) revealed, right answer
  //    inked, then « Suivante ».
  // Then the end screen: score, record, and what each answer changed.
  import { onDestroy, onMount, tick } from "svelte";
  import { _ } from "@asteria/ui";
  import {
    SkyMap,
    type CatalogStar,
    type FigureLevel,
    type SkyLayers,
    type SkyTheme,
  } from "@asteria/sky-renderer";
  import { framingFov, zenithObserver, type ConstellationShape } from "../lib/games/geometry";
  import { outcomeOf, type Answer, type Question } from "../lib/games/which-constellation";
  import Icon from "./Icon.svelte";

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
  let endTitle = $state<HTMLElement>();
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

  /** Frames the current question's figure: at the zenith, north up, filling the stage. */
  function frame() {
    const q = question;
    const shape = q && shapes[q.answer];
    if (!map || !shape) return;
    const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
    map.setObserver(zenithObserver(shape.centre, date));
    map.setView({ azimuth: 180, altitude: 90, roll: 0, fov: framingFov(shape.radius, aspect) });
  }

  function showQuestion() {
    if (!map || !question) return;
    map.setLayers(layersFor(false));
    map.setSelectedNameShown(false);
    map.setSelectedConstellation(question.answer);
    frame();
  }

  onMount(() => {
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
          starNames: false,
          planets: false,
          allPaths: false,
          equatorialGrid: false,
          azimuthalGrid: false,
          ecliptic: false,
          seeThroughGround: true,
          deepSky: false,
          ...layersFor(false),
        },
      });
    } catch (e) {
      console.error(e); // no WebGL: the names stay playable, without the sky
      map = undefined;
      return;
    }
    map.setDate(date);
    map.figureLayer.setLevel(level);
    showQuestion();
    const resize = new ResizeObserver(() => frame());
    resize.observe(stage);
    return () => resize.disconnect();
  });
  onDestroy(() => map?.dispose());

  $effect(() => {
    map?.setTheme({ ...theme, daySky: theme.sky, ground: theme.sky });
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
      await tick();
      endTitle?.focus();
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
  <header class="head">
    <div class="titles">
      <p class="meta">#01 // {$_("games.whichConstellation.title")}</p>
      <!-- One square per question: inked when right, struck when wrong. -->
      <ol
        class="steps"
        aria-label={$_("quiz.progress", {
          values: { n: Math.min(index + 1, series.length), total: series.length },
        })}
      >
        {#each series as q, i (q.answer)}
          <li
            class:right={answers[i]?.correct === true}
            class:wrong={answers[i]?.correct === false}
            class:now={i === index && !done}
          ></li>
        {/each}
      </ol>
    </div>
    <button class="close" onclick={onquit} aria-label={$_("quiz.quit")} title={$_("quiz.quit")}
      >×</button
    >
  </header>

  <div
    class="stage"
    class:hidden
    class:gone={done}
    role="img"
    aria-label={$_("quiz.sky")}
    bind:this={stage}
  >
    <canvas bind:this={canvas} aria-hidden="true"></canvas>
    <canvas bind:this={overlay} class="overlay" aria-hidden="true"></canvas>
  </div>

  {#if done}
    <section class="end" aria-labelledby="quiz-end-title">
      <h2 id="quiz-end-title" tabindex="-1" bind:this={endTitle}>{$_("quiz.end.title")}</h2>
      <p class="score">
        <span class="big">{score}</span><span class="of">/{series.length}</span>
        <span class="sr-only"
          >{$_("quiz.end.score", { values: { score, total: series.length } })}</span
        >
      </p>
      <p class="record">
        {score > previousBest
          ? $_("quiz.end.newBest")
          : $_("quiz.end.best", { values: { best: previousBest, total: series.length } })}
      </p>
      <h3>{$_("quiz.end.list")}</h3>
      <ul class="results">
        {#each answers as a (a.answer)}
          {@const outcome = outcomeOf(a)}
          <li>
            <span class="mark" aria-hidden="true">{a.correct ? "✓" : "✗"}</span>
            <span class="r-name">{nameOf(a.answer)}</span>
            <span class={`tag ${outcome}`}>{$_(`quiz.outcome.${outcome}`)}</span>
          </li>
        {/each}
      </ul>
      <div class="end-actions">
        <button class="primary" onclick={onreplay}>{$_("quiz.replay")}</button>
        <button class="secondary" onclick={onquit}>{$_("quiz.back")}</button>
      </div>
    </section>
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
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px
      max(16px, env(safe-area-inset-left));
    border-bottom: 1px solid var(--ast-hairline);
  }
  .meta {
    margin: 0 0 8px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
  }
  .steps {
    display: flex;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border: 1px solid var(--ast-hairline);
  }
  .steps li.now {
    border-color: var(--ast-fg);
  }
  .steps li.right {
    border-color: var(--ast-fg);
    background: var(--ast-fg);
  }
  .steps li.wrong {
    border-color: var(--ast-fg-muted);
    background: repeating-conic-gradient(var(--ast-fg-muted) 0 25%, transparent 0 50%) 0 0 / 4px 4px;
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
  .stage {
    position: relative;
    flex: 1;
    min-height: 160px;
    transition: opacity 140ms var(--ast-ease-out);
  }
  .stage.hidden {
    opacity: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .stage {
      transition: none;
    }
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    /* A still picture: no pan, zoom or pick in the quiz. */
    pointer-events: none;
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
    border-style: dashed;
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
  .end {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 18px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
    box-sizing: border-box;
  }
  .end h2,
  .end h3 {
    margin: 0;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    outline: none;
  }
  .score {
    margin: 6px 0 0;
    font-family: var(--ast-font-display);
    font-weight: 700;
    line-height: 0.9;
  }
  .big {
    font-size: 88px;
  }
  .of {
    font-size: 36px;
    color: var(--ast-fg-muted);
  }
  .record {
    margin: 6px 0 20px;
    font: 500 11px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .results {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }
  .results li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 34px;
    border-top: 1px solid var(--ast-hairline);
    font: 400 13px/1.2 var(--ast-font-mono);
  }
  .mark {
    width: 14px;
    color: var(--ast-fg-muted);
  }
  .r-name {
    flex: 1;
    min-width: 0;
  }
  .tag {
    flex: none;
    padding: 3px 6px;
    border: 1px solid var(--ast-hairline);
    font: 500 9px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .tag.learnt {
    color: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .tag.mastered {
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .tag.review {
    border-style: dashed;
  }
  .end-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: auto;
    padding-top: 18px;
  }
  .end-actions button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    border: 1px solid var(--ast-fg);
  }
  .primary {
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
</style>
