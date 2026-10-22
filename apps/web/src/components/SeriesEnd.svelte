<script lang="ts">
  // End of a series (#163, #164): the score, the record, and what each round changed for the
  // constellation played (apprise, maîtrisée, à revoir, acquise); « Rejouer » or back to the list.
  import { onMount } from "svelte";
  import { _, locale } from "@asteria/ui";
  import { outcomeOf, type ItemResult } from "../lib/games/results";

  let {
    score,
    total,
    previousBest,
    results,
    nameOf,
    detail,
    of,
    scoreLabel,
    recordLabel,
    onreplay,
    onquit,
  }: {
    score: number;
    total: number;
    previousBest: number;
    results: readonly Pick<ItemResult, "item" | "correct" | "before" | "after">[];
    nameOf: (item: string) => string;
    /** Short extra line per round (errors, hints), or nothing. */
    detail?: ((index: number) => string) | undefined;
    /** Points games (#184): text after the big score (default « /total »), spoken score, record. */
    of?: string | undefined;
    scoreLabel?: string | undefined;
    recordLabel?: string | undefined;
    onreplay: () => void;
    onquit: () => void;
  } = $props();

  // Digit grouping for points scores (« 5 000 »).
  const fmt = $derived(new Intl.NumberFormat($locale ?? "fr"));

  let title: HTMLElement;
  onMount(() => title.focus());
</script>

<section class="end" aria-labelledby="series-end-title">
  <h2 id="series-end-title" tabindex="-1" bind:this={title}>{$_("quiz.end.title")}</h2>
  <p class="score">
    <span class="big" aria-hidden="true">{fmt.format(score)}</span><span class="of" aria-hidden="true"
      >{of ?? `/${total}`}</span
    >
    <span class="sr-only">{scoreLabel ?? $_("quiz.end.score", { values: { score, total } })}</span>
  </p>
  <p class="record">
    {score > previousBest
      ? $_("quiz.end.newBest")
      : (recordLabel ?? $_("quiz.end.best", { values: { best: previousBest, total } }))}
  </p>
  <h3>{$_("quiz.end.list")}</h3>
  <ul class="results">
    {#each results as r, i (r.item)}
      {@const outcome = outcomeOf(r)}
      {@const more = detail?.(i)}
      <li>
        <span class="mark" aria-hidden="true">{r.correct ? "✓" : "✗"}</span>
        <span class="r-name"
          >{nameOf(r.item)}{#if more}<span class="detail">{more}</span>{/if}</span
        >
        <span class={`tag ${outcome}`}>{$_(`quiz.outcome.${outcome}`)}</span>
      </li>
    {/each}
  </ul>
  <div class="end-actions">
    <button class="primary" onclick={onreplay}>{$_("quiz.replay")}</button>
    <button onclick={onquit}>{$_("quiz.back")}</button>
  </div>
</section>

<style>
  .end {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 18px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
    box-sizing: border-box;
  }
  h2,
  h3 {
    margin: 0;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    outline: none;
  }
  .score {
    margin: 6px 0 0;
    font-family: var(--ast-font-display);
    font-weight: 700;
    line-height: 0.9;
  }
  .big {
    font-size: 88px;
  }
  .of {
    font-size: 36px;
    color: var(--ast-fg-muted);
  }
  .record {
    margin: 6px 0 20px;
    font: 500 11px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .results {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }
  .results li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 34px;
    padding: 4px 0;
    border-top: 1px solid var(--ast-hairline);
    font: 400 13px/1.2 var(--ast-font-mono);
  }
  .mark {
    width: 14px;
    color: var(--ast-fg-muted);
  }
  .r-name {
    flex: 1;
    min-width: 0;
  }
  .detail {
    display: block;
    margin-top: 3px;
    font-size: 10px;
    color: var(--ast-fg-muted);
  }
  .tag {
    flex: none;
    padding: 3px 6px;
    border: 1px solid var(--ast-hairline);
    font: 500 9px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .tag.learnt {
    color: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .tag.mastered {
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .tag.review {
    border-style: dashed;
  }
  .end-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: auto;
    padding-top: 18px;
  }
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
    background: transparent;
    border: 1px solid var(--ast-fg);
    border-radius: var(--ast-radius);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .primary {
    color: var(--ast-bg);
    background: var(--ast-fg);
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
