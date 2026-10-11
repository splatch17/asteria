<script lang="ts">
  // One switch row of the menu (#130), shared by the layers and the display settings: engraved
  // pictogram, label, optional one-line hint, and an instrument toggle (hairline slot, square knob).
  import type { Snippet } from "svelte";
  import type { IconName } from "../lib/icons";
  import Icon from "./Icon.svelte";

  let {
    icon,
    label,
    hint,
    checked,
    disabled = false,
    onclick,
    glyph,
  }: {
    icon?: IconName | undefined;
    label: string;
    hint?: string | undefined;
    checked: boolean;
    disabled?: boolean;
    onclick: () => void;
    /** Drawing in place of the icon (e.g. a rotating needle). */
    glyph?: Snippet;
  } = $props();
</script>

<button class="switch" role="switch" aria-checked={checked} {disabled} {onclick}>
  <span class="icon"
    >{#if glyph}{@render glyph()}{:else if icon}<Icon name={icon} />{/if}</span
  >
  <span class="text">
    <span class="label">{label}</span>
    {#if hint}<span class="hint">{hint}</span>{/if}
  </span>
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
</button>

<style>
  .switch {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 4px 12px;
    font: 500 11px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    text-align: left;
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  .switch:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  .icon {
    display: grid;
    place-items: center;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .label {
    text-transform: uppercase;
    letter-spacing: var(--ast-tracking-meta);
  }
  .hint {
    font-size: 9px;
    line-height: 1.3;
    letter-spacing: 0.02em;
    color: var(--ast-fg-muted);
    opacity: 0.85;
  }
  .track {
    position: relative;
    width: 28px;
    height: 14px;
    border: 1px solid var(--ast-hairline);
    transition: border-color 120ms var(--ast-ease-out);
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 8px;
    height: 8px;
    border: 1px solid var(--ast-fg-muted);
    box-sizing: border-box;
    transition: transform 120ms var(--ast-ease-out);
  }
  .switch:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .switch[aria-checked="true"] {
    color: var(--ast-fg);
  }
  .switch[aria-checked="true"] .track {
    border-color: var(--ast-fg);
  }
  .switch[aria-checked="true"] .knob {
    transform: translateX(14px);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  @media (prefers-reduced-motion: reduce) {
    .track,
    .knob {
      transition: none;
    }
  }
</style>
