<script lang="ts">
  // The single menu (#130): every action that is not a field action, grouped by theme. A bottom
  // sheet on a phone, a side panel on a wide screen. Modal: a backdrop takes the outside taps
  // (they close the menu without selecting anything), Tab stays inside, Escape closes.
  import { onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import type { SkyLayers } from "@asteria/sky-renderer";
  import type { LayerKey } from "../lib/layers";
  import Icon from "./Icon.svelte";
  import LayersPanel from "./LayersPanel.svelte";
  import MenuSwitch from "./MenuSwitch.svelte";

  let {
    mode,
    onview,
    rotation,
    northDisabled,
    onnorth,
    pointing,
    onpoint,
    povTitle,
    visiting,
    onpov,
    onvisit,
    onrecentre,
    layers,
    onlayer,
    unavailable = [],
    placeName,
    coords,
    locating,
    onlocate,
    time,
    live,
    relative,
    ontime,
    onnow,
    night,
    onnight,
    brightness = $bindable(),
    minBrightness,
    realistic,
    onrealistic,
    fullscreen,
    onfullscreen,
    oncredits,
    onhide,
    onclose,
  }: {
    mode: "sky" | "space";
    /** Switches between the sky map and the Earth view. */
    onview: (mode: "sky" | "space") => void;
    /** Compass needle rotation, degrees (sky map). */
    rotation: number;
    northDisabled: boolean;
    onnorth: () => void;
    /** Sensor pointing on or starting. */
    pointing: boolean;
    onpoint: () => void;
    /** Earth view: the point of view shown, and the body visited (body-centred frame) or null. */
    povTitle: string;
    visiting: string | null;
    onpov: () => void;
    onvisit: () => void;
    onrecentre: () => void;
    layers: Readonly<SkyLayers>;
    onlayer: (key: LayerKey, value: boolean) => void;
    unavailable?: readonly LayerKey[];
    placeName: string;
    coords: string;
    locating: "idle" | "busy" | "error";
    onlocate: () => void;
    time: string;
    live: boolean;
    relative: string;
    /** Opens the time controls (slider), closing the menu. */
    ontime: () => void;
    onnow: () => void;
    night: boolean;
    onnight: () => void;
    brightness: number;
    minBrightness: number;
    realistic: boolean;
    onrealistic: () => void;
    /** null: fullscreen not available (row hidden). */
    fullscreen: boolean | null;
    onfullscreen: () => void;
    oncredits: () => void;
    /** Hides the interface (immersive mode), closing the menu. */
    onhide: () => void;
    onclose: () => void;
  } = $props();

  let sheet: HTMLElement;
  const pad = (i: number) => String(i).padStart(2, "0");

  onMount(() => {
    sheet.focus({ preventScroll: true });
  });

  /** Escape closes; Tab cycles inside the sheet (modal). */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [
      ...sheet.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"),
    ];
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === sheet)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<!-- Outside taps close the menu and stop there (no selection behind it). -->
<div class="backdrop" aria-hidden="true" onpointerdown={onclose}></div>
<div
  class="sheet frame"
  role="dialog"
  aria-modal="true"
  aria-labelledby="menu-title"
  tabindex="-1"
  id="main-menu"
  bind:this={sheet}
  {onkeydown}
>
  <div class="head">
    <h2 id="menu-title">{$_("menu.title")}</h2>
    <!-- Night vision at hand, whatever the scroll (also in « Affichage »). -->
    <button
      class="quick"
      aria-pressed={night}
      onclick={onnight}
      aria-label={$_("night.toggle")}
      title={$_("night.toggle")}><Icon name="night" size={18} /></button
    >
    <button class="close" onclick={onclose} aria-label={$_("menu.close")} title={$_("menu.close")}
      >×</button
    >
  </div>
  <div class="scroll">
    <section aria-labelledby="menu-view">
      <h3 id="menu-view">{pad(1)} // {$_("menu.section.view")}</h3>
      <div class="segmented" role="radiogroup" aria-labelledby="menu-view">
        <button role="radio" aria-checked={mode === "sky"} onclick={() => onview("sky")}
          ><Icon name="sky" />{$_("menu.view.sky")}</button
        >
        <button role="radio" aria-checked={mode === "space"} onclick={() => onview("space")}
          ><Icon name="earth" />{$_("menu.view.earth")}</button
        >
      </div>
      {#if mode === "sky"}
        <button class="row" onclick={onnorth} disabled={northDisabled}>
          <span class="glyph" style:transform={`rotate(${rotation}deg)`}><Icon name="north" /></span
          >
          <span class="label">{$_("compass.north")}</span>
        </button>
        <MenuSwitch icon="aim" label={$_("pointing.toggle")} checked={pointing} onclick={onpoint} />
      {:else}
        <button class="row" onclick={onpov} aria-haspopup="dialog">
          <Icon name="frame" />
          <span class="label">{$_("frame.title")}</span>
          <span class="value">{povTitle} ›</span>
        </button>
        <button class="row" onclick={onvisit} aria-haspopup="dialog">
          <Icon name="planets" />
          <span class="label">{$_("frame.body")}</span>
          <span class="value">{visiting ?? ""} ›</span>
        </button>
        <button class="row" onclick={onrecentre}>
          <Icon name="recentre" />
          <span class="label">{$_("gestures.recentre")}</span>
        </button>
      {/if}
    </section>

    <section aria-labelledby="menu-layers">
      <h3 id="menu-layers">{pad(2)} // {$_("layers.title")}</h3>
      <LayersPanel view={mode} {layers} onchange={onlayer} {unavailable} />
    </section>

    <section aria-labelledby="menu-place">
      <h3 id="menu-place">{pad(3)} // {$_("menu.section.placeTime")}</h3>
      <div class="info">
        <span class="label">{placeName}</span>
        <span class="value">{coords}</span>
      </div>
      <button class="row" onclick={onlocate} aria-busy={locating === "busy"}>
        <Icon name="locate" />
        <span class="label">{$_("place.locate")}</span>
        {#if locating !== "idle"}
          <span class="value" role="status"
            >{locating === "busy" ? $_("place.locating") : $_("place.locateError")}</span
          >
        {/if}
      </button>
      <div class="info">
        <span class="label">{time}</span>
        <span class="value">{live ? `● ${$_("time.live")}` : relative}</span>
      </div>
      <button class="row" onclick={ontime}>
        <Icon name="range" />
        <span class="label">{$_("menu.setDate")}</span>
        <span class="value">›</span>
      </button>
      <button class="row" onclick={onnow} disabled={live}>
        <Icon name="now" />
        <span class="label">{$_("time.backToNow")}</span>
      </button>
    </section>

    <section aria-labelledby="menu-display">
      <h3 id="menu-display">{pad(4)} // {$_("menu.section.display")}</h3>
      <MenuSwitch icon="night" label={$_("night.toggle")} checked={night} onclick={onnight} />
      {#if night}
        <label class="dim">
          <span>{$_("night.brightness")}</span>
          <input
            class="slider"
            type="range"
            min={minBrightness}
            max="1"
            step="0.05"
            bind:value={brightness}
          />
        </label>
      {/if}
      <MenuSwitch
        icon="realistic"
        label={$_("space.realistic")}
        checked={realistic}
        onclick={onrealistic}
      />
      {#if fullscreen !== null}
        <MenuSwitch
          icon="fullscreen"
          label={$_("fullscreen.enter")}
          checked={fullscreen}
          onclick={onfullscreen}
        />
      {/if}
      <button class="row" onclick={onhide}>
        <Icon name="expand" />
        <span class="text">
          <span class="label">{$_("hud.hide")}</span>
          <span class="hint">{$_("hud.hide.hint")}</span>
        </span>
      </button>
    </section>

    <section aria-labelledby="menu-help">
      <h3 id="menu-help">{pad(5)} // {$_("menu.section.help")}</h3>
      <ul class="help">
        <li>{$_("menu.help.tapSky")}</li>
        <li>{$_("menu.help.tapObject")}</li>
        <li>{$_("menu.help.time")}</li>
      </ul>
      <button class="row" onclick={oncredits}>
        <Icon name="help" />
        <span class="label">{$_("credits.open")}</span>
        <span class="value">›</span>
      </button>
    </section>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 4;
    background: color-mix(in srgb, var(--ast-bg) 35%, transparent);
  }
  /* Phone: bottom sheet over the time line, under the safe areas. */
  .sheet {
    position: fixed;
    z-index: 5;
    left: max(8px, env(safe-area-inset-left));
    right: max(8px, env(safe-area-inset-right));
    bottom: max(8px, env(safe-area-inset-bottom));
    max-height: calc(100dvh - max(16px, env(safe-area-inset-top)) - 56px);
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--ast-bg) 94%, transparent);
    outline: none;
    animation: rise 180ms var(--ast-ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  @keyframes slide {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
  }
  /* Wide screen: side panel on the right, the sky stays visible on the left. */
  @media (min-width: 720px) {
    .sheet {
      left: auto;
      top: max(16px, env(safe-area-inset-top));
      right: max(16px, env(safe-area-inset-right));
      bottom: max(16px, env(safe-area-inset-bottom));
      width: 360px;
      max-height: none;
      animation-name: slide;
    }
    .backdrop {
      background: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet {
      animation: none;
    }
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--ast-hairline);
  }
  h2 {
    flex: 1;
    margin: 0 12px;
    font: 700 20px/1 var(--ast-font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ast-fg);
  }
  .quick {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-left: 1px solid var(--ast-hairline);
    color: var(--ast-fg);
  }
  .quick[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .close {
    width: 44px;
    height: 44px;
    border: 0;
    border-left: 1px solid var(--ast-hairline);
    background: transparent;
    color: var(--ast-fg);
    font: 400 20px/1 var(--ast-font-mono);
    cursor: pointer;
  }
  .scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 2px 0 8px;
  }
  section + section {
    border-top: 1px solid var(--ast-hairline);
  }
  h3 {
    margin: 10px 12px 2px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
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
  button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 6px 12px 4px;
    border: 1px solid var(--ast-hairline);
  }
  .segmented button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .segmented button + button {
    border-left: 1px solid var(--ast-hairline);
  }
  .segmented button[aria-checked="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .row,
  .info {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 4px 12px;
    box-sizing: border-box;
    text-align: left;
    letter-spacing: 0.06em;
  }
  .row {
    color: var(--ast-fg);
  }
  .info {
    grid-template-columns: 1fr auto;
    min-height: 32px;
    padding-left: 40px;
    font: 500 11px/1.3 var(--ast-font-mono);
    color: var(--ast-fg);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .hint {
    font-size: 9px;
    line-height: 1.3;
    letter-spacing: 0.02em;
    color: var(--ast-fg-muted);
  }
  .label {
    text-transform: uppercase;
    letter-spacing: var(--ast-tracking-meta);
    min-width: 0;
  }
  .value {
    font-size: 10px;
    color: var(--ast-fg-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-align: right;
  }
  .glyph {
    display: grid;
    place-items: center;
    transition: transform 160ms var(--ast-ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .glyph {
      transition: none;
    }
  }
  .help {
    margin: 4px 12px 2px 40px;
    padding: 0;
    list-style: none;
    font: 10px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .help li + li {
    margin-top: 4px;
  }
  .dim {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 0 12px 0 40px;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  /* Fully themed slider: native tracks are white/grey, which would break night vision */
  .slider {
    appearance: none;
    width: 140px;
    height: 44px;
    background: transparent;
  }
  .slider:focus-visible {
    outline: 1px solid var(--ast-fg);
  }
  .slider::-webkit-slider-runnable-track {
    height: 1px;
    background: var(--ast-fg);
  }
  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -6px;
    border: 0;
    border-radius: 0;
    background: var(--ast-fg);
  }
  .slider::-moz-range-track {
    height: 1px;
    background: var(--ast-fg);
  }
  .slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: 0;
    border-radius: 0;
    background: var(--ast-fg);
  }
</style>
