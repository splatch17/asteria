<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import { SkyMap, type CatalogStar } from "@asteria/sky-renderer";
  import { formatDec, formatRa, parallaxToLightYears } from "./lib/format";

  const THEMES = {
    day: { ink: "#f0e6d2", sky: "#101b52", ground: "#0a1136" },
    red: { ink: "#ff2a1a", sky: "#000000", ground: "#000000" },
  };

  let canvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let map: SkyMap | undefined;
  let status = $state<"loading" | "ready" | "error">("loading");
  let night = $state(false);
  let lines = $state(true);
  let selected = $state<CatalogStar | null>(null);
  let now = $state(new Date());
  let clock: ReturnType<typeof setInterval>;

  onMount(async () => {
    try {
      const base = import.meta.env.BASE_URL;
      const [stars, constellationLines] = await Promise.all([
        fetch(`${base}data/stars.json`).then((r) => r.json()),
        fetch(`${base}data/constellation-lines.json`).then((r) => r.json()),
      ]);
      map = new SkyMap({
        canvas,
        overlay,
        stars,
        lines: constellationLines,
        cardinals: $_("map.cardinals").split(","),
        theme: THEMES.day,
        onSelect: (s) => (selected = s),
      });
      status = "ready";
      const params = new URLSearchParams(location.search);
      if (params.get("night") === "1") night = true;
      const view = ["az", "alt", "fov"].map((k) => Number(params.get(k) ?? NaN));
      map.setView({
        ...(Number.isFinite(view[0]) && { azimuth: view[0] }),
        ...(Number.isFinite(view[1]) && { altitude: view[1] }),
        ...(Number.isFinite(view[2]) && { fov: view[2] }),
      });
      clock = setInterval(() => {
        now = new Date();
        map?.setDate(now);
      }, 30_000);
    } catch (e) {
      console.error(e);
      status = "error";
    }
  });

  onDestroy(() => {
    clearInterval(clock);
    map?.dispose();
  });

  $effect(() => {
    document.documentElement.dataset.night = night ? "red" : "";
    map?.setTheme(night ? THEMES.red : THEMES.day);
  });

  $effect(() => {
    map?.setLinesVisible(lines);
  });

  const time = $derived(
    now.toLocaleString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  const distance = $derived(selected ? parallaxToLightYears(selected.plx) : null);
</script>

<canvas class="sky" bind:this={canvas}></canvas>
<canvas class="overlay" bind:this={overlay}></canvas>

<header class="hud top">
  <p class="meta">#02 // {$_("map.title")}</p>
  <p class="where">{$_("place.paris")} · 48.86°N 2.35°E</p>
  <p class="when">{time}</p>
</header>

{#if status !== "ready"}
  <p class="status">{status === "error" ? $_("map.error") : $_("map.loading")}</p>
{/if}

{#if selected}
  <aside class="hud panel">
    <p class="meta">HIP {selected.hip}{selected.bayer ? ` // ${selected.bayer}` : ""}</p>
    <p class="name">{selected.name ?? selected.bayer ?? `HIP ${selected.hip}`}</p>
    <pre class="data">RA   {formatRa(selected.ra)}
DEC  {formatDec(selected.dec)}
V    {selected.v.toFixed(2)}{selected.bv !== undefined ? `\nB−V  ${selected.bv.toFixed(2)}` : ""}
DIST {distance
        ? $_("star.distance", { values: { ly: Math.round(distance) } })
        : $_("star.unknownDistance")}</pre>
    <button class="close" onclick={() => (selected = null)} aria-label={$_("star.close")}>×</button>
  </aside>
{/if}

<nav class="hud bottom">
  <div class="group">
    <button aria-pressed={lines} onclick={() => (lines = !lines)}>{$_("map.lines")}</button>
    <button aria-pressed={night} onclick={() => (night = !night)}>{$_("night.toggle")}</button>
  </div>
</nav>

<style>
  canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  .overlay {
    pointer-events: none;
  }
  .hud {
    position: fixed;
    z-index: 2;
  }
  .top {
    top: max(16px, env(safe-area-inset-top));
    left: 16px;
    right: 16px;
    pointer-events: none;
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
  }
  .when {
    margin-top: 4px;
    color: var(--ast-fg-muted);
  }
  .status {
    position: fixed;
    inset: 0;
    display: grid;
    place-content: center;
    margin: 0;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .bottom {
    left: 16px;
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
    display: flex;
    justify-content: center;
  }
  .group {
    display: flex;
    flex-wrap: wrap;
    max-width: 100%;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 70%, transparent);
    backdrop-filter: blur(4px);
  }
  button {
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 0;
    border-right: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    padding: 13px 14px;
    cursor: pointer;
  }
  .group button:last-child {
    border-right: 0;
  }
  button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .panel {
    left: 16px;
    right: 16px;
    bottom: calc(max(16px, env(safe-area-inset-bottom)) + 60px);
    max-width: 300px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 85%, transparent);
    backdrop-filter: blur(6px);
    padding: 12px 14px;
  }
  .name {
    margin: 4px 0 8px;
    font-family: var(--ast-font-display);
    font-weight: 700;
    font-size: 30px;
    line-height: 1;
    text-transform: uppercase;
  }
  .data {
    margin: 0;
    font: 11px/1.7 var(--ast-font-mono);
    letter-spacing: 0.06em;
    color: var(--ast-fg-muted);
  }
  .close {
    position: absolute;
    top: 4px;
    right: 4px;
    border: 0;
    padding: 8px 10px;
    font-size: 16px;
  }
</style>
