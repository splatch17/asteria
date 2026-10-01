<script lang="ts">
  import { onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import type { SkyLayers } from "@asteria/sky-renderer";
  import { sectionsFor, type LayerKey, type LayerView } from "../lib/layers";
  import Icon from "./Icon.svelte";

  let {
    view,
    layers,
    onchange,
    onclose,
    toggle,
  }: {
    /** Current view: only the layers it renders are offered. */
    view: LayerView;
    layers: Readonly<SkyLayers>;
    onchange: (key: LayerKey, value: boolean) => void;
    onclose: () => void;
    /** The button that opens the panel (a tap on it is not an "outside" tap). */
    toggle?: HTMLElement | undefined;
  } = $props();

  let panel: HTMLElement;
  const sections = $derived(sectionsFor(view));
  const pad = (i: number) => String(i + 1).padStart(2, "0");

  onMount(() => {
    panel.focus({ preventScroll: true });
    // Outside tap closes (capture: runs before the map grabs the pointer); the tap still acts.
    const outside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && !panel.contains(target) && !toggle?.contains(target)) onclose();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        toggle?.focus();
        onclose();
      }
    };
    addEventListener("pointerdown", outside, true);
    addEventListener("keydown", escape);
    return () => {
      removeEventListener("pointerdown", outside, true);
      removeEventListener("keydown", escape);
    };
  });
</script>

<div
  class="layers frame"
  role="dialog"
  aria-label={$_("layers.title")}
  tabindex="-1"
  bind:this={panel}
  id="layers-panel"
>
  <div class="scroll">
    {#each sections as section, i (section.id)}
      <section aria-labelledby={`layers-${section.id}`}>
        <h2 id={`layers-${section.id}`}>{pad(i)} // {$_(`layers.section.${section.id}`)}</h2>
        {#each section.entries as entry (entry.key)}
          <button
            class="switch"
            role="switch"
            aria-checked={layers[entry.key]}
            onclick={() => onchange(entry.key, !layers[entry.key])}
          >
            <span class="icon"><Icon name={entry.icon} /></span>
            <span class="text">
              <span class="label">{$_(`layers.${entry.key}`)}</span>
              {#if entry.hint}<span class="hint">{$_(`layers.${entry.key}.hint`)}</span>{/if}
            </span>
            <span class="track" aria-hidden="true"><span class="knob"></span></span>
          </button>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  .layers {
    width: 100%;
    max-width: 420px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    /* Never taller than the room between the right-hand dials and the time controls
       (--controls-h: height of the controls under the panel, set by the parent). */
    max-height: calc(
      100dvh - max(16px, env(safe-area-inset-top)) - 156px - var(--controls-h, 140px) -
        max(16px, env(safe-area-inset-bottom)) - 8px
    );
    min-height: 0;
    outline: none;
    animation: rise 160ms var(--ast-ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .layers {
      animation: none;
    }
  }
  .scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 0 6px;
  }
  h2 {
    margin: 6px 12px 0;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  button {
    font: 500 11px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  .switch {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 4px 12px;
    text-align: left;
    letter-spacing: 0.06em;
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
  /* Instrument toggle: hairline slot, square knob, filled when on */
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
