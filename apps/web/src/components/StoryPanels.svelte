<script lang="ts">
  // A constellation's story, anecdotes and sources (#61), as panels (#171). Shared by the map's
  // constellation sheet and the catalogue page (#170). Rewritten from Wikipédia: CC BY-SA.
  import { _ } from "@asteria/ui";
  import { inlineSegments, type ConstellationStory } from "@asteria/content";

  let {
    story,
    heading = "h3",
  }: {
    story: ConstellationStory;
    /** Level of the panel titles in the page outline. */
    heading?: "h2" | "h3";
  } = $props();
</script>

<section class="panel-block">
  <svelte:element this={heading} class="panel-title">{$_("constellation.story")}</svelte:element>
  {#each story.story as paragraph, i (i)}
    <p>
      {#each inlineSegments(paragraph) as seg, j (j)}{#if seg.italic}<i>{seg.text}</i
          >{:else}{seg.text}{/if}{/each}
    </p>
  {/each}
</section>
{#if story.anecdotes.length}
  <section class="panel-block">
    <svelte:element this={heading} class="panel-title"
      >{$_("constellation.anecdotes")}</svelte:element
    >
    <ul>
      {#each story.anecdotes as anecdote, i (i)}
        <li>
          {#each inlineSegments(anecdote) as seg, j (j)}{#if seg.italic}<i>{seg.text}</i
              >{:else}{seg.text}{/if}{/each}
        </li>
      {/each}
    </ul>
  </section>
{/if}
<details class="sources">
  <summary>{$_("constellation.sources")}</summary>
  <p>
    {$_("constellation.attribution")}
    <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" target="_blank" rel="noopener"
      >{$_("constellation.licenseLink")}</a
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

<style>
  .panel-block {
    margin-top: 12px;
    --ast-panel-pad: 12px;
  }
  /* Reading text (#208); the panel titles keep their mono capitals. */
  .panel-block p,
  .panel-block li {
    max-width: var(--ast-text-measure);
    font: 400 var(--ast-text-size) / var(--ast-text-leading) var(--ast-font-text);
  }
  p {
    margin: 0 0 10px;
  }
  .panel-block p:last-child {
    margin-bottom: 0;
  }
  .panel-block ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .panel-block li {
    padding: 8px 0;
  }
  .panel-block li:first-child {
    padding-top: 0;
  }
  .panel-block li:last-child {
    padding-bottom: 0;
  }
  .panel-block li + li {
    border-top: 1px solid var(--ast-hairline);
  }
  .sources {
    margin-top: 6px;
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
  .sources p,
  .muted {
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
</style>
