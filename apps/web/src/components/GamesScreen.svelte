<script lang="ts">
  // Jeux screen (#163): the games, the player's level and « Ton ciel », the constellations learnt
  // so far as a grid of cards inked by mastery (1-bit dither: none, light, half, full). Opens over
  // the whole app (the map stops under it) and closes back to it as it was. A game is played in
  // the same dialog (QuizGame), so that Escape and focus stay in one place.
  import { onMount, tick, untrack } from "svelte";
  import { _ } from "@asteria/ui";
  import type { Observer } from "@asteria/astro-core";
  import type { CatalogStar, FigureLevel, SkyTheme } from "@asteria/sky-renderer";
  import { GAMES } from "../lib/games/catalog";
  import { constellationShapes } from "../lib/games/geometry";
  import { constellationPool } from "../lib/games/pool";
  import {
    countMastery,
    itemKey,
    loadProgress,
    masteryOfItem,
    recordGame,
    saveProgress,
    type Progress,
  } from "../lib/games/progress";
  import { mulberry32 } from "../lib/games/rng";
  import { visibleTonight } from "../lib/games/visibility";
  import {
    GAME_ID,
    SERIES_LENGTH,
    answerQuestion,
    buildSeries,
    type Answer,
    type Question,
  } from "../lib/games/which-constellation";
  import { LEVEL_STORAGE_KEY, isLevel } from "../lib/layers";
  import { readSetting, writeSetting } from "../lib/storage";
  import Icon from "./Icon.svelte";
  import QuizGame from "./QuizGame.svelte";

  let {
    stars,
    lines,
    names,
    latin,
    date,
    observer,
    theme,
    figureSet,
    onclose,
  }: {
    stars: CatalogStar[];
    lines: Record<string, number[][]>;
    /** Constellation names (French) and official Latin names, by IAU abbreviation. */
    names: Readonly<Record<string, string>>;
    latin: Readonly<Record<string, string>>;
    /** The app's date and place: the sky of « tonight » the games prefer. */
    date: Date;
    observer: Observer;
    theme: SkyTheme;
    figureSet: string;
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

  let progress = $state.raw<Progress>(loadProgress());
  // Computed once per opening: the catalogue, place and date do not change under the screen.
  const shapes = untrack(() => constellationShapes(stars, lines));
  const visible = untrack(() => visibleTonight(shapes, date, observer));
  const pool = $derived(constellationPool(level, Object.keys(shapes)));
  const counts = $derived(
    countMastery(
      progress,
      pool.map((a) => itemKey("con", a)),
    ),
  );
  const best = $derived(progress.games[GAME_ID]?.best ?? 0);

  /** The series being played, null on the list. `?seed=` makes it reproducible (captures). */
  let series = $state.raw<Question[] | null>(null);
  const seed = Number(params.get("seed"));
  const rng = mulberry32(Number.isFinite(seed) && seed > 0 ? seed : Date.now());

  function play() {
    series = buildSeries({ level, shapes, progress, now: Date.now(), rng, visible });
  }
  function answer(question: Question, chosen: string): Answer {
    const r = answerQuestion(progress, question, chosen, Date.now());
    progress = r.progress;
    saveProgress(progress);
    return r.answer;
  }
  function finish(score: number): number {
    const previous = best;
    progress = recordGame(progress, GAME_ID, score);
    saveProgress(progress);
    return previous;
  }
  async function leave() {
    series = null;
    await tick();
    dialog.querySelector<HTMLElement>("[data-game='whichConstellation']")?.focus();
  }

  let dialog: HTMLElement;
  let closeButton = $state<HTMLButtonElement>();
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton?.focus();
    if (params.get("game") === "1") play(); // captures
    return () => previous?.focus?.();
  });

  /** Escape leaves the game, then the screen; Tab cycles inside the dialog. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (series) void leave();
      else onclose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled)")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
</script>

<div
  class="games"
  role="dialog"
  aria-modal="true"
  aria-labelledby="games-title"
  tabindex="-1"
  bind:this={dialog}
  {onkeydown}
>
  {#if series}
    <QuizGame
      {series}
      {stars}
      {lines}
      {names}
      {latin}
      {level}
      {theme}
      {figureSet}
      {date}
      {shapes}
      onanswer={answer}
      onfinish={finish}
      onreplay={play}
      onquit={leave}
    />
  {:else}
    <header class="head">
      <div>
        <p class="meta">{$_("games.meta")}</p>
        <h1 id="games-title">{$_("games.title")}</h1>
      </div>
      <button
        class="close"
        bind:this={closeButton}
        onclick={onclose}
        aria-label={$_("games.close")}
        title={$_("games.close")}>×</button
      >
    </header>

    <div class="scroll">
      <div class="levels" role="group" aria-label={$_("games.level")}>
        {#each LEVELS as l (l)}
          <button aria-pressed={level === l} onclick={() => chooseLevel(l)}
            >{$_(`level.${l}`)}</button
          >
        {/each}
      </div>

      <section class="panel-block" aria-labelledby="games-list">
        <h2 class="panel-title" id="games-list">{$_("games.section.games")}</h2>
        <ul class="cards">
          {#each GAMES as game (game.id)}
            <li class="card" class:soon={!game.available}>
              <div class="card-inner">
                <div class="card-text">
                  <h3>{$_(`games.${game.id}.title`)}</h3>
                  <p>{$_(`games.${game.id}.hint`)}</p>
                  {#if game.available && best > 0}
                    <p class="best">
                      {$_("games.best", { values: { score: best, total: SERIES_LENGTH } })}
                    </p>
                  {/if}
                </div>
                {#if game.available}
                  <button class="play" data-game={game.id} onclick={play}>
                    <Icon name="play" size={12} />{$_("games.play")}
                  </button>
                {:else}
                  <span class="tag">{$_("games.soon")}</span>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        {#if visible.size > 0}<p class="note">{$_("games.tonight")}</p>{/if}
      </section>

      <section class="panel-block" aria-labelledby="games-sky">
        <h2 class="panel-title" id="games-sky">{$_("games.section.sky")}</h2>
        <p class="summary">
          {$_("games.sky.summary", {
            values: {
              mastered: counts.mastered,
              known: counts.known,
              total: counts.total,
            },
          })}
        </p>
        <ul class="sky" class:few={pool.length < 40}>
          {#each pool as abbr (abbr)}
            {@const state = masteryOfItem(progress, itemKey("con", abbr))}
            <li
              class={`cell ${state}`}
              title={names[abbr] ?? abbr}
              aria-label={$_("games.sky.cell", {
                values: { name: names[abbr] ?? abbr, state: $_(`games.mastery.${state}`) },
              })}
            >
              <span aria-hidden="true">{abbr}</span>
            </li>
          {/each}
        </ul>
        <ul class="legend" aria-hidden="true">
          {#each ["new", "learning", "known", "mastered"] as state (state)}
            <li><span class={`cell ${state}`}></span>{$_(`games.mastery.${state}`)}</li>
          {/each}
        </ul>
      </section>
    </div>
  {/if}
</div>

<style>
  .games {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    background: var(--ast-bg);
    color: var(--ast-fg);
    outline: none;
    box-sizing: border-box;
    animation: fade 160ms var(--ast-ease-out);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .games {
      animation: none;
    }
  }
  .head,
  .scroll {
    width: 100%;
    max-width: 640px;
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
    padding-top: max(16px, env(safe-area-inset-top));
    padding-bottom: 12px;
    border-bottom: 1px solid var(--ast-hairline);
  }
  .meta {
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .meta {
    margin: 0 0 4px;
  }
  h1 {
    margin: 0;
    font: 700 30px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
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
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: max(20px, env(safe-area-inset-bottom));
  }
  .levels {
    display: flex;
    width: fit-content;
    margin-top: 14px;
    border: 1px solid var(--ast-hairline);
  }
  .levels button {
    min-height: 40px;
    padding: 0 12px;
    color: var(--ast-fg-muted);
  }
  .levels button + button {
    border-left: 1px solid var(--ast-hairline);
  }
  .levels button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  section {
    margin-top: var(--ast-panel-gap);
  }
  .levels + section {
    margin-top: 16px;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Game cards: a pixel checkerboard band around the card (collection cards, DA §3). */
  .cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card {
    padding: 4px;
    background: repeating-conic-gradient(var(--ast-fg) 0 25%, transparent 0 50%) 0 0 / 8px 8px;
  }
  .card.soon {
    background: repeating-conic-gradient(var(--ast-hairline) 0 25%, transparent 0 50%) 0 0 / 8px 8px;
  }
  .card-inner {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 10px 12px;
    background: var(--ast-bg);
  }
  .card-text {
    flex: 1;
    min-width: 0;
  }
  h3 {
    margin: 0 0 3px;
    font: 700 19px/1.05 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .card-text p {
    margin: 0;
    font: 400 11px/1.4 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .card-text .best {
    margin-top: 4px;
    font-size: 9px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
  }
  .soon h3 {
    color: var(--ast-fg-muted);
  }
  .play {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .play:focus-visible {
    outline-offset: 3px;
  }
  .tag {
    flex: none;
    padding: 4px 6px;
    border: 1px dashed var(--ast-hairline);
    font: 500 9px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .note,
  .summary {
    margin: 10px 0 0;
    font: 400 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .summary {
    margin: 0 0 10px;
    color: var(--ast-fg);
  }
  /* « Ton ciel »: one card per constellation, inked by mastery in 1-bit dither. */
  .sky {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 3px;
  }
  .sky.few {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .cell {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border: 1px solid var(--ast-hairline);
    font: 500 9px/1 var(--ast-font-mono);
    letter-spacing: 0.02em;
    color: var(--ast-fg-muted);
    background-color: var(--ast-bg);
  }
  .sky.few .cell {
    font-size: 11px;
  }
  .cell span {
    padding: 1px 2px;
    background: var(--ast-bg);
  }
  .cell.learning {
    border-style: dashed;
    border-color: var(--ast-fg-muted);
  }
  .cell.known {
    border-color: var(--ast-fg);
    color: var(--ast-fg);
    background-image: repeating-conic-gradient(var(--ast-fg) 0 25%, transparent 0 50%);
    background-size: 4px 4px;
  }
  .cell.mastered {
    border-color: var(--ast-fg);
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .cell.mastered span {
    background: transparent;
    font-weight: 700;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 10px;
    font: 400 10px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .legend .cell {
    width: 12px;
    height: 12px;
    box-sizing: border-box;
  }
</style>
