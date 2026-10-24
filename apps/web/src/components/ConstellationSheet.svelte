<script lang="ts">
  // Constellation sheet (#61): names, brightest star, visibility, and — for the constellations
  // that have one — the Découverte story, three anecdotes and their sources (CC BY-SA).
  import { _, locale } from "@asteria/ui";
  import { formatNumber } from "../lib/format";
  import {
    hasConstellationStory,
    inlineSegments,
    loadConstellationStory,
    type ConstellationStory,
  } from "@asteria/content";
  import type { Visibility } from "../lib/constellation";
  import Icon from "./Icon.svelte";
  import StoryPanels from "./StoryPanels.svelte";

  let {
    abbr,
    name,
    latin,
    brightest,
    visibility,
    daylight,
    top,
    bottom,
    onclose,
    onstar,
    on3d,
    oncatalogue,
  }: {
    abbr: string;
    name: string;
    latin: string;
    brightest: { label: string; v: number } | null;
    visibility: Visibility | null;
    /** The Sun is up (or nearly): a figure above the horizon is still not visible. */
    daylight: boolean;
    /** CSS lengths: the sheet stays between the header/dials and the time controls. */
    top: string;
    bottom: string;
    onclose: () => void;
    /** Opens the brightest star's sheet. */
    onstar?: (() => void) | undefined;
    /** Opens the 3D view of the figure (#8). */
    on3d?: (() => void) | undefined;
    /** Opens the constellation's page in the catalogue (#170). */
    oncatalogue?: (() => void) | undefined;
  } = $props();

  const hasStory = $derived(hasConstellationStory("fr", abbr));
  let story = $state<ConstellationStory | null>(null);
  let failed = $state(false);
  let expanded = $state(false);
  const titleId = $derived(`con-title-${abbr}`);

  $effect(() => {
    const id = abbr;
    story = null;
    failed = false;
    if (!hasConstellationStory("fr", id)) return;
    let alive = true;
    loadConstellationStory("fr", id).then(
      (s) => alive && (story = s),
      () => alive && (failed = true),
    );
    return () => (alive = false);
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window {onkeydown} />

<aside
  class="sheet frame"
  class:expanded
  aria-labelledby={titleId}
  style:--sheet-top={top}
  style:--sheet-bottom={bottom}
>
  <header class="head">
    <p class="meta">{$_("constellation.kind")}</p>
    <h2 class="name" id={titleId}>{name}</h2>
    <p class="latin"><i lang="la">{latin}</i></p>
    <dl class="data">
      {#if brightest}
        <dt>{$_("constellation.brightest")}</dt>
        <dd>
          {#if onstar}
            <button class="link" onclick={onstar}>{brightest.label}</button>
          {:else}
            {brightest.label}
          {/if}
          <span class="muted">V {formatNumber(brightest.v, 2, $locale ?? "fr")}</span>
        </dd>
      {/if}
      {#if visibility}
        <dt>{$_("constellation.where")}</dt>
        <dd>{$_(`constellation.visibility.${visibility}`)}</dd>
      {/if}
      <dt>{$_("constellation.abbr")}</dt>
      <dd>{abbr}</dd>
    </dl>
    {#if daylight && visibility && visibility !== "down"}
      <p class="note daylight">{$_("constellation.daylight")}</p>
    {/if}
    {#if on3d || oncatalogue}
      <div class="go">
        {#if oncatalogue}
          <button class="more" onclick={oncatalogue}>
            {$_("catalogue.open")}<span aria-hidden="true">›</span>
          </button>
        {/if}
        {#if on3d}
          <button class="more" onclick={on3d} title={$_("c3d.openHint")}>
            {$_("c3d.open")}<span aria-hidden="true">›</span>
          </button>
        {/if}
      </div>
    {/if}
    <div class="actions">
      {#if hasStory}
        <button
          class="icon"
          aria-expanded={expanded}
          aria-label={expanded ? $_("constellation.collapse") : $_("constellation.expand")}
          title={expanded ? $_("constellation.collapse") : $_("constellation.expand")}
          onclick={() => (expanded = !expanded)}
          ><Icon name={expanded ? "collapse" : "expand"} /></button
        >
      {/if}
      <button class="icon close" onclick={onclose} aria-label={$_("star.close")}>×</button>
    </div>
  </header>

  {#if !hasStory}
    <p class="note">{$_("constellation.noStory")}</p>
  {:else if failed}
    <p class="note">{$_("constellation.loadError")}</p>
  {:else if !story}
    <p class="note" role="status">{$_("constellation.loading")}</p>
  {:else if !expanded}
    <p class="teaser">
      {#each inlineSegments(story.story[0] ?? "") as seg, i (i)}{#if seg.italic}<i>{seg.text}</i
          >{:else}{seg.text}{/if}{/each}
    </p>
    <button class="more" aria-expanded="false" onclick={() => (expanded = true)}>
      {$_("constellation.readMore")}<Icon name="expand" />
    </button>
  {:else}
    <div class="body">
      <StoryPanels {story} />
    </div>
  {/if}
</aside>

<style>
  .sheet {
    position: fixed;
    z-index: 2;
    left: max(16px, env(safe-area-inset-left));
    right: max(16px, env(safe-area-inset-right));
    bottom: var(--sheet-bottom);
    max-width: 420px;
    margin: 0 auto;
    max-height: calc(100dvh - var(--sheet-top) - var(--sheet-bottom));
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--ast-bg) 90%, transparent);
    padding: 12px 14px;
    box-sizing: border-box;
  }
  .head {
    position: relative;
    flex: none;
  }
  .meta {
    margin: 0;
    padding-right: 88px;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .name {
    margin: 4px 0 0;
    padding-right: 88px;
    font-family: var(--ast-font-display);
    font-weight: 700;
    font-size: 30px;
    line-height: 1;
    text-transform: uppercase;
  }
  .latin {
    margin: 2px 0 8px;
    font-family: var(--ast-font-serif);
    font-size: 17px;
    color: var(--ast-fg-muted);
  }
  .data {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0;
    font: 11px/1.6 var(--ast-font-mono);
    letter-spacing: 0.06em;
  }
  /* Expanded: the reading area gets the room; the data rows come back when folded. */
  .expanded .data,
  .expanded .daylight {
    display: none;
  }
  .data dt {
    color: var(--ast-fg-muted);
    text-transform: uppercase;
  }
  .data dd {
    margin: 0;
  }
  .muted {
    color: var(--ast-fg-muted);
  }
  .note {
    margin: 8px 0 0;
    font: 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .actions {
    position: absolute;
    top: -8px;
    right: -10px;
    display: flex;
  }
  button {
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    font-size: 16px;
    color: var(--ast-fg);
  }
  .link {
    padding: 0;
    font: inherit;
    letter-spacing: inherit;
    text-transform: none;
    color: var(--ast-fg);
    text-decoration: underline;
    text-decoration-color: var(--ast-hairline);
    text-underline-offset: 3px;
  }
  .teaser {
    margin: 10px 0 0;
    max-width: var(--ast-text-measure);
    font: 400 var(--ast-text-size) / var(--ast-text-leading) var(--ast-font-text);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
  }
  .more {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    margin-top: 8px;
    padding: 0 12px;
    border: 1px solid var(--ast-control-border);
    color: var(--ast-fg);
  }
  .go {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 10px;
  }
  .go .more {
    margin-top: 0;
  }
  .expanded .go {
    display: none;
  }
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin: 10px -14px 0;
    padding: 0 14px 4px;
  }
  i {
    font-family: var(--ast-font-serif);
    font-size: 1.15em;
  }
  .latin i {
    font-size: inherit;
  }
</style>
