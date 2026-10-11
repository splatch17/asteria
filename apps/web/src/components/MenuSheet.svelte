<script lang="ts">
  // The single menu (#130), as a compact control surface (#135): the everyday choices are tiles in
  // a 4-column grid (engraved pictogram, short label, filled when on), the points of view are
  // cards, place and time are two readout lines, and the rarer settings wait in a collapsed
  // « Plus de réglages ». Long labels and hints are not printed: a readout at the foot of the
  // sheet shows the detail of the tile focused, hovered or long-pressed (and screen readers get it
  // as the tile's description). A bottom sheet on a phone, a side panel on a wide screen. Modal: a
  // backdrop takes the outside taps (they close the menu without selecting anything), Tab stays
  // inside, Escape closes.
  import { onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import { REFERENCE_FRAMES, type ReferenceFrameId, type SkyLayers } from "@asteria/sky-renderer";
  import type { LayerKey } from "../lib/layers";
  import { readSetting, writeSetting } from "../lib/storage";
  import FramePicto from "./FramePicto.svelte";
  import Icon from "./Icon.svelte";
  import LayersPanel from "./LayersPanel.svelte";
  import MenuTile from "./MenuTile.svelte";

  let {
    mode,
    onview,
    rotation,
    northDisabled,
    onnorth,
    pointing,
    onpoint,
    frame,
    onframe,
    visiting,
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
    frame: ReferenceFrameId;
    /** A point of view other than « Visiter un astre » is chosen (closes the menu). */
    onframe: (id: ReferenceFrameId) => void;
    visiting: string | null;
    /** « Visiter un astre »: opens the selector with its bodies. */
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
    /** null: fullscreen not available (tile hidden). */
    fullscreen: boolean | null;
    onfullscreen: () => void;
    oncredits: () => void;
    /** Hides the interface (immersive mode), closing the menu. */
    onhide: () => void;
    onclose: () => void;
  } = $props();

  let sheet: HTMLElement;
  const pad = (i: number) => String(i).padStart(2, "0");
  /** Section numbers: the Earth view has one more section (points of view). */
  const n = $derived(
    mode === "space"
      ? { view: 1, pov: 2, display: 3, place: 4 }
      : { view: 1, pov: 0, display: 2, place: 3 },
  );

  /** « Plus de réglages », folded by default, remembered per device. */
  const MORE_KEY = "asteria.menu.more";
  const isBool = (v: unknown): v is boolean => typeof v === "boolean";
  let more = $state(readSetting(MORE_KEY, false, isBool));
  function toggleMore() {
    more = !more;
    writeSetting(MORE_KEY, more);
  }

  /** Detail readout: the tile focused, hovered or long-pressed. */
  type Info = { label: string; detail: string; hint?: string | undefined };
  let info = $state<Info | null>(null);
  function oninfo(tile: Info, on: boolean) {
    if (on) info = tile;
    else if (info?.detail === tile.detail) info = null;
  }

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

{#snippet needle()}
  <span class="needle" style:transform={`rotate(${rotation}deg)`}
    ><Icon name="north" size={20} /></span
  >
{/snippet}

{#snippet realisticTile()}
  <MenuTile
    id="realistic"
    icon="realistic"
    label={$_("menu.realistic.short")}
    detail={$_("space.realistic")}
    pressed={realistic}
    onclick={onrealistic}
    {oninfo}
  />
{/snippet}

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
    <button class="close" onclick={onclose} aria-label={$_("menu.close")} title={$_("menu.close")}
      >×</button
    >
  </div>
  <div class="scroll">
    <section aria-labelledby="menu-view">
      <h3 id="menu-view">{pad(n.view)} // {$_("menu.section.view")}</h3>
      <div class="grid">
        <div class="group" role="radiogroup" aria-labelledby="menu-view">
          <MenuTile
            id="view-sky"
            icon="sky"
            label={$_("menu.view.sky.short")}
            detail={$_("menu.view.sky")}
            checked={mode === "sky"}
            onclick={() => onview("sky")}
            {oninfo}
          />
          <MenuTile
            id="view-earth"
            icon="earth"
            label={$_("menu.view.earth.short")}
            detail={$_("menu.view.earth")}
            checked={mode === "space"}
            onclick={() => onview("space")}
            {oninfo}
          />
        </div>
        {#if mode === "sky"}
          <MenuTile
            id="north"
            glyph={needle}
            label={$_("menu.north.short")}
            detail={$_("compass.north")}
            disabled={northDisabled}
            onclick={onnorth}
            {oninfo}
          />
          <MenuTile
            id="pointing"
            icon="aim"
            label={$_("menu.pointing.short")}
            detail={$_("pointing.toggle")}
            pressed={pointing}
            onclick={onpoint}
            {oninfo}
          />
        {:else}
          <MenuTile
            id="recentre"
            icon="recentre"
            label={$_("menu.recentre.short")}
            detail={$_("gestures.recentre")}
            onclick={onrecentre}
            {oninfo}
          />
          {@render realisticTile()}
        {/if}
      </div>
    </section>

    {#if mode === "space"}
      <section aria-labelledby="menu-pov">
        <h3 id="menu-pov">{pad(n.pov)} // {$_("menu.section.pov")}</h3>
        <div class="grid" role="radiogroup" aria-labelledby="menu-pov">
          {#each REFERENCE_FRAMES as entry (entry.id)}
            {#snippet picto()}<FramePicto frame={entry.id} size={28} />{/snippet}
            <MenuTile
              id={`pov-${entry.id}`}
              glyph={picto}
              large
              label={$_(`frame.${entry.id}`)}
              detail={entry.id === "body" && visiting
                ? $_("frame.body.header", { values: { body: visiting } })
                : undefined}
              hint={$_(`frame.${entry.id}.hint`)}
              checked={frame === entry.id}
              disabled={!entry.available}
              haspopup={entry.id === "body"}
              onclick={() => (entry.id === "body" ? onvisit() : onframe(entry.id))}
              {oninfo}
            />
          {/each}
        </div>
      </section>
    {/if}

    <section aria-labelledby="menu-display">
      <h3 id="menu-display">{pad(n.display)} // {$_("menu.section.display")}</h3>
      <div class="grid">
        <LayersPanel view={mode} tier="main" {layers} onchange={onlayer} {unavailable} {oninfo} />
        <MenuTile
          id="night"
          icon="night"
          label={$_("night.short")}
          detail={$_("night.toggle")}
          pressed={night}
          onclick={onnight}
          {oninfo}
        />
        <MenuTile
          id="hide"
          icon="expand"
          label={$_("menu.hide.short")}
          detail={$_("hud.hide")}
          hint={$_("hud.hide.hint")}
          onclick={onhide}
          {oninfo}
        />
      </div>
    </section>

    <section aria-labelledby="menu-place">
      <h3 id="menu-place">{pad(n.place)} // {$_("menu.section.placeTime")}</h3>
      <div class="line">
        <span class="data">
          <span class="main">{placeName}</span>
          {#if locating === "idle"}
            <span class="sub">{coords}</span>
          {:else}
            <span class="sub" role="status"
              >{locating === "busy" ? $_("place.locating") : $_("place.locateError")}</span
            >
          {/if}
        </span>
        <button
          class="icon"
          onclick={onlocate}
          aria-busy={locating === "busy"}
          aria-label={$_("place.locate")}
          title={$_("place.locate")}><Icon name="locate" size={16} /></button
        >
      </div>
      <div class="line">
        <span class="data">
          <span class="main">{time}</span>
          <span class="sub">{live ? `● ${$_("time.live")}` : relative}</span>
        </span>
        <button
          class="icon"
          onclick={ontime}
          aria-label={$_("menu.setDate")}
          title={$_("menu.setDate")}><Icon name="range" size={16} /></button
        >
        <button
          class="icon"
          onclick={onnow}
          disabled={live}
          aria-label={$_("time.backToNow")}
          title={$_("time.backToNow")}><Icon name="now" size={16} /></button
        >
      </div>
    </section>

    <section class="more-section">
      <button class="more" aria-expanded={more} aria-controls="menu-more" onclick={toggleMore}>
        <span>{$_("menu.more")}</span>
        <Icon name={more ? "expand" : "collapse"} />
      </button>
      {#if more}
        <div id="menu-more" class="more-body">
          <div class="grid">
            <LayersPanel
              view={mode}
              tier="more"
              {layers}
              onchange={onlayer}
              {unavailable}
              {oninfo}
            />
            {#if mode === "sky"}{@render realisticTile()}{/if}
            {#if fullscreen !== null}
              <MenuTile
                id="fullscreen"
                icon="fullscreen"
                label={$_("menu.fullscreen.short")}
                detail={$_("fullscreen.enter")}
                pressed={fullscreen}
                onclick={onfullscreen}
                {oninfo}
              />
            {/if}
            <MenuTile
              id="credits"
              icon="help"
              label={$_("menu.credits.short")}
              detail={$_("credits.open")}
              haspopup
              onclick={oncredits}
              {oninfo}
            />
          </div>
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
          <h4 id="menu-help">{$_("menu.section.help")}</h4>
          <ul class="help" aria-labelledby="menu-help">
            <li>{$_("menu.help.tapSky")}</li>
            <li>{$_("menu.help.tapObject")}</li>
            <li>{$_("menu.help.time")}</li>
          </ul>
        </div>
      {/if}
    </section>
  </div>
  <!-- Visual only: screen readers get the same text as each tile's description. -->
  <p class="readout" aria-hidden="true">
    {#if info}
      <span class="r-label">{info.detail}</span>{#if info.hint}<span class="r-hint"
          >{info.hint}</span
        >{/if}
    {:else}
      <span class="r-idle">{$_("menu.caption.idle")}</span>
    {/if}
  </p>
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
  /* Wide screen: side panel on the right, the sky stays visible on the left; it is only as tall
     as its content (up to the screen's height). */
  @media (min-width: 720px) {
    .sheet {
      left: auto;
      top: max(16px, env(safe-area-inset-top));
      right: max(16px, env(safe-area-inset-right));
      bottom: auto;
      width: 360px;
      max-height: calc(100dvh - 2 * max(16px, env(safe-area-inset-top)));
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
  .close:focus-visible,
  .icon:focus-visible,
  .more:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  .scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 0 10px;
  }
  section {
    padding: 0 10px;
  }
  h3 {
    margin: 10px 2px 6px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  /* The tiles: four columns on a phone as on the side panel. */
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .group {
    display: contents;
  }
  .needle {
    display: grid;
    place-items: center;
    transition: transform 160ms var(--ast-ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .needle {
      transition: none;
    }
  }
  /* Place and time: two readout lines, data in monospace, actions as engraved icon buttons. */
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding-left: 4px;
    color: var(--ast-fg-muted);
  }
  .line + .line {
    border-top: 1px solid var(--ast-hairline);
  }
  .data {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    font: 500 11px/1.2 var(--ast-font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .main {
    color: var(--ast-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-size: 9px;
    color: var(--ast-fg-muted);
  }
  .icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    color: var(--ast-fg);
    background: transparent;
    border: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  .icon + .icon {
    margin-left: -4px;
  }
  .icon:disabled {
    cursor: default;
    opacity: 0.4;
  }
  /* « Plus de réglages »: a folded hairline row. */
  .more-section {
    margin-top: 10px;
  }
  .more {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 1px dashed var(--ast-hairline);
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  .more[aria-expanded="true"] {
    color: var(--ast-fg);
    border-style: solid;
    border-bottom-color: transparent;
  }
  .more-body {
    padding: 8px 0 0;
  }
  h4 {
    margin: 12px 2px 4px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .help {
    margin: 0 2px;
    padding: 0;
    list-style: none;
    font: 10px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .help li + li {
    margin-top: 4px;
  }
  /* Detail readout at the foot of the sheet. */
  .readout {
    flex: none;
    margin: 0;
    min-height: 40px;
    padding: 7px 12px 8px;
    box-sizing: border-box;
    border-top: 1px solid var(--ast-hairline);
    font: 400 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.02em;
    color: var(--ast-fg-muted);
  }
  .r-label {
    margin-right: 8px;
    color: var(--ast-fg);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .r-label::before,
  .r-idle::before {
    content: "// ";
    color: var(--ast-fg-muted);
  }
  .r-idle {
    opacity: 0.8;
  }
  .dim {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    margin-top: 6px;
    padding: 0 2px;
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  /* Fully themed slider: native tracks are white/grey, which would break night vision */
  .slider {
    appearance: none;
    width: 160px;
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
