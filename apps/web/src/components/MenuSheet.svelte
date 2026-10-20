<script lang="ts">
  // The single menu (#130) as separate panels (#138): a row of four tabs (Vue, Affichage, Lieu et
  // temps, Réglages) shows one short panel at a time, remembered on the device. The choices are
  // tiles (#135): an engraved pictogram over a short label, filled when on. Long labels and hints
  // are not printed: a readout shows the detail of the tile focused, hovered or long-pressed (and
  // screen readers get it as the tile's description).
  // A bottom sheet on a phone, whose tabs sit at the bottom, under the thumb and where the menu
  // button was, so that they do not move when the panel's height changes; a side panel on a wide
  // screen, tabs at the top. Modal: a backdrop takes the outside taps (they close the menu without
  // selecting anything), Tab stays inside, Escape closes.
  import { onMount, tick } from "svelte";
  import { _ } from "@asteria/ui";
  import { REFERENCE_FRAMES, type ReferenceFrameId, type SkyLayers } from "@asteria/sky-renderer";
  import { sectionsFor, type LayerKey } from "../lib/layers";
  import {
    MENU_PANELS,
    MENU_PANEL_ICONS,
    MENU_PANEL_KEY,
    isMenuPanel,
    tabForKey,
    type MenuPanel,
  } from "../lib/menu";
  import { offlinePercent, type OfflineState } from "../lib/offline";
  import { readSetting, writeSetting } from "../lib/storage";
  import FramePicto from "./FramePicto.svelte";
  import Icon from "./Icon.svelte";
  import LayersPanel from "./LayersPanel.svelte";
  import MenuTile from "./MenuTile.svelte";

  let {
    mode,
    onview,
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
    ongames,
    online,
    offline,
    onofflineretry,
    iosInstall = false,
    onhide,
    onclose,
  }: {
    mode: "sky" | "space";
    /** Switches between the sky map and the Earth view. */
    onview: (mode: "sky" | "space") => void;
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
    /** Opens the Jeux screen (#163). */
    ongames: () => void;
    /** Offline copy of the app (#142); « unsupported »: line hidden (development, old browser). */
    /** The phone has a network (#146): a green or red light in the settings. */
    online: boolean;
    offline: OfflineState;
    /** iOS in the browser (#160): how to add the app to the home screen. */
    iosInstall?: boolean;
    onofflineretry: () => void;
    /** Hides the interface (immersive mode), closing the menu. */
    onhide: () => void;
    onclose: () => void;
  } = $props();

  let sheet: HTMLElement;
  let tablist: HTMLElement;

  /** Panel shown: the last one, remembered on the device (Vue the first time). */
  let panel = $state<MenuPanel>(readSetting(MENU_PANEL_KEY, "view", isMenuPanel));
  function show(id: MenuPanel) {
    if (id === panel) return;
    panel = id;
    info = null;
    writeSetting(MENU_PANEL_KEY, id);
  }
  /** Arrow keys, Home and End move between the tabs and show their panel (automatic activation). */
  async function ontabkey(e: KeyboardEvent) {
    const next = tabForKey(panel, e.key);
    if (!next) return;
    e.preventDefault();
    show(next);
    await tick();
    tablist.querySelector<HTMLElement>(`[data-panel="${next}"]`)?.focus();
  }

  /** Detail readout: the tile focused, hovered or long-pressed. */
  type Info = { label: string; detail: string; hint?: string | undefined };
  let info = $state<Info | null>(null);
  function oninfo(tile: Info, on: boolean) {
    if (on) info = tile;
    else if (info?.detail === tile.detail) info = null;
  }

  // The sheet itself takes the focus (no ring drawn on a tab after a tap); Tab then reaches the
  // tab shown first.
  onMount(() => {
    sheet.focus({ preventScroll: true });
  });

  /** Escape closes; Tab cycles inside the sheet (modal), over what is reachable by Tab. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [
      ...sheet.querySelectorAll<HTMLElement>(
        'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled)',
      ),
    ].filter((el) => !el.closest("[hidden]"));
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
  <h2 id="menu-title" class="sr-only">{$_("menu.title")}</h2>
  <div class="head">
    <div class="tabs" role="tablist" aria-label={$_("menu.tabs")} bind:this={tablist}>
      {#each MENU_PANELS as id (id)}
        <button
          class="tab"
          role="tab"
          id={`menu-tab-${id}`}
          data-panel={id}
          aria-selected={panel === id}
          aria-controls={`menu-panel-${id}`}
          tabindex={panel === id ? 0 : -1}
          onclick={() => show(id)}
          onkeydown={ontabkey}
        >
          <Icon name={MENU_PANEL_ICONS[id]} size={18} />
          <span class="tab-label">{$_(`menu.section.${id === "place" ? "placeTime" : id}`)}</span>
        </button>
      {/each}
    </div>
    <button class="close" onclick={onclose} aria-label={$_("menu.close")} title={$_("menu.close")}
      >×</button
    >
  </div>

  <div class="panels">
    <!-- Vue: the view, how it is driven, night vision. -->
    <div
      class="panel"
      role="tabpanel"
      id="menu-panel-view"
      aria-labelledby="menu-tab-view"
      hidden={panel !== "view"}
    >
      <div class="grid">
        <div class="group" role="radiogroup" aria-label={$_("menu.section.view")}>
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
        {/if}
        <MenuTile
          id="night"
          icon="night"
          label={$_("night.short")}
          detail={$_("night.toggle")}
          pressed={night}
          onclick={onnight}
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
      {#if mode === "space"}
        <h3 id="menu-pov">{$_("menu.section.pov")}</h3>
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
      {/if}
      <!-- Apprendre (#163): the games open over the whole app. -->
      <h3 id="menu-learn">{$_("menu.section.learn")}</h3>
      <div class="grid" role="group" aria-labelledby="menu-learn">
        <MenuTile
          id="games"
          icon="games"
          label={$_("menu.games.short")}
          detail={$_("menu.games")}
          haspopup
          onclick={ongames}
          {oninfo}
        />
      </div>
    </div>

    <!-- Affichage: every layer of the view, by section (Ciel, Système solaire, Repères). -->
    <div
      class="panel"
      role="tabpanel"
      id="menu-panel-display"
      aria-labelledby="menu-tab-display"
      hidden={panel !== "display"}
    >
      {#each sectionsFor(mode) as section, i (section.id)}
        <h3 id={`menu-layers-${section.id}`} class:first={i === 0}>
          {$_(`layers.section.${section.id}`)}
        </h3>
        <div class="grid" role="group" aria-labelledby={`menu-layers-${section.id}`}>
          <LayersPanel
            entries={section.entries}
            {layers}
            onchange={onlayer}
            {unavailable}
            {oninfo}
          />
        </div>
      {/each}
    </div>

    <!-- Lieu et temps: two readout lines, data in monospace, actions as engraved icon buttons. -->
    <div
      class="panel"
      role="tabpanel"
      id="menu-panel-place"
      aria-labelledby="menu-tab-place"
      hidden={panel !== "place"}
    >
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
      <p class="note">{$_("menu.help.time")}</p>
    </div>

    <!-- Réglages: the rarer settings, the credits and a short help. -->
    <div
      class="panel"
      role="tabpanel"
      id="menu-panel-settings"
      aria-labelledby="menu-tab-settings"
      hidden={panel !== "settings"}
    >
      <div class="grid">
        <MenuTile
          id="realistic"
          icon="realistic"
          label={$_("menu.realistic.short")}
          detail={$_("space.realistic")}
          pressed={realistic}
          onclick={onrealistic}
          {oninfo}
        />
        <MenuTile
          id="hide"
          icon="hide"
          label={$_("menu.hide.short")}
          detail={$_("hud.hide")}
          hint={$_("hud.hide.hint")}
          onclick={onhide}
          {oninfo}
        />
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
      <div class="line network">
        <span class="data">
          <span class="main">{$_("network.title")}</span>
          <span class="sub" role="status">
            <span class="light" class:on={online} aria-hidden="true"></span>
            {online ? $_("network.online") : $_("network.offline")}
          </span>
        </span>
      </div>
      {#if iosInstall}
        <div class="line install">
          <span class="data">
            <span class="main">{$_("install.title")}</span>
            <span class="sub">{$_("install.ios")}</span>
          </span>
        </div>
      {/if}
      {#if offline.state !== "unsupported"}
        <div class="line offline">
          <span class="data">
            <span class="main">{$_("offline.title")}</span>
            <span class="sub" role="status" class:ok={offline.state === "ready"}>
              {#if offline.state === "ready"}
                {$_("offline.ready", { values: { size: Math.round(offline.bytes / 1e6) } })}
              {:else if offline.state === "downloading" && offline.total > 0}
                {$_("offline.downloading", {
                  values: { percent: offlinePercent(offline.done, offline.total) },
                })}
              {:else if offline.state === "error"}
                {$_("offline.error")}
              {:else}
                {$_("offline.idle")}
              {/if}
            </span>
          </span>
          {#if offline.state === "error"}
            <button
              class="icon"
              onclick={onofflineretry}
              aria-label={$_("offline.retry")}
              title={$_("offline.retry")}><Icon name="now" size={16} /></button
            >
          {/if}
        </div>
        <p class="note">{$_("offline.note")}</p>
      {/if}
      <h3 id="menu-help">{$_("menu.section.help")}</h3>
      <ul class="help" aria-labelledby="menu-help">
        <li>{$_("menu.help.tapSky")}</li>
        <li>{$_("menu.help.tapObject")}</li>
        {#if mode === "sky"}<li>{$_("menu.help.compass")}</li>{/if}
      </ul>
    </div>
  </div>

  <!-- Visual only: screen readers get the same text as each tile's description. No tiles in
       « Lieu et temps », so no readout there. -->
  <p class="readout" aria-hidden="true" hidden={panel === "place"}>
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
  /* Phone: bottom sheet over the time line, under the safe areas; the tabs at its foot. */
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
  .panels {
    order: 1;
  }
  .readout {
    order: 2;
  }
  .head {
    order: 3;
    border-top: 1px solid var(--ast-hairline);
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
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  /* Wide screen: side panel on the right, tabs at the top, the sky stays visible on the left; it
     is only as tall as its content (up to the screen's height). */
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
    .head {
      order: 0;
      border-top: 0;
      border-bottom: 1px solid var(--ast-hairline);
    }
    .backdrop {
      background: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .panel {
      animation: none;
    }
  }
  .head {
    display: flex;
    align-items: stretch;
    flex: none;
  }
  .tabs {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  /* A tab: engraved pictogram over a short label; the one shown is inked, with a rule on the
     side of its panel (above on a phone, below on a wide screen). */
  .tab {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 52px;
    padding: 6px 2px 5px;
    border: 0;
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg-muted);
    font: 500 9px/1.15 var(--ast-font-mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-align: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .tab + .tab {
    border-left: 1px solid var(--ast-hairline);
  }
  .tab:hover {
    color: var(--ast-fg);
  }
  .tab[aria-selected="true"] {
    color: var(--ast-fg);
    background: color-mix(in srgb, var(--ast-fg) 12%, transparent);
  }
  .tab[aria-selected="true"]::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: -1px;
    height: 2px;
    background: var(--ast-fg);
  }
  @media (min-width: 720px) {
    .tab[aria-selected="true"]::after {
      top: auto;
      bottom: -1px;
    }
  }
  .tab-label {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .close {
    flex: none;
    width: 44px;
    border: 0;
    border-left: 1px solid var(--ast-hairline);
    background: transparent;
    color: var(--ast-fg);
    font: 400 20px/1 var(--ast-font-mono);
    cursor: pointer;
  }
  .tab:focus-visible,
  .close:focus-visible,
  .icon:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  .panels {
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .panel {
    padding: 10px 10px 12px;
    animation: appear 140ms var(--ast-ease-out);
  }
  .panel[hidden] {
    display: none;
  }
  h3 {
    margin: 12px 2px 6px;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  h3.first {
    margin-top: 0;
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
  /* Place and time: two readout lines. */
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding-left: 4px;
    color: var(--ast-fg-muted);
  }
  .line + .line {
    margin-top: 8px;
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
  .icon:disabled {
    cursor: default;
    opacity: 0.4;
  }
  .network {
    margin-top: 12px;
  }
  /* Network light (#146): green when connected, red offline — a signal, outside the palette. */
  .light {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 5px;
    border-radius: 50%;
    vertical-align: 0;
    background: #ff5a4f;
    box-shadow: 0 0 6px #ff5a4f;
  }
  .light.on {
    background: #5fd47a;
    box-shadow: 0 0 6px #5fd47a;
  }
  .sub.ok {
    color: var(--ast-fg);
  }
  .note {
    margin: 12px 4px 0;
    font: 10px/1.5 var(--ast-font-mono);
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
  /* Detail readout of the tiles. */
  .readout {
    flex: none;
    margin: 0;
    /* Two lines reserved: the sheet does not jump when a hint wraps. */
    min-height: 44px;
    padding: 7px 12px 8px;
    box-sizing: border-box;
    border-top: 1px solid var(--ast-hairline);
    font: 400 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.02em;
    color: var(--ast-fg-muted);
  }
  .readout[hidden] {
    display: none;
  }
  .r-label {
    margin-right: 8px;
    color: var(--ast-fg);
    letter-spacing: 0.08em;
    text-transform: uppercase;
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
