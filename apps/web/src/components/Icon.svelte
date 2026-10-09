<script lang="ts">
  // Line icons drawn on a 16×16 grid, stroked with currentColor (works in night red).
  import type { IconName } from "../lib/icons";
  // `size` in CSS px: 14 in text rows, larger in the round buttons so the drawing reads at a glance.
  let { name, size = 14 }: { name: IconName; size?: number } = $props();
  /** Four-pointed sparkle centred on (x, y), radius r. */
  const sparkle = (x: number, y: number, r: number) => {
    const k = r * 0.28;
    return `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`;
  };
</script>

<svg viewBox="0 0 16 16" aria-hidden="true" style:width={`${size}px`} style:height={`${size}px`}>
  {#if name === "play"}
    <path d="M4.5 2.5 L13 8 L4.5 13.5 Z" class="fill" />
  {:else if name === "pause"}
    <path d="M4.5 3 V13 M11.5 3 V13" />
  {:else if name === "now"}
    <!-- A clock: back to the current time. -->
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5 V8 L10.5 9.8" />
  {:else if name === "lines"}
    <path d="M2.5 11.5 L6 4.5 L10 8 L13.5 3" />
    <circle cx="2.5" cy="11.5" r="1.2" class="fill" />
    <circle cx="6" cy="4.5" r="1.2" class="fill" />
    <circle cx="10" cy="8" r="1.2" class="fill" />
    <circle cx="13.5" cy="3" r="1.2" class="fill" />
  {:else if name === "night"}
    <!-- A filled crescent and a star: night vision. -->
    <path d="M8.5 2.5 A6 6 0 1 0 13.8 11 A5 5 0 0 1 8.5 2.5 Z" class="fill" />
    <path d={sparkle(12.8, 3.6, 2.2)} class="fill" />
  {:else if name === "earth"}
    <!-- The globe with continents: the Earth seen from space. -->
    <circle cx="8" cy="8" r="6" />
    <path
      d="M3.6 5 C4.8 4.6 6.2 5.2 6 6.6 C5.8 7.8 6.9 8.4 7.1 9.6 C7.3 10.8 6.6 12.2 6.2 13.7 C4.4 12.9 3 11.4 2.4 9.2 C2.6 7.6 3 6.2 3.6 5 Z"
      class="fill"
    />
    <path
      d="M9.6 2.2 C9.4 3.6 10.2 4.6 11.4 4.8 C12.4 5 12.8 6.2 12.4 7.4 C13.2 7.6 13.8 7.4 14 7.2 C13.8 5 12.4 3 9.6 2.2 Z"
      class="fill"
    />
  {:else if name === "sky"}
    <!-- Stars above the horizon: back to the sky. -->
    <path d="M1.5 13.5 H14.5" />
    <path d={sparkle(5.5, 6, 3.4)} class="fill" />
    <path d={sparkle(11.6, 3.4, 2)} class="fill" />
    <path d={sparkle(11.4, 9.4, 1.6)} class="fill" />
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
  {:else if name === "seeThrough"}
    <path d="M1.5 7.5 H14.5" />
    <path d="M3 7.5 A5 5 0 0 0 13 7.5" class="thin" stroke-dasharray="1.2 1.1" />
    <circle cx="8" cy="4" r="1.4" class="fill" />
    <circle cx="8" cy="10.6" r="1.1" class="thin" />
  {:else if name === "figures"}
    <!-- An engraved figure among the stars: the illustrated constellations (#96). -->
    <circle cx="6" cy="4" r="1.8" />
    <path d="M6 5.8 V10.5 M2.8 7.6 L6 6.8 L9.2 8.6 M6 10.5 L4 14 M6 10.5 L8.2 13.6" />
    <path d={sparkle(12.5, 4, 2.2)} class="fill" />
  {:else if name === "fullscreen"}
    <path d="M2.5 6 V2.5 H6 M10 2.5 H13.5 V6 M13.5 10 V13.5 H10 M6 13.5 H2.5 V10" />
  {:else if name === "fullscreenExit"}
    <path d="M6 2.5 V6 H2.5 M13.5 6 H10 V2.5 M10 13.5 V10 H13.5 M2.5 10 H6 V13.5" />
  {:else if name === "realistic"}
    <!-- A painter's palette: real colours instead of the engraving. -->
    <path
      d="M8 2 A6 6 0 1 0 8 14 C9.3 14 9.6 12.9 9 12.1 C8.3 11.2 8.9 9.8 10.2 9.8 H12 A2 2 0 0 0 14 7.8 C14 4.6 11.3 2 8 2 Z"
    />
    <circle cx="5" cy="9.2" r="1.15" class="fill" />
    <circle cx="5.2" cy="5.8" r="1.15" class="fill" />
    <circle cx="8.3" cy="4.4" r="1.15" class="fill" />
    <circle cx="11.2" cy="5.6" r="1.15" class="fill" />
  {:else if name === "expand"}
    <path d="M3.5 10 L8 5.5 L12.5 10" />
  {:else if name === "collapse"}
    <path d="M3.5 6 L8 10.5 L12.5 6" />
  {:else if name === "locate"}
    <!-- A map pin: use my position. -->
    <path d="M8 14.5 C6 12.2 3.2 9.2 3.2 6.3 A4.8 4.8 0 0 1 12.8 6.3 C12.8 9.2 10 12.2 8 14.5 Z" />
    <circle cx="8" cy="6.3" r="1.7" class="fill" />
  {:else if name === "aim"}
    <!-- A phone raised towards a star: aim at the sky with the phone. -->
    <rect x="2.5" y="6.5" width="6" height="8.5" rx="1" />
    <path d="M4.6 13.2 H6.4" class="thin" />
    <path d="M7.6 5.8 L10.6 3.9" stroke-dasharray="1.2 1.1" class="thin" />
    <path d={sparkle(12.6, 3, 2.4)} class="fill" />
  {:else if name === "range"}
    <path d="M4 2.5 H12 M4 13.5 H12 M5 2.5 C5 6 11 10 11 13.5 M11 2.5 C11 6 5 10 5 13.5" />
  {:else if name === "search"}
    <!-- A magnifier: find an object in the sky (#99). -->
    <circle cx="6.8" cy="6.8" r="4.3" />
    <path d="M10 10 L14 14" />
    <path d={sparkle(6.8, 6.8, 1.9)} class="fill" />
  {:else if name === "star"}
    <path d={sparkle(8, 8, 6)} class="fill" />
  {:else if name === "sun"}
    <circle cx="8" cy="8" r="3" class="fill" />
    <path
      d="M8 1.5 V3.2 M8 12.8 V14.5 M1.5 8 H3.2 M12.8 8 H14.5 M3.4 3.4 L4.6 4.6 M11.4 11.4 L12.6 12.6 M3.4 12.6 L4.6 11.4 M11.4 4.6 L12.6 3.4"
    />
  {:else if name === "moon"}
    <path d="M9 2 A6 6 0 1 0 14 10.5 A5 5 0 0 1 9 2 Z" class="fill" />
  {:else if name === "recentre"}
    <!-- A sight: back to the view's starting point (#107). -->
    <circle cx="8" cy="8" r="4.5" />
    <path d="M8 1 V4.5 M8 11.5 V15 M1 8 H4.5 M11.5 8 H15" />
    <circle cx="8" cy="8" r="1.2" class="fill" />
  {/if}
</svg>

<style>
  svg {
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
