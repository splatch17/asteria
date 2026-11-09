<script lang="ts">
  // Home of the Jeux tab (menu v2, sketch A + B panel 5; replaces the Apprendre screen's home,
  // #176). « Reprendre » in large: the game played last with its last settings (mode, part of the
  // sky) and its record, ▶ Jouer plays it at once (3 taps from the sky: button, Jeux, Jouer).
  // Before any game, the first game is offered there instead (its settings open). Then the games
  // as illustrated tiles on two columns (their 1-bit vignette, lib/vignettes; the record as a
  // tag): a tile opens the game's settings (#187). The fourth tile is « Ton ciel », what the games
  // know of the constellations of this level (#185). The level control is in the sheet's header.
  import { _ } from "@asteria/ui";
  import { GAMES, LAST_GAME_KEY, isResumable } from "../lib/games/catalog";
  import { constellationPool } from "../lib/games/pool";
  import {
    bestScore,
    countMastery,
    itemKey,
    loadProgress,
    recordKey,
    type GameMode,
  } from "../lib/games/progress";
  import { defaultSettings, isGameSettings, settingsKey } from "../lib/games/settings";
  import { level } from "../lib/level-store.svelte";
  import { readSetting } from "../lib/storage";
  import Icon from "./Icon.svelte";
  import Vignette from "./Vignette.svelte";

  let {
    located,
    constellations,
    onresume,
    onsetup,
    onsky,
  }: {
    /** The player's place is known: a game never set asks about « Visibles de chez moi ». */
    located: boolean;
    /** Abbreviations of the figures the catalogue draws (the pool of « Ton ciel »). */
    constellations: readonly string[];
    /** ▶ Jouer: the game, with its remembered settings. */
    onresume: (game: string) => void;
    /** A game's tile: its settings. */
    onsetup: (game: string) => void;
    /** « Ton ciel ». */
    onsky: () => void;
  } = $props();

  const progress = loadProgress();
  const last = readSetting<string | null>(LAST_GAME_KEY, null, isResumable);
  const available = GAMES.filter((g) => g.available);
  const lead = available.find((g) => g.id === last) ?? null;
  const settingsOf = (id: string) =>
    readSetting(settingsKey(id), defaultSettings(located), isGameSettings);
  const best = (id: string, mode: GameMode) =>
    bestScore(progress, recordKey(id, mode, level.value));

  /** A record as its tag: « Record 8/10 », « Série 12 », « Chrono 4 200 pts »; empty if none. */
  function recordTag(id: string, mode: GameMode): string {
    const game = GAMES.find((g) => g.id === id)!;
    const score = best(id, mode);
    if (score <= 0) return "";
    if (mode === "streak") return $_("games.card.streak", { values: { score } });
    if (mode === "timed")
      return game.points
        ? $_("games.card.timedPoints", { values: { score } })
        : $_("games.card.timed", { values: { score } });
    return game.points
      ? $_("games.bestPoints", { values: { score } })
      : $_("games.best", { values: { score, total: game.length } });
  }
  /** « Reprendre »'s record, after the mode's name: « record 8 », « record 4 200 pts ». */
  function resumeRecord(id: string, mode: GameMode): string {
    const score = best(id, mode);
    if (score <= 0) return "";
    const points = GAMES.find((g) => g.id === id)?.points ?? false;
    return $_(points ? "games.resume.recordPoints" : "games.resume.record", { values: { score } });
  }
  /** The best tag of a game across its modes, training first. */
  const tagOf = (id: string) =>
    (["training", "streak", "timed"] as const).map((m) => recordTag(id, m)).find(Boolean) ?? "";

  const resume = $derived.by(() => {
    if (!lead) return null;
    const s = settingsOf(lead.id);
    return {
      id: lead.id,
      line: [
        $_(`games.mode.${s.mode}.label`),
        $_(`games.scope.${s.scope}.label`),
        resumeRecord(lead.id, s.mode),
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
  const first = available[0]!;
  const pool = $derived(constellationPool(level.value, constellations));
  const counts = $derived(
    countMastery(
      progress,
      pool.map((a) => itemKey("con", a)),
    ),
  );
  const learnt = $derived(counts.known + counts.mastered);
  /** « Ton ciel »'s gauge: one pip per constellation of the level (at most 30, then scaled). */
  const pips = $derived.by(() => {
    const n = Math.min(pool.length, 30);
    const on = Math.round((learnt / Math.max(1, pool.length)) * n);
    return Array.from({ length: n }, (_, i) => i < on);
  });
</script>

<div class="home">
  {#if resume}
    <button
      class="lead"
      data-action="resume"
      data-game={resume.id}
      onclick={() => onresume(resume.id)}
    >
      <span class="lead-art"><Vignette id={resume.id} /></span>
      <span class="lead-text">
        <span class="over">{$_("learn.resume.title")}</span>
        <span class="lead-title">{$_(`games.${resume.id}.title`)}</span>
        <span class="lead-meta">{resume.line}</span>
        <span class="play"><Icon name="play" size={11} />{$_("learn.resume.play")}</span>
      </span>
    </button>
  {:else}
    <!-- No game played yet: the first one leads, its settings a tap away. -->
    <button class="lead" data-action="first" data-game={first.id} onclick={() => onsetup(first.id)}>
      <span class="lead-art"><Vignette id={first.id} /></span>
      <span class="lead-text">
        <span class="over">{$_("games.start")}</span>
        <span class="lead-title">{$_(`games.${first.id}.title`)}</span>
        <span class="lead-meta">{$_(`games.${first.id}.hint`)}</span>
        <span class="play"><Icon name="play" size={11} />{$_("games.play")}</span>
      </span>
    </button>
  {/if}

  <ul class="tiles">
    {#each available as game (game.id)}
      {@const tag = tagOf(game.id)}
      <li>
        <button
          class="tile"
          data-game={game.id}
          onclick={() => onsetup(game.id)}
          aria-label={[$_(`games.${game.id}.title`), tag].filter(Boolean).join(" · ")}
        >
          <span class="tile-art" aria-hidden="true"><Vignette id={game.id} /></span>
          {#if tag}<span class="tag" aria-hidden="true">{tag}</span>{/if}
          <span class="tile-name" aria-hidden="true">{$_(`games.${game.id}.title`)}</span>
        </button>
      </li>
    {/each}
    <li>
      <button
        class="tile sky"
        data-action="sky"
        onclick={onsky}
        aria-label={$_("games.sky.tile", { values: { n: learnt, total: pool.length } })}
      >
        <span class="score" aria-hidden="true"
          ><span class="n">{learnt}</span><span class="of">/{pool.length}</span></span
        >
        <span class="gauge" aria-hidden="true">
          {#each pips as on, i (i)}
            <i class:on></i>
          {/each}
        </span>
        <span class="tile-name" aria-hidden="true">{$_("games.section.sky")}</span>
      </button>
    </li>
  </ul>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--sheet-gap);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  button {
    font: inherit;
    color: var(--ast-fg);
    background: transparent;
    border-radius: var(--ast-radius);
    cursor: pointer;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible {
    outline: 2px solid var(--ast-focus);
    outline-offset: 2px;
  }
  /* « Reprendre »: a panel with the game's vignette, the game and its settings, ▶ Jouer. */
  .lead {
    display: flex;
    align-items: stretch;
    gap: 14px;
    width: 100%;
    padding: 10px;
    border: 1px solid var(--ast-control-border);
    background: var(--ast-panel-bg);
  }
  .lead-art {
    flex: none;
    width: 92px;
    height: 92px;
    background: var(--ast-bg);
    box-shadow: inset 0 0 0 1px var(--ast-hairline);
  }
  .lead-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }
  .over {
    font: 500 var(--ast-fs-xs)/1.2 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .lead-title {
    font: 700 22px/1 var(--ast-font-display);
    letter-spacing: 0.01em;
    text-wrap: balance;
  }
  .lead-meta {
    font: 500 var(--ast-fs-xs)/1.35 var(--ast-font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .play {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 4px;
    padding: 7px 12px 6px;
    background: var(--ast-fg);
    color: var(--ast-bg);
    font: 600 var(--ast-fs-s)/1 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  /* The games: two columns of tiles, the vignette top left, the record as a tag. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    position: relative;
    /* The picture, then the name under it: a name on two lines (narrow screens, large text)
       makes the tile taller, it never runs over the picture. */
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    min-height: 96px;
    padding: 6px 8px 8px 10px;
    border: 1px solid var(--ast-control-border);
    background: var(--ast-bg);
    overflow: hidden;
  }
  .tile-art {
    flex: none;
    width: 50px;
    height: 50px;
    margin-left: -2px;
  }
  .tag {
    position: absolute;
    top: 6px;
    right: 6px;
    max-width: calc(100% - 70px);
    padding: 3px 5px 2px;
    border: 1px solid var(--ast-hairline);
    font: 500 var(--ast-fs-xs)/1.1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .tile-name {
    margin-top: auto;
    padding-top: 6px;
    font: 700 17px/1 var(--ast-font-display);
    text-align: left;
    text-wrap: balance;
  }
  /* « Ton ciel »: the count in large, a gauge of pips under it. */
  .score {
    position: absolute;
    top: 8px;
    left: 10px;
    display: flex;
    align-items: baseline;
    font: 700 26px/1 var(--ast-font-display);
    font-variant-numeric: tabular-nums;
  }
  .of {
    font-size: 15px;
    color: var(--ast-fg-muted);
  }
  .gauge {
    position: absolute;
    top: 40px;
    left: 10px;
    right: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .gauge i {
    width: 5px;
    height: 5px;
    box-sizing: border-box;
    border: 1px solid var(--ast-fg-muted);
  }
  .gauge i.on {
    border-color: var(--ast-fg);
    background: var(--ast-fg);
  }
  @media (hover: hover) {
    .tile:hover,
    .lead:hover {
      border-color: var(--ast-fg);
    }
  }
  .tile:active,
  .lead:active {
    transform: translateY(1px);
  }
  @media (prefers-reduced-motion: reduce) {
    .tile:active,
    .lead:active {
      transform: none;
    }
  }
</style>
