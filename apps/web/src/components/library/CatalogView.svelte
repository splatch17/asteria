<script lang="ts" module>
  import type { CatalogTab, SortKey } from "../../lib/library";
  // Remembered while the app runs: reopening the catalogue finds the same tab, search and order.
  const memory: { tab: CatalogTab; query: string; sort: SortKey } = {
    tab: "constellations",
    query: "",
    sort: "name",
  };
</script>

<script lang="ts">
  // Catalogues of the library (#90): constellations, named stars, Sun/Moon/planets. Searchable
  // and sortable; a tap shows the object on the map. Visibility is for the displayed date/place.
  import { _, locale } from "@asteria/ui";
  import { PLANETS, yearsSinceHipparcos } from "@asteria/astro-core";
  import { hasConstellationStory } from "@asteria/content";
  import {
    CATALOG_TABS,
    brightestMagnitudes,
    constellationItems,
    constellationVisibilities,
    matchRank,
    normalize,
    searchItems,
    solarItems,
    starItems,
    type LibraryItem,
    type LibraryTarget,
    type SkyContext,
  } from "../../lib/library";
  import type { LibraryData } from "./Library.svelte";
  import Icon from "../Icon.svelte";
  import Designation from "../Designation.svelte";

  let {
    data,
    onshow,
    onstory,
  }: {
    data: LibraryData;
    onshow: (target: LibraryTarget) => void;
    onstory: (abbr: string) => void;
  } = $props();

  let tab = $state(memory.tab);
  let query = $state(memory.query);
  let sort = $state(memory.sort);
  $effect(() => {
    memory.tab = tab;
    memory.query = query;
    memory.sort = sort;
  });

  const ctx = $derived<SkyContext>({
    date: data.date,
    observer: data.observer,
    years: yearsSinceHipparcos(data.date),
  });

  // Each list is built the first time its tab is shown (the constellations' visibility needs one
  // pass over the 8 870 stars: a few milliseconds).
  const constellations = $derived.by(() =>
    tab !== "constellations"
      ? []
      : constellationItems(
          Object.keys(data.names),
          data.names,
          data.latin,
          brightestMagnitudes(data.stars),
          constellationVisibilities(data.stars, data.lines, ctx),
        ),
  );
  const stars = $derived.by(() => (tab !== "stars" ? [] : starItems(data.stars, data.names, ctx)));
  const solar = $derived.by(() =>
    tab !== "solar"
      ? []
      : solarItems([
          {
            id: "Sun",
            name: $_("body.Sun"),
            detail: $_("catalog.solar.sun"),
            magnitude: null,
            altitude: data.sun.altitude,
          },
          {
            id: "Moon",
            name: $_("body.Moon"),
            detail: $_("catalog.solar.moon"),
            magnitude: null,
            altitude: data.moon?.altitude ?? null,
          },
          ...PLANETS.map((p) => {
            const q = data.planets?.find((x) => x.name === p);
            return {
              id: p,
              name: $_(`planet.${p}`),
              detail: $_("catalog.solar.planet"),
              magnitude: q?.magnitude ?? null,
              altitude: q?.altitude ?? null,
            };
          }),
        ]),
  );
  const results = $derived.by((): LibraryItem[] => {
    if (tab === "solar") {
      const q = normalize(query);
      return solar.filter((i) => matchRank(i, q) !== null);
    }
    return searchItems(tab === "stars" ? stars : constellations, query, sort, $locale ?? "fr");
  });

  const icon = (item: LibraryItem) =>
    item.target.kind === "body" ? (item.target.body === "Sun" ? "sun" : "moon") : null;
  const mag = (m: number | null) => (m === null ? "" : `${$_("data.v")} ${m.toFixed(2)}`);
  /** Moon and planets cannot be shown out of the ephemeris range. */
  const unavailable = (item: LibraryItem) =>
    item.visibility === null && item.target.kind !== "constellation" && item.target.kind !== "star";

  let input = $state<HTMLInputElement>();
  function selectTab(next: CatalogTab, focus = false) {
    tab = next;
    if (focus) document.getElementById(`cat-tab-${next}`)?.focus();
  }
  /** Arrow keys move between tabs (WAI-ARIA tabs pattern). */
  function ontabkey(e: KeyboardEvent) {
    const i = CATALOG_TABS.indexOf(tab);
    const n = CATALOG_TABS.length;
    if (e.key === "ArrowRight") selectTab(CATALOG_TABS[(i + 1) % n]!, true);
    else if (e.key === "ArrowLeft") selectTab(CATALOG_TABS[(i + n - 1) % n]!, true);
    else return;
    e.preventDefault();
  }
</script>

<div class="tabs" role="tablist" aria-label={$_("catalog.tabs")} tabindex="-1" onkeydown={ontabkey}>
  {#each CATALOG_TABS as t (t)}
    <button
      role="tab"
      id={`cat-tab-${t}`}
      aria-selected={tab === t}
      aria-controls="cat-panel"
      tabindex={tab === t ? 0 : -1}
      onclick={() => selectTab(t)}>{$_(`catalog.tab.${t}`)}</button
    >
  {/each}
</div>

<div class="tools">
  <label class="search">
    <Icon name="search" size={16} />
    <span class="sr-only">{$_("catalog.search")}</span>
    <input
      bind:this={input}
      bind:value={query}
      type="search"
      enterkeyhint="search"
      autocomplete="off"
      spellcheck="false"
      placeholder={$_("catalog.searchPlaceholder")}
    />
    {#if query}
      <button
        class="clear"
        onclick={() => {
          query = "";
          input?.focus();
        }}
        aria-label={$_("catalog.clear")}
        title={$_("catalog.clear")}>×</button
      >
    {/if}
  </label>
  {#if tab !== "solar"}
    <div class="sort" role="group" aria-label={$_("catalog.sort")}>
      {#each ["name", "bright"] as const as key (key)}
        <button aria-pressed={sort === key} onclick={() => (sort = key)}
          >{$_(`catalog.sort.${key}`)}</button
        >
      {/each}
    </div>
  {/if}
</div>

<p class="legend">
  <span aria-live="polite">{$_("catalog.results", { values: { count: results.length } })}</span>
  <span aria-hidden="true"> · </span>{$_("catalog.legend")}
</p>

<div id="cat-panel" role="tabpanel" aria-labelledby={`cat-tab-${tab}`}>
  {#if results.length === 0}
    <p class="empty">{$_("catalog.empty", { values: { query } })}</p>
  {:else}
    <ul class="list">
      {#each results as item (item.id)}
        {@const off = unavailable(item)}
        {@const story =
          item.target.kind === "constellation" && hasConstellationStory("fr", item.target.abbr)}
        <li class="item">
          <button
            class="row"
            disabled={off}
            onclick={() => onshow(item.target)}
            aria-label={$_("catalog.show", { values: { name: item.name } })}
          >
            <span
              class={`vis ${item.visibility ?? "none"}`}
              title={item.visibility ? $_(`catalog.visibility.${item.visibility}`) : undefined}
              aria-hidden="true"
            ></span>
            <span class="text">
              <span class="name">
                {#if icon(item)}<Icon name={icon(item)!} size={14} />{/if}{item.name}
              </span>
              <span class="detail"
                ><Designation text={item.detail} />{#if off}
                  · {$_("catalog.unavailable")}{/if}</span
              >
            </span>
            <span class="data">
              {#if item.visibility}
                <span class="state">{$_(`catalog.${item.visibility}`)}</span>
                <span class="sr-only">{$_(`catalog.visibility.${item.visibility}`)}</span>
              {/if}
              {#if item.magnitude !== null}<span>{mag(item.magnitude)}</span>{/if}
            </span>
            <span class="go" aria-hidden="true"><Icon name="target" size={16} /></span>
          </button>
          {#if story && item.target.kind === "constellation"}
            {@const abbr = item.target.abbr}
            <button
              class="story"
              onclick={() => onstory(abbr)}
              aria-label={$_("catalog.readStory", { values: { name: item.name } })}
              title={$_("catalog.readStory", { values: { name: item.name } })}
              ><Icon name="story" size={18} /></button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .tabs {
    display: flex;
    border: 1px solid var(--ast-hairline);
    outline: none;
  }
  .tabs button {
    flex: 1;
    min-height: 44px;
    padding: 0 6px;
    border: 0;
    border-right: 1px solid var(--ast-hairline);
    background: transparent;
    color: var(--ast-fg-muted);
    font: 500 11px/1.2 var(--ast-font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    position: relative;
  }
  .tabs button:last-child {
    border-right: 0;
  }
  .tabs button[aria-selected="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
    box-shadow: var(--ast-glow);
  }
  .tools {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 0 0 12px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 70%, transparent);
    color: var(--ast-fg-muted);
    transition: box-shadow var(--ast-dur-fast) var(--ast-ease-out);
  }
  .search:focus-within {
    border-color: color-mix(in srgb, var(--ast-fg) 45%, transparent);
    box-shadow: var(--ast-glow-soft);
    color: var(--ast-fg);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 44px;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ast-fg);
    font: 400 14px/1 var(--ast-font-mono);
    caret-color: var(--ast-fg);
  }
  input:focus-visible {
    outline: none;
    box-shadow: none;
  }
  input::placeholder {
    color: color-mix(in srgb, var(--ast-fg) 45%, transparent);
  }
  input::-webkit-search-cancel-button {
    appearance: none;
  }
  .clear {
    width: 44px;
    height: 44px;
    border: 0;
    background: transparent;
    color: var(--ast-fg);
    font: 400 20px/1 var(--ast-font-mono);
    cursor: pointer;
  }
  .sort {
    display: flex;
    border: 1px solid var(--ast-hairline);
  }
  .sort button {
    min-width: 52px;
    height: 44px;
    padding: 0 8px;
    border: 0;
    background: transparent;
    color: var(--ast-fg-muted);
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
  }
  .sort button + button {
    border-left: 1px solid var(--ast-hairline);
  }
  .sort button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .legend {
    margin: 10px 0 6px;
    font: 400 10px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .legend span:first-child {
    color: var(--ast-fg);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .empty {
    margin: 24px 0;
    font: 400 12px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
    text-align: center;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .item {
    display: flex;
    border-top: 1px solid var(--ast-hairline);
    /* Long lists (330 stars): rows off screen are not laid out nor painted. */
    content-visibility: auto;
    contain-intrinsic-size: auto 58px;
  }
  .item:last-child {
    border-bottom: 1px solid var(--ast-hairline);
  }
  .row {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 58px;
    padding: 8px 4px 8px 6px;
    border: 0;
    background: transparent;
    color: var(--ast-fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--ast-hatch);
    opacity: 0;
    transition: opacity var(--ast-dur-fast) var(--ast-ease-out);
    pointer-events: none;
  }
  .row:not(:disabled):hover::before,
  .row:not(:disabled):active::before,
  .row:focus-visible::before {
    opacity: 1;
  }
  .row:not(:disabled):active {
    transform: none;
  }
  .row:not(:disabled):hover .go,
  .row:focus-visible .go {
    opacity: 1;
    transform: none;
  }
  .row:disabled {
    cursor: default;
    color: var(--ast-fg-muted);
  }
  /* Visibility mark: a full disc when up, half when partly up, a ring when down. */
  .vis {
    flex: none;
    width: 9px;
    height: 9px;
    border: 1px solid var(--ast-fg);
    border-radius: 50%;
    box-sizing: border-box;
  }
  .vis.up {
    background: var(--ast-fg);
    box-shadow: var(--ast-glow);
  }
  .vis.partial {
    background: linear-gradient(to top, var(--ast-fg) 50%, transparent 50%);
  }
  .vis.down {
    border-color: var(--ast-fg-muted);
  }
  .vis.none {
    border-style: dashed;
    border-color: var(--ast-hairline);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 500 15px/1.2 var(--ast-font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail {
    font: 400 11px/1.3 var(--ast-font-mono);
    color: var(--ast-fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .data {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    font: 400 10px/1.3 var(--ast-font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .state {
    color: var(--ast-fg);
  }
  .go {
    flex: none;
    display: grid;
    place-items: center;
    opacity: 0.45;
    transform: scale(0.85);
    transition:
      opacity var(--ast-dur-fast) var(--ast-ease-out),
      transform var(--ast-dur-fast) var(--ast-ease-settle);
  }
  .story {
    flex: none;
    width: 48px;
    border: 0;
    border-left: 1px solid var(--ast-hairline);
    background: transparent;
    color: var(--ast-fg);
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .story:hover {
    box-shadow: inset var(--ast-glow);
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
