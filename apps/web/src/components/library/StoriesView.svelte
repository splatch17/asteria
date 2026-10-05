<script lang="ts">
  // Stories of the library (#90): the anecdote of the day, then every constellation that has a
  // story, with a teaser and its reading time. The story files (~3 KB each) are fetched when this
  // page opens; each row fills in when its file arrives.
  import { _ } from "@asteria/ui";
  import {
    inlineSegments,
    loadConstellationStory,
    storyIds,
    type ConstellationStory,
  } from "@asteria/content";
  import { anecdoteOfTheDay, readingMinutes, teaser } from "../../lib/library";
  import Icon from "../Icon.svelte";

  let {
    names,
    latin,
    onread,
  }: {
    names: Readonly<Record<string, string>>;
    latin: Readonly<Record<string, string>>;
    onread: (abbr: string) => void;
  } = $props();

  const pad = (i: number) => String(i).padStart(2, "0");
  // Listed in the reader's alphabetical order of names, not by abbreviation.
  const ids = storyIds("fr").sort((a, b) =>
    (names[a] ?? a).localeCompare(names[b] ?? b, "fr", { sensitivity: "base" }),
  );
  let loaded = $state<Record<string, ConstellationStory>>({});
  const day = anecdoteOfTheDay(storyIds("fr"), new Date());

  $effect(() => {
    let alive = true;
    for (const id of ids)
      loadConstellationStory("fr", id).then(
        (s) => {
          if (alive && s) loaded[id] = s;
        },
        () => {}, // offline: the row keeps its name only
      );
    return () => (alive = false);
  });

  const featured = $derived.by(() => {
    if (!day) return null;
    const story = loaded[day.id];
    if (!story?.anecdotes.length) return null;
    return { id: day.id, text: story.anecdotes[day.seed % story.anecdotes.length]! };
  });
</script>

<p class="intro">{$_("stories.intro")}</p>

{#if featured}
  <article class="featured" aria-labelledby="story-day">
    <p class="kicker" id="story-day">
      <Icon name="story" size={14} />{$_("stories.day")}
    </p>
    <blockquote>
      {#each inlineSegments(featured.text) as seg, i (i)}{#if seg.italic}<i>{seg.text}</i
          >{:else}{seg.text}{/if}{/each}
    </blockquote>
    <button class="from" onclick={() => onread(featured.id)}>
      <span>{$_("stories.dayFrom", { values: { name: names[featured.id] ?? featured.id } })}</span>
      <span class="cta">{$_("stories.read")} →</span>
    </button>
  </article>
{/if}

<ol class="list">
  {#each ids as id, i (id)}
    {@const story = loaded[id]}
    <li style:--i={i}>
      <button class="story" onclick={() => onread(id)}>
        <span class="num" aria-hidden="true">#{pad(i + 1)}</span>
        <span class="titles">
          <span class="name">{names[id] ?? id}</span>
          <span class="latin"><i lang="la">{latin[id] ?? id}</i></span>
        </span>
        {#if story}
          <span class="teaser">{teaser(story.story[0] ?? "")}</span>
          <span class="meta">
            {$_("stories.minutes", {
              values: { min: readingMinutes([...story.story, ...story.anecdotes]) },
            })} · {$_("stories.anecdotes", { values: { count: story.anecdotes.length } })}
          </span>
        {/if}
        <span class="arrow" aria-hidden="true">→</span>
      </button>
    </li>
  {/each}
</ol>

<style>
  .intro {
    margin: 0 0 16px;
    font: 400 12px/1.6 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .featured {
    position: relative;
    margin: 0 0 20px;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--ast-fg) 35%, transparent);
    background: var(--ast-hatch), color-mix(in srgb, var(--ast-bg) 75%, transparent);
    box-shadow: var(--ast-glow-soft);
    animation: rise 420ms var(--ast-ease-settle) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate3d(0, 12px, 0);
    }
  }
  .kicker {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  blockquote {
    margin: 0;
    font: 500 italic 21px/1.35 var(--ast-font-serif);
  }
  blockquote::before {
    content: "« ";
  }
  blockquote::after {
    content: " »";
  }
  blockquote i {
    font-style: normal;
  }
  .from {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 12px;
    width: 100%;
    min-height: 44px;
    margin-top: 12px;
    padding: 10px 0 0;
    border: 0;
    border-top: 1px solid var(--ast-hairline);
    background: transparent;
    color: var(--ast-fg-muted);
    font: 400 11px/1.4 var(--ast-font-mono);
    text-align: left;
    cursor: pointer;
  }
  .cta {
    color: var(--ast-fg);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list li {
    border-top: 1px solid var(--ast-hairline);
    animation: rise 380ms var(--ast-ease-settle) both;
    animation-delay: calc(60ms + min(var(--i), 10) * 40ms);
  }
  .list li:last-child {
    border-bottom: 1px solid var(--ast-hairline);
  }
  .story {
    position: relative;
    display: grid;
    grid-template-columns: 40px 1fr 20px;
    grid-template-areas:
      "num titles arrow"
      ". teaser arrow"
      ". meta arrow";
    gap: 4px 8px;
    width: 100%;
    padding: 14px 4px 14px 0;
    border: 0;
    background: transparent;
    color: var(--ast-fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .story::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--ast-hatch);
    opacity: 0;
    transition: opacity var(--ast-dur-fast) var(--ast-ease-out);
    pointer-events: none;
  }
  .story:hover::before,
  .story:active::before,
  .story:focus-visible::before {
    opacity: 1;
  }
  .story:hover .arrow,
  .story:focus-visible .arrow {
    transform: translateX(4px);
    opacity: 1;
  }
  .num {
    grid-area: num;
    padding-top: 6px;
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    color: var(--ast-fg-muted);
  }
  .titles {
    grid-area: titles;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
  }
  .name {
    font: 700 24px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .latin {
    font: 500 16px/1 var(--ast-font-serif);
    color: var(--ast-fg-muted);
  }
  .teaser {
    grid-area: teaser;
    font: 400 12px/1.55 var(--ast-font-mono);
    color: color-mix(in srgb, var(--ast-fg) 85%, transparent);
  }
  .meta {
    grid-area: meta;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .arrow {
    grid-area: arrow;
    align-self: center;
    font: 400 16px/1 var(--ast-font-mono);
    opacity: 0.5;
    transition:
      transform var(--ast-dur-fast) var(--ast-ease-settle),
      opacity var(--ast-dur-fast) var(--ast-ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .featured,
    .list li {
      animation: none;
    }
  }
</style>
