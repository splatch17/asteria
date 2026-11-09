<script lang="ts">
  // The single button (#176, mock-up A′1), bottom left under the thumb: three engraved rules (the
  // owner's choice) over the name of the mode in force, in small capitals, so that one glance says
  // where one is (Orbites and Apprendre look alike from afar). It opens the sheet of the modes.
  // Beside it, chips for what is not as usual, each undone in one tap: a date that is not now
  // (the date opens the time line, ↺ goes back to now) and the pointing (« Viser », a tap stops it).
  import { _ } from "@asteria/ui";
  import Icon from "./Icon.svelte";

  let {
    mode,
    open,
    onopen,
    date = null,
    pointing = null,
    button = $bindable(),
    floating = true,
  }: {
    /** Name of the mode in force (« Observer »…). */
    mode: string;
    /** The sheet is open (aria-expanded). */
    open: boolean;
    onopen: () => void;
    /** Date chip, when the time shown is not now. */
    date?: { time: string; ontime: () => void; onnow: () => void } | null;
    /** « Viser » chip, while the pointing is on. */
    pointing?: { onstop: () => void } | null;
    button?: HTMLButtonElement | undefined;
    /** Fixed in the screen's corner (false: laid out by its container, e.g. the Apprendre screen). */
    floating?: boolean;
  } = $props();
</script>

<div class="corner" class:floating>
  <button
    class="mode-button frame"
    bind:this={button}
    onclick={onopen}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-controls={open ? "main-menu" : undefined}
    aria-label={$_("modes.button", { values: { mode } })}
    title={$_("menu.open")}
    data-corner="button"
    data-hud
  >
    <Icon name="menu" size={22} />
    <span class="label" aria-hidden="true">{mode}</span>
  </button>
  {#if date || pointing}
    <div class="chips">
      {#if date}
        <div class="chip frame" data-chip="date" data-hud>
          <button
            class="chip-main"
            onclick={date.ontime}
            aria-label={$_("chip.date", { values: { time: date.time } })}
          >
            <span class="chip-text">{date.time}</span>
          </button>
          <button
            class="chip-icon"
            onclick={date.onnow}
            aria-label={$_("time.backToNow")}
            title={$_("time.backToNow")}><Icon name="toNow" size={18} /></button
          >
        </div>
      {/if}
      {#if pointing}
        <button
          class="chip chip-main on"
          data-chip="pointing"
          data-hud
          onclick={pointing.onstop}
          aria-label={$_("chip.pointing.stop")}
          title={$_("chip.pointing.stop")}
        >
          <Icon name="aim" size={16} />
          <span class="chip-text">{$_("chip.pointing")}</span>
          <span class="x" aria-hidden="true">×</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Only the button and the chips take taps: the sky stays touchable around them. */
  .corner {
    flex: 1;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    min-width: 0;
    pointer-events: none;
  }
  .corner.floating {
    position: fixed;
    z-index: 2;
    left: max(var(--ast-corner-inset), env(safe-area-inset-left));
    right: max(var(--ast-corner-inset), env(safe-area-inset-right));
    bottom: max(var(--ast-corner-inset), env(safe-area-inset-bottom));
  }
  .mode-button,
  .chip {
    pointer-events: auto;
  }
  .mode-button {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: var(--ast-corner-size);
    height: var(--ast-corner-size);
    padding: 0;
    border-color: var(--ast-control-border);
    border-radius: var(--ast-radius);
    background: color-mix(in srgb, var(--ast-bg) 90%, transparent);
    color: var(--ast-fg);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mode-button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -4px;
  }
  .label {
    max-width: calc(100% - 4px);
    overflow: hidden;
    font: 500 var(--ast-fs-xs)/1 var(--ast-font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--ast-fg-muted);
  }
  /* Chips: on the button's row, wrapping upwards when they do not fit beside it. */
  .chips {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap-reverse;
    align-items: flex-end;
    gap: 8px;
    padding-bottom: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: stretch;
    max-width: 100%;
    height: 44px;
    border-color: var(--ast-control-border);
    animation: chip-in 160ms var(--ast-ease-out);
  }
  @keyframes chip-in {
    from {
      opacity: 0;
      transform: translateX(-6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip {
      animation: none;
    }
  }
  .chip button,
  button.chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 44px;
    margin: 0;
    padding: 0 12px;
    border: 0;
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    font: 500 var(--ast-fs-s)/1 var(--ast-font-mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .chip-main {
    min-width: 0;
  }
  .chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip-icon {
    justify-content: center;
    padding: 0 !important;
    width: 44px;
    border-left: 1px solid var(--ast-control-border) !important;
  }
  /* Viser is on: the chip inverted, like a pressed tile; its × says a tap stops it. */
  button.chip.on {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .x {
    font: 400 16px/1 var(--ast-font-mono);
  }
  .chip button:focus-visible,
  button.chip:focus-visible {
    outline: 1px solid currentColor;
    outline-offset: -4px;
  }
</style>
