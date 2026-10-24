<script lang="ts">
  // Apprendre screen (#163, #164, #165, #170): the catalogue of the constellations, the games, the
  // player's level and « Ton ciel », the constellations learnt so far as a grid of cells filled by
  // mastery (1-bit dither: none, a third in dots, half in checkerboard, full). Catalogue and games
  // are cards with a vignette (#185); a game's card comes from its `GAMES` entry. Opens over the
  // whole app (the map stops under it) and closes back to it as it was. A game (QuizGame, WhereGame,
  // NameStarGame), the
  // catalogue and a constellation's page are shown in the same dialog, so that Escape and focus
  // stay in one place. The constellation games feed the same memory of each constellation
  // (`con:XXX`), « Nomme l'étoile » that of each star (`star:HIP`). Opened from the map on a
  // constellation's page, « back » returns to the map; opened from « Nomme l'étoile », it returns
  // to the game as it was (the game stays mounted, hidden, under the page).
  // A game's card opens its settings (#187, GameSetup): the mode (training series, « Série »,
  // « Chrono ») and the part of the sky asked, remembered per game; records are per game, mode
  // and level. « Rejouer » plays again with the same settings.
  import { onMount, tick, untrack } from "svelte";
  import { _ } from "@asteria/ui";
  import type { Observer } from "@asteria/astro-core";
  import type { CatalogStar, FigureLevel, SkyTheme } from "@asteria/sky-renderer";
  import { defaultFilter, type CatalogueEntry, type CatalogueFilter } from "../lib/catalogue";
  import { pageSequence } from "../lib/catalogue-nav";
  import { GAMES, type GameEntry } from "../lib/games/catalog";
  import { isChallenge } from "../lib/games/challenge";
  import { constellationShapes, figureStars } from "../lib/games/geometry";
  import { constellationPool } from "../lib/games/pool";
  import {
    GAME_MODES,
    bestScore,
    countMastery,
    itemKey,
    loadProgress,
    markSeen,
    masteryOfItem,
    recordGame,
    recordKey,
    saveProgress,
    type GameMode,
    type Progress,
  } from "../lib/games/progress";
  import {
    defaultSettings,
    isGameSettings,
    playableScope,
    scopeCounts,
    scopeItems,
    settingsKey,
    type GameSettings,
    type ScopeSets,
    type SkyScope,
  } from "../lib/games/settings";
  import {
    GAME_ID as NAME_ID,
    brightnessRanks,
    buildStarSeries,
    gradeOf as starGrade,
    namedStars,
    starPool,
    type StarQuestion,
  } from "../lib/games/name-star";
  import { recordItem, type ItemResult } from "../lib/games/results";
  import { mulberry32 } from "../lib/games/rng";
  import {
    upFromLatitude,
    upTonight,
    visibleFromLatitude,
    tonightWindow,
    visibleTonight,
  } from "../lib/games/visibility";
  import {
    GAME_ID as QUIZ_ID,
    answerQuestion,
    buildSeries,
    type Answer,
    type Question,
  } from "../lib/games/which-constellation";
  import { GAME_ID as WHERE_ID, MAX_POINTS, buildWhereSeries } from "../lib/games/where-is-it";
  import type { Grade } from "../lib/games/srs";
  import { LEVEL_STORAGE_KEY, isLevel } from "../lib/layers";
  import { readSetting, writeSetting } from "../lib/storage";
  import Catalogue from "./Catalogue.svelte";
  import CatalogueDeck, { type DeckCardProps } from "./CatalogueDeck.svelte";
  import ConstellationPage from "./ConstellationPage.svelte";
  import GameSetup from "./GameSetup.svelte";
  import Icon from "./Icon.svelte";
  import NameStarGame from "./NameStarGame.svelte";
  import QuizGame from "./QuizGame.svelte";
  import WhereGame from "./WhereGame.svelte";
  import Vignette from "./Vignette.svelte";
  import type { IconName } from "../lib/icons";
  import type { Mastery } from "../lib/games/srs";

  let {
    stars,
    lines,
    names,
    latin,
    date,
    observer,
    theme,
    figureSet,
    placeName,
    located = false,
    start = null,
    onlatitude,
    onexplain,
    onlocate,
    locating = "idle",
    onclose,
  }: {
    /** The player's own place is known (else `observer` is the app's default place, #187). */
    located?: boolean;
    /**
     * « Pourquoi ? » next to « Visibles de chez moi » in a game's settings: opens the latitude
     * explorer (#188) when given; no link otherwise.
     */
    onexplain?: (() => void) | undefined;
    /** « Utiliser ma position » in a game's settings when the place is unknown (#198). */
    onlocate?: (() => void) | undefined;
    locating?: "idle" | "busy" | "error";
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
    placeName: string;
    /** Where the screen opens: the catalogue (menu), or a constellation's page (map, #170). */
    start?: { view: "catalogue" } | { view: "page"; abbr: string; star?: number | null } | null;
    /** Opens « Selon la latitude » (#188) over this screen, at a latitude (null: the player's). */
    onlatitude?: (latitude?: number | null) => void;
    onclose: () => void;
  } = $props();

  const LEVELS: readonly FigureLevel[] = ["discovery", "amateur", "expert"];
  /** « Ton ciel » counts, best known first. */
  const MASTERY: readonly Mastery[] = ["mastered", "known", "learning", "new"];

  /** A card of the screen (#185): the catalogue or a game (one entry of `GAMES` each). */
  interface Card {
    /** Vignette and element ids: `catalogue` or the game id. */
    id: string;
    title: string;
    pitch: string;
    /** Record or progress line; empty for a game to come. */
    meta: string;
    /** Gauge: `value` of `total` inked (best score, constellations seen). */
    value: number;
    total: number;
    /** Challenge records (#187), small tags under the gauge. */
    chips?: string[];
    icon: IconName;
    action: string;
    /** Null for a game to come (« Bientôt »). */
    onclick: (() => void) | null;
  }
  const params = new URLSearchParams(location.search);
  const urlLevel = params.get("level");
  let level = $state<FigureLevel>(
    isLevel(urlLevel) ? urlLevel : readSetting(LEVEL_STORAGE_KEY, "amateur", isLevel),
  );
  function chooseLevel(l: FigureLevel) {
    level = l;
    if (!isLevel(urlLevel)) writeSetting(LEVEL_STORAGE_KEY, l);
  }

  // Older records (one per game, #163) become the training records of the level chosen.
  let progress = $state.raw<Progress>(
    loadProgress(
      undefined,
      untrack(() => level),
    ),
  );
  // Computed once per opening: the catalogue, place and date do not change under the screen.
  const shapes = untrack(() => constellationShapes(stars, lines));
  const visible = untrack(() => visibleTonight(shapes, date, observer));
  /** « Nomme l'étoile » (#165): the named stars, their brightness ranks, those up tonight. */
  const named = untrack(() => namedStars(stars));
  const ranks = untrack(() => brightnessRanks(stars));
  const starsTonight = untrack(() =>
    upTonight(Object.fromEntries(named.map((s) => [String(s.hip), s.dir])), date, observer),
  );
  /** « Visibles de chez moi » (#187): figures and named stars up from this latitude in a year. */
  const home = untrack(() =>
    visibleFromLatitude(figureStars(stars, lines), observer.latitude, date),
  );
  const starsHome = untrack(() =>
    upFromLatitude(
      Object.fromEntries(named.map((s) => [String(s.hip), s.dir])),
      observer.latitude,
      date,
    ),
  );
  const pool = $derived(constellationPool(level, Object.keys(shapes)));
  const starItems = $derived(starPool(level, named, shapes));
  const counts = $derived(
    countMastery(
      progress,
      pool.map((a) => itemKey("con", a)),
    ),
  );
  const bestOf = (game: string, mode: GameMode = "training") =>
    bestScore(progress, recordKey(game, mode, level));

  /** What a game asks about at this level, and the sky scopes over it (#187). */
  function askable(game: GameEntry): { pool: string[]; sets: ScopeSets } {
    return game.items === "star"
      ? {
          pool: starItems.map((s) => String(s.hip)),
          sets: { home: starsHome, tonight: starsTonight },
        }
      : { pool, sets: { home, tonight: visible } };
  }

  // --- Settings of each game (#187), remembered per game.
  const stored = (id: string): GameSettings =>
    readSetting(settingsKey(id), defaultSettings(located), isGameSettings);
  let settings = $state<Record<string, GameSettings>>(
    untrack(() => Object.fromEntries(GAMES.map((g) => [g.id, stored(g.id)]))),
  );
  /** The game whose settings sheet is open. */
  let setup = $state<string | null>(null);
  const setupGame = $derived(GAMES.find((g) => g.id === setup) ?? null);
  async function closeSetup() {
    const id = setup;
    setup = null;
    await tick();
    dialog.querySelector<HTMLElement>(`[data-game='${id}']`)?.focus();
  }
  function startGame(game: string, chosen: GameSettings) {
    settings = { ...settings, [game]: chosen };
    writeSetting(settingsKey(game), chosen);
    setup = null;
    play(game, chosen);
  }

  // --- Catalogue (#170): the list (filter and search kept while a page is open) and a page.
  const entries: CatalogueEntry[] = untrack(() =>
    Object.keys(shapes)
      .map((abbr) => ({ abbr, name: names[abbr] ?? abbr, latin: latin[abbr] ?? abbr }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr")),
  );
  let catalogueOpen = $state(false);
  let filter = $state<CatalogueFilter>(untrack(() => defaultFilter(level)));
  let query = $state("");
  /**
   * The page shown, a card of the deck (#196) of the list as it was left (`sequence`, fixed while
   * the deck is open); `outside`: opened from the map, « back » closes the screen.
   */
  let page = $state.raw<{
    abbr: string;
    star: number | null;
    outside: boolean;
    sequence: CatalogueEntry[];
  } | null>(null);
  const seenCount = $derived(Object.keys(progress.seen).filter((k) => k.startsWith("con:")).length);

  function openPage(abbr: string, star: number | null = null, outside = false) {
    const sequence = pageSequence(entries, abbr, {
      filter,
      query,
      level,
      outside,
      tonight: visible,
    });
    page = { abbr, star, outside, sequence };
    markPageSeen(abbr);
  }
  /** The deck rests on another card: it is the page now, and consulted. */
  function turnTo(abbr: string) {
    if (page) page = { ...page, abbr };
    markPageSeen(abbr);
  }
  /** A page read is « seen » (#170): kept apart from the games' review schedule. */
  function markPageSeen(abbr: string) {
    const next = markSeen(progress, itemKey("con", abbr), Date.now());
    if (next !== progress) {
      progress = next;
      saveProgress(progress);
    }
  }
  async function closePage() {
    const from = page;
    page = null;
    if (from?.outside) return onclose();
    catalogueOpen = true;
    await tick();
    dialog.querySelector<HTMLElement>(`[data-abbr='${from?.abbr}']`)?.focus();
  }
  async function closeCatalogue() {
    catalogueOpen = false;
    await tick();
    dialog.querySelector<HTMLElement>("[data-learn='catalogue']")?.focus();
  }

  /** The series being played, null on the list. `?seed=` makes it reproducible (captures). */
  let playing = $state.raw<
    | ((
        | { game: typeof QUIZ_ID; series: Question[] }
        | { game: typeof WHERE_ID; series: string[] }
        | { game: typeof NAME_ID; series: StarQuestion[] }
      ) & { settings: GameSettings; best: number })
    | null
  >(null);
  /** A constellation's page opened from « Nomme l'étoile », over the game (#165). */
  let gamePage = $state.raw<{ abbr: string; star: number } | null>(null);
  const seed = Number(params.get("seed"));
  const rng = mulberry32(Number.isFinite(seed) && seed > 0 ? seed : Date.now());

  /** Plays a game with its settings (#187): mode, and the items of the sky scope chosen. */
  function play(game: string, chosen: GameSettings = settings[game] ?? defaultSettings(located)) {
    const entry = GAMES.find((g) => g.id === game);
    if (!entry) return;
    const now = Date.now();
    const { pool: all, sets } = askable(entry);
    const scope = playableScope(chosen.scope, scopeCounts(all, sets));
    const ask = scope === "all" ? undefined : scopeItems(all, scope, sets);
    const challenge = isChallenge(chosen.mode);
    const common = { level, progress, now, rng, ask, challenge };
    const meta = { settings: chosen, best: bestOf(game, chosen.mode) };
    if (game === QUIZ_ID)
      playing = { game, series: buildSeries({ ...common, shapes, visible }), ...meta };
    else if (game === WHERE_ID)
      playing = { game, series: buildWhereSeries({ ...common, shapes, visible }), ...meta };
    else if (game === NAME_ID)
      playing = {
        game,
        series: buildStarSeries({ ...common, pool: starItems, visible: starsTonight }),
        ...meta,
      };
  }
  /** « Rejouer »: the same settings, the record to beat updated. */
  const replay = () => playing && play(playing.game, playing.settings);
  function namedAnswer(hip: number, correct: boolean): ItemResult {
    const r = recordItem(progress, "star", String(hip), starGrade(correct), Date.now());
    progress = r.progress;
    saveProgress(progress);
    return r.result;
  }
  /** « Voir dans le catalogue » from the game: the page on the star, marked « seen ». */
  function openGamePage(abbr: string, hip: number) {
    if (!shapes[abbr]) return;
    gamePage = { abbr, star: hip };
    markPageSeen(abbr);
  }
  async function closeGamePage() {
    gamePage = null;
    await tick();
    dialog.querySelector<HTMLElement>(".name-star .go")?.focus();
  }
  function placed(abbr: string, grade: Grade): ItemResult {
    const r = recordItem(progress, "con", abbr, grade, Date.now());
    progress = r.progress;
    saveProgress(progress);
    return r.result;
  }
  function answer(question: Question, chosen: string): Answer {
    const r = answerQuestion(progress, question, chosen, Date.now());
    progress = r.progress;
    saveProgress(progress);
    return r.answer;
  }
  /** Records a finished series or challenge; returns the record it had to beat. */
  function finish(game: string, score: number): number {
    const mode = playing?.settings.mode ?? "training";
    const previous = bestOf(game, mode);
    progress = recordGame(progress, recordKey(game, mode, level), score);
    saveProgress(progress);
    return previous;
  }
  async function leave() {
    const game = playing?.game;
    playing = null;
    gamePage = null;
    await tick();
    dialog.querySelector<HTMLElement>(`[data-game='${game}']`)?.focus();
  }

  let dialog: HTMLElement;
  let closeButton = $state<HTMLButtonElement>();
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton?.focus();
    // Captures: ?game=1 (« Quelle constellation ? »), 2 (« Où est-elle ? »), 3 (« Nomme
    // l'étoile »), with its remembered settings or ?mode= and ?scope=; ?setup=N opens a game's
    // settings.
    const game = GAMES[Number(params.get("game")) - 1];
    const mode = params.get("mode") as GameMode | null;
    const scope = params.get("scope") as SkyScope | null;
    if (game?.available) {
      const chosen = { ...settings[game.id]!, ...(mode && { mode }), ...(scope && { scope }) };
      play(game.id, isGameSettings(chosen) ? chosen : settings[game.id]);
    }
    const sheet = GAMES[Number(params.get("setup")) - 1];
    if (sheet?.available) setup = sheet.id;
    if (start?.view === "catalogue") catalogueOpen = true;
    else if (start?.view === "page" && shapes[start.abbr])
      openPage(start.abbr, start.star ?? null, true);
    return () => previous?.focus?.();
  });

  /** Escape leaves the game, then the screen; Tab cycles inside the dialog. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (gamePage) void closeGamePage();
      else if (playing) void leave();
      else if (setup) void closeSetup();
      else if (page) void closePage();
      else if (catalogueOpen) void closeCatalogue();
      else onclose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input, summary, a[href]"),
    ].filter((el) => !el.closest("[inert]")); // the list under an open settings sheet
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

{#snippet constellationCard(entry: CatalogueEntry, deck: DeckCardProps)}
  <ConstellationPage
    abbr={entry.abbr}
    name={entry.name}
    latin={entry.latin}
    {names}
    {stars}
    {lines}
    shape={shapes[entry.abbr]!}
    {date}
    latitude={observer.latitude}
    {placeName}
    tonight={visible.has(entry.abbr)
      ? tonightWindow(shapes[entry.abbr]!.centre, date, observer)
      : null}
    initialStar={deck.star}
    sky={deck.sky}
    current={deck.current}
    figures={deck.figures}
    onfigures={deck.onfigures}
  />
{/snippet}

<div
  class="games"
  role="dialog"
  aria-modal="true"
  aria-labelledby="games-title"
  tabindex="-1"
  bind:this={dialog}
  {onkeydown}
>
  {#if playing?.game === WHERE_ID}
    <WhereGame
      series={playing.series}
      {stars}
      {lines}
      {names}
      {level}
      {theme}
      {figureSet}
      {date}
      {observer}
      onresult={placed}
      onfinish={(score) => finish(WHERE_ID, score)}
      mode={playing.settings.mode}
      best={playing.best}
      onreplay={replay}
      onquit={leave}
    />
  {:else if playing?.game === NAME_ID}
    <div class="layer" hidden={gamePage !== null}>
      <NameStarGame
        series={playing.series}
        {stars}
        {lines}
        {names}
        {named}
        {ranks}
        {shapes}
        {level}
        {theme}
        {figureSet}
        {date}
        onanswer={namedAnswer}
        onfinish={(score) => finish(NAME_ID, score)}
        oncatalogue={openGamePage}
        mode={playing.settings.mode}
        best={playing.best}
        onreplay={replay}
        onquit={leave}
      />
    </div>
    {#if gamePage}
      {@const p = gamePage}
      <!-- A deck of one card: the page of the star's constellation, back to the game after. -->
      <CatalogueDeck
        sequence={entries.filter((e) => e.abbr === p.abbr)}
        abbr={p.abbr}
        initialStar={p.star}
        onturn={() => {}}
        onback={closeGamePage}
        onclose={closeGamePage}
        {stars}
        {lines}
        {names}
        {theme}
        {figureSet}
        {level}
        {date}
        card={constellationCard}
      />
    {/if}
  {:else if playing?.game === QUIZ_ID}
    <QuizGame
      series={playing.series}
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
      onfinish={(score) => finish(QUIZ_ID, score)}
      mode={playing.settings.mode}
      best={playing.best}
      onreplay={replay}
      onquit={leave}
    />
  {:else if page}
    {@const p = page}
    <!-- Keyed by the list: the deck stays as its cards turn (p.abbr follows them). -->
    {#key p.sequence}
      <CatalogueDeck
        sequence={p.sequence}
        abbr={p.abbr}
        initialStar={p.star}
        onturn={turnTo}
        onback={closePage}
        {onclose}
        {stars}
        {lines}
        {names}
        {theme}
        {figureSet}
        {level}
        {date}
        card={constellationCard}
      />
    {/key}
  {:else if catalogueOpen}
    <Catalogue
      {entries}
      bind:filter
      bind:query
      tonight={visible}
      {progress}
      onopen={(abbr) => openPage(abbr)}
      onback={closeCatalogue}
      {onclose}
    />
  {:else}
    <header class="head" inert={setup !== null}>
      <h1 id="games-title">{$_("learn.title")}</h1>
      <button
        class="close"
        bind:this={closeButton}
        onclick={onclose}
        aria-label={$_("learn.close")}
        title={$_("learn.close")}>×</button
      >
    </header>

    <div class="scroll" inert={setup !== null}>
      <div class="levels" role="group" aria-label={$_("games.level")}>
        {#each LEVELS as l (l)}
          <button aria-pressed={level === l} onclick={() => chooseLevel(l)}
            >{$_(`level.${l}`)}</button
          >
        {/each}
      </div>

      <section class="group" aria-labelledby="learn-catalogue">
        <h2 class="group-title" id="learn-catalogue">{$_("catalogue.title")}</h2>
        <ul class="cards">
          {@render card({
            id: "catalogue",
            title: $_("learn.catalogue.title"),
            pitch: $_("learn.catalogue.hint"),
            meta: $_("learn.catalogue.seen", {
              values: { seen: seenCount, total: entries.length },
            }),
            value: seenCount,
            total: entries.length,
            icon: "catalogue",
            action: $_("learn.catalogue.open"),
            onclick: () => (catalogueOpen = true),
          })}
          {#if onlatitude}
            {@render card({
              id: "latitude",
              title: $_("learn.latitude.title"),
              pitch: $_("learn.latitude.hint"),
              meta: "",
              value: 0,
              total: 0,
              icon: "latitude",
              action: $_("learn.latitude.open"),
              onclick: () => onlatitude(),
            })}
          {/if}
        </ul>
      </section>

      <section class="group" aria-labelledby="games-list">
        <h2 class="group-title" id="games-list">{$_("games.section.games")}</h2>
        <ul class="cards">
          {#each GAMES as game (game.id)}
            {@const best = bestOf(game.id)}
            {@const streak = bestOf(game.id, "streak")}
            {@const timed = bestOf(game.id, "timed")}
            {@render card({
              // Challenge records at this level (#187), when there are some.
              chips: [
                ...(streak > 0 ? [$_("games.card.streak", { values: { score: streak } })] : []),
                ...(timed > 0
                  ? [
                      game.points
                        ? $_("games.card.timedPoints", { values: { score: timed } })
                        : $_("games.card.timed", { values: { score: timed } }),
                    ]
                  : []),
              ],
              id: game.id,
              title: $_(`games.${game.id}.title`),
              pitch: $_(`games.${game.id}.hint`),
              meta: !game.available
                ? ""
                : best > 0
                  ? game.points
                    ? $_("games.bestPoints", { values: { score: best } })
                    : $_("games.best", { values: { score: best, total: game.length } })
                  : streak + timed > 0
                    ? $_("games.setup.noRecord")
                    : $_("games.noRecord"),
              // Points games (#184): one square per MAX_POINTS of the record.
              value: game.points ? Math.round(best / MAX_POINTS) : best,
              total: game.length,
              icon: "play",
              action: $_("games.play"),
              onclick: game.available ? () => (setup = game.id) : null,
            })}
          {/each}
        </ul>
        {#if visible.size > 0}<p class="note">{$_("games.tonight")}</p>{/if}
      </section>

      <section class="group" aria-labelledby="games-sky">
        <h2 class="group-title" id="games-sky">{$_("games.section.sky")}</h2>
        <div class="panel-block sky-panel">
          <dl class="stats">
            {#each MASTERY as state (state)}
              <div class="stat">
                <dt>
                  <span class={`swatch ${state}`} aria-hidden="true"></span>{$_(
                    `games.sky.count.${state}`,
                    { values: { count: counts[state] } },
                  )}
                </dt>
                <dd>{counts[state]}</dd>
              </div>
            {/each}
          </dl>
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
        </div>
      </section>
    </div>
    {#if setupGame}
      {@const g = setupGame}
      {@const scope = askable(g)}
      <GameSetup
        game={g.id}
        title={$_(`games.${g.id}.title`)}
        items={g.items}
        length={g.length}
        points={g.points ?? false}
        {level}
        settings={settings[g.id] ?? defaultSettings(located)}
        counts={scopeCounts(scope.pool, scope.sets)}
        records={Object.fromEntries(GAME_MODES.map((m) => [m, bestOf(g.id, m)])) as Record<
          GameMode,
          number
        >}
        {located}
        {placeName}
        latitude={observer.latitude}
        {onexplain}
        {onlocate}
        {locating}
        onplay={(chosen) => startGame(g.id, chosen)}
        onclose={closeSetup}
      />
    {/if}
  {/if}
</div>

<!-- A card of the screen (#185): vignette, title, pitch, record, gauge and the one action,
     which covers the whole card (a tap anywhere opens it). -->
{#snippet card(c: Card)}
  <li class="card" class:soon={!c.onclick}>
    <div class="art"><Vignette id={c.id} /></div>
    <div class="text">
      <h3 id={`card-${c.id}`}>{c.title}</h3>
      <p class="pitch">{c.pitch}</p>
      {#if c.meta}
        <p class="meta">
          <span class="gauge" class:fine={c.total > 20} aria-hidden="true">
            {#each Array.from({ length: c.total }, (_, i) => i < c.value) as on, i (i)}
              <i class:on></i>
            {/each}
          </span>
          <span>{c.meta}</span>
        </p>
      {/if}
      {#if c.chips?.length}
        <p class="chips">
          {#each c.chips as chip (chip)}<span class="chip">{chip}</span>{/each}
        </p>
      {/if}
    </div>
    <div class="action">
      {#if c.onclick}
        <button
          class="go"
          id={`go-${c.id}`}
          aria-labelledby={`go-${c.id} card-${c.id}`}
          onclick={c.onclick}
          data-learn={c.id === "catalogue" ? "catalogue" : undefined}
          data-game={c.id === "catalogue" ? undefined : c.id}
        >
          <Icon name={c.icon} size={12} /><span>{c.action}</span>
        </button>
      {:else}
        <span class="later">{$_("games.soon")}</span>
      {/if}
    </div>
  </li>
{/snippet}

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
  /* A game kept under a catalogue page (#165): hidden, still mounted. */
  .layer {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .layer[hidden] {
    display: none;
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
    padding-bottom: max(24px, env(safe-area-inset-bottom));
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Level: a segmented control across the width. */
  .levels {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 16px;
    border: 1px solid var(--ast-hairline);
  }
  .levels button {
    min-height: 44px;
    padding: 0 6px;
    color: var(--ast-fg-muted);
    transition:
      color 120ms var(--ast-ease-out),
      background-color 120ms var(--ast-ease-out);
  }
  .levels button + button {
    border-left: 1px solid var(--ast-hairline);
  }
  .levels button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .levels button:focus-visible {
    outline-offset: -4px;
  }
  .levels button[aria-pressed="true"]:focus-visible {
    outline-color: var(--ast-bg);
  }

  /* Groups: catalogue, games, « Ton ciel ». A spaced-capitals title ruled to the edge. */
  .group {
    margin-top: 26px;
  }
  .levels + .group {
    margin-top: 22px;
  }
  .group-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 10px;
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

  /* Cards (#185): panels (#171) with a vignette, the record and one action over the card. */
  .cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
    container-type: inline-size;
  }
  .card {
    position: relative;
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    grid-template-areas:
      "art text"
      "art action";
    gap: 12px 14px;
    border: 1px solid var(--ast-panel-border);
    background: var(--ast-panel-bg);
    padding: 12px;
    transition:
      border-color 160ms var(--ast-ease-out),
      background-color 160ms var(--ast-ease-out);
  }
  .art {
    grid-area: art;
    align-self: center;
    width: 104px;
    height: 104px;
    background: var(--ast-bg);
    box-shadow: inset 0 0 0 1px var(--ast-hairline);
  }
  .text {
    grid-area: text;
    align-self: end;
    min-width: 0;
  }
  h3 {
    margin: 0 0 4px;
    font: 700 21px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-wrap: balance;
  }
  .pitch {
    margin: 0;
    font: 400 11px/1.45 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin: 8px 0 0;
    font: 500 9px/1.3 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  /* Gauge: one pip per round (the record) or one tick per constellation (the catalogue). */
  .gauge {
    display: flex;
    align-items: flex-end;
    gap: 2px;
  }
  .gauge i {
    flex: none;
    width: 6px;
    height: 6px;
    box-sizing: border-box;
    border: 1px solid var(--ast-fg-muted);
  }
  .gauge i.on {
    border-color: var(--ast-fg);
    background: var(--ast-fg);
  }
  .gauge.fine {
    gap: 1px;
  }
  .gauge.fine i {
    width: 1px;
    height: 6px;
    border: 0;
    background: var(--ast-fg-muted);
    opacity: 0.6;
  }
  .gauge.fine i:nth-child(10n) {
    height: 9px;
  }
  .gauge.fine i.on {
    height: 9px;
    opacity: 1;
    background: var(--ast-fg);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 6px 0 0;
  }
  .chip {
    padding: 3px 5px 2px;
    border: 1px solid var(--ast-hairline);
    font: 500 8px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .action {
    grid-area: action;
    align-self: start;
    display: flex;
  }
  .go {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 16px;
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  /* The action covers the card: a tap anywhere on it plays (one tap, ≤ 2 rule). */
  .go::after {
    content: "";
    position: absolute;
    inset: -1px;
  }
  .go:focus-visible {
    outline: none;
  }
  .go:focus-visible::after {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .go :global(svg) {
    transition: transform 160ms var(--ast-ease-out);
  }
  @media (hover: hover) {
    .card:hover {
      border-color: var(--ast-fg-muted);
    }
    .card:hover .go :global(svg) {
      transform: translateX(2px);
    }
  }
  .card:active {
    background: color-mix(in srgb, var(--ast-fg) 9%, transparent);
  }
  .later {
    font: 500 9px/44px var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .soon .art,
  .soon h3 {
    opacity: 0.55;
  }
  /* Wide (tablet, desktop): one row, the action on the right. */
  @container (min-width: 520px) {
    .card {
      grid-template-columns: 96px minmax(0, 1fr) auto;
      grid-template-areas: "art text action";
      column-gap: 20px;
      padding: 14px;
    }
    .art {
      width: 96px;
      height: 96px;
    }
    .text,
    .action {
      align-self: center;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .levels button,
    .go :global(svg) {
      transition: none;
    }
  }
  .note {
    margin: 10px 0 0;
    font: 400 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }

  /* « Ton ciel » (#185): counts by mastery (the numbers are the legend), then the cells. */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin: 0 0 14px;
  }
  .stat {
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
  }
  .stat dd {
    margin: 0;
    font: 700 28px/1 var(--ast-font-display);
    font-variant-numeric: tabular-nums;
  }
  .stat dt {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    font: 500 9px/1.25 var(--ast-font-mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .swatch {
    position: relative;
    flex: none;
    width: 10px;
    height: 10px;
    box-sizing: border-box;
    border: 1px solid var(--ast-hairline);
  }
  .sky {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 3px;
  }
  .sky.few {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  /* A cell fills up from the bottom as the constellation is learnt, with denser ink: under a
     third in fine dots (25 %), half in a checkerboard (50 %), full and solid. The name stays on the
     clear top, read without the dither behind it. */
  .cell {
    position: relative;
    display: flex;
    justify-content: center;
    aspect-ratio: 1;
    box-sizing: border-box;
    padding-top: 5px;
    border: 1px solid var(--ast-hairline);
    font: 500 9px/1 var(--ast-font-mono);
    letter-spacing: 0.02em;
    color: var(--ast-fg-muted);
  }
  .sky.few .cell {
    padding-top: 7px;
    font-size: 11px;
  }
  .cell span {
    position: relative;
  }
  .cell::before,
  .swatch::before {
    content: "";
    position: absolute;
    inset: auto 0 0;
    height: var(--fill, 0);
  }
  /* The legend shows the screens only, at full height. */
  .swatch::before {
    height: 100%;
  }
  .cell.learning,
  .swatch.learning {
    --fill: 30%;
  }
  .cell.known,
  .swatch.known {
    --fill: 54%;
  }
  .cell.mastered,
  .swatch.mastered {
    --fill: 100%;
  }
  .cell.learning::before,
  .swatch.learning::before {
    background: conic-gradient(from 270deg at 1px 1px, var(--ast-fg) 25%, transparent 0) 0 100% /
      2px 2px;
  }
  .cell.known::before,
  .swatch.known::before {
    background: repeating-conic-gradient(var(--ast-fg) 0 25%, transparent 0 50%) 0 100% / 4px 4px;
  }
  .cell.mastered::before,
  .swatch.mastered::before {
    background: var(--ast-fg);
  }
  .cell.learning,
  .cell.known,
  .swatch.learning,
  .swatch.known {
    border-color: var(--ast-fg-muted);
  }
  .cell.learning,
  .cell.known {
    color: var(--ast-fg);
  }
  .cell.mastered,
  .swatch.mastered {
    border-color: var(--ast-fg);
  }
  .cell.mastered {
    color: var(--ast-bg);
    font-weight: 700;
  }
</style>
