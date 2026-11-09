<script lang="ts">
  // Home of the Orbites tab (menu v2, sketch A + B panel 6): the Earth view is already behind the
  // sheet (the tab switched the map). The points of view (#122, #123: a pictogram over the name,
  // the one shown inked; « Visiter un astre » opens its list of bodies), the « Heure » row (the
  // time line unfolds from the button), and the gestures in one line.
  import { _ } from "@asteria/ui";
  import { REFERENCE_FRAMES, type ReferenceFrameId } from "@asteria/sky-renderer";
  import FramePicto from "./FramePicto.svelte";
  import MenuTile from "./MenuTile.svelte";
  import SheetRow from "./SheetRow.svelte";

  let {
    frame,
    onframe,
    visiting,
    onvisit,
    time,
    live,
    relative,
    ontime,
  }: {
    /** The point of view shown, and the body visited (body-centred frame) or null. */
    frame: ReferenceFrameId;
    /** A point of view other than « Visiter un astre » chosen. */
    onframe: (id: ReferenceFrameId) => void;
    visiting: string | null;
    /** « Visiter un astre »: opens the selector with its bodies. */
    onvisit: () => void;
    time: string;
    live: boolean;
    relative: string;
    ontime: () => void;
  } = $props();

  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
</script>

<div class="home">
  <h3 id="sheet-pov">{$_("menu.section.pov")}</h3>
  <div class="grid" role="radiogroup" aria-labelledby="sheet-pov">
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
      />
    {/each}
  </div>
  <SheetRow
    id="time"
    label={$_("menu.time.row")}
    onclick={ontime}
    ariaLabel={`${$_("menu.time.row")} · ${time}`}
  >
    <span class="time">{time}</span>
    <span class="sub" class:live>{live ? `● ${$_("time.live")}` : relative}</span>
  </SheetRow>
  <SheetRow id="gestures" kind="hint">
    <span class="hint"
      ><span class="dot" aria-hidden="true"></span>{$_(
        touch ? "gestures.tip.earth.touch" : "gestures.tip.earth.mouse",
      )}</span
    >
  </SheetRow>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--sheet-gap);
  }
  h3 {
    margin: 0 2px -2px;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .time {
    display: block;
    font: 500 11px/1.3 var(--ast-font-mono);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .sub {
    display: block;
    margin-top: 2px;
    font: 500 9px/1.2 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .sub.live {
    color: var(--ast-fg);
  }
  .hint {
    display: block;
    line-height: 1.45;
  }
  .dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    margin-right: 7px;
    border-radius: 50%;
    background: var(--ast-fg-muted);
    vertical-align: 1px;
  }
</style>
