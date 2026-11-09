<script lang="ts">
  // The settings page of the sheet (menu v2, sketch A + B, panels 7 and 8): behind ⚙, apart from
  // the destinations, in three parts picked by a segmented control (Affichage · Lieu et temps ·
  // Appli), the last one remembered. Affichage: every layer of the view, by section (#54, #138).
  // Lieu et temps: the place and the time, data in monospace, actions as engraved icon buttons.
  // Appli: the level (#201), the rarer settings, the network, the offline copy, the credits and a
  // short help. Long labels are not printed on the tiles: a readout shows the detail of the tile
  // focused, hovered or long-pressed (screen readers get it as the tile's description, #135).
  import { tick } from "svelte";
  import { _ } from "@asteria/ui";
  import type { SkyLayers } from "@asteria/sky-renderer";
  import { sectionsFor, type LayerKey } from "../lib/layers";
  import { LEVELS } from "../lib/level";
  import { level } from "../lib/level-store.svelte";
  import { TEXT_SIZES } from "../lib/text-size";
  import { textSize } from "../lib/text-size-store.svelte";
  import {
    LEGACY_PANEL_KEY,
    SETTINGS_PARTS,
    SETTINGS_PART_KEY,
    initialSettingsPart,
    itemForKey,
    type SettingsPart,
  } from "../lib/modes";
  import { offlinePercent, type OfflineState } from "../lib/offline";
  import { readSetting, writeSetting } from "../lib/storage";
  import Icon from "./Icon.svelte";
  import LayersPanel from "./LayersPanel.svelte";
  import MenuTile from "./MenuTile.svelte";

  let {
    view,
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
    realistic,
    onrealistic,
    fullscreen,
    onfullscreen,
    oncredits,
    online,
    offline,
    iosInstall = false,
    onofflineretry,
  }: {
    /** The map's view: its own layers (the sky map, or the Earth view). */
    view: "sky" | "space";
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
    /** Unfolds the time line from the button, closing the sheet. */
    ontime: () => void;
    onnow: () => void;
    realistic: boolean;
    onrealistic: () => void;
    /** null: fullscreen not available (tile hidden). */
    fullscreen: boolean | null;
    onfullscreen: () => void;
    oncredits: () => void;
    /** The phone has a network (#146): a full or hollow dot. */
    online: boolean;
    /** Offline copy of the app (#142); « unsupported »: line hidden (development, old browser). */
    offline: OfflineState;
    /** iOS in the browser (#160): how to add the app to the home screen. */
    iosInstall?: boolean;
    onofflineretry: () => void;
  } = $props();

  /** The part shown: the last one, remembered (before menu v2, the last tab of the sheet). */
  const anything = (v: unknown): v is unknown => v !== undefined;
  let part = $state<SettingsPart>(
    initialSettingsPart(
      readSetting<unknown>(SETTINGS_PART_KEY, null, anything),
      readSetting<unknown>(LEGACY_PANEL_KEY, null, anything),
    ),
  );
  let segments = $state<HTMLElement>();
  function show(id: SettingsPart) {
    if (id === part) return;
    part = id;
    info = null;
    writeSetting(SETTINGS_PART_KEY, id);
  }
  async function onsegkey(e: KeyboardEvent) {
    const next = itemForKey(SETTINGS_PARTS, part, e.key);
    if (!next) return;
    e.preventDefault();
    show(next);
    await tick();
    segments?.querySelector<HTMLElement>(`[data-part="${next}"]`)?.focus();
  }

  /** Detail readout: the tile focused, hovered or long-pressed. */
  type Info = { label: string; detail: string; hint?: string | undefined };
  let info = $state<Info | null>(null);
  function oninfo(tile: Info, on: boolean) {
    if (on) info = tile;
    else if (info?.detail === tile.detail) info = null;
  }
</script>

<div class="segments" role="tablist" aria-label={$_("settings.parts")} bind:this={segments}>
  {#each SETTINGS_PARTS as id (id)}
    <button
      role="tab"
      id={`settings-tab-${id}`}
      data-part={id}
      aria-selected={part === id}
      aria-controls={`settings-part-${id}`}
      tabindex={part === id ? 0 : -1}
      onclick={() => show(id)}
      onkeydown={onsegkey}>{$_(`settings.part.${id}`)}</button
    >
  {/each}
</div>

<div class="parts">
  <div
    class="part"
    role="tabpanel"
    id="settings-part-display"
    aria-labelledby="settings-tab-display"
    hidden={part !== "display"}
  >
    {#each sectionsFor(view) as section, i (section.id)}
      <h3 id={`menu-layers-${section.id}`} class:first={i === 0}>
        {$_(`layers.section.${section.id}`)}
      </h3>
      <div class="grid" role="group" aria-labelledby={`menu-layers-${section.id}`}>
        <LayersPanel entries={section.entries} {layers} onchange={onlayer} {unavailable} {oninfo} />
      </div>
    {/each}
  </div>

  <div
    class="part"
    role="tabpanel"
    id="settings-part-place"
    aria-labelledby="settings-tab-place"
    hidden={part !== "place"}
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

  <div
    class="part"
    role="tabpanel"
    id="settings-part-app"
    aria-labelledby="settings-tab-app"
    hidden={part !== "app"}
  >
    <!-- The app's level (#201), first: what the sheets, the games and the explanations say.
         The Jeux tab, « Selon la latitude » and the 3D view keep a shortcut to it. -->
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
    <!-- Text size (audit P5): the small steps of the type scale and the names on the maps. -->
    <h3 id="menu-text-size">{$_("settings.textSize")}</h3>
    <div class="levels text-sizes" role="group" aria-labelledby="menu-text-size">
      {#each TEXT_SIZES as size (size)}
        <button
          data-text-size={size}
          aria-pressed={textSize.value === size}
          onclick={() => textSize.set(size)}>{$_(`settings.textSize.${size}`)}</button
        >
      {/each}
    </div>
    <p class="note level-note">{$_("settings.textSize.note")}</p>
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

<!-- Visual only: screen readers get the same text as each tile's description. -->
<p class="readout" aria-hidden="true" hidden={part === "place"}>
  {#if info}
    <span class="r-label">{info.detail}</span>{#if info.hint}<span class="r-hint">{info.hint}</span
      >{/if}
  {:else}
    <span class="r-idle">{$_("menu.caption.idle")}</span>
  {/if}
</p>

<style>
  /* The three parts: a segmented control across the width, the part shown inverted. */
  .segments {
    flex: none;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0 var(--sheet-pad) 0;
    border: 1px solid var(--ast-control-border);
  }
  .segments button,
  .levels button {
    min-height: 40px;
    padding: 0 4px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--ast-fg-muted);
    font: 500 var(--ast-fs-s)/1.15 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      color 120ms var(--ast-ease-out),
      background-color 120ms var(--ast-ease-out);
  }
  /* « Découverte » in a third of the sheet, whatever the text size. */
  .levels button {
    min-height: 44px;
    font-size: min(var(--ast-fs-s), 4vw);
    letter-spacing: 0.04em;
  }
  .segments button + button,
  .levels button + button {
    border-left: 1px solid var(--ast-control-border);
  }
  .segments button[aria-selected="true"],
  .levels button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .segments button:focus-visible,
  .levels button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -4px;
  }
  .segments button[aria-selected="true"]:focus-visible,
  .levels button[aria-pressed="true"]:focus-visible {
    outline-color: var(--ast-bg);
  }
  @media (prefers-reduced-motion: reduce) {
    .segments button,
    .levels button,
    .part {
      animation: none;
      transition: none;
    }
  }
  .parts {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .part {
    padding: 12px var(--sheet-pad) 14px;
    animation: appear 140ms var(--ast-ease-out);
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  .part[hidden] {
    display: none;
  }
  h3 {
    margin: 14px 2px 6px;
    font: 500 var(--ast-fs-s)/1.4 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  h3.first {
    margin-top: 0;
  }
  .levels {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--ast-control-border);
  }
  .note.level-note {
    margin: 6px 4px 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
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
    font: 500 var(--ast-fs-s)/1.2 var(--ast-font-mono);
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
    font-size: var(--ast-fs-xs);
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
  .icon:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  .network {
    margin-top: 12px;
  }
  /* Network light (#146, #198): a full dot when connected, a hollow one offline. */
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
    font: var(--ast-fs-s)/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .help {
    margin: 0 2px;
    padding: 0;
    list-style: none;
    font: var(--ast-fs-s)/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .help li + li {
    margin-top: 4px;
  }
  /* Detail readout of the tiles: two lines reserved, the sheet does not jump. */
  .readout {
    flex: none;
    margin: 0;
    min-height: 44px;
    padding: 7px 12px 8px;
    box-sizing: border-box;
    border-top: 1px solid var(--ast-hairline);
    font: 400 var(--ast-fs-s)/1.4 var(--ast-font-mono);
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
</style>
