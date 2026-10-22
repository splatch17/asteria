<script lang="ts">
  // A card's tiny sky on the Apprendre screen (#185), drawn by lib/vignettes.ts: dithered ground
  // revealed in three densities (the dots grow denser, as the figures appear), stars, thin lines.
  // Inked with currentColor (night red included); decorative, hidden from screen readers.
  import { VIGNETTE_SIZE, vignette } from "../lib/vignettes";

  let { id }: { id: string } = $props();
  const uid = $props.id();
  const art = $derived(vignette(id));
</script>

<svg
  class="vignette"
  viewBox={`0 0 ${VIGNETTE_SIZE} ${VIGNETTE_SIZE}`}
  aria-hidden="true"
  focusable="false"
>
  <defs>
    <!-- The ground is cleared under the lines and around the stars, so that they read. -->
    <mask
      id={`${uid}-clear`}
      maskUnits="userSpaceOnUse"
      x="0"
      y="0"
      width={VIGNETTE_SIZE}
      height={VIGNETTE_SIZE}
    >
      <rect width={VIGNETTE_SIZE} height={VIGNETTE_SIZE} fill="#fff" />
      {#each art.strokes as s, i (i)}
        <path d={s.d} fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" />
      {/each}
      {#each art.clear as c, i (i)}
        <circle cx={c.x} cy={c.y} r={c.r} fill="#000" />
      {/each}
    </mask>
  </defs>
  <g mask={`url(#${uid}-clear)`}>
    {#each art.dither as d, k (k)}
      <path class="dither" {d} style:--step={k} />
    {/each}
  </g>
  {#each art.strokes as s, i (i)}
    <path class="stroke" class:dashed={s.dashed} d={s.d} />
  {/each}
  <path class="ink" d={art.ink} />
</svg>

<style>
  .vignette {
    display: block;
    width: 100%;
    height: 100%;
    color: inherit;
  }
  .dither,
  .ink {
    fill: currentColor;
    shape-rendering: crispEdges;
  }
  .dither {
    /* Reveal: each density step appears after the previous one (steps are nested). */
    animation: dots 1ms steps(1, end) both;
    animation-delay: calc(80ms + var(--step) * 110ms);
  }
  @keyframes dots {
    from {
      visibility: hidden;
    }
  }
  .stroke {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.6;
    stroke-linecap: round;
  }
  .dashed {
    stroke-dasharray: 1.2 1.4;
  }
  @media (prefers-reduced-motion: reduce) {
    .dither {
      animation: none;
    }
  }
</style>
