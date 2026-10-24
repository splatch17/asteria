<script lang="ts">
  // Constellation catalogue (#170): the 88 constellations by French name, with their Latin name
  // and abbreviation, a search (as on the map, #99), and three filters: the essential ones (the
  // Découverte list of the games), all, or those up tonight. Each row shows what the games know
  // of it (mastery square, as « Ton ciel ») and whether its page was opened.
  import { onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import { hasConstellationStory } from "@asteria/content";
  import { filterCatalogue, type CatalogueEntry, type CatalogueFilter } from "../lib/catalogue";
  import { isSeen, itemKey, masteryOfItem, type Progress } from "../lib/games/progress";

  let {
    entries,
    filter = $bindable(),
    query = $bindable(),
    tonight,
    progress,
    onopen,
    onback,
    onclose,
  }: {
    entries: readonly CatalogueEntry[];
    /** Kept by the caller: coming back from a page finds the list as it was. */
    filter: CatalogueFilter;
    query: string;
    tonight: ReadonlySet<string>;
    progress: Progress;
    onopen: (abbr: string) => void;
    onback: () => void;
    onclose: () => void;
  } = $props();

  const FILTERS: readonly CatalogueFilter[] = ["essential", "all", "tonight"];
  const shown = $derived(filterCatalogue(entries, filter, query, tonight));
  const countOf = (f: CatalogueFilter) => filterCatalogue(entries, f, "", tonight).length;

  let backButton: HTMLButtonElement;
  onMount(() => backButton.focus());
</script>

<div class="catalogue">
  <header class="head">
    <button
      class="icon"
      bind:this={backButton}
      onclick={onback}
      aria-label={$_("catalogue.back")}
      title={$_("catalogue.back")}>←</button
    >
    <h1 id="games-title">{$_("catalogue.title")}</h1>
    <button
      class="icon"
      onclick={onclose}
      aria-label={$_("catalogue.close")}
      title={$_("catalogue.close")}>×</button
    >
  </header>

  <div class="tools">
    <input
      type="search"
      class="search"
      bind:value={query}
      placeholder={$_("catalogue.search")}
      aria-label={$_("catalogue.search")}
      autocomplete="off"
      spellcheck="false"
    />
    <div class="filters" role="group" aria-label={$_("catalogue.filters")}>
      {#each FILTERS as f (f)}
        <button aria-pressed={filter === f} onclick={() => (filter = f)}>
          {$_(`catalogue.filter.${f}`)}<span class="n">{countOf(f)}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="scroll">
    <p class="count" role="status">{$_("catalogue.count", { values: { n: shown.length } })}</p>
    {#if shown.length === 0}
      <p class="empty">{$_("catalogue.empty")}</p>
    {:else}
      <ul class="list">
        {#each shown as e (e.abbr)}
          {@const key = itemKey("con", e.abbr)}
          {@const state = masteryOfItem(progress, key)}
          {@const seen = isSeen(progress, key)}
          <li>
            <button
              class="row"
              data-abbr={e.abbr}
              onclick={() => onopen(e.abbr)}
              aria-label={$_("catalogue.row", {
                values: {
                  name: e.name,
                  latin: e.latin,
                  state: seen
                    ? `${$_(`games.mastery.${state}`)}, ${$_("catalogue.seen")}`
                    : $_(`games.mastery.${state}`),
                },
              })}
            >
              <span class={`cell ${state}`} class:seen aria-hidden="true"></span>
              <span class="names" aria-hidden="true">
                <span class="name">{e.name}</span>
                <span class="latin"><i lang="la">{e.latin}</i></span>
              </span>
              {#if hasConstellationStory("fr", e.abbr)}
                <span class="tag" aria-hidden="true">{$_("catalogue.hasStory")}</span>
              {/if}
              <span class="abbr" aria-hidden="true">{e.abbr}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .catalogue {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }
  .head,
  .tools,
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
  }
  h1 {
    flex: 1;
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
  button:focus-visible,
  .search:focus-visible {
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
  .tools {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--ast-hairline);
  }
  .search {
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    padding: 0 12px;
    border: 1px solid var(--ast-panel-border);
    border-radius: var(--ast-radius);
    background: var(--ast-panel-bg);
    color: var(--ast-fg);
    font: 400 14px/1 var(--ast-font-mono);
    appearance: none;
  }
  .search::placeholder {
    color: var(--ast-fg-muted);
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--ast-control-border);
  }
  .filters button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 40px;
    padding: 0 2px;
    font-size: 10px;
    letter-spacing: 0.04em;
    color: var(--ast-fg-muted);
  }
  .filters button + button {
    border-left: 1px solid var(--ast-hairline);
  }
  .filters button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .n {
    font-size: 9px;
    opacity: 0.8;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: max(20px, env(safe-area-inset-bottom));
  }
  .count,
  .empty {
    margin: 10px 0 6px;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .empty {
    text-transform: none;
    letter-spacing: 0;
    font-size: 12px;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--ast-panel-border);
    background: var(--ast-panel-bg);
  }
  .list li + li {
    border-top: 1px solid var(--ast-hairline);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 6px 12px;
    text-align: left;
    text-transform: none;
    letter-spacing: 0;
  }
  .row:active {
    background: color-mix(in srgb, var(--ast-fg) 8%, transparent);
  }
  .names {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .name {
    font: 700 18px/1.05 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .latin {
    font: 500 italic 15px/1.1 var(--ast-font-serif);
    color: var(--ast-fg-muted);
  }
  .abbr {
    flex: none;
    width: 30px;
    text-align: right;
    font: 500 10px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .tag {
    flex: none;
    padding: 3px 5px;
    border: 1px solid var(--ast-hairline);
    font: 500 8px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  /* Mastery square, the same inking as « Ton ciel » (#163), once the games met the
     constellation; a small dot once its page was read; nothing before. */
  .cell {
    position: relative;
    flex: none;
    width: 10px;
    height: 10px;
    box-sizing: border-box;
  }
  .cell.learning,
  .cell.known,
  .cell.mastered {
    border: 1px solid var(--ast-hairline);
  }
  /* Fine dots, then checkerboard, then solid: the « Ton ciel » scale (#185, no dashed cells). */
  .cell.learning {
    border-color: var(--ast-fg-muted);
    background: conic-gradient(from 270deg at 1px 1px, var(--ast-fg) 25%, transparent 0) 0 0 / 2px
      2px;
  }
  .cell.known {
    border-color: var(--ast-fg);
    background: repeating-conic-gradient(var(--ast-fg) 0 25%, transparent 0 50%) 0 0 / 4px 4px;
  }
  .cell.mastered {
    border-color: var(--ast-fg);
    background: var(--ast-fg);
  }
  .cell.seen.new::after {
    content: "";
    position: absolute;
    inset: 3px;
    background: var(--ast-fg-muted);
  }
</style>
