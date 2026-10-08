<script lang="ts">
  // Search for a sky object by name (#99): full-screen on a phone, keyboard open. The input is a
  // combobox driving a listbox (arrow keys, Enter, Escape); matching lives in lib/search.ts.
  import { onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import Icon from "./Icon.svelte";
  import Designation from "./Designation.svelte";
  import type { IconName } from "../lib/icons";
  import { search, type SearchEntry, type SearchIndex, type SearchTarget } from "../lib/search";

  let {
    index,
    onselect,
    onclose,
  }: {
    index: SearchIndex | null;
    onselect: (target: SearchTarget) => void;
    onclose: () => void;
  } = $props();

  let input: HTMLInputElement;
  let closeButton: HTMLButtonElement;
  let list = $state<HTMLUListElement>();
  let query = $state("");
  let active = $state(0);
  const results = $derived(index ? search(index, query) : []);

  const ICONS: Record<SearchTarget["kind"], IconName> = {
    star: "star",
    constellation: "lines",
    planet: "planets",
    body: "sun",
  };
  const iconOf = (t: SearchTarget): IconName =>
    t.kind === "body" && t.body === "Moon" ? "moon" : ICONS[t.kind];
  const kindOf = (t: SearchTarget) =>
    $_(t.kind === "body" ? `search.kind.${t.body}` : `search.kind.${t.kind}`);
  const optionId = (i: number) => `search-option-${i}`;

  onMount(() => input.focus());

  function choose(entry: SearchEntry | undefined) {
    if (entry) onselect(entry.target);
  }

  /** Escape closes (not the sheet below); Tab stays between the input and the close button. */
  function ondialogkey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === "Tab") {
      e.preventDefault();
      (document.activeElement === input ? closeButton : input).focus();
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!results.length) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      active = (active + step + results.length) % results.length;
      list?.children[active]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]?.entry);
    }
  }
</script>

<div
  class="search"
  role="dialog"
  aria-modal="true"
  aria-label={$_("search.open")}
  tabindex="-1"
  onkeydown={ondialogkey}
>
  <div class="column">
    <div class="bar">
      <Icon name="search" size={18} />
      <input
        bind:this={input}
        bind:value={query}
        oninput={() => (active = 0)}
        {onkeydown}
        type="text"
        role="combobox"
        aria-label={$_("search.label")}
        aria-expanded={results.length > 0}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={results.length ? optionId(active) : undefined}
        placeholder={$_("search.placeholder")}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="go"
      />
      <button
        bind:this={closeButton}
        class="close"
        onclick={onclose}
        aria-label={$_("search.close")}
        title={$_("search.close")}>×</button
      >
    </div>
    <p class="sr-only" role="status">
      {query.trim() ? $_("search.results", { values: { count: results.length } }) : ""}
    </p>
    {#if !query.trim()}
      <p class="hint">{$_("search.hint")}</p>
    {:else if !results.length}
      <p class="hint">{$_("search.empty", { values: { query: query.trim() } })}</p>
    {/if}
    <ul id="search-results" role="listbox" aria-label={$_("search.label")} bind:this={list}>
      {#each results as { entry }, i (i)}
        <!-- svelte-ignore a11y_click_events_have_key_events (keys go to the combobox input) -->
        <li
          id={optionId(i)}
          role="option"
          aria-selected={i === active}
          onpointerdown={(e) => e.preventDefault()}
          onclick={() => choose(entry)}
        >
          <span class="icon"><Icon name={iconOf(entry.target)} size={16} /></span>
          <span class="text">
            <span class="name"><Designation text={entry.label} /></span>
            <span class="meta"
              >{kindOf(entry.target)}{#each entry.details as d (d)}<span class="detail"
                  ><Designation text={d} /></span
                >{/each}</span
            >
          </span>
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .search {
    position: fixed;
    z-index: 5;
    inset: 0;
    background: color-mix(in srgb, var(--ast-bg) 94%, transparent);
    backdrop-filter: blur(6px);
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 0
      max(16px, env(safe-area-inset-left));
    animation: appear 160ms var(--ast-ease-out);
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .search {
      animation: none;
    }
  }
  .column {
    display: flex;
    flex-direction: column;
    max-width: 520px;
    height: 100%;
    margin: 0 auto;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-left: 12px;
    border: 1px solid var(--ast-hairline);
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
    font: 16px var(--ast-font-mono); /* 16 px: no zoom on focus in mobile browsers */
  }
  input::placeholder {
    color: var(--ast-fg-muted);
  }
  .bar:focus-within {
    border-color: var(--ast-fg);
  }
  .close {
    width: 44px;
    height: 44px;
    border: 0;
    border-left: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    font: 16px var(--ast-font-mono);
    cursor: pointer;
  }
  ul {
    flex: 1;
    overflow-y: auto;
    margin: 8px 0 0;
    padding: 0 0 max(16px, env(safe-area-inset-bottom));
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--ast-hairline);
    color: var(--ast-fg-muted);
    cursor: pointer;
  }
  li[aria-selected="true"] {
    background: var(--ast-fg);
    color: var(--ast-bg);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 20px;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-family: var(--ast-font-display);
    font-weight: 700;
    font-size: 20px;
    line-height: 1.1;
    text-transform: uppercase;
    color: var(--ast-fg);
  }
  li[aria-selected="true"] .name {
    color: var(--ast-bg);
  }
  .meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 10px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  /* Separator drawn by CSS: Svelte trims the spaces at the start of an element. */
  .detail::before {
    content: " · ";
    white-space: pre;
  }
  .hint {
    margin: 16px 12px;
    font: 11px/1.6 var(--ast-font-mono);
    color: var(--ast-fg-muted);
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
