<script lang="ts">
  // Line icons drawn on a 16×16 grid, stroked with currentColor (works in night red).
  import type { IconName } from "../lib/icons";
  let { name }: { name: IconName } = $props();
</script>

<svg viewBox="0 0 16 16" aria-hidden="true">
  {#if name === "play"}
    <path d="M4.5 2.5 L13 8 L4.5 13.5 Z" class="fill" />
  {:else if name === "pause"}
    <path d="M4.5 3 V13 M11.5 3 V13" />
  {:else if name === "now"}
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="8" cy="8" r="1.6" class="fill" />
  {:else if name === "lines"}
    <path d="M2.5 11.5 L6 4.5 L10 8 L13.5 3" />
    <circle cx="2.5" cy="11.5" r="1.2" class="fill" />
    <circle cx="6" cy="4.5" r="1.2" class="fill" />
    <circle cx="10" cy="8" r="1.2" class="fill" />
    <circle cx="13.5" cy="3" r="1.2" class="fill" />
  {:else if name === "night"}
    <path d="M10.5 2.5 A5.5 5.5 0 1 0 13.5 10.5 A4.5 4.5 0 0 1 10.5 2.5 Z" />
  {:else if name === "earth"}
    <circle cx="8" cy="8" r="5.5" />
    <path d="M2.5 8 H13.5 M8 2.5 C5.5 5 5.5 11 8 13.5 M8 2.5 C10.5 5 10.5 11 8 13.5" />
  {:else if name === "sky"}
    <path d="M2 12.5 H14" />
    <path
      d="M8 3 L8.9 5.6 L11.5 5.6 L9.4 7.2 L10.2 9.8 L8 8.2 L5.8 9.8 L6.6 7.2 L4.5 5.6 L7.1 5.6 Z"
    />
  {:else if name === "planets"}
    <circle cx="8" cy="8" r="3" />
    <ellipse cx="8" cy="8" rx="6.5" ry="2" transform="rotate(-20 8 8)" />
  {:else if name === "paths"}
    <path
      d="M1.5 11 C4 11 5.5 4.5 8.5 5 C11 5.4 10.5 9 8.5 8.6 C6.8 8.2 9 3.5 14.5 3.5"
      stroke-dasharray="1.6 1.4"
    />
    <circle cx="14.5" cy="3.5" r="1.4" class="fill" />
  {:else if name === "layers"}
    <path d="M8 2 L14 5 L8 8 L2 5 Z" />
    <path d="M2 8 L8 11 L14 8" />
    <path d="M2 11 L8 14 L14 11" />
  {:else if name === "conNames"}
    <path d="M2.5 13 L5.5 3 L8.5 13 M3.6 9.5 H7.4" />
    <path d="M10.5 13 H14 M10.5 10 H14" stroke-dasharray="1.2 1.2" />
  {:else if name === "starNames"}
    <path d="M5 2 L6 5 L9 5 L6.6 6.8 L7.5 9.8 L5 8 L2.5 9.8 L3.4 6.8 L1 5 L4 5 Z" />
    <path d="M9.5 12.5 H15 M11 9.5 H15" />
  {:else if name === "eqGrid"}
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8 H14 M3 4.8 H13 M3 11.2 H13 M8 2 V14" />
  {:else if name === "azGrid"}
    <path d="M1.5 13.5 H14.5" />
    <path d="M2.5 13.5 A5.5 5.5 0 0 1 13.5 13.5 M5 13.5 A3 3 0 0 1 11 13.5" />
    <path d="M8 13.5 V8 M8 13.5 L3.8 9.6 M8 13.5 L12.2 9.6" stroke-dasharray="1.2 1" />
  {:else if name === "ecliptic"}
    <path d="M1.5 9.5 H14.5" class="thin" />
    <path d="M1.5 12.5 L14.5 5" stroke-dasharray="1.6 1.2" />
    <circle cx="9.9" cy="7.7" r="1.9" class="fill" />
  {:else if name === "fullscreen"}
    <path d="M2.5 6 V2.5 H6 M10 2.5 H13.5 V6 M13.5 10 V13.5 H10 M6 13.5 H2.5 V10" />
  {:else if name === "fullscreenExit"}
    <path d="M6 2.5 V6 H2.5 M13.5 6 H10 V2.5 M10 13.5 V10 H13.5 M2.5 10 H6 V13.5" />
  {:else if name === "expand"}
    <path d="M3.5 10 L8 5.5 L12.5 10" />
  {:else if name === "collapse"}
    <path d="M3.5 6 L8 10.5 L12.5 6" />
  {:else if name === "range"}
    <path d="M4 2.5 H12 M4 13.5 H12 M5 2.5 C5 6 11 10 11 13.5 M11 2.5 C11 6 5 10 5 13.5" />
  {/if}
</svg>

<style>
  svg {
    width: 14px;
    height: 14px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: square;
  }
  .thin {
    stroke-width: 0.8;
  }
  .fill {
    fill: currentColor;
    stroke: none;
  }
</style>
