<script lang="ts">
  // Home of the Ciel tab (menu v2, sketch A + B panel 2): what is used under the sky. The search
  // field (it opens the search over the sky, #99), « Ce soir » (one line of what is worth a look
  // now, lib/sky-tonight: a tap opens the « Ce soir » page, #11), the « Heure » row (unfolds the time line
  // from the button, #176), and three tools, an engraved pictogram over a word (#135): Viser
  // (the phone drives the map, #45), Nuit (red night vision) and Masquer (hides the interface,
  // #130). In red night, the brightness slider under them.
  import { _ } from "@asteria/ui";
  import MenuTile from "./MenuTile.svelte";
  import SheetRow from "./SheetRow.svelte";

  let {
    onsearch,
    tonight,
    ontonight,
    time,
    live,
    relative,
    ontime,
    pointing,
    onpoint,
    night,
    onnight,
    brightness = $bindable(),
    minBrightness,
    onhide,
  }: {
    onsearch: () => void;
    /** « Ce soir »: its label and the sentence; a tap opens the page (#11). null while the sky loads. */
    tonight: { label: string; text: string } | null;
    ontonight: () => void;
    time: string;
    live: boolean;
    relative: string;
    ontime: () => void;
    pointing: boolean;
    onpoint: () => void;
    night: boolean;
    onnight: () => void;
    brightness: number;
    minBrightness: number;
    onhide: () => void;
  } = $props();
</script>

<div class="home">
  <SheetRow id="search" kind="field" icon="search" onclick={onsearch} haspopup>
    <span class="field-text">{$_("menu.search.field")}</span>
    <span class="sr-only">{$_("search.open")}</span>
  </SheetRow>
  {#if tonight}
    <SheetRow
      id="tonight"
      onclick={ontonight}
      haspopup
      ariaLabel={`${tonight.label} · ${tonight.text}`}
    >
      <span class="tonight"
        ><span class="dot" aria-hidden="true"></span><strong>{tonight.label}</strong> · {tonight.text}</span
      >
    </SheetRow>
  {/if}
  <SheetRow
    id="time"
    label={$_("menu.time.row")}
    onclick={ontime}
    ariaLabel={`${$_("menu.time.row")} · ${time} · ${live ? $_("time.live") : relative}`}
  >
    <span class="time">{time}</span>
    <span class="sub" class:live>{live ? `● ${$_("time.live")}` : relative}</span>
  </SheetRow>
  <div class="tools">
    <MenuTile
      id="pointing"
      icon="aim"
      label={$_("menu.pointing.short")}
      detail={$_("pointing.toggle")}
      pressed={pointing}
      onclick={onpoint}
    />
    <MenuTile
      id="night"
      icon="night"
      label={$_("night.short")}
      detail={$_("night.toggle")}
      pressed={night}
      onclick={onnight}
    />
    <MenuTile
      id="hide"
      icon="hide"
      label={$_("menu.hide.short")}
      detail={$_("hud.hide")}
      hint={$_("hud.hide.hint")}
      onclick={onhide}
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
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--sheet-gap);
  }
  .field-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tonight {
    display: block;
    font-size: var(--ast-fs-s);
    line-height: 1.4;
  }
  .tonight strong {
    font-weight: 700;
  }
  /* A small full disc: the ink's « look now » mark. */
  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 7px;
    border-radius: 50%;
    background: var(--ast-fg);
    vertical-align: 1px;
  }
  .time {
    display: block;
    font: 500 var(--ast-fs-s)/1.3 var(--ast-font-mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .sub {
    display: block;
    margin-top: 2px;
    font: 500 var(--ast-fs-xs)/1.2 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .sub.live {
    color: var(--ast-fg);
  }
  .tools {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .dim {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 0 2px;
    font: 500 var(--ast-fs-s)/1 var(--ast-font-mono);
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
