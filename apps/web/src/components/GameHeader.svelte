<script lang="ts">
  // Head of a game (#163, #164): its title (no number, #171), one square per round of the series
  // (inked when won, dithered when lost, outlined when to come), and the button that leaves.
  // In a challenge (#187) the squares grow with the answers (the last ones only, sliding) and the
  // head shows the big number of the challenge: the streak, or the clock of « Contre-la-montre »
  // with its bar draining along the head's bottom edge (a CSS animation, restarted from where it
  // stood after a pause), urgent for the last 10 s.
  import { _ } from "@asteria/ui";
  import { TIMED_MS, URGENT_MS, clockText, type ChallengeMode } from "../lib/games/challenge";

  let {
    meta,
    results,
    total,
    index,
    done,
    progressLabel,
    challenge = null,
    onquit,
  }: {
    /** The game's title, « QUELLE CONSTELLATION ? » (#171: no number). */
    meta: string;
    /** Outcome of each round played so far. */
    results: readonly boolean[];
    total: number;
    index: number;
    done: boolean;
    progressLabel: string;
    /** A challenge (#187): its mode, number (streak or right answers), record and clock. */
    challenge?: {
      mode: ChallengeMode;
      value: number;
      best: number;
      /** Timed: ms left, the clock running, its (re)start count and the ms left then. */
      remaining?: number;
      running?: boolean;
      segment?: number;
      left?: number;
    } | null;
    onquit: () => void;
  } = $props();

  /** Squares shown in a challenge: the last ones. */
  const TRAIL = 18;
  const trail = $derived(challenge ? results.slice(-TRAIL) : results);
  const offset = $derived(results.length - trail.length);
  const remaining = $derived(challenge?.remaining ?? TIMED_MS);
  /** The streak has gone past its record. */
  const beaten = $derived(!!challenge && challenge.best > 0 && challenge.value > challenge.best);
  const urgent = $derived(challenge?.mode === "timed" && remaining <= URGENT_MS && !done);
</script>

<header class="head" class:timed={challenge?.mode === "timed"} class:urgent>
  <div class="left">
    <p class="meta">
      {meta}{#if challenge}<span class="mode">{$_(`games.mode.${challenge.mode}.short`)}</span>{/if}
    </p>
    {#if challenge}
      <ol class="steps trail" aria-label={progressLabel}>
        {#each trail as r, i (offset + i)}
          <li class:right={r} class:wrong={!r}></li>
        {/each}
        {#if !done}<li class="now"></li>{/if}
      </ol>
    {:else}
      <ol class="steps" aria-label={progressLabel}>
        {#each { length: total }, i (i)}
          <li
            class:right={results[i] === true}
            class:wrong={results[i] === false}
            class:now={i === index && !done}
          ></li>
        {/each}
      </ol>
    {/if}
  </div>
  {#if challenge}
    <div class="figure" aria-live="off">
      {#if challenge.mode === "streak"}
        {#key challenge.value}
          <span class="big pop" aria-hidden="true">{challenge.value}</span>
        {/key}
        <span class="sub" class:beaten aria-hidden="true"
          >{beaten
            ? $_("games.challenge.beaten")
            : challenge.best > 0
              ? $_("games.challenge.best", { values: { best: challenge.best } })
              : $_("games.mode.streak.label")}</span
        >
      {:else}
        <span class="big clock" aria-hidden="true">{clockText(remaining)}</span>
        <span class="sub" aria-hidden="true"
          >{$_("games.challenge.right", { values: { count: challenge.value } })}</span
        >
      {/if}
      <span class="sr-only" role="status"
        >{challenge.mode === "streak"
          ? $_("games.challenge.streakSr", { values: { count: challenge.value } })
          : urgent
            ? $_("games.challenge.urgentSr")
            : ""}</span
      >
    </div>
  {/if}
  <button class="close" onclick={onquit} aria-label={$_("quiz.quit")} title={$_("quiz.quit")}
    >×</button
  >
  {#if challenge?.mode === "timed"}
    {#key challenge.segment}
      <div
        class="bar"
        class:paused={!challenge.running || done}
        style:--duration={`${TIMED_MS}ms`}
        style:--delay={`${(challenge.left ?? TIMED_MS) - TIMED_MS}ms`}
        aria-hidden="true"
      ></div>
    {/key}
  {/if}
</header>

<style>
  .head {
    position: relative;
    flex: none;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px
      max(16px, env(safe-area-inset-left));
    border-bottom: 1px solid var(--ast-hairline);
  }
  .left {
    flex: 1;
    min-width: 0;
  }
  .meta {
    margin: 0 0 8px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mode {
    color: var(--ast-fg-muted);
  }
  .mode::before {
    content: "·";
    margin: 0 0.5em;
  }
  .sub.beaten {
    color: var(--ast-fg);
  }
  .steps {
    display: flex;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    flex: none;
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border: 1px solid var(--ast-hairline);
  }
  .steps li.now {
    border-color: var(--ast-fg);
  }
  .steps li.right {
    border-color: var(--ast-fg);
    background: var(--ast-fg);
  }
  .steps li.wrong {
    border-color: var(--ast-fg-muted);
    background: repeating-conic-gradient(var(--ast-fg-muted) 0 25%, transparent 0 50%) 0 0 / 4px 4px;
  }
  /* A challenge's trail: smaller squares, each new one popping in. */
  .trail {
    gap: 3px;
    overflow: hidden;
  }
  .trail li {
    width: 10px;
    height: 10px;
    animation: pip 180ms var(--ast-ease-out);
  }
  .trail li.now {
    animation: none;
  }
  @keyframes pip {
    from {
      transform: scale(0.2);
    }
  }
  /* The number of the challenge: the streak, or the clock. */
  .figure {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    margin-top: -4px;
    min-width: 64px;
  }
  .big {
    display: block;
    font: 700 34px/0.9 var(--ast-font-display);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }
  .pop {
    animation: pop 260ms var(--ast-ease-out);
  }
  @keyframes pop {
    from {
      transform: translateY(5px) scale(0.86);
      opacity: 0.4;
    }
  }
  .sub {
    font: 500 8px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    white-space: nowrap;
  }
  /* The last ten seconds: the clock on an ink plate, beating once a second. */
  .urgent .clock {
    padding: 2px 5px 1px;
    margin-right: -5px;
    color: var(--ast-bg);
    background: var(--ast-fg);
    animation: beat 1s steps(1) infinite;
  }
  @keyframes beat {
    50% {
      opacity: 0.78;
    }
  }
  /* The time left, along the bottom edge of the head (over its hairline). */
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    background: var(--ast-fg);
    transform-origin: left;
    animation: drain var(--duration) linear var(--delay) forwards;
  }
  .bar.paused {
    animation-play-state: paused;
  }
  .urgent .bar {
    height: 3px;
  }
  @keyframes drain {
    to {
      transform: scaleX(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .trail li,
    .pop,
    .urgent .clock {
      animation: none;
    }
  }
  .close {
    flex: none;
    width: 44px;
    height: 44px;
    margin: -6px -10px 0 0;
    font: 400 24px/1 var(--ast-font-mono);
    color: var(--ast-fg);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  .close:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -6px;
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
