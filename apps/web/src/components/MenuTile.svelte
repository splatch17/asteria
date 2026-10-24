<script lang="ts">
  // One tile of the menu's grids (#135): an engraved pictogram over a short label, at least
  // 44 px. The state reads as a filled ink square in the corner and a tinted, inked frame when on,
  // a hairline outline when off: no switch. Three kinds:
  //  - toggle (`pressed` set): aria-pressed;
  //  - choice (`checked` set): role radio, inside a radiogroup given by the caller;
  //  - action (neither): a plain button.
  // The long label and the hint are not printed: they are the button's description for screen
  // readers, and are shown in the menu's readout on focus, hover or a long press (`oninfo`).
  import type { Snippet } from "svelte";
  import type { IconName } from "../lib/icons";
  import Icon from "./Icon.svelte";

  let {
    id,
    icon,
    glyph,
    label,
    detail,
    hint,
    pressed,
    checked,
    disabled = false,
    haspopup = false,
    large = false,
    onclick,
    oninfo,
  }: {
    /** Stable name of the tile (data-tile), for tests and captures. */
    id: string;
    icon?: IconName | undefined;
    /** Drawing in place of the icon (a rotating needle, a point-of-view pictogram). */
    glyph?: Snippet;
    /** Short label printed under the pictogram. */
    label: string;
    /** Full label, when the short one abbreviates it. */
    detail?: string | undefined;
    /** One-line explanation (formerly the row's sub-line). */
    hint?: string | undefined;
    pressed?: boolean | undefined;
    checked?: boolean | undefined;
    disabled?: boolean;
    /** The tile opens a dialog (point-of-view selector). */
    haspopup?: boolean;
    /** Taller tile with a larger pictogram (points of view). */
    large?: boolean;
    onclick: () => void;
    /** The readout should show this tile's detail (true) or may forget it (false). */
    oninfo?:
      | ((tile: { label: string; detail: string; hint?: string | undefined }, on: boolean) => void)
      | undefined;
  } = $props();

  const uid = $props.id();
  const full = $derived(detail ?? label);
  const description = $derived([full !== label ? full : "", hint ?? ""].filter(Boolean).join(". "));
  const info = (on: boolean) => oninfo?.({ label, detail: full, hint }, on);

  /** Long press (touch, pen): show the detail, and swallow the click that follows the release. */
  const LONG_PRESS_MS = 450;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let swallow = false;
  function down(e: PointerEvent) {
    if (e.pointerType === "mouse") return;
    swallow = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      swallow = true;
      info(true);
    }, LONG_PRESS_MS);
  }
  const cancel = () => clearTimeout(timer);
  function click() {
    if (swallow) {
      swallow = false;
      return;
    }
    onclick();
  }
</script>

<button
  class="tile"
  class:large
  class:on={pressed === true || checked === true}
  class:stateful={pressed !== undefined || checked !== undefined}
  data-tile={id}
  role={checked !== undefined ? "radio" : undefined}
  aria-checked={checked}
  aria-pressed={pressed}
  aria-haspopup={haspopup ? "dialog" : undefined}
  aria-describedby={description ? `${uid}-d` : undefined}
  {disabled}
  onclick={click}
  onpointerdown={down}
  onpointerup={cancel}
  onpointercancel={cancel}
  onpointerleave={(e) => {
    cancel();
    if (e.pointerType === "mouse") info(false);
  }}
  onpointerenter={(e) => e.pointerType === "mouse" && info(true)}
  onfocus={() => info(true)}
  onblur={() => info(false)}
  oncontextmenu={(e) => e.preventDefault()}
>
  <span class="picto" aria-hidden="true"
    >{#if glyph}{@render glyph()}{:else if icon}<Icon
        name={icon}
        size={large ? 18 : 20}
      />{/if}</span
  >
  <span class="label">{label}</span>
  {#if description}<span class="sr" id={`${uid}-d`}>{description}</span>{/if}
</button>

<style>
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 44px;
    min-height: 60px;
    padding: 8px 2px 6px;
    font: 500 9px/1.2 var(--ast-font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-align: center;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      color 120ms var(--ast-ease-out),
      background-color 120ms var(--ast-ease-out),
      border-color 120ms var(--ast-ease-out);
  }
  .tile.large {
    min-height: 72px;
  }
  .tile:hover:not(:disabled) {
    border-color: var(--ast-fg-muted);
    color: var(--ast-fg);
  }
  .tile:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .tile:disabled {
    cursor: default;
    opacity: 0.45;
  }
  /* Instrument mark: a hollow square when off, filled when on (toggles and choices only). */
  .tile.stateful::after {
    content: "";
    position: absolute;
    top: 4px;
    right: 4px;
    width: 5px;
    height: 5px;
    border: 1px solid var(--ast-hairline);
    box-sizing: border-box;
  }
  .tile.on {
    color: var(--ast-fg);
    background: color-mix(in srgb, var(--ast-fg) 18%, transparent);
    border-color: var(--ast-fg);
  }
  .tile.on::after {
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .picto {
    display: grid;
    place-items: center;
    min-height: 20px;
  }
  .label {
    max-width: 100%;
    overflow-wrap: anywhere;
    hyphens: manual;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .tile {
      transition: none;
    }
  }
</style>
