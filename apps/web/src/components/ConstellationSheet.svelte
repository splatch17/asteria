<script lang="ts">
  // Constellation sheet (#61): names, brightest star, visibility, and — for the constellations
  // that have one — the Découverte story, three anecdotes and their sources (CC BY-SA).
  import { _ } from "@asteria/ui";
  import {
    hasConstellationStory,
    inlineSegments,
    loadConstellationStory,
    type ConstellationStory,
  } from "@asteria/content";
  import type { Visibility } from "../lib/constellation";
  import Icon from "./Icon.svelte";

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
  } = $props();

  const hasStory = $derived(hasConstellationStory("fr", abbr));
  let story = $state<ConstellationStory | null>(null);
  let failed = $state(false);
  let expanded = $state(false);
  const titleId = $derived(`con-title-${abbr}`);
  const pad = (i: number) => String(i).padStart(2, "0");

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
    <p class="meta">#{abbr.toUpperCase()} // {$_("constellation.kind")}</p>
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
          <span class="muted">V {brightest.v.toFixed(2)}</span>
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
      <section>
        <h3><span class="num">#01</span> {$_("constellation.story")}</h3>
        {#each story.story as paragraph, i (i)}
          <p>
            {#each inlineSegments(paragraph) as seg, j (j)}{#if seg.italic}<i>{seg.text}</i
                >{:else}{seg.text}{/if}{/each}
          </p>
        {/each}
      </section>
      <section>
        <h3><span class="num">#02</span> {$_("constellation.anecdotes")}</h3>
        <ol>
          {#each story.anecdotes as anecdote, i (i)}
            <li>
              <span class="num" aria-hidden="true">{pad(i + 1)}</span>
              <p>
                {#each inlineSegments(anecdote) as seg, j (j)}{#if seg.italic}<i>{seg.text}</i
                    >{:else}{seg.text}{/if}{/each}
              </p>
            </li>
          {/each}
        </ol>
      </section>
      <details class="sources">
        <summary>{$_("constellation.sources")}</summary>
        <p>
          {$_("constellation.attribution")}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr"
            target="_blank"
            rel="noopener">{$_("constellation.licenseLink")}</a
          >
        </p>
        <ul>
          {#each story.sources as source (source.url)}
            <li>
              <a href={source.url} target="_blank" rel="noopener">{source.title}</a>
              <span class="muted">{source.license}</span>
            </li>
          {/each}
        </ul>
      </details>
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
    font-size: 13px;
    line-height: 1.6;
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
    border: 1px solid var(--ast-hairline);
    color: var(--ast-fg);
  }
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin: 10px -14px 0;
    padding: 0 14px 4px;
    border-top: 1px solid var(--ast-hairline);
    font-size: 13px;
    line-height: 1.6;
  }
  h3 {
    margin: 14px 0 6px;
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .num {
    color: var(--ast-fg);
  }
  .body p {
    margin: 0 0 10px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ol li {
    display: grid;
    grid-template-columns: 24px 1fr;
    gap: 6px;
    padding: 8px 0;
    border-top: 1px solid var(--ast-hairline);
  }
  ol li .num {
    font-size: 11px;
    line-height: 1.9;
    letter-spacing: var(--ast-tracking-meta);
  }
  ol li p {
    margin: 0;
  }
  .sources {
    margin-top: 6px;
    border-top: 1px solid var(--ast-hairline);
    font-size: 11px;
    line-height: 1.5;
  }
  .sources summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .sources p {
    color: var(--ast-fg-muted);
  }
  .sources ul {
    margin: 0;
    padding: 0 0 0 14px;
  }
  .sources li {
    margin-bottom: 6px;
  }
  a {
    color: var(--ast-fg);
    text-underline-offset: 3px;
  }
  i {
    font-family: var(--ast-font-serif);
    font-size: 1.15em;
  }
  .latin i {
    font-size: inherit;
  }
</style>
