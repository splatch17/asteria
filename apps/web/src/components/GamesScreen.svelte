<script lang="ts" module>
  import type { CatalogueFilter as Filter } from "../lib/catalogue";

  /**
   * What the screen opens on (menu v2): the catalogue's list (a filter), a constellation's card in
   * the deck (`all`: the deck of the 88, else the list the catalogue opens on), a game's settings,
   * a game played at once with its last settings (« Reprendre »), or « Ton ciel ».
   */
  export type LearnStart =
    | { view: "catalogue"; filter?: Filter }
    | { view: "page"; abbr: string; star?: number | null; all?: boolean }
    | { view: "setup"; game: string }
    | { view: "play"; game: string }
    | { view: "sky" };
</script>

<script lang="ts">
  // Screens of the Catalogue and Jeux tabs (#163, #164, #165, #170; menu v2): the catalogue's
  // list and deck, a game's settings (#187), a game, and « Ton ciel », the constellations learnt
  // so far as a grid of cells filled by mastery (1-bit dither: none, a third in dots, half in
  // checkerboard, full). Their homes are in the menu's sheet (SheetCatalogue, SheetGames): the
  // screen opens on what was chosen there, over the whole app (the map stops under it), and
  // closing what it opened on closes the screen, back to that home. A game (QuizGame, WhereGame,
  // NameStarGame), the catalogue and a constellation's page are shown in the same dialog, so that
  // Escape and focus stay in one place. The constellation games feed the same memory of each constellation
  // (`con:XXX`), « Nomme l'étoile » that of each star (`star:HIP`). Opened from the map on a
  // constellation's page, « back » returns to the map; opened from « Nomme l'étoile », it returns
  // to the game as it was (the game stays mounted, hidden, under the page).
  // A game's card opens its settings (#187, GameSetup): the mode (training series, « Série »,
  // « Chrono ») and the part of the sky asked, remembered per game; records are per game, mode
  // and level. « Rejouer » plays again with the same settings.
  import { onMount, tick, untrack } from "svelte";
  import { _ } from "@asteria/ui";
  import { applyMat3, j2000ToHorizontalMatrix, type Observer } from "@asteria/astro-core";
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
  import { GAME_ID as WHERE_ID, buildWhereSeries } from "../lib/games/where-is-it";
  import type { Grade } from "../lib/games/srs";
  import { level as levelPref } from "../lib/level-store.svelte";
  import { readSetting, writeSetting } from "../lib/storage";
  import Catalogue from "./Catalogue.svelte";
  import CatalogueDeck, { type DeckCardProps } from "./CatalogueDeck.svelte";
  import ConstellationPage from "./ConstellationPage.svelte";
  import GameSetup from "./GameSetup.svelte";
  import NameStarGame from "./NameStarGame.svelte";
  import QuizGame from "./QuizGame.svelte";
  import WhereGame from "./WhereGame.svelte";
  import { historyLayer } from "../lib/back.svelte";
  import { LAST_GAME_KEY } from "../lib/games/catalog";
  import { RECENT_KEY, isRecentList, pushRecent } from "../lib/recent-cards";
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
    start,
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
    /** Where the screen opens (a tab of the menu, or a constellation's page from the map, #170). */
    start: LearnStart;
    onclose: () => void;
  } = $props();

  /** « Ton ciel » counts, best known first. */
  const MASTERY: readonly Mastery[] = ["mastered", "known", "learning", "new"];

  const params = new URLSearchParams(location.search);
  // The app's level (#201), set in the menu (Jeux tab, Réglages).
  const level = $derived<FigureLevel>(levelPref.value);

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
  /** Each figure's height above the horizon now (its centre), for the « Ce soir » list's order. */
  const figureAltitudes = untrack(() => {
    const m = j2000ToHorizontalMatrix(date, observer);
    return Object.fromEntries(
      Object.values(shapes).map((sh) => [
        sh.abbr,
        (Math.asin(Math.max(-1, Math.min(1, applyMat3(m, sh.centre)[2]))) * 180) / Math.PI,
      ]),
    );
  });
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
  /** « Ton ciel »: by full name in Découverte, where the cells show it (#198), else by abbreviation. */
  const skyCells = $derived(
    level === "discovery"
      ? [...pool].sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b, "fr"))
      : pool,
  );
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
  /** The settings closed without playing: back to the Jeux tab. */
  function closeSetup() {
    setup = null;
    if (!playing) onclose();
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

  /** `all`: the deck of the 88 (« Ouvrir les 88 cartes », a recent card). */
  function openPage(abbr: string, star: number | null = null, outside = false, all = false) {
    const sequence = all
      ? pageSequence(entries, abbr, { filter: "all", query: "", level, outside: false })
      : pageSequence(entries, abbr, { filter, query, level, outside, tonight: visible });
    page = { abbr, star, outside, sequence };
    markPageSeen(abbr);
  }
  /** The deck rests on another card: it is the page now, and consulted. */
  function turnTo(abbr: string) {
    if (page) page = { ...page, abbr };
    markPageSeen(abbr);
  }
  /**
   * A page read is « seen » (#170): kept apart from the games' review schedule. It also leads
   * « Tes dernières cartes » of the Catalogue tab.
   */
  function markPageSeen(abbr: string) {
    writeSetting(RECENT_KEY, pushRecent(readSetting(RECENT_KEY, [], isRecentList), abbr));
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
  function closeCatalogue() {
    catalogueOpen = false;
    onclose();
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
    // « Reprendre » of the Jeux tab (#176): this game, with these settings, in one tap.
    writeSetting(LAST_GAME_KEY, game);
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
  /** Out of a game: back to the Jeux tab. */
  function leave() {
    playing = null;
    gamePage = null;
    onclose();
  }

  // Android back (#176) closes what is on top: a page opened from a game, the game, its settings,
  // a constellation's page, the catalogue; closing what the screen opened on closes it.
  historyLayer(
    "learn-catalogue",
    () => catalogueOpen,
    () => closeCatalogue(),
  );
  historyLayer(
    "learn-page",
    () => page !== null,
    () => void closePage(),
  );
  historyLayer(
    "learn-setup",
    () => setup !== null,
    () => closeSetup(),
  );
  historyLayer(
    "learn-game",
    () => playing !== null,
    () => leave(),
  );
  historyLayer(
    "learn-game-page",
    () => gamePage !== null,
    () => void closeGamePage(),
  );

  let dialog: HTMLElement;
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.focus({ preventScroll: true });
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
    const asked = GAMES.find((g) => "game" in start && g.id === start.game && g.available);
    if (start.view === "catalogue") {
      if (start.filter) filter = start.filter;
      catalogueOpen = true;
    } else if (start.view === "page" && shapes[start.abbr])
      openPage(start.abbr, start.star ?? null, true, start.all);
    else if (start.view === "setup" && asked) setup = asked.id;
    else if (start.view === "play" && asked && !playing) play(asked.id);
    else if (start.view !== "sky" && !playing && !setup) onclose(); // nothing to show
    return () => previous?.focus?.();
  });

  /** Escape leaves the game, then the screen; Tab cycles inside the dialog. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (gamePage) void closeGamePage();
      else if (playing) void leave();
      else if (setup) closeSetup();
      else if (page) void closePage();
      else if (catalogueOpen) closeCatalogue();
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
  class:bare={!playing && !page && !catalogueOpen && start.view !== "sky"}
  role="dialog"
  aria-modal="true"
  aria-labelledby={playing ? undefined : "games-title"}
  aria-label={playing ? $_("tabs.games") : undefined}
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
      altitudes={figureAltitudes}
      {progress}
      onopen={(abbr) => openPage(abbr)}
      onback={closeCatalogue}
      {onclose}
    />
  {:else}
    <!-- « Ton ciel » (#185), from the Jeux tab: what the games know of each constellation. Under
         a game's settings opened from that tab, nothing: the sheet rises over the sky. -->
    {#if start.view === "sky"}
      <header class="head">
        <button
          class="icon"
          onclick={onclose}
          aria-label={$_("games.sky.back")}
          title={$_("games.sky.back")}>←</button
        >
        <h1 id="games-title">{$_("games.section.sky")}</h1>
      </header>
      <div class="scroll">
        <section class="group" aria-labelledby="games-title">
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
            <!-- Découverte (#198): the names in full, on wider cells; abbreviations elsewhere. -->
            <ul class="sky" class:few={pool.length < 40} class:named={level === "discovery"}>
              {#each skyCells as abbr (abbr)}
                {@const state = masteryOfItem(progress, itemKey("con", abbr))}
                <li
                  class={`cell ${state}`}
                  title={names[abbr] ?? abbr}
                  aria-label={$_("games.sky.cell", {
                    values: { name: names[abbr] ?? abbr, state: $_(`games.mastery.${state}`) },
                  })}
                >
                  <span aria-hidden="true"
                    >{level === "discovery" ? (names[abbr] ?? abbr) : abbr}</span
                  >
                </li>
              {/each}
            </ul>
          </div>
        </section>
      </div>
    {:else}
      <h1 id="games-title" class="sr-only">{$_("tabs.games")}</h1>
    {/if}
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
    gap: 8px;
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
    font: 500 var(--ast-fs-s)/1 var(--ast-font-mono);
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

  /* A game's settings opened from the Jeux tab (menu v2): the sheet rises over the sky. */
  .games.bare {
    background: transparent;
  }
  .icon {
    flex: none;
    width: 44px;
    height: 44px;
    margin: -8px 0 0 -12px;
    font: 400 20px/1 var(--ast-font-mono);
  }
  .group {
    margin-top: 26px;
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
    font: 500 var(--ast-fs-xs)/1.25 var(--ast-font-mono);
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
    font: 500 var(--ast-fs-xs)/1 var(--ast-font-mono);
    letter-spacing: 0.02em;
    color: var(--ast-fg-muted);
  }
  .sky.few .cell {
    padding-top: 7px;
    font-size: var(--ast-fs-s);
  }
  .cell span {
    position: relative;
  }
  /* Découverte (#198): three columns of wider cells, the full name on up to two lines at the
     top, on a plate of the sky colour where a dither could run under the letters. */
  .sky.named {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .sky.named .cell {
    aspect-ratio: auto;
    min-height: 52px;
    padding: 6px 4px 0;
    font-size: var(--ast-fs-s);
    line-height: 1.2;
    text-align: center;
  }
  .sky.named .cell span {
    align-self: flex-start;
    padding: 0 2px;
  }
  .sky.named .cell.learning span,
  .sky.named .cell.known span {
    background: var(--ast-bg);
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
