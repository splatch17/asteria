<script lang="ts">
  // End of a series (#163, #164): the score, the record, and what each round changed for the
  // constellation played (apprise, maîtrisée, à revoir, acquise); « Rejouer » or back to the list.
  // After a challenge (#187): the streak, or what was won within the time, with its own record
  // (per game, mode and level); a new record gets a small burst of stars around the number and
  // an inked plate (still, with reduced motion).
  import { onMount } from "svelte";
  import { _, locale } from "@asteria/ui";
  import type { ChallengeEnd } from "../lib/games/challenge";
  import type { GameMode } from "../lib/games/progress";
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
    mode = "training",
    end = null,
    inPoints = false,
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
    /** A challenge (#187): its mode, why it ended, scored in points (timed « Où est-elle ? »). */
    mode?: GameMode;
    end?: ChallengeEnd | null;
    inPoints?: boolean;
    onreplay: () => void;
    onquit: () => void;
  } = $props();

  // Digit grouping for points scores (« 5 000 »).
  const fmt = $derived(new Intl.NumberFormat($locale ?? "fr"));
  const challenge = $derived(mode !== "training");
  const newBest = $derived(score > previousBest);
  const unit = $derived(inPoints ? "points" : "right");

  const title = $derived(
    mode === "training"
      ? $_("quiz.end.title")
      : end === "exhausted"
        ? $_("games.end.exhausted")
        : $_(`games.end.${mode}.title`),
  );
  const record = $derived(
    !challenge
      ? (recordLabel ?? $_("quiz.end.best", { values: { best: previousBest, total } }))
      : $_(`games.end.${mode}.best.${unit}`, { values: { best: fmt.format(previousBest) } }),
  );

  /** The burst of a new record: small stars thrown around the number. */
  /** The burst of a new record: small 1-bit stars thrown around the number, on an ellipse. */
  const burst = $derived.by(() => {
    // The number stands on the left edge: the stars fan out to its right, within its height (the
    // caption is just below).
    const half = String(score).length * 25; // half the number's width, about
    const n = 16;
    return Array.from({ length: n }, (_, i) => {
      const a = ((i / (n - 1)) * 2 - 1) * 1.45 + (i % 2 ? 0.08 : -0.08);
      const r = [18, 46, 80, 30][i % 4]!;
      return {
        x: Math.round(half + 12 + Math.cos(a) * r * 1.5),
        y: Math.round(Math.sin(a) * (30 + r * 0.16)),
        s: i % 5 === 0 ? 4 : 2,
        i,
      };
    });
  });

  let heading: HTMLElement;
  onMount(() => heading.focus());
</script>

<section class="end" class:challenge aria-labelledby="series-end-title">
  <h2 id="series-end-title" tabindex="-1" bind:this={heading}>{title}</h2>
  <div class="score-block">
    <p class="score" class:best={newBest}>
      <span class="big" aria-hidden="true"
        >{#if newBest && challenge}<span class="burst">
            {#each burst as b (b.i)}
              <i
                style:--x={`${b.x}px`}
                style:--y={`${b.y}px`}
                style:--s={`${b.s}px`}
                style:--d={`${(b.i % 4) * 40}ms`}
              ></i>
            {/each}
          </span>{/if}{fmt.format(score)}</span
      >{#if !challenge}<span class="of" aria-hidden="true">{of ?? `/${total}`}</span>{/if}
      <span class="sr-only"
        >{!challenge
          ? (scoreLabel ?? $_("quiz.end.score", { values: { score, total } }))
          : $_(`games.end.${mode}.score.${unit}`, { values: { score } })}</span
      >
    </p>
    {#if challenge}
      <p class="caption" aria-hidden="true">
        {$_(`games.end.${mode}.caption.${unit}`, { values: { score } })}
      </p>
    {/if}
  </div>
  {#if newBest}
    <p class="record new">
      <span class="plate">{$_("quiz.end.newBest")}</span>
      {#if challenge && previousBest > 0}
        <span class="was"
          >{$_("games.end.previous", { values: { best: fmt.format(previousBest) } })}</span
        >
      {/if}
    </p>
  {:else}
    <p class="record">{record}</p>
  {/if}
  {#if results.length}
    <h3>{challenge ? $_("games.end.list") : $_("quiz.end.list")}</h3>
    <ul class="results">
      {#each results as r, i (i)}
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
  {/if}
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
    animation: rise 220ms var(--ast-ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
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
  .challenge h2 {
    color: var(--ast-fg);
  }
  .score-block {
    position: relative;
  }
  .score {
    position: relative;
    margin: 6px 0 0;
    font-family: var(--ast-font-display);
    font-weight: 700;
    line-height: 0.9;
  }
  .big {
    position: relative;
    display: inline-block;
    font-size: 88px;
    font-variant-numeric: tabular-nums;
  }
  .challenge .big {
    font-size: 104px;
  }
  .best .big {
    animation: grow 420ms var(--ast-ease-out);
  }
  @keyframes grow {
    from {
      transform: scale(0.7);
      opacity: 0.2;
    }
    60% {
      transform: scale(1.05);
    }
  }
  .of {
    font-size: 36px;
    color: var(--ast-fg-muted);
  }
  .caption {
    margin: 4px 0 0;
    font: 500 11px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  /* New record: stars thrown out from behind the number, then left twinkling faintly. */
  .burst {
    position: absolute;
    left: 50%;
    top: 52%;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .burst i {
    position: absolute;
    left: 0;
    top: 0;
    width: var(--s);
    height: var(--s);
    background: var(--ast-fg);
    transform: translate(var(--x), var(--y));
    opacity: 0.7;
    animation: burst 900ms var(--ast-ease-out) var(--d) both;
  }
  @keyframes burst {
    from {
      transform: translate(0, 0) scale(0.4);
      opacity: 1;
    }
    55% {
      opacity: 1;
    }
  }
  .record {
    margin: 10px 0 20px;
    font: 500 11px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .record.new {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
  }
  .plate {
    display: inline-block;
    padding: 6px 9px 5px;
    color: var(--ast-bg);
    background: var(--ast-fg);
    animation: stamp 260ms var(--ast-ease-out) 180ms both;
  }
  @keyframes stamp {
    from {
      transform: scale(1.25);
      opacity: 0;
    }
  }
  .was {
    color: var(--ast-fg-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .end,
    .best .big,
    .burst i,
    .plate {
      animation: none;
    }
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
    border-color: var(--ast-fg-muted);
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
