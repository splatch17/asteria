<script lang="ts">
  // Line icons drawn on a 16×16 grid, stroked with currentColor (works in night red).
  export type IconName =
    "play" | "pause" | "now" | "lines" | "night" | "range" | "earth" | "sky" | "planets" | "paths";
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
  .fill {
    fill: currentColor;
    stroke: none;
  }
</style>
