<script lang="ts">
  // Bottom line of the interface (#130): play/pause and the displayed date (a tap unfolds the
  // time slider above it), then sensor pointing where it works in the field, then the menu.
  // The search is at the top right of the sky map (#138); everything else is in the menu.
  import type { Snippet } from "svelte";
  import { _ } from "@asteria/ui";
  import Icon from "./Icon.svelte";

  let {
    playing,
    ontoggle,
    time,
    live,
    relative,
    timeOpen,
    ontime,
    pointing,
    onpoint,
    menuOpen,
    onmenu,
    menuButton = $bindable(),
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
    timeOpen: boolean;
    /** Unfolds or folds the time controls. */
    ontime: () => void;
    /** Direct sensor pointing button: null when not offered here (it stays in the menu). */
    pointing: boolean | null;
    onpoint: () => void;
    menuOpen: boolean;
    onmenu: () => void;
    menuButton?: HTMLButtonElement | undefined;
    lineElement?: HTMLElement | undefined;
    /** Time controls shown above the line when unfolded. */
    expanded: Snippet;
  } = $props();
</script>

{#if timeOpen}
  <div class="expanded" id="time-controls">{@render expanded()}</div>
{/if}
<div class="line frame" bind:this={lineElement}>
  <button
    class="icon"
    onclick={ontoggle}
    aria-label={playing ? $_("time.pause") : $_("time.play")}
    title={playing ? $_("time.pause") : $_("time.play")}
    aria-pressed={playing}
  >
    <Icon name={playing ? "pause" : "play"} />
  </button>
  <button
    class="when"
    onclick={ontime}
    aria-expanded={timeOpen}
    aria-controls="time-controls"
    title={timeOpen ? $_("time.collapse") : $_("time.expand")}
  >
    <span class="date">{time}</span>
    <span class="state" class:live>{live ? `● ${$_("time.live")}` : relative}</span>
    <span class="sr-only">{timeOpen ? $_("time.collapse") : $_("time.expand")}</span>
  </button>
  {#if pointing !== null}
    <button
      class="icon"
      onclick={onpoint}
      aria-pressed={pointing}
      aria-label={$_("pointing.toggle")}
      title={$_("pointing.toggle")}
    >
      <Icon name="aim" size={18} />
    </button>
  {/if}
  <button
    class="icon"
    bind:this={menuButton}
    onclick={onmenu}
    aria-haspopup="dialog"
    aria-expanded={menuOpen}
    aria-controls="main-menu"
    aria-label={$_("menu.open")}
    title={$_("menu.open")}
  >
    <Icon name="menu" size={18} />
  </button>
</div>

<style>
  .expanded {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    animation: unfold 160ms var(--ast-ease-out);
  }
  @keyframes unfold {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .expanded {
      animation: none;
    }
  }
  .line {
    display: flex;
    align-items: stretch;
    width: 100%;
    max-width: 420px;
    height: 44px;
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 44px;
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
  button + button {
    border-left: 1px solid var(--ast-hairline);
  }
  .icon {
    flex: none;
    width: 44px;
  }
  button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  /* Date and live state, stacked: the whole line is the target that unfolds the slider. */
  .when {
    flex: 1;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 0 8px 0 10px;
    text-align: left;
  }
  .when[aria-expanded="true"] {
    background: color-mix(in srgb, var(--ast-fg) 10%, transparent);
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
