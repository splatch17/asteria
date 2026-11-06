<script lang="ts">
  // The sheet of the single button (menu v2, sketch A + B in docs/design/menu-v2/, after #176).
  // One sheet under the thumb. Its foot is where the button was: « × Fermer » in the button's
  // place, then four tabs that are destinations, a pictogram over a word: Ciel · Orbites ·
  // Catalogue · Jeux (the selected one inked, with a rule on the side of the sheet). Ciel and
  // Orbites are the map's two modes: their tabs switch the map behind the sheet at once; Catalogue
  // and Jeux leave it as it is (App.svelte). Each tab opens on its home (SheetSky, SheetOrbits,
  // SheetCatalogue, SheetGames), under a header: the title in tall capitals, a short meta, and ⚙
  // at the top right, far from the thumb. ⚙ opens the settings, apart (SheetSettings), with a
  // ‹ back to the tab; the tab bar stays below, the tab of origin still marked (a tap on it comes
  // back too). In the Jeux tab, the level (#201) is in the header, where it changes the games.
  // On a wide screen the same sheet is a 380 px panel rising from that corner. Modal: a backdrop
  // takes the outside taps (they close the sheet without selecting anything), Tab stays inside,
  // Escape and Android back close the settings, then the sheet (App.svelte).
  import { onMount, tick, type ComponentProps } from "svelte";
  import { _ } from "@asteria/ui";
  import { historyLayer } from "../lib/back.svelte";
  import type { IconName } from "../lib/icons";
  import { LEVELS } from "../lib/level";
  import { level } from "../lib/level-store.svelte";
  import { SHEET_TABS, itemForKey, type SheetTab } from "../lib/modes";
  import Icon from "./Icon.svelte";
  import SheetOrbits from "./SheetOrbits.svelte";
  import SheetSettings from "./SheetSettings.svelte";
  import SheetSky from "./SheetSky.svelte";
  import type SheetCatalogue from "./SheetCatalogue.svelte";
  import type SheetGames from "./SheetGames.svelte";

  let {
    tab,
    ontab,
    metas,
    sky,
    orbits,
    catalogue,
    games,
    settings,
    brightness = $bindable(),
    onclose,
    closeButton = $bindable(),
  }: {
    /** The tab shown: Ciel or Orbites (the map's mode) when the sheet opens. */
    tab: SheetTab;
    /** A tab chosen (Ciel and Orbites also switch the map). */
    ontab: (tab: SheetTab) => void;
    /** The header's short meta of Ciel (« PARIS · 21:30 · EN DIRECT ») and Orbites (the point of view). */
    metas: { sky: string; orbits: string };
    sky: Omit<ComponentProps<typeof SheetSky>, "brightness">;
    orbits: ComponentProps<typeof SheetOrbits>;
    /** null while the sky's catalogue loads. */
    catalogue: Omit<ComponentProps<typeof SheetCatalogue>, "onmeta"> | null;
    games: ComponentProps<typeof SheetGames> | null;
    settings: ComponentProps<typeof SheetSettings>;
    brightness: number;
    onclose: () => void;
    closeButton?: HTMLButtonElement | undefined;
  } = $props();

  // Catalogue and Jeux carry the games' logic and the card sketches: loaded on demand, from the
  // first opening of the sheet (they are ready by the time a finger reaches their tab).
  const catalogueHome = import("./SheetCatalogue.svelte");
  const gamesHome = import("./SheetGames.svelte");

  const ICONS: Record<SheetTab, IconName> = {
    sky: "sky",
    orbits: "planets",
    catalogue: "catalogue",
    games: "games",
  };

  let sheet: HTMLElement;
  let tablist = $state<HTMLElement>();
  let settingsButton = $state<HTMLButtonElement>();
  let backButton = $state<HTMLButtonElement>();
  let catalogueMeta = $state("");

  /** The settings page (⚙), over the tab's home; Android back closes it first. */
  let settingsOpen = $state(false);
  async function openSettings() {
    levelsOpen = false;
    settingsOpen = true;
    await tick();
    backButton?.focus({ preventScroll: true });
  }
  async function closeSettings() {
    settingsOpen = false;
    await tick();
    settingsButton?.focus({ preventScroll: true });
  }
  historyLayer(
    "sheet-settings",
    () => settingsOpen,
    () => void closeSettings(),
  );

  /** Jeux: the level's choices, unfolded under the header. */
  let levelsOpen = $state(false);

  function choose(next: SheetTab) {
    levelsOpen = false;
    if (settingsOpen) settingsOpen = false;
    if (next !== tab) ontab(next);
  }
  /** Arrow keys, Home and End move between the tabs and show them (automatic activation). */
  async function ontabkey(e: KeyboardEvent) {
    const next = itemForKey(SHEET_TABS, tab, e.key);
    if (!next) return;
    e.preventDefault();
    choose(next);
    await tick();
    tablist?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
  }

  const title = $derived(settingsOpen ? $_("menu.section.settings") : $_(`tabs.${tab}`));
  const meta = $derived(
    tab === "sky"
      ? metas.sky
      : tab === "orbits"
        ? metas.orbits
        : tab === "catalogue"
          ? catalogueMeta
          : "",
  );

  // The sheet itself takes the focus (no ring drawn on a tab after a tap); Tab then reaches the
  // header's buttons and the tab's home.
  onMount(() => {
    sheet.focus({ preventScroll: true });
  });

  /** Escape folds the level, closes the settings, then the sheet; Tab cycles inside (modal). */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (levelsOpen) levelsOpen = false;
      else if (settingsOpen) void closeSettings();
      else onclose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [
      ...sheet.querySelectorAll<HTMLElement>(
        'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled)',
      ),
    ].filter((el) => !el.closest("[hidden]"));
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === sheet)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<!-- Outside taps close the sheet and stop there (no selection behind it). -->
<div class="backdrop" aria-hidden="true" onpointerdown={onclose}></div>
<div
  class="sheet frame"
  role="dialog"
  aria-modal="true"
  aria-labelledby="menu-title"
  tabindex="-1"
  id="main-menu"
  data-tab={tab}
  data-settings={settingsOpen || undefined}
  bind:this={sheet}
  {onkeydown}
>
  <header class="head">
    {#if settingsOpen}
      <button
        class="square"
        bind:this={backButton}
        onclick={() => void closeSettings()}
        aria-label={$_("settings.back", { values: { tab: $_(`tabs.${tab}`) } })}
        title={$_("settings.back", { values: { tab: $_(`tabs.${tab}`) } })}
        data-action="settings-back"><span class="chev" aria-hidden="true">‹</span></button
      >
    {/if}
    <h2 id="menu-title" class="title">{title}</h2>
    {#if !settingsOpen}
      {#if meta}<p class="meta">{meta}</p>{:else}<span class="spacer"></span>{/if}
      {#if tab === "games"}
        <button
          class="level"
          aria-expanded={levelsOpen}
          aria-controls="sheet-levels"
          onclick={() => (levelsOpen = !levelsOpen)}
          aria-label={$_("games.level.label", { values: { level: $_(`level.${level.value}`) } })}
          ><span>{$_(`level.${level.value}`)}</span><span class="caret" aria-hidden="true">▾</span
          ></button
        >
      {/if}
      <button
        class="square"
        bind:this={settingsButton}
        onclick={() => void openSettings()}
        aria-label={$_("menu.section.settings")}
        title={$_("menu.section.settings")}
        aria-haspopup="true"
        data-action="settings"><Icon name="settings" size={20} /></button
      >
    {/if}
  </header>
  {#if tab === "games" && levelsOpen && !settingsOpen}
    <div class="levels" id="sheet-levels" role="group" aria-label={$_("settings.level")}>
      {#each LEVELS as l (l)}
        <button
          aria-pressed={level.value === l}
          onclick={() => {
            level.set(l);
            levelsOpen = false;
          }}>{$_(`level.${l}`)}</button
        >
      {/each}
    </div>
  {/if}

  {#if settingsOpen}
    <div class="settings">
      <SheetSettings {...settings} />
    </div>
  {:else}
    <div
      class="body"
      role="tabpanel"
      id={`sheet-panel-${tab}`}
      aria-labelledby={`sheet-tab-${tab}`}
    >
      {#if tab === "sky"}
        <SheetSky {...sky} bind:brightness />
      {:else if tab === "orbits"}
        <SheetOrbits {...orbits} />
      {:else if tab === "catalogue"}
        {#if catalogue}
          {#await catalogueHome then { default: Home }}
            <Home {...catalogue} onmeta={(m) => (catalogueMeta = m)} />
          {/await}
        {:else}
          <p class="wait">{$_("map.loading")}</p>
        {/if}
      {:else if games}
        {#await gamesHome then { default: Home }}
          <Home {...games} />
        {/await}
      {:else}
        <p class="wait">{$_("map.loading")}</p>
      {/if}
    </div>
  {/if}

  <!-- The foot sits where the button was: « × Fermer » in its place, then the destinations. -->
  <div class="foot">
    <button
      class="close"
      bind:this={closeButton}
      onclick={onclose}
      aria-label={$_("menu.close")}
      title={$_("menu.close")}
    >
      <span class="x" aria-hidden="true">×</span>
      <span class="close-label" aria-hidden="true">{$_("modes.close")}</span>
    </button>
    <div class="tabs" role="tablist" aria-label={$_("tabs.title")} bind:this={tablist}>
      {#each SHEET_TABS as id (id)}
        <button
          class="tab"
          class:origin={settingsOpen && tab === id}
          role="tab"
          id={`sheet-tab-${id}`}
          data-tab={id}
          aria-selected={tab === id}
          aria-controls={settingsOpen ? undefined : `sheet-panel-${id}`}
          tabindex={tab === id ? 0 : -1}
          onclick={() => choose(id)}
          onkeydown={ontabkey}
        >
          <Icon name={ICONS[id]} size={20} />
          <span class="tab-label">{$_(`tabs.${id}`)}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 11;
    background: color-mix(in srgb, var(--ast-bg) 35%, transparent);
  }
  /* Phone: a sheet rising from the button's corner, under the thumb; its foot is the button's row. */
  .sheet {
    --inset-l: max(var(--ast-corner-inset), env(safe-area-inset-left));
    --inset-b: max(var(--ast-corner-inset), env(safe-area-inset-bottom));
    /* Spacing inside the sheet: the homes' padding and the gap between their parts. */
    --sheet-pad: 12px;
    --sheet-gap: 8px;
    position: fixed;
    z-index: 12;
    left: var(--inset-l);
    right: max(var(--ast-corner-inset), env(safe-area-inset-right));
    bottom: var(--inset-b);
    max-height: calc(100dvh - max(16px, env(safe-area-inset-top)) - var(--inset-b));
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--ast-bg) 94%, transparent);
    outline: none;
    transform-origin: bottom left;
    animation: rise 180ms var(--ast-ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  /* Wide screen: the same sheet as a panel rising from the corner, the sky visible beside it. */
  @media (min-width: 720px) {
    .sheet {
      right: auto;
      width: 380px;
    }
    .backdrop {
      background: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .body,
    .settings {
      animation: none;
    }
  }
  /* Header: the tab's name in tall capitals, its meta in small data capitals, ⚙ at the right. */
  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 10px var(--sheet-pad) 8px;
  }
  .title {
    flex: none;
    margin: 0;
    font: 700 26px/1 var(--ast-font-display);
    letter-spacing: 0.01em;
  }
  .meta {
    flex: 1;
    min-width: 0;
    margin: 4px 0 0;
    font: 500 9px/1.2 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .square {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin: -4px -4px -4px 0;
    padding: 0;
    border: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .head .square:first-child {
    margin: -4px 0 -4px -4px;
  }
  .chev {
    font: 400 26px/1 var(--ast-font-mono);
    margin-top: -3px;
  }
  /* Jeux: the level, a small framed choice that unfolds the segmented control below. */
  .level {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 10px;
    margin: -4px 0;
    border: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    cursor: pointer;
  }
  .level[aria-expanded="true"] {
    background: color-mix(in srgb, var(--ast-fg) 12%, transparent);
  }
  .caret {
    font-size: 9px;
    color: var(--ast-fg-muted);
  }
  .levels {
    flex: none;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0 var(--sheet-pad) var(--sheet-gap);
    border: 1px solid var(--ast-control-border);
    animation: appear 140ms var(--ast-ease-out);
  }
  .levels button {
    min-height: 44px;
    padding: 0 4px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--ast-fg-muted);
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    cursor: pointer;
  }
  .levels button + button {
    border-left: 1px solid var(--ast-control-border);
  }
  .levels button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .square:focus-visible,
  .level:focus-visible,
  .levels button:focus-visible,
  .tab:focus-visible,
  .close:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -4px;
  }
  .levels button[aria-pressed="true"]:focus-visible {
    outline-color: var(--ast-bg);
  }
  /* The tab's home: scrolls inside the sheet when the screen is short. */
  .body {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 2px var(--sheet-pad) 12px;
    animation: appear 140ms var(--ast-ease-out);
  }
  .settings {
    flex: 0 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    animation: appear 140ms var(--ast-ease-out);
  }
  .wait {
    margin: 12px 2px;
    font: 400 11px/1.4 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  /* The foot: the button's place (« × Fermer »), then the tabs, all on one row. */
  .foot {
    flex: none;
    display: flex;
    align-items: stretch;
    height: calc(var(--ast-corner-size) - 1px);
    border-top: 1px solid var(--ast-hairline);
  }
  .close {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: calc(var(--ast-corner-size) - 1px);
    padding: 0;
    border: 0;
    border-right: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .x {
    font: 400 22px/1 var(--ast-font-mono);
  }
  .close-label {
    font: 500 8px/1 var(--ast-font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tabs {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  /* A tab: engraved pictogram over a word; the one shown is inked, with a rule on the side of
     the sheet (above). Under the settings, the tab of origin keeps its rule only. */
  .tab {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 2px 5px;
    border: 0;
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg-muted);
    font: 500 9px/1.15 var(--ast-font-mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-align: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      color 120ms var(--ast-ease-out),
      background-color 120ms var(--ast-ease-out);
  }
  .tab + .tab {
    border-left: 1px solid var(--ast-hairline);
  }
  .tab:hover {
    color: var(--ast-fg);
  }
  .tab[aria-selected="true"] {
    color: var(--ast-fg);
    background: color-mix(in srgb, var(--ast-fg) 12%, transparent);
  }
  .tab.origin {
    background: transparent;
  }
  .tab[aria-selected="true"]::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: -1px;
    height: 2px;
    background: var(--ast-fg);
  }
  .tab-label {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  @media (prefers-reduced-motion: reduce) {
    .tab {
      transition: none;
    }
  }
</style>
