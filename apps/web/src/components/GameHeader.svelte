<script lang="ts">
  // Head of a game (#163, #164): its number and title, one square per round of the series
  // (inked when won, dithered when lost, outlined when to come), and the button that leaves.
  import { _ } from "@asteria/ui";

  let {
    meta,
    results,
    total,
    index,
    done,
    progressLabel,
    onquit,
  }: {
    /** « #01 // QUELLE CONSTELLATION ? » */
    meta: string;
    /** Outcome of each round played so far. */
    results: readonly boolean[];
    total: number;
    index: number;
    done: boolean;
    progressLabel: string;
    onquit: () => void;
  } = $props();
</script>

<header class="head">
  <div>
    <p class="meta">{meta}</p>
    <ol class="steps" aria-label={progressLabel}>
      {#each { length: total }, i (i)}
        <li
          class:right={results[i] === true}
          class:wrong={results[i] === false}
          class:now={i === index && !done}
        ></li>
      {/each}
    </ol>
  </div>
  <button class="close" onclick={onquit} aria-label={$_("quiz.quit")} title={$_("quiz.quit")}
    >×</button
  >
</header>

<style>
  .head {
    flex: none;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px
      max(16px, env(safe-area-inset-left));
    border-bottom: 1px solid var(--ast-hairline);
  }
  .meta {
    margin: 0 0 8px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
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
</style>
