<script lang="ts">
  // A constellation's story, as a page of an old atlas (#90): drop cap, numbered anecdotes,
  // sources and licence (CC BY-SA), and "show in the sky" always at hand.
  import { _ } from "@asteria/ui";
  import {
    inlineSegments,
    loadConstellationStory,
    type ConstellationStory,
  } from "@asteria/content";
  import { readingMinutes } from "../../lib/library";
  import Icon from "../Icon.svelte";

  let {
    abbr,
    latin,
    onshow,
  }: {
    abbr: string;
    latin: string;
    onshow: () => void;
  } = $props();

  let story = $state<ConstellationStory | null>(null);
  let failed = $state(false);
  const pad = (i: number) => String(i).padStart(2, "0");

  $effect(() => {
    let alive = true;
    loadConstellationStory("fr", abbr).then(
      (s) => {
        if (!alive) return;
        story = s;
        failed = !s;
      },
      () => alive && (failed = true),
    );
    return () => (alive = false);
  });
</script>

<article class="story">
  <p class="latin"><i lang="la">{latin}</i> · {abbr}</p>
  {#if failed}
    <p class="note" role="alert">{$_("constellation.loadError")}</p>
  {:else if !story}
    <p class="note" role="status">{$_("constellation.loading")}</p>
  {:else}
    <p class="meta">
      {$_("stories.minutes", {
        values: { min: readingMinutes([...story.story, ...story.anecdotes]) },
      })} · {$_("stories.anecdotes", { values: { count: story.anecdotes.length } })}
    </p>

    <div class="ornament" aria-hidden="true"><span>✦</span></div>

    <section aria-labelledby="story-h">
      <h2 id="story-h"><span class="num">#01</span> {$_("constellation.story")}</h2>
      {#each story.story as paragraph, i (i)}
        <p class:lead={i === 0}>
          {#each inlineSegments(paragraph) as seg, j (j)}{#if seg.italic}<i>{seg.text}</i
              >{:else}{seg.text}{/if}{/each}
        </p>
      {/each}
    </section>

    <section aria-labelledby="anecdotes-h">
      <h2 id="anecdotes-h"><span class="num">#02</span> {$_("constellation.anecdotes")}</h2>
      <ol>
        {#each story.anecdotes as anecdote, i (i)}
          <li>
            <span class="big" aria-hidden="true">{pad(i + 1)}</span>
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
          rel="noopener noreferrer">{$_("constellation.licenseLink")}</a
        >
      </p>
      <ul>
        {#each story.sources as source (source.url)}
          <li>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
            <span class="muted">{source.license}</span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  <div class="dock">
    <button class="show" onclick={onshow}>
      <Icon name="target" size={18} />{$_("stories.showInSky")}
    </button>
  </div>
</article>

<style>
  .story {
    max-width: 620px;
    margin: 0 auto;
  }
  .latin {
    margin: -4px 0 4px;
    font: 500 19px/1.2 var(--ast-font-serif);
    color: var(--ast-fg-muted);
  }
  .latin i {
    font-size: 1.1em;
  }
  .meta,
  .note {
    margin: 0;
    font: 500 10px/1.5 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .note {
    margin: 24px 0;
  }
  /* Printer's ornament: hairlines fading out on both sides of a star. */
  .ornament {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 18px 0 6px;
    font-size: 12px;
    color: var(--ast-fg);
    text-shadow: var(--ast-glow);
  }
  .ornament::before,
  .ornament::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--ast-fg));
  }
  .ornament::after {
    background: linear-gradient(90deg, var(--ast-fg), transparent);
  }
  h2 {
    margin: 22px 0 10px;
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .num {
    color: var(--ast-fg);
  }
  section p {
    margin: 0 0 14px;
    font: 400 14px/1.75 var(--ast-font-mono);
    hyphens: auto;
  }
  /* Drop cap, as in the old atlases: the first letter in the serif, three lines high. */
  .lead::first-letter {
    float: left;
    margin: 6px 10px 0 0;
    font: 500 italic 64px/0.8 var(--ast-font-serif);
    color: var(--ast-fg);
    text-shadow: 0 0 20px color-mix(in srgb, var(--ast-fg) 35%, transparent);
  }
  i {
    font-family: var(--ast-font-serif);
    font-size: 1.15em;
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  ol li {
    display: grid;
    grid-template-columns: 52px 1fr;
    gap: 10px;
    padding: 14px 0;
    border-top: 1px solid var(--ast-hairline);
  }
  .big {
    font: 700 40px/0.9 var(--ast-font-display);
    color: transparent;
    -webkit-text-stroke: 1px var(--ast-fg);
  }
  ol li p {
    margin: 0;
  }
  .sources {
    margin-top: 10px;
    border-top: 1px solid var(--ast-hairline);
    font: 400 11px/1.5 var(--ast-font-mono);
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
    margin: 0 0 8px;
    color: var(--ast-fg-muted);
  }
  .sources ul {
    margin: 0;
    padding: 0 0 0 14px;
  }
  .sources li {
    margin-bottom: 6px;
  }
  .muted {
    color: var(--ast-fg-muted);
  }
  a {
    color: var(--ast-fg);
    text-underline-offset: 3px;
    overflow-wrap: anywhere;
  }
  /* Kept in reach at the bottom of the screen while reading. */
  .dock {
    position: sticky;
    bottom: 0;
    margin-top: 16px;
    padding: 24px 0 4px;
    background: linear-gradient(to bottom, transparent, var(--ast-night-deep) 45%);
  }
  .show {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    border: 1px solid var(--ast-fg);
    background: var(--ast-fg);
    color: var(--ast-bg);
    font: 700 12px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: var(--ast-glow-soft);
  }
  .show:hover {
    box-shadow: var(--ast-glow);
  }
</style>
