<script lang="ts">
  // « Nomme l'étoile » (#165): a star lights up in its constellation on the real sky (the games'
  // SkyMap: the constellation's figure highlighted, the rest of the sky under a veil, the star in
  // the map's engraved reticle with its arrival rings), and the player names it: 4 names in
  // Découverte and Amateur, typed in Expert. Every answer, right or wrong, turns the choices into
  // a short sheet of the star (name, designation, constellation, magnitude, distance, rank), with
  // « Voir dans le catalogue », which opens its constellation's page on the star and comes back.
  // As in « Quelle constellation ? » (#183), the player may pinch or scroll out, and pan, to see
  // where the star lies (not while an Expert question is asked); « Recentrer » comes back.
  // Challenges (#187): « Série » until the first mistake, « Chrono » for 60 s; the next star
  // comes by itself after a short look at its sheet, without « Voir dans le catalogue ».
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { _ } from "@asteria/ui";
  import type {
    CatalogStar,
    FigureLevel,
    SkyMap,
    SkyTheme,
    ViewState,
  } from "@asteria/sky-renderer";
  import { starDistance, type StarDistanceFields } from "../lib/format";
  import {
    createGameSky,
    gameTheme,
    showDirection,
    viewMoved,
    zoomLimits,
  } from "../lib/games/game-sky";
  import type { ConstellationShape } from "../lib/games/geometry";
  import {
    matchStarName,
    rankFact,
    starFraming,
    type BrightnessRanks,
    type StarItem,
    type StarQuestion,
  } from "../lib/games/name-star";
  import type { ItemResult } from "../lib/games/results";
  import { autoNextDelay, isChallenge, type ChallengeEnd } from "../lib/games/challenge";
  import { ChallengeRun } from "../lib/games/challenge-run.svelte";
  import type { GameMode } from "../lib/games/progress";
  import Designation from "./Designation.svelte";
  import GameHeader from "./GameHeader.svelte";
  import GameRecentre from "./GameRecentre.svelte";
  import Icon from "./Icon.svelte";
  import SeriesEnd from "./SeriesEnd.svelte";

  let {
    series,
    stars,
    lines,
    names,
    named,
    ranks,
    shapes,
    level,
    theme,
    figureSet,
    date,
    mode = "training",
    best = 0,
    onanswer,
    onfinish,
    oncatalogue,
    onreplay,
    onquit,
  }: {
    /** A training series or a challenge (#187); `best`: its record at this level. */
    mode?: GameMode;
    best?: number;
    series: StarQuestion[];
    stars: CatalogStar[];
    lines: Record<string, number[][]>;
    /** French constellation names. */
    names: Readonly<Record<string, string>>;
    /** Every named star that can be asked (namedStars): names, and neighbours for the framing. */
    named: readonly StarItem[];
    ranks: BrightnessRanks;
    shapes: Readonly<Record<string, ConstellationShape>>;
    level: FigureLevel;
    theme: SkyTheme;
    figureSet: string;
    date: Date;
    /** Records the answer about a star, returns what it changed. */
    onanswer: (hip: number, correct: boolean) => ItemResult;
    /** Records the finished series, returns the record before it. */
    onfinish: (score: number) => number;
    /** Opens the star's constellation page in the catalogue, on the star. */
    oncatalogue: (abbr: string, hip: number) => void;
    onreplay: () => void;
    onquit: () => void;
  } = $props();

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CAPTURE = new URLSearchParams(location.search).has("seed");
  const items = untrack(() => new Map(named.map((s) => [s.hip, s])));
  const records = untrack(() => new Map(stars.map((s) => [s.hip, s])));
  const typed = untrack(() => level === "expert");
  const nameOf = (hip: number) => items.get(hip)?.name ?? records.get(hip)?.name ?? `${hip}`;
  const conName = (abbr: string) => names[abbr] ?? abbr;

  let index = $state(0);
  let results = $state.raw<ItemResult[]>([]);
  /** The current question once answered: right or not, and the name typed when it was a typo. */
  let answered = $state.raw<{ correct: boolean; chosen: number | null; typo: boolean } | null>(
    null,
  );
  let done = $state(false);
  let previousBest = $state(0);
  let input = $state("");
  const question = $derived(series[index]);
  const star = $derived(question ? items.get(question.hip) : undefined);
  const record = $derived(question ? records.get(question.hip) : undefined);

  /** The challenge being played (#187), null in training. */
  let run = $state.raw<ChallengeRun | null>(null);
  let autoNext: ReturnType<typeof setTimeout> | null = null;
  function newRun() {
    run?.stop();
    run = isChallenge(mode) ? new ChallengeRun(mode, () => finish("time")) : null;
  }
  untrack(newRun);
  const score = $derived(run ? run.score(false) : results.filter((r) => r.correct).length);
  /** The answer just given ends the series or the challenge: « Voir le résultat ». */
  const last = $derived((run?.over ?? false) || index + 1 >= series.length);

  function finish(why?: ChallengeEnd) {
    if (done) return;
    if (autoNext) clearTimeout(autoNext);
    autoNext = null;
    run?.end(why ?? run.state.end ?? "exhausted");
    previousBest = onfinish(score);
    done = true;
  }

  let root: HTMLDivElement;
  let stage: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let map: SkyMap | undefined;
  let hidden = $state(false);
  let nextButton = $state<HTMLButtonElement>();
  let answerArea = $state<HTMLElement>();
  let field = $state<HTMLInputElement>();
  /** The question's framing, where « Recentrer » goes back to. */
  let framed: ViewState | null = null;
  /** The player has moved the view away from the framing. */
  let moved = $state(false);
  /** Zoom and pan: always but while an Expert question is asked. */
  const free = $derived(!typed || answered !== null);

  /**
   * Frames the question: the constellation (or, among close named stars, the star) at the
   * zenith, and bounds the player's zoom around it. `keep`: only the framing and the bounds
   * follow (the stage was resized while the player looks around).
   */
  function frame(keep = false) {
    if (!map || !star || !stage.clientWidth || !stage.clientHeight) return;
    const aspect = stage.clientWidth / stage.clientHeight;
    const f = starFraming(star, shapes[star.con], named, aspect, stage.clientHeight / 2);
    map.setViewLimits(zoomLimits(f.fov, aspect));
    if (keep && framed) {
      framed = { ...framed, fov: f.fov };
      return;
    }
    framed = showDirection(map, f.centre, date, f.fov);
    moved = false;
  }

  function recentre() {
    if (!map || !framed) return;
    if (reduceMotion) map.setView(framed);
    else map.animateTo(framed, 450);
  }

  /** The star in the reticle, its constellation highlighted (setSelection clears the latter). */
  function showQuestion() {
    if (!map || !star || !record) return;
    map.setSelection({ kind: "star", star: record });
    map.setSelectedConstellation(star.con);
    frame();
    if (!reduceMotion) map.playArrival();
  }

  onMount(() => {
    // No WebGL: the question is still playable from the constellation's name.
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
      layers: { constellationLines: true, constellationFigures: false },
      onViewChange: (view) => {
        const m = framed !== null && viewMoved(view, framed);
        if (m !== moved) moved = m;
      },
    });
    showQuestion();
    run?.start();
    // Typed answers start in the field; choices wait for a touch (no focus ring at first).
    if (typed) void focusAnswer();
    const resize = new ResizeObserver(() => frame(moved));
    resize.observe(stage);
    // The phone's keyboard (typed answers): the panel rises above it, the sky shrinks.
    const vv = window.visualViewport;
    const onViewport = () => {
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      root.style.setProperty("--kb", `${kb > 80 ? kb : 0}px`);
    };
    vv?.addEventListener("resize", onViewport);
    return () => {
      resize.disconnect();
      vv?.removeEventListener("resize", onViewport);
    };
  });
  onDestroy(() => {
    run?.stop();
    if (autoNext) clearTimeout(autoNext);
    map?.dispose();
  });

  $effect(() => {
    map?.setTheme(gameTheme(theme));
  });

  // A new series (Rejouer): back to its first star.
  let shown: StarQuestion[] | null = null;
  $effect(() => {
    if (series === shown) return;
    const first = shown === null;
    shown = series;
    if (first) return;
    index = 0;
    results = [];
    answered = null;
    input = "";
    done = false;
    untrack(newRun);
    void tick().then(() => {
      showQuestion();
      run?.start();
      void focusAnswer();
    });
  });

  async function focusAnswer() {
    await tick();
    if (typed) field?.focus();
    else answerArea?.querySelector<HTMLElement>("button")?.focus();
  }

  async function settle(correct: boolean, chosen: number | null, typo = false) {
    if (answered || !question || done) return;
    answered = { correct, chosen, typo };
    results = [...results, onanswer(question.hip, correct)];
    run?.answer(correct);
    // A challenge goes on with the keyboard up (typed answers): the field comes back at once.
    if (!run) field?.blur();
    await tick();
    if (!run || !typed) nextButton?.focus();
    const delay = run ? autoNextDelay(run.mode, correct) : null;
    if (delay !== null)
      autoNext = setTimeout(() => void next(), reduceMotion ? delay + 250 : delay);
    else if (run) nextButton?.focus();
  }

  function choose(hip: number) {
    void settle(hip === question?.hip, hip);
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!star || !input.trim()) return;
    const match = matchStarName(input, star.name);
    void settle(match !== null, null, match === "typo");
  }

  async function next() {
    if (autoNext) clearTimeout(autoNext);
    autoNext = null;
    if (!answered || done) return;
    if (last) {
      finish();
      return;
    }
    if (!reduceMotion) {
      hidden = true;
      await new Promise((r) => setTimeout(r, 140));
    }
    index++;
    answered = null;
    input = "";
    showQuestion();
    hidden = false;
    void focusAnswer();
  }

  /** Keys 1–4 answer, as the numbers printed on the choices. */
  function onkeydown(e: KeyboardEvent) {
    if (typed || done || answered || e.altKey || e.ctrlKey || e.metaKey) return;
    const n = Number(e.key);
    const choices = question?.choices ?? [];
    if (n >= 1 && n <= choices.length) {
      e.preventDefault();
      choose(choices[n - 1]!);
    }
  }

  // The sheet of the star, once answered.
  const distance = $derived.by(() => {
    if (!record) return null;
    const d = starDistance(record as StarDistanceFields);
    if (!d) return null;
    return d.approx
      ? $_("star.distanceApprox", { values: { ly: d.ly } })
      : $_("star.distance", { values: { ly: d.ly } });
  });
  const rank = $derived(question ? rankFact(question.hip, ranks) : null);
</script>

<svelte:window {onkeydown} />

<div class="name-star" bind:this={root}>
  <GameHeader
    meta={$_("games.nameStar.title")}
    results={results.map((r) => r.correct)}
    total={series.length}
    {index}
    {done}
    progressLabel={run
      ? $_("games.challenge.streakSr", { values: { count: run.state.right } })
      : $_("nameStar.progress", {
          values: { n: Math.min(index + 1, series.length), total: series.length },
        })}
    challenge={run?.head(best) ?? null}
    {onquit}
  />

  <div class="stage" class:hidden class:gone={done} class:free bind:this={stage}>
    <div
      class="sky"
      role="img"
      aria-label={$_("nameStar.sky", { values: { name: conName(star?.con ?? "") } })}
    >
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
      {results}
      nameOf={(item) => nameOf(Number(item))}
      detail={(i) => conName(items.get(Number(results[i]?.item))?.con ?? "")}
      {mode}
      end={run?.state.end ?? null}
      {onreplay}
      {onquit}
    />
  {:else if question && star}
    <section class="panel" aria-labelledby="ns-question">
      <p class="context">{$_("nameStar.context", { values: { name: conName(star.con) } })}</p>
      <p id="ns-question" class="prompt" role="status">
        {#if !answered}
          {$_("nameStar.question")}
        {:else if answered.correct && answered.typo}
          {$_("nameStar.rightTypo", { values: { name: star.name } })}
        {:else if answered.correct}
          {$_("nameStar.right")}
        {:else}
          {$_("nameStar.wrong", { values: { name: star.name } })}
        {/if}
      </p>

      <div class="answer" bind:this={answerArea}>
        {#if answered}
          <!-- What to remember, right or wrong: the star's sheet. -->
          <div class="sheet panel-block">
            <p class="s-meta">
              {#if record?.bayer}<Designation text={record.bayer} /> ·
              {/if}{conName(star.con)}
            </p>
            <p class="s-name">{star.name}</p>
            <dl class="s-data">
              <dt>{$_("data.v")}</dt>
              <dd>{star.v.toFixed(2).replace("-", "−")}</dd>
              {#if distance}
                <dt>{$_("data.dist")}</dt>
                <dd>{distance}</dd>
              {/if}
            </dl>
            {#if rank}
              <p class="s-rank">
                {$_(`nameStar.rank.${rank.kind}`, { values: { rank: rank.rank } })}
              </p>
            {/if}
            <!-- Not during a challenge: its clock and rhythm stay on the game. -->
            {#if !run}
              <button class="go" onclick={() => oncatalogue(star.con, star.hip)}>
                {$_("catalogue.openStar")}<span aria-hidden="true">›</span>
              </button>
            {/if}
          </div>
        {:else if question.choices}
          <div
            class="choices"
            role="group"
            aria-labelledby="ns-question"
            data-answer={CAPTURE ? question.choices.indexOf(question.hip) : undefined}
          >
            {#each question.choices as hip, i (hip)}
              <button class="choice" onclick={() => choose(hip)}>
                <span class="n" aria-hidden="true">{i + 1}</span>
                <span class="c-name">{nameOf(hip)}</span>
              </button>
            {/each}
          </div>
        {:else}
          <form class="typed" onsubmit={submit}>
            <label class="sr-only" for="ns-input">{$_("nameStar.input")}</label>
            <input
              id="ns-input"
              bind:this={field}
              bind:value={input}
              placeholder={$_("nameStar.input")}
              autocomplete="off"
              autocapitalize="words"
              spellcheck="false"
              enterkeyhint="done"
            />
            <div class="row">
              <button type="submit" class="primary" disabled={!input.trim()}
                >{$_("nameStar.submit")}</button
              >
              <button type="button" onclick={() => settle(false, null)}
                >{$_("nameStar.giveUp")}</button
              >
            </div>
            <p class="hint">{$_("nameStar.inputHint")}</p>
          </form>
        {/if}
      </div>

      <button
        class="next"
        class:shown={answered !== null}
        bind:this={nextButton}
        disabled={answered === null}
        onclick={next}
      >
        {last ? $_("quiz.result") : $_("quiz.next")}
        <Icon name="play" size={10} />
      </button>
    </section>
  {/if}
</div>

<style>
  .name-star {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    /* The phone's keyboard, when a name is typed (set from the visual viewport). */
    padding-bottom: var(--kb, 0px);
    box-sizing: border-box;
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
  button:disabled {
    cursor: default;
    opacity: 0.45;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 140px;
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
  .context {
    margin: 0;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .prompt {
    margin: 2px 0 10px;
    min-height: 1.15em;
    font: 700 20px/1.15 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  /* Choices, the typed answer or the star's sheet: one height, so the sky does not jump. */
  .answer {
    min-height: 210px;
  }
  .choices {
    display: grid;
    gap: 6px;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 0 12px;
    border: 1px solid var(--ast-hairline);
    text-align: left;
    font: 500 14px/1.2 var(--ast-font-mono);
    letter-spacing: 0.02em;
    text-transform: none;
  }
  @media (hover: hover) {
    .choice:hover {
      border-color: var(--ast-fg);
    }
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
  .typed {
    display: grid;
    gap: 8px;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    min-height: 48px;
    padding: 0 12px;
    border: 1px solid var(--ast-fg);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    font: 500 16px/1.2 var(--ast-font-mono);
    letter-spacing: 0.02em;
  }
  input::placeholder {
    color: var(--ast-fg-muted);
  }
  input:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .row button {
    min-height: 48px;
    border: 1px solid var(--ast-hairline);
  }
  .primary {
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg) !important;
  }
  .hint {
    margin: 0;
    font: 400 11px/1.4 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .sheet {
    --ast-panel-pad: 12px 14px;
    animation: rise 160ms var(--ast-ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet {
      animation: none;
    }
  }
  .s-meta {
    margin: 0;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .s-name {
    margin: 2px 0 6px;
    font: 700 30px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }
  .s-data {
    display: flex;
    flex-wrap: wrap;
    gap: 0 8px;
    margin: 0;
    font: 12px/1.6 var(--ast-font-mono);
    letter-spacing: 0.06em;
    color: var(--ast-fg-muted);
  }
  .s-data dd {
    margin: 0 10px 0 0;
    color: var(--ast-fg);
    font-variant-numeric: tabular-nums;
  }
  .s-rank {
    margin: 2px 0 0;
    font: 400 12px/1.5 var(--ast-font-mono);
  }
  .go {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    margin: 6px 0 -8px;
    padding: 0;
    color: var(--ast-fg);
  }
  .go span {
    font-size: 16px;
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
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
