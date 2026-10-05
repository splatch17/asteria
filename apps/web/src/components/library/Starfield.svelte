<script lang="ts" module>
  // Ambient starfield of the library (#91): three layers of 1-bit "pixel" stars that drift slowly
  // and move at different speeds when the page scrolls (parallax), plus a few twinkling sparkles.
  // Each layer is a tiled mask over the ink colour, so it follows the theme (night red too).
  // Only transforms and opacity are animated: composited, no repaint per frame.

  interface Layer {
    /** Tile size, CSS px. */
    tile: number;
    count: number;
    /** Largest star, in tile pixels. */
    dot: number;
    /** Parallax factor (fraction of the scroll). */
    depth: number;
    /** Seconds for one tile of drift. */
    drift: number;
    opacity: number;
  }

  const LAYERS: Layer[] = [
    { tile: 240, count: 46, dot: 1, depth: 0.08, drift: 160, opacity: 0.35 },
    { tile: 330, count: 22, dot: 2, depth: 0.2, drift: 110, opacity: 0.55 },
    { tile: 470, count: 8, dot: 2, depth: 0.38, drift: 80, opacity: 0.85 },
  ];

  /** Seeded pseudo-random numbers (mulberry32): the same sky at every opening. */
  function random(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** One mask tile per layer, drawn once per page load (a few hundred squares in all). */
  let tiles: string[] | null = null;
  function makeTiles(): string[] {
    if (tiles) return tiles;
    tiles = LAYERS.map((layer, i) => {
      const c = document.createElement("canvas");
      c.width = c.height = layer.tile;
      const ctx = c.getContext("2d");
      if (!ctx) return "";
      const rnd = random(1609 + i * 97);
      ctx.fillStyle = "#000";
      for (let k = 0; k < layer.count; k++) {
        const x = Math.floor(rnd() * layer.tile);
        const y = Math.floor(rnd() * layer.tile);
        const s = rnd() < 0.25 ? layer.dot : 1;
        ctx.fillRect(x, y, s, s);
        // The biggest ones get a 1-px cross, like an engraved star.
        if (s > 1 && rnd() < 0.5) {
          ctx.fillRect(x - 1, y + s / 2 - 0.5, s + 2, 1);
          ctx.fillRect(x + s / 2 - 0.5, y - 1, 1, s + 2);
        }
      }
      return c.toDataURL();
    });
    return tiles;
  }

  /** Twinkling sparkles: position (% of the screen), radius (px), delay (s). */
  const SPARKLES = [
    { x: 14, y: 18, r: 5, d: 0 },
    { x: 82, y: 9, r: 4, d: 1.7 },
    { x: 67, y: 41, r: 6, d: 3.1 },
    { x: 8, y: 63, r: 4, d: 0.9 },
    { x: 91, y: 72, r: 5, d: 2.4 },
    { x: 38, y: 88, r: 4, d: 4.2 },
  ];
  const sparkle = (r: number) => {
    const k = r * 0.22;
    return `M0 ${-r} L${k} ${-k} L${r} 0 L${k} ${k} L0 ${r} L${-k} ${k} L${-r} 0 L${-k} ${-k} Z`;
  };
</script>

<script lang="ts">
  import { onMount } from "svelte";

  /** Scroll offset of the page above (px), for the parallax. */
  let { scroll = 0 }: { scroll?: number } = $props();
  let masks = $state<string[]>([]);
  onMount(() => {
    masks = makeTiles();
  });
</script>

<div class="field" aria-hidden="true">
  <!-- A band of dithered "milky way", engraved across the page. -->
  <div class="band"></div>
  {#each LAYERS as layer, i (i)}
    {#if masks[i]}
      <div
        class="layer"
        style:--tile={`${layer.tile}px`}
        style:transform={`translate3d(0, ${-((scroll * layer.depth) % layer.tile)}px, 0)`}
      >
        <div
          class="stars"
          style:mask-image={`url(${masks[i]})`}
          style:-webkit-mask-image={`url(${masks[i]})`}
          style:opacity={layer.opacity}
          style:animation-duration={`${layer.drift}s`}
        ></div>
      </div>
    {/if}
  {/each}
  {#each SPARKLES as s, i (i)}
    <svg
      class="sparkle"
      viewBox={`${-s.r} ${-s.r} ${2 * s.r} ${2 * s.r}`}
      style:left={`${s.x}%`}
      style:top={`${s.y}%`}
      style:width={`${2 * s.r}px`}
      style:height={`${2 * s.r}px`}
      style:animation-delay={`${s.d}s`}
    >
      <path d={sparkle(s.r)} />
    </svg>
  {/each}
</div>

<style>
  .field {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .band {
    position: absolute;
    left: -30%;
    right: -30%;
    top: 30%;
    height: 34%;
    transform: rotate(-24deg);
    background: var(--ast-fg);
    opacity: 0.09;
    mask:
      var(--ast-dither) 0 0 / 4px 4px,
      radial-gradient(closest-side, #000, transparent);
    mask-composite: intersect;
  }
  .layer {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: calc(100% + 2 * var(--tile));
    will-change: transform;
  }
  .stars {
    position: absolute;
    inset: 0;
    background: var(--ast-fg);
    mask-size: var(--tile) var(--tile);
    -webkit-mask-size: var(--tile) var(--tile);
    mask-repeat: repeat;
    animation: drift linear infinite;
    will-change: transform;
  }
  @keyframes drift {
    to {
      transform: translate3d(0, calc(-1 * var(--tile)), 0);
    }
  }
  .sparkle {
    position: absolute;
    fill: var(--ast-fg);
    opacity: 0.2;
    animation: twinkle 5.2s ease-in-out infinite;
  }
  @keyframes twinkle {
    0%,
    100% {
      opacity: 0.15;
      transform: scale(0.6);
    }
    50% {
      opacity: 0.9;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .stars,
    .sparkle {
      animation: none;
    }
  }
</style>
