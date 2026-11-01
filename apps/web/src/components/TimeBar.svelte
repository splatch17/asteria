<script lang="ts">
  // The time line (#130), unfolded from the single button (#176): opened from the sheet's
  // « Heure » row or the date chip, it rises from the button's corner, and its first cell is the
  // button itself, now a × that folds it. Then play/pause and the date shown; the slider, the range
  // and « Maintenant » unfold above it.
  import type { Snippet } from "svelte";
  import { _ } from "@asteria/ui";
  import Icon from "./Icon.svelte";

  let {
    playing,
    ontoggle,
    time,
    live,
    relative,
    onfold,
    foldButton = $bindable(),
    lineElement = $bindable(),
    expanded,
  }: {
    playing: boolean;
    ontoggle: () => void;
    /** Displayed instant, e.g. "sam. 10 oct., 22:30". */
    time: string;
    live: boolean;
    /** Signed offset from now, when not live. */
    relative: string;
    /** Folds the time line (the button's place). */
    onfold: () => void;
    foldButton?: HTMLButtonElement | undefined;
    lineElement?: HTMLElement | undefined;
    /** Time controls shown above the line. */
    expanded: Snippet;
  } = $props();
</script>

<div class="timeline" id="time-controls">
  <div class="expanded">{@render expanded()}</div>
  <div class="line frame" bind:this={lineElement}>
    <button
      class="fold"
      bind:this={foldButton}
      onclick={onfold}
      aria-expanded="true"
      aria-controls="time-controls"
      aria-label={$_("modes.fold")}
      title={$_("modes.fold")}
    >
      <span aria-hidden="true">×</span>
    </button>
    <button
      class="icon"
      onclick={ontoggle}
      aria-label={playing ? $_("time.pause") : $_("time.play")}
      title={playing ? $_("time.pause") : $_("time.play")}
      aria-pressed={playing}
    >
      <Icon name={playing ? "pause" : "play"} />
    </button>
    <p class="when" aria-live="off">
      <span class="date">{time}</span>
      <span class="state" class:live>{live ? `● ${$_("time.live")}` : relative}</span>
    </p>
  </div>
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    width: 100%;
    max-width: 420px;
    transform-origin: bottom left;
    animation: unfold 180ms var(--ast-ease-out);
  }
  /* From the button: the line grows to the right, the controls rise above it. */
  @keyframes unfold {
    from {
      opacity: 0;
      clip-path: inset(0 85% 0 0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .timeline {
      animation: none;
    }
  }
  .expanded {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .line {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: var(--ast-corner-size);
    box-sizing: border-box;
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    font: 500 11px/1 var(--ast-font-mono);
    cursor: pointer;
  }
  button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  .fold {
    flex: none;
    width: calc(var(--ast-corner-size) - 2px);
    border-right: 1px solid var(--ast-control-border);
    font: 400 22px/1 var(--ast-font-mono);
  }
  .icon {
    flex: none;
    width: 52px;
    border-right: 1px solid var(--ast-hairline);
  }
  button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  /* Date and live state, stacked. */
  .when {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    margin: 0;
    padding: 0 8px 0 12px;
    font: 500 11px/1 var(--ast-font-mono);
    color: var(--ast-fg);
  }
  .date,
  .state {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .state {
    letter-spacing: var(--ast-tracking-meta);
    font-size: 9px;
    color: var(--ast-fg-muted);
  }
  .state.live {
    color: var(--ast-fg);
  }
</style>
