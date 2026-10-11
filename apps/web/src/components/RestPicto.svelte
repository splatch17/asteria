<script lang="ts">
  // Engraved pictogram of a rest frame of the Earth view (#139): what stays still on screen.
  // Ink hairlines on a 32×32 grid, as FramePicto.
  import type { RestFrameId } from "@asteria/sky-renderer";

  let { rest, size = 24 }: { rest: RestFrameId; size?: number } = $props();
</script>

<svg
  class="picto"
  viewBox="0 0 32 32"
  aria-hidden="true"
  style:width={`${size}px`}
  style:height={`${size}px`}
>
  {#if rest === "stars"}
    <!-- A four-pointed star and two faint ones: the fixed sky -->
    <path d="M14 5 L15.6 13.4 L24 15 L15.6 16.6 L14 25 L12.4 16.6 L4 15 L12.4 13.4 Z" />
    <circle class="fill" cx="25" cy="6" r="1.2" />
    <circle class="fill" cx="26" cy="25" r="0.9" />
    <circle class="fill" cx="6" cy="26" r="0.7" />
  {:else if rest === "sun"}
    <!-- The Sun: a filled disc and its rays -->
    <circle class="fill" cx="16" cy="16" r="5" />
    {#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}
      <path d="M16 6.5 L16 3" transform={`rotate(${a} 16 16)`} />
    {/each}
  {:else if rest === "earth"}
    <!-- The Earth: its axis, equator and a meridian -->
    <circle cx="16" cy="16" r="9" />
    <path d="M7 16 A9 3 0 0 0 25 16" />
    <ellipse cx="16" cy="16" rx="3.6" ry="9" />
    <path d="M16 2.5 L16 7 M16 25 L16 29.5" />
  {:else}
    <!-- A ringed planet -->
    <circle cx="16" cy="16" r="6.5" />
    <ellipse cx="16" cy="16" rx="12.5" ry="3.4" transform="rotate(-18 16 16)" />
    <circle class="fill" cx="13.6" cy="13.4" r="1.4" />
  {/if}
</svg>

<style>
  .picto {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.1;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .fill {
    fill: currentColor;
    stroke: none;
  }
</style>
