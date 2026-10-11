<script lang="ts">
  // Header of the map and Earth views (#130): one discreet line, « #02 // CARTE DU CIEL · PARIS ».
  // The date and time are on the time line at the bottom, the coordinates in the menu. A short
  // scrim of the theme's background keeps it readable over bright stars (#74). Fades out in
  // immersive mode.
  import { _ } from "@asteria/ui";

  let {
    index,
    title,
    place,
    loading = false,
    locating,
    hidden = false,
    element = $bindable(),
    height = $bindable(20),
  }: {
    /** Section number, e.g. "#02". */
    index: string;
    /** View or point of view, e.g. "Carte du ciel", "La Terre tourne". */
    title: string;
    place: string;
    /** Shown after the title (Earth view loading). */
    loading?: boolean;
    locating: "idle" | "busy" | "error";
    /** Immersive mode: faded out. */
    hidden?: boolean;
    element?: HTMLElement | undefined;
    height?: number;
  } = $props();
</script>

<div
  class="scrim"
  class:hidden
  aria-hidden="true"
  style:height={`calc(max(16px, env(safe-area-inset-top)) + ${height + 28}px)`}
></div>
<header class="top" class:hidden bind:this={element} bind:clientHeight={height}>
  <p class="line">
    <span class="index">{index} //</span>
    <span class="title">{title}</span>
    <span class="place">· {place}</span>
    {#if loading}<span class="place">· {$_("space.loading")}</span>{/if}
  </p>
  {#if locating !== "idle"}
    <p class="status" role="status">
      {locating === "busy" ? $_("place.locating") : $_("place.locateError")}
    </p>
  {/if}
</header>

<style>
  /* Above the canvases, below the HUD; follows the theme (black in night red). */
  .scrim {
    position: fixed;
    z-index: 1;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--ast-bg) 70%, transparent) 0%,
      color-mix(in srgb, var(--ast-bg) 0%, transparent) 100%
    );
  }
  /* Stops short of the mini-globe (56 px + 12 px gap) in the top right corner. */
  .top {
    position: fixed;
    z-index: 2;
    top: max(16px, env(safe-area-inset-top));
    left: max(16px, env(safe-area-inset-left));
    right: calc(max(16px, env(safe-area-inset-right)) + 68px);
    pointer-events: none;
    text-shadow: 0 0 6px var(--ast-bg);
  }
  .scrim,
  .top {
    transition: opacity 220ms var(--ast-ease-out);
  }
  .hidden {
    opacity: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .scrim,
    .top {
      transition: none;
    }
  }
  .line,
  .status {
    margin: 0;
    font-size: 11px;
    line-height: 16px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ast-fg-muted);
  }
  .title {
    color: var(--ast-fg);
  }
  .status {
    margin-top: 2px;
  }
</style>
