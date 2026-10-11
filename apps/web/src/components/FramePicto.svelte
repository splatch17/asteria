<script lang="ts">
  // Engraved pictogram of a point of view of the Earth view (#122, #131), shared by the point-of-
  // view selector and the menu's cards (#135): ink hairlines on a 32×32 grid, a few filled parts.
  import type { ReferenceFrameId } from "@asteria/sky-renderer";

  let { frame, size = 30 }: { frame: ReferenceFrameId; size?: number } = $props();
</script>

<svg
  class="picto"
  viewBox="0 0 32 32"
  aria-hidden="true"
  style:width={`${size}px`}
  style:height={`${size}px`}
>
  {#if frame === "ecliptic"}
    <!-- The Sun, the orbit, two Earths with the same tilted axis -->
    <ellipse cx="16" cy="17" rx="13" ry="6" />
    <circle class="fill" cx="16" cy="17" r="2.6" />
    <circle cx="3" cy="17" r="2.2" />
    <circle cx="29" cy="17" r="2.2" />
    <path d="M1.4 13 L4.6 21 M27.4 13 L30.6 21" />
  {:else if frame === "heliocentric"}
    <!-- The Sun and nested orbits, planets on them -->
    <ellipse cx="16" cy="16" rx="6" ry="3" />
    <ellipse cx="16" cy="16" rx="10" ry="5" />
    <ellipse cx="16" cy="16" rx="14.5" ry="7.5" />
    <circle class="fill" cx="16" cy="16" r="1.8" />
    <circle class="fill" cx="22" cy="16" r="1.1" />
    <circle class="fill" cx="9" cy="19.5" r="1.3" />
    <circle class="fill" cx="27" cy="11" r="1.6" />
  {:else}
    <!-- A ringed planet, the Earth far away -->
    <circle cx="15" cy="17" r="6.5" />
    <ellipse cx="15" cy="17" rx="12" ry="3.2" transform="rotate(-18 15 17)" />
    <circle class="fill" cx="28" cy="5" r="1.3" />
  {/if}
</svg>

<style>
  .picto {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.1;
    stroke-linecap: round;
  }
  .fill {
    fill: currentColor;
    stroke: none;
  }
</style>
