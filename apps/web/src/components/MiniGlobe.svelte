<script lang="ts">
  // Mini-globe of the sky view (#38): the Earth centred on the observer, with the terminator of
  // the displayed date; a tap flies to the Earth view (#37). Drawn on demand by MiniGlobe. Laid
  // out by SkyTools, between the search and the compass (#138).
  import { onDestroy, onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import { unitVector, type Vec3 } from "@asteria/astro-core";
  import {
    MiniGlobe,
    sunEarthFixed,
    type MiniGlobeImages,
    type MiniGlobeTheme,
    type SpaceStyle,
  } from "@asteria/sky-renderer";

  /** Diameter, CSS px. */
  const SIZE = 56;

  let {
    images,
    place,
    sun,
    date,
    style,
    theme,
    monochrome,
    onopen,
    hidden = false,
    element = $bindable(),
  }: {
    images: MiniGlobeImages | null;
    place: { latitude: number; longitude: number };
    /** Sun, astrometric J2000 (degrees). */
    sun: { ra: number; dec: number };
    date: Date;
    style: SpaceStyle;
    theme: MiniGlobeTheme;
    monochrome: boolean;
    onopen: () => void;
    /** Hidden (Earth view, flights): not drawn, but kept with its sampled textures. */
    hidden?: boolean;
    element?: HTMLElement | undefined;
  } = $props();

  let canvas: HTMLCanvasElement;
  let globe = $state<MiniGlobe>();
  const sunDir: Vec3 = [1, 0, 0];

  onMount(() => {
    globe = new MiniGlobe({ canvas, size: SIZE, theme, style, monochrome });
  });
  onDestroy(() => globe?.dispose());

  $effect(() => {
    if (globe && images) globe.setImages(images);
  });
  $effect(() => {
    globe?.setObserver(place.latitude, place.longitude);
  });
  $effect(() => {
    if (!globe || hidden) return;
    sunEarthFixed(unitVector(sun.ra, sun.dec), date, sunDir);
    globe.setSun(sunDir);
  });
  $effect(() => {
    globe?.setStyle(style);
  });
  $effect(() => {
    globe?.setTheme({ ink: theme.ink, base: theme.base }, monochrome);
  });
</script>

<button
  class="globe"
  {hidden}
  style:--size={`${SIZE}px`}
  bind:this={element}
  onclick={onopen}
  aria-label={$_("space.toggleToEarth")}
  title={$_("space.toggleToEarth")}
>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
</button>

<style>
  .globe {
    width: var(--size);
    height: var(--size);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }
  .globe[hidden] {
    display: none;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
