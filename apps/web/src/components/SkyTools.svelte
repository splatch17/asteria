<script lang="ts">
  // Top right of the map (menu v2, croquis-compass.jpg): a small engraved compass, always there
  // on the sky map, under the notch, 44 px, framed like the button bottom left. The needle shows
  // where north is as the map turns (the view's heading and roll); a tap turns the map to face
  // north (it replaced « Recentrer », #176). While Viser drives the map, the phone's direction is
  // an ink mark on the dial (the map follows the phone: the mark sits at the top, and the needle
  // turns as the phone does) and a tap does nothing. With the interface hidden it stays, dimmed.
  // In the Earth view (Orbites) the same place puts the point of view back (its framing): north
  // means nothing there, and the corner keeps one meaning, « remettre la vue droite ».
  // The mini-globe (#38) comes under it during a gesture only and fades 2 s after (#176).
  import type { Snippet } from "svelte";
  import { _ } from "@asteria/ui";
  import { compassHeading, compassPoint, needleRotation } from "../lib/hud";
  import Icon from "./Icon.svelte";

  let {
    view,
    shown,
    dimmed = false,
    instruments = false,
    azimuth,
    roll,
    pointing,
    phoneHeading = null,
    onnorth,
    onreframe,
    globe,
    element = $bindable(),
  }: {
    /** The sky map (compass) or the Earth view (reframe). */
    view: "sky" | "space";
    /** Something to show: the view is ready and not flying. */
    shown: boolean;
    /** The interface is hidden (immersive): the compass stays, dimmed. */
    dimmed?: boolean;
    /** A gesture moves the sky: the mini-globe comes under the compass. */
    instruments?: boolean;
    /** View heading, degrees from north through east, and roll (sensor pointing). */
    azimuth: number;
    roll: number;
    /** Sensor pointing (Viser) drives the map: the compass only reads. */
    pointing: boolean;
    /** True heading of the phone while Viser is on, or null (no magnetometer). */
    phoneHeading?: number | null;
    onnorth: () => void;
    onreframe: () => void;
    /** The mini-globe, when its layer is on. */
    globe?: Snippet;
    element?: HTMLElement | undefined;
  } = $props();

  const heading = $derived(compassHeading(azimuth));
  const rotation = $derived(needleRotation(azimuth, roll));
  /** The phone's mark on the dial, degrees clockwise from the top (0 while the map follows it). */
  const mark = $derived(phoneHeading === null ? 0 : rotation + phoneHeading);
  const values = $derived({ heading, dir: $_(`compass.dir.${compassPoint(heading)}`) });
  const north = $derived(heading === 0);
</script>

<div class="tools" class:off={!shown} class:dimmed bind:this={element}>
  {#if view === "sky"}
    <button
      class="compass frame"
      data-tool="compass"
      data-heading={heading}
      data-hud
      onclick={pointing ? undefined : onnorth}
      aria-disabled={pointing}
      class:north
      aria-label={$_(pointing ? "compass.labelPointing" : "compass.label", { values })}
      title={pointing ? $_("compass.pointing") : $_("compass.north")}
    >
      <svg viewBox="-22 -22 44 44" aria-hidden="true">
        <!-- Engraved dial: one ring at the control outline's strength. -->
        <circle r="13.5" class="ring" />
        {#if pointing}
          <!-- Viser: the phone's direction, an ink bar across the ring. -->
          <rect
            x="-1.4"
            y="-17.5"
            width="2.8"
            height="6"
            class="lubber"
            transform={`rotate(${mark})`}
          />
        {/if}
        <g class="needle" transform={`rotate(${rotation})`}>
          <!-- A kite: the north half inked, the south half drawn; N beyond its tip. -->
          <path d="M0 -12 L3.6 -1.2 L0 1.2 L-3.6 -1.2 Z" class="north-half" />
          <path d="M0 12 L3.6 -1.2 L0 1.2 L-3.6 -1.2 Z" class="south-half" />
          <text y="-17.4" class="n" text-anchor="middle" dominant-baseline="central"
            >{$_("compass.letter")}</text
          >
        </g>
      </svg>
    </button>
    {#if globe}
      <div class="globe" class:away={!instruments || dimmed}>{@render globe()}</div>
    {/if}
  {:else}
    <button
      class="compass frame"
      data-tool="reframe"
      data-hud
      onclick={onreframe}
      aria-label={$_("gestures.recentre")}
      title={$_("gestures.recentre")}
    >
      <Icon name="recentre" size={22} />
    </button>
  {/if}
</div>

<style>
  /* One axis on the right, under the notch, at the button's distance from the edges. */
  .tools {
    position: fixed;
    z-index: 3;
    top: max(var(--ast-corner-inset), env(safe-area-inset-top));
    right: max(var(--ast-corner-inset), env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 56px;
    pointer-events: none;
    transition: opacity 220ms var(--ast-ease-out);
  }
  .tools > :global(*) {
    pointer-events: auto;
  }
  .tools.off {
    display: none;
  }
  /* Interface hidden: the compass stays, faint (still a tap away). */
  .tools.dimmed {
    opacity: 0.45;
  }
  @media (prefers-reduced-motion: reduce) {
    .tools,
    .needle,
    .lubber {
      transition: none;
    }
  }
  .compass {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    color: var(--ast-fg);
    border-color: var(--ast-control-border);
    border-radius: var(--ast-radius);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .compass[aria-disabled="true"] {
    cursor: default;
  }
  .compass:focus-visible {
    outline: 2px solid var(--ast-focus);
    outline-offset: 2px;
  }
  .compass svg {
    display: block;
    width: 42px;
    height: 42px;
    overflow: visible;
  }
  .ring {
    fill: none;
    stroke: var(--ast-fg-muted);
    stroke-width: 1.2;
  }
  .compass.north .ring {
    stroke: var(--ast-fg);
  }
  .needle {
    transition: transform 120ms linear;
  }
  .north-half {
    fill: var(--ast-fg);
  }
  .south-half {
    fill: none;
    stroke: var(--ast-fg);
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .lubber {
    fill: var(--ast-fg);
  }
  .n {
    font: 700 6.5px var(--ast-font-mono); /* a glyph of the icon, not text to read */
    fill: var(--ast-fg);
  }
  @media (hover: hover) {
    .compass:not([aria-disabled="true"]):hover .ring {
      stroke: var(--ast-fg);
    }
  }
  /* The mini-globe under the compass, during a gesture only: it leaves slowly (#176), it fades,
     it does not blink away. */
  .globe {
    transition: opacity 220ms var(--ast-ease-out);
  }
  .globe.away {
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 600ms var(--ast-ease-out),
      visibility 0s 600ms;
  }
  @media (prefers-reduced-motion: reduce) {
    .globe,
    .globe.away {
      transition: none;
    }
  }
</style>
