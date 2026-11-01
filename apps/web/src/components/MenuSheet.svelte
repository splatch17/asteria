<script lang="ts">
  // The single button's sheet (#176, mock-up A′1 « Tout derrière le bouton »), over the menu in
  // panels of #138. One short sheet under the thumb: the three modes on top (Observer · Orbites ·
  // Apprendre, small engraved vignettes, the current one inverted), then the settings of the mode in
  // force: for Observer and Orbites, the four tabs (Vue, Affichage, Lieu et temps, Réglages), the
  // last one shown remembered on the device. Vue holds what is used under the sky: the search
  // field, the « Heure » row (unfolds the time line from the button), and the tiles Viser, Nuit,
  // Recentrer, Masquer (#135: an engraved pictogram over a short label, filled when on). Long
  // labels and hints are not printed: a readout shows the detail of the tile focused, hovered or
  // long-pressed (screen readers get it as the tile's description).
  // The foot of the sheet is where the button was: its first cell is the button, now « × Fermer »,
  // then the tabs, under the thumb. On a wide screen the same sheet is a panel rising from that
  // corner. Modal: a backdrop takes the outside taps (they close the sheet without selecting
  // anything), Tab stays inside, Escape closes, and so does Android back (App.svelte).
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
  import { APP_MODES, type AppMode } from "../lib/modes";
  import { LEVELS } from "../lib/level";
  import { level } from "../lib/level-store.svelte";
  import { offlinePercent, type OfflineState } from "../lib/offline";
  import { readSetting, writeSetting } from "../lib/storage";
  import FramePicto from "./FramePicto.svelte";
  import Icon from "./Icon.svelte";
  import LayersPanel from "./LayersPanel.svelte";
  import MenuTile from "./MenuTile.svelte";
  import Vignette from "./Vignette.svelte";

  let {
    mode,
    onmode,
    onsearch,
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
    title,
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
    online,
    offline,
    onofflineretry,
    iosInstall = false,
    onhide,
    onclose,
    closeButton = $bindable(),
  }: {
    /** Mode in force: its tile is inverted, its settings follow. */
    mode: AppMode;
    /** A mode chosen (the sheet closes; the same mode only closes it). */
    onmode: (mode: AppMode) => void;
    /** Opens the search (Observer). */
    onsearch: () => void;
    /** Sensor pointing on or starting. */
    pointing: boolean;
    onpoint: () => void;
    /** Orbites: the point of view shown, and the body visited (body-centred frame) or null. */
    frame: ReferenceFrameId;
    /** A point of view other than « Visiter un astre » is chosen (closes the sheet). */
    onframe: (id: ReferenceFrameId) => void;
    visiting: string | null;
    /** « Visiter un astre »: opens the selector with its bodies. */
    onvisit: () => void;
    /** Observer: the view back to the north (the compass's job when it is hidden); Orbites: reframe. */
    onrecentre: () => void;
    layers: Readonly<SkyLayers>;
    onlayer: (key: LayerKey, value: boolean) => void;
    unavailable?: readonly LayerKey[];
    /** Title of the sheet: the place (« Paris », or the coordinates of the player's own). */
    title: string;
    placeName: string;
    coords: string;
    locating: "idle" | "busy" | "error";
    onlocate: () => void;
    time: string;
    live: boolean;
    relative: string;
    /** Unfolds the time line from the button, closing the sheet. */
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
    /** The phone has a network (#146): a full or hollow dot in the settings. */
    online: boolean;
    /** Offline copy of the app (#142); « unsupported »: line hidden (development, old browser). */
    offline: OfflineState;
    /** iOS in the browser (#160): how to add the app to the home screen. */
    iosInstall?: boolean;
    onofflineretry: () => void;
    /** Hides the interface (immersive mode), closing the sheet. */
    onhide: () => void;
    onclose: () => void;
    closeButton?: HTMLButtonElement | undefined;
  } = $props();

  let sheet: HTMLElement;
  let tablist = $state<HTMLElement>();
  /** The views' own layers and settings: Orbites is the Earth view, the others the sky map. */
  const view = $derived(mode === "orbits" ? "space" : "sky");
  const tabbed = $derived(mode !== "learn");

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
    tablist?.querySelector<HTMLElement>(`[data-panel="${next}"]`)?.focus();
  }

  /** Detail readout: the tile focused, hovered or long-pressed. */
  type Info = { label: string; detail: string; hint?: string | undefined };
  let info = $state<Info | null>(null);
  function oninfo(tile: Info, on: boolean) {
    if (on) info = tile;
    else if (info?.detail === tile.detail) info = null;
  }

  // The sheet itself takes the focus (no ring drawn on a tab after a tap); Tab then reaches the
  // first mode.
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

<!-- Outside taps close the sheet and stop there (no selection behind it). -->
<div class="backdrop" aria-hidden="true" onpointerdown={onclose}></div>
<div
  class="sheet frame"
  class:compact={!tabbed}
  role="dialog"
  aria-modal="true"
  aria-labelledby="menu-title"
  tabindex="-1"
  id="main-menu"
  bind:this={sheet}
  {onkeydown}
>
  <h2 id="menu-title" class="title">
    <span class="sr-only">{$_("menu.title")} · </span>{title}
  </h2>

  <!-- The three modes (#176): a small engraved vignette over the name, the one in force inverted. -->
  <div class="modes" role="radiogroup" aria-label={$_("modes.title")}>
    {#each APP_MODES as m (m)}
      <button
        class="mode"
        role="radio"
        aria-checked={mode === m}
        data-mode={m}
        aria-describedby={`mode-hint-${m}`}
        onclick={() => onmode(m)}
      >
        <span class="art"><Vignette id={`mode-${m}`} /></span>
        <span class="mode-text">
          <span class="mode-name">{$_(`modes.${m}`)}</span>
          <span class="mode-hint" id={`mode-hint-${m}`}>{$_(`modes.${m}.hint`)}</span>
        </span>
      </button>
    {/each}
  </div>

  {#if tabbed}
    <div class="panels">
      <!-- Vue: what is used under the sky. -->
      <div
        class="panel"
        role="tabpanel"
        id="menu-panel-view"
        aria-labelledby="menu-tab-view"
        hidden={panel !== "view"}
      >
        {#if mode === "observe"}
          <!-- Looks like a field; the search itself opens over the sky (SearchPanel). -->
          <button class="field" onclick={onsearch} aria-haspopup="dialog">
            <Icon name="search" size={16} />
            <span class="field-text">{$_("menu.search.field")}</span>
            <span class="sr-only">{$_("search.open")}</span>
          </button>
        {/if}
        <button class="row" onclick={ontime} aria-label={`${$_("menu.time.row")} · ${time}`}>
          <span class="row-label">{$_("menu.time.row")}</span>
          <span class="data">
            <span class="main">{time}</span>
            <span class="sub" class:live>{live ? `● ${$_("time.live")}` : relative}</span>
          </span>
          <span class="chev" aria-hidden="true">›</span>
        </button>
        <div class="grid">
          {#if mode === "observe"}
            <MenuTile
              id="pointing"
              icon="aim"
              label={$_("menu.pointing.short")}
              detail={$_("pointing.toggle")}
              pressed={pointing}
              onclick={onpoint}
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
          <MenuTile
            id="recentre"
            icon={mode === "observe" ? "north" : "recentre"}
            label={$_("menu.recentre.short")}
            detail={mode === "observe" ? $_("menu.recentre.north") : $_("gestures.recentre")}
            onclick={onrecentre}
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
        {#if mode === "orbits"}
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
      </div>

      <!-- Affichage: every layer of the view, by section (Ciel, Système solaire, Repères). -->
      <div
        class="panel"
        role="tabpanel"
        id="menu-panel-display"
        aria-labelledby="menu-tab-display"
        hidden={panel !== "display"}
      >
        {#each sectionsFor(view) as section, i (section.id)}
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
        <!-- The app's level (#201), first: what the sheets, the games and the explanations say.
           Apprendre, « Selon la latitude » and the 3D view keep a shortcut to it. -->
        <h3 class="first" id="menu-level">{$_("settings.level")}</h3>
        <div class="levels" role="group" aria-labelledby="menu-level">
          {#each LEVELS as l (l)}
            <button aria-pressed={level.value === l} onclick={() => level.set(l)}
              >{$_(`level.${l}`)}</button
            >
          {/each}
        </div>
        <p class="note level-note">
          {$_(`settings.level.${level.value}`)}<br />{$_("settings.level.scope")}
        </p>
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
          {#if view === "sky"}<li>{$_("menu.help.compass")}</li>{/if}
        </ul>
      </div>
    </div>
  {/if}

  <!-- Visual only: screen readers get the same text as each tile's description. Shown under the
       tiles that have long names (Affichage, Réglages); Vue's are plain words. -->
  <p class="readout" aria-hidden="true" hidden={!tabbed || panel === "place" || panel === "view"}>
    {#if info}
      <span class="r-label">{info.detail}</span>{#if info.hint}<span class="r-hint"
          >{info.hint}</span
        >{/if}
    {:else}
      <span class="r-idle">{$_("menu.caption.idle")}</span>
    {/if}
  </p>

  <!-- The foot sits where the button was: « × Fermer » in its place, then the tabs. -->
  <div class="foot">
    <button
      class="close"
      bind:this={closeButton}
      onclick={onclose}
      aria-label={$_("menu.close")}
      title={$_("menu.close")}
    >
      <span class="x" aria-hidden="true">×</span>
      <span class="close-label" aria-hidden="true">{$_("modes.close")}</span>
    </button>
    {#if tabbed}
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
    {:else}
      <!-- Apprendre has its settings on its own screen: the foot says the way back instead. -->
      <p class="foot-note">{$_("modes.learn.back")}</p>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 11;
    background: color-mix(in srgb, var(--ast-bg) 35%, transparent);
  }
  /* Phone: a short sheet rising from the button's corner, under the thumb; its foot is the
     button's row. Above the Apprendre screen too (z-index 10), where the button also lives. */
  .sheet {
    --inset-l: max(var(--ast-corner-inset), env(safe-area-inset-left));
    --inset-b: max(var(--ast-corner-inset), env(safe-area-inset-bottom));
    position: fixed;
    z-index: 12;
    left: var(--inset-l);
    right: max(var(--ast-corner-inset), env(safe-area-inset-right));
    bottom: var(--inset-b);
    max-height: calc(100dvh - max(16px, env(safe-area-inset-top)) - var(--inset-b));
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--ast-bg) 94%, transparent);
    outline: none;
    transform-origin: bottom left;
    animation: rise 180ms var(--ast-ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  /* Wide screen: the same sheet as a panel rising from the corner, the sky visible beside it. */
  @media (min-width: 720px) {
    .sheet {
      right: auto;
      width: 380px;
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
  /* The place, as the map's header used to say it (« PARIS », or its coordinates). */
  .title {
    flex: none;
    margin: 0;
    padding: 10px 12px 0;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Modes: three compact tiles, a vignette beside two short lines; the one in force inverted. */
  .modes {
    flex: none;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 8px 10px 0;
    border: 1px solid var(--ast-control-border);
  }
  .mode {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-height: 74px;
    padding: 7px 4px 6px;
    border: 0;
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    text-align: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      color 120ms var(--ast-ease-out),
      background-color 120ms var(--ast-ease-out);
  }
  .mode + .mode {
    border-left: 1px solid var(--ast-control-border);
  }
  .mode[aria-checked="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .mode:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -4px;
  }
  .mode[aria-checked="true"]:focus-visible {
    outline-color: var(--ast-bg);
  }
  .art {
    display: block;
    width: 32px;
    height: 32px;
  }
  .mode-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 100%;
  }
  .mode-name {
    font: 500 10px/1.15 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .mode-hint {
    font: 400 9px/1.2 var(--ast-font-mono);
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Vue: the search field and the « Heure » row, full width, then the tiles. */
  .field,
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    margin: 0 0 6px;
    padding: 0 12px;
    border: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    text-align: left;
    cursor: pointer;
  }
  .field {
    color: var(--ast-fg-muted);
    font: 400 12px/1.2 var(--ast-font-mono);
  }
  .field-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-label {
    flex: none;
    width: 52px;
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .row .data {
    padding: 6px 0;
  }
  .row .sub.live {
    color: var(--ast-fg);
  }
  .chev {
    flex: none;
    font: 400 16px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .field:focus-visible,
  .row:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -4px;
  }
  /* The foot: the button's place (« × Fermer »), then the tabs, all on one row. */
  .foot {
    order: 10;
    flex: none;
    display: flex;
    align-items: stretch;
    height: calc(var(--ast-corner-size) - 1px);
    border-top: 1px solid var(--ast-hairline);
  }
  .compact .foot {
    margin-top: 10px;
  }
  .foot-note {
    flex: 1;
    align-self: center;
    margin: 0;
    padding: 0 12px;
    font: 400 10px/1.4 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .close {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: calc(var(--ast-corner-size) - 1px);
    padding: 0;
    border: 0;
    border-right: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .x {
    font: 400 22px/1 var(--ast-font-mono);
  }
  .close-label {
    font: 500 8px/1 var(--ast-font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tabs {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  /* A tab: engraved pictogram over a short label; the one shown is inked, with a rule on the
     side of its panel (above). */
  .tab {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
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
  .tab-label {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  .tab:focus-visible,
  .close:focus-visible,
  .icon:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  .panels {
    flex: 0 1 auto;
    min-height: 0;
    margin-top: 8px;
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
  /* Level (#201): the segmented control of Apprendre, the choice inverted. */
  .levels {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--ast-control-border);
  }
  .levels button {
    min-height: 44px;
    padding: 0 6px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--ast-fg-muted);
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    cursor: pointer;
    transition:
      color 120ms var(--ast-ease-out),
      background-color 120ms var(--ast-ease-out);
  }
  .levels button + button {
    border-left: 1px solid var(--ast-control-border);
  }
  .levels button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .levels button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -4px;
  }
  .levels button[aria-pressed="true"]:focus-visible {
    outline-color: var(--ast-bg);
  }
  .note.level-note {
    margin: 6px 4px 14px;
  }
  /* The tiles: four columns on a phone as on the side panel. */
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
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
    border: 1px solid var(--ast-control-border);
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
  /* Network light (#146, #198): a full dot when connected, a hollow one offline, in the ink of
     the palette (read without colour, and the same in red night vision). */
  .light {
    display: inline-block;
    box-sizing: border-box;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border: 1.5px solid var(--ast-fg);
    border-radius: 50%;
    vertical-align: 0;
    background: transparent;
  }
  .light.on {
    background: var(--ast-fg);
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
