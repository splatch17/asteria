<script lang="ts">
  // Instruments of the sky map, top right (#138): the search, the mini-globe (#38) and a small
  // engraved compass, stacked on one axis under the safe area. With a phone compass, it is a real
  // one (#144): the needle points to true north as the phone turns; otherwise it follows the
  // view's heading. Either way a tap turns the view to face north. Only on the sky map; faded out in immersive
  // mode like the rest of the interface. The mini-globe is passed in (it keeps its own state).
  import type { Snippet } from "svelte";
  import { _ } from "@asteria/ui";
  import { compassHeading, compassPoint, needleRotation } from "../lib/hud";
  import Icon from "./Icon.svelte";

  let {
    shown,
    hidden = false,
    searchOpen,
    onsearch,
    searchButton = $bindable(),
    azimuth,
    roll,
    phoneHeading = null,
    northDisabled,
    onnorth,
    globe,
    element = $bindable(),
  }: {
    /** Sky map at rest (not the Earth view, not flying). */
    shown: boolean;
    /** Immersive mode: faded out and out of the way. */
    hidden?: boolean;
    searchOpen: boolean;
    onsearch: () => void;
    searchButton?: HTMLButtonElement | undefined;
    /** View heading, degrees from north through east, and roll (sensor pointing). */
    azimuth: number;
    roll: number;
    /** True heading of the phone (magnetometer + declination), or null without a compass. */
    phoneHeading?: number | null;
    /** Sensor pointing drives the view: the compass only reads. */
    northDisabled: boolean;
    onnorth: () => void;
    /** The mini-globe, when its layer is on. */
    globe?: Snippet;
    element?: HTMLElement | undefined;
  } = $props();

  const real = $derived(phoneHeading !== null);
  const heading = $derived(compassHeading(phoneHeading ?? azimuth));
  const rotation = $derived(
    phoneHeading !== null ? needleRotation(phoneHeading) : needleRotation(azimuth, roll),
  );
  const values = $derived({ heading, dir: $_(`compass.dir.${compassPoint(heading)}`) });
</script>

<div class="tools" class:hidden class:off={!shown} bind:this={element}>
  <button
    class="round"
    bind:this={searchButton}
    onclick={onsearch}
    aria-haspopup="dialog"
    aria-expanded={searchOpen}
    aria-label={$_("search.open")}
    title={$_("search.open")}
  >
    <Icon name="search" size={18} />
  </button>
  {@render globe?.()}
  <button
    class="round compass"
    data-heading={heading}
    onclick={onnorth}
    disabled={northDisabled}
    class:real
    aria-label={$_(
      northDisabled ? "compass.labelPointing" : real ? "compass.labelPhone" : "compass.label",
      { values },
    )}
    title={northDisabled ? $_("compass.pointing") : $_("compass.north")}
  >
    <svg viewBox="-20 -20 40 40" aria-hidden="true">
      <!-- Engraved dial: a hairline ring and eight ticks, the cardinal ones longer. -->
      <circle r="17" class="ring" />
      <g transform={`rotate(${rotation})`}>
        {#each [45, 90, 135, 180, 225, 270, 315] as a (a)}
          <path
            d={a % 90 === 0 ? "M0 -17 V-14" : "M0 -17 V-15.5"}
            class="tick"
            transform={`rotate(${a})`}
          />
        {/each}
        <path d="M0 -10.5 L3 0 L-3 0 Z" class="north" />
        <path d="M0 10.5 L3 0 L-3 0 Z" class="south" />
        <text y="-13.9" class="n" text-anchor="middle" dominant-baseline="central"
          >{$_("compass.letter")}</text
        >
      </g>
      {#if real}
        <!-- Lubber line: the phone's own direction, fixed at the top of the dial. -->
        <path d="M0 -20 L1.6 -17.4 L-1.6 -17.4 Z" class="lubber" />
      {/if}
      <circle r="1.2" class="pivot" />
    </svg>
  </button>
</div>

<style>
  /* One axis on the right: the mini-globe (56 px) sets its width; the round buttons are centred. */
  .tools {
    position: fixed;
    z-index: 2;
    top: max(16px, env(safe-area-inset-top));
    right: max(16px, env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 56px;
    transition: opacity 220ms var(--ast-ease-out);
  }
  .tools.off {
    display: none;
  }
  .tools.hidden {
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 220ms var(--ast-ease-out),
      visibility 0s 220ms;
  }
  @media (prefers-reduced-motion: reduce) {
    .tools,
    .tools.hidden {
      transition: none;
    }
  }
  .round {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    color: var(--ast-fg);
    background: color-mix(in srgb, var(--ast-bg) 55%, transparent);
    border: 1px solid var(--ast-hairline);
    border-radius: 50%;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .round:hover:not(:disabled) {
    border-color: var(--ast-fg-muted);
  }
  .round:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .round[aria-expanded="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  /* The compass has its own ring: the button's border stays off. */
  .compass {
    border-color: transparent;
  }
  .compass:disabled {
    cursor: default;
  }
  .compass svg {
    display: block;
    width: 44px;
    height: 44px;
  }
  .ring {
    fill: none;
    stroke: var(--ast-hairline);
    stroke-width: 1;
  }
  /* A live compass: a firmer ring, and the lubber line. */
  .compass.real .ring {
    stroke: var(--ast-fg-muted);
  }
  .lubber {
    fill: var(--ast-fg);
  }
  .compass:hover:not(:disabled) .ring {
    stroke: var(--ast-fg-muted);
  }
  .tick {
    stroke: var(--ast-fg-muted);
    stroke-width: 1;
  }
  .north {
    fill: var(--ast-fg);
  }
  .south {
    fill: none;
    stroke: var(--ast-fg-muted);
    stroke-width: 0.8;
  }
  .pivot {
    fill: var(--ast-bg);
    stroke: var(--ast-fg);
    stroke-width: 0.8;
  }
  .n {
    font: 700 5.5px var(--ast-font-mono);
    fill: var(--ast-fg);
  }
</style>
