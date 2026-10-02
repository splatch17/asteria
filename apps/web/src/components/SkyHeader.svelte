<script lang="ts">
  // Header of the map and Earth views: view title, place, coordinates and displayed time.
  // A soft scrim of the theme's background keeps it readable over the Moon, planets and bright
  // stars without hiding the sky (#74).
  import { _ } from "@asteria/ui";

  let {
    title,
    loading = false,
    place,
    coords,
    time,
    live,
    relative,
    locating,
    element = $bindable(),
    height = $bindable(90),
  }: {
    /** e.g. "#02 // Carte du ciel". */
    title: string;
    /** Shown after the title (Earth view loading). */
    loading?: boolean;
    place: string;
    coords: string;
    time: string;
    live: boolean;
    /** Signed offset from now, when not live. */
    relative: string;
    locating: "idle" | "busy" | "error";
    element?: HTMLElement | undefined;
    height?: number;
  } = $props();
</script>

<div
  class="scrim"
  aria-hidden="true"
  style:height={`calc(max(16px, env(safe-area-inset-top)) + ${height + 36}px)`}
></div>
<header class="top" bind:this={element} bind:clientHeight={height}>
  <p class="meta">
    {title}
    {#if loading}· {$_("space.loading")}{/if}
  </p>
  <p class="where">{place}</p>
  <p class="when">
    {coords} · {time}
    {#if live}<span class="live">● {$_("time.live")}</span>{:else}<span class="live"
        >{relative}</span
      >{/if}
  </p>
  {#if locating !== "idle"}
    <p class="meta" role="status">
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
      color-mix(in srgb, var(--ast-bg) 78%, transparent) 0%,
      color-mix(in srgb, var(--ast-bg) 62%, transparent) 55%,
      color-mix(in srgb, var(--ast-bg) 0%, transparent) 100%
    );
  }
  /* Stops short of the dials column (44 px + 12 px gap) so the date never runs under it. */
  .top {
    position: fixed;
    z-index: 2;
    top: max(16px, env(safe-area-inset-top));
    left: max(16px, env(safe-area-inset-left));
    right: calc(max(16px, env(safe-area-inset-right)) + 56px);
    pointer-events: none;
    text-shadow: 0 0 6px var(--ast-bg);
  }
  .meta,
  .where,
  .when {
    margin: 0;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .meta {
    color: var(--ast-fg-muted);
  }
  .where {
    margin-top: 6px;
    font-family: var(--ast-font-display);
    font-weight: 700;
    font-size: 28px;
    letter-spacing: 0.02em;
    line-height: 1;
    color: var(--ast-fg);
  }
  .when {
    margin-top: 4px;
    color: var(--ast-fg-muted);
  }
  .live {
    white-space: nowrap;
    margin-left: 6px;
    color: var(--ast-fg);
  }
</style>
