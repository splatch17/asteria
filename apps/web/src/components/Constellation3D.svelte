<script lang="ts">
  // Constellation in 3D (#8): the figure's stars at their real distances (Hipparcos parallaxes,
  // or a reference distance when the catalogue gives one), opened from the constellation sheet
  // with a transition from the sky map's own view. Loaded on demand with its renderer.
  import { onMount, untrack } from "svelte";
  import { _ } from "@asteria/ui";
  import { j2000ToHorizontalMatrix, yearsSinceHipparcos, type Observer } from "@asteria/astro-core";
  import type { CatalogStar, ViewState } from "@asteria/sky-renderer";
  import {
    Constellation3DView,
    buildConstellation3D,
    type Level3D,
    type Star3D,
    type StellarDistance,
  } from "@asteria/sky-renderer/constellation-3d";
  import { readSetting, writeSetting } from "../lib/storage";
  import Designation from "./Designation.svelte";

  let {
    abbr,
    name,
    stars,
    lines,
    date,
    observer,
    startView,
    theme,
    monochrome,
    onclose,
  }: {
    abbr: string;
    /** Constellation name, localised. */
    name: string;
    stars: readonly CatalogStar[];
    lines: Readonly<Record<string, number[][]>>;
    /** Displayed date and place: the 3D view starts exactly as the sky map shows the figure. */
    date: Date;
    observer: Observer;
    /** The sky map's view when the button was pressed. */
    startView: ViewState;
    theme: { ink: string; sky: string };
    monochrome: boolean;
    onclose: () => void;
  } = $props();

  const LEVELS: readonly Level3D[] = ["discovery", "amateur", "expert"];
  const isLevel = (v: unknown): v is Level3D => LEVELS.includes(v as Level3D);
  const params = new URLSearchParams(location.search);
  // `?level=` and the 3D capture parameters take precedence (and are then not saved).
  const urlLevel = params.get("level");
  let level = $state<Level3D>(
    isLevel(urlLevel) ? urlLevel : readSetting("asteria.level", "amateur", isLevel),
  );

  // Snapshot at opening: the figure does not move while it is explored.
  const model = untrack(() =>
    buildConstellation3D(stars, lines, abbr, {
      years: yearsSinceHipparcos(date),
      frame: j2000ToHorizontalMatrix(date, observer),
    }),
  );

  let root: HTMLElement;
  let canvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let header: HTMLElement;
  let footer: HTMLElement;
  let closeButton: HTMLButtonElement;
  let view: Constellation3DView | undefined;
  let failed = $state(false);
  let ready = $state(false);
  let closing = $state(false);
  let fromEarth = $state(false);
  let selected = $state<number | null>(null);

  const number = (x: number) => Math.round(x);
  /** Two significant figures (approximate distances, uncertainties). */
  const sig2 = (x: number) => {
    if (!(x > 0) || !Number.isFinite(x)) return x;
    const p = 10 ** (Math.floor(Math.log10(x)) - 1);
    return Math.round(x / p) * p;
  };

  function designation(s: CatalogStar, lvl: Level3D): string {
    if (s.name) return s.name;
    if (lvl === "discovery") return s.v < 2.5 && s.bayer ? s.bayer : "";
    if (s.bayer) return s.bayer;
    return lvl === "expert" ? $_("star.hip", { values: { hip: s.hip } }) : "";
  }

  /** Distance text for a label or the star panel. */
  function distanceText(d: StellarDistance | null, lvl: Level3D): string {
    if (!d) return $_("c3d.distanceUnknown");
    if (Number.isNaN(d.ly)) return $_("c3d.distanceBeyond", { values: { ly: sig2(d.nearLy) } });
    if (d.quality === "uncertain" && lvl !== "expert")
      return $_("c3d.distanceBeyond", { values: { ly: sig2(d.nearLy) } });
    if (lvl === "expert" && d.farLy > d.nearLy) {
      const ly = d.quality === "precise" ? number(d.ly) : sig2(d.ly);
      const minus = sig2(d.ly - d.nearLy);
      return Number.isFinite(d.farLy)
        ? $_("c3d.distanceSigma", { values: { ly, minus, plus: sig2(d.farLy - d.ly) } })
        : $_("c3d.distanceSigmaOpen", { values: { ly, minus } });
    }
    return d.quality === "approx"
      ? $_("c3d.distanceApprox", { values: { ly: sig2(d.ly) } })
      : $_("c3d.distance", { values: { ly: number(d.ly) } });
  }

  function label(s: Star3D, lvl: Level3D) {
    // An uncertain star is always named (but in Découverte): its label carries the warning.
    const name =
      designation(s.star, lvl) ||
      (s.uncertain && lvl !== "discovery" ? $_("star.hip", { values: { hip: s.star.hip } }) : "");
    return { name, distance: name ? distanceText(s.distance, lvl) : "" };
  }

  const lesson = $derived.by(() => {
    const near = model.stars[model.nearest];
    const far = model.stars[model.farthest];
    if (!near || !far || near === far) return $_("c3d.lessonFlat");
    const named = (s: Star3D) => designation(s.star, "expert");
    return $_("c3d.lesson", {
      values: {
        near: named(near),
        nearDist: distanceText(near.distance, "amateur"),
        far: named(far),
        farDist: distanceText(far.distance, "amateur"),
      },
    });
  });
  const hasApprox = model.stars.some((s) => s.distance?.quality === "approx");
  const hasUncertain = model.stars.some((s) => s.uncertain);
  const selectedStar = $derived(selected === null ? null : (model.stars[selected] ?? null));

  function updateHud() {
    const rects = [header, footer].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    view?.setHudExclusions(rects);
  }

  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.focus();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      view = new Constellation3DView({
        canvas,
        overlay,
        model,
        startView,
        theme,
        monochrome,
        level,
        label,
        formatRing: (ly) => $_("c3d.ring", { values: { ly } }),
        originLabel: $_("c3d.origin"),
        duration: reduced ? 0 : 2600,
        onSelect: (i) => (selected = i),
      });
    } catch (e) {
      console.error(e);
      failed = true;
      return () => previous?.focus?.();
    }
    const observer = new ResizeObserver(updateHud);
    observer.observe(header);
    observer.observe(footer);
    // Captures: ?t3d= freezes the transition, ?orbit3d=yaw,pitch,zoom, ?sel3d=HIP.
    const frozen = Number(params.get("t3d") ?? NaN);
    const [yaw, pitch, zoom] = (params.get("orbit3d") ?? "").split(",").map(Number);
    if (Number.isFinite(yaw) || Number.isFinite(pitch) || Number.isFinite(zoom))
      view.setOrbit({
        ...(Number.isFinite(yaw) && { yaw }),
        ...(Number.isFinite(pitch) && { pitch }),
        ...(Number.isFinite(zoom) && { zoom }),
      });
    const sel = model.stars.findIndex((s) => s.star.hip === Number(params.get("sel3d")));
    if (sel >= 0) {
      selected = sel;
      view.setSelected(sel);
    }
    if (Number.isFinite(frozen)) {
      view.setProgress(frozen);
      ready = frozen >= 1;
    } else view.open().then(() => (ready = true));
    return () => {
      observer.disconnect();
      view?.dispose();
      view = undefined;
      previous?.focus?.();
    };
  });

  $effect(() => {
    view?.setTheme(theme, monochrome);
  });
  $effect(() => {
    view?.setLevel(level);
    if (!isLevel(urlLevel)) writeSetting("asteria.level", level);
  });

  async function close() {
    if (closing) return;
    closing = true;
    ready = false;
    selected = null;
    await view?.close();
    onclose();
  }

  async function toggleEarth() {
    fromEarth = !fromEarth;
    selected = null;
    view?.setSelected(null);
    ready = false;
    await view?.fromEarth(fromEarth);
    ready = !closing;
  }

  /** Escape closes (before the sheet below); Tab cycles inside the dialog. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (selected !== null) {
        selected = null;
        view?.setSelected(null);
      } else close();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...root.querySelectorAll<HTMLElement>("button:not([disabled])")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
</script>

<div
  class="view3d"
  class:ready
  role="dialog"
  aria-modal="true"
  aria-labelledby="c3d-title"
  tabindex="-1"
  bind:this={root}
  {onkeydown}
>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
  <canvas class="overlay" bind:this={overlay} aria-hidden="true"></canvas>

  <!-- Always shown, also during the transition: it cancels the view. -->
  <button class="icon close" bind:this={closeButton} onclick={close} aria-label={$_("c3d.close")}
    >×</button
  >
  <header class="head" bind:this={header}>
    <div class="titles">
      <p class="meta">#{abbr.toUpperCase()} // {$_("c3d.meta")}</p>
      <h2 class="name" id="c3d-title">{name}</h2>
    </div>
    <div class="levels" role="group" aria-label={$_("c3d.level")}>
      {#each LEVELS as l (l)}
        <button aria-pressed={level === l} onclick={() => (level = l)}>{$_(`level.${l}`)}</button>
      {/each}
    </div>
  </header>

  <footer class="foot frame" bind:this={footer}>
    {#if failed}
      <p class="lesson" role="alert">{$_("c3d.error")}</p>
    {:else if selectedStar}
      {@const s = selectedStar}
      {@const d = s.distance}
      <p class="star">
        <span class="star-name"><Designation text={designation(s.star, "expert")} /></span>
        <span>{distanceText(d, level === "discovery" ? "amateur" : level)}</span>
      </p>
      {#if d?.source === "reference"}
        <p class="note">
          {$_("c3d.star.sourceReference", { values: { source: d.distanceSource ?? "" } })}
        </p>
      {:else if s.star.plx !== undefined}
        {#if level !== "discovery" && s.star.ePlx !== undefined}
          <p class="note">
            {$_("c3d.star.parallax", {
              values: {
                plx: s.star.plx,
                ePlx: s.star.ePlx,
                pct: s.star.ePlx / Math.abs(s.star.plx),
              },
            })}
          </p>
        {/if}
        <p class="note">{$_("c3d.star.sourceHipparcos")}</p>
      {/if}
      {#if s.uncertain}
        <p class="note">{$_("c3d.star.uncertain")}</p>
      {:else if d?.quality === "approx"}
        <p class="note">{$_("c3d.star.approx")}</p>
      {/if}
      {#if s.clamped}<p class="note">{$_("c3d.star.clamped")}</p>{/if}
    {:else}
      <p class="lesson">{lesson}</p>
      {#if level !== "discovery" && hasApprox}<p class="note">{$_("c3d.legend.approx")}</p>{/if}
      {#if hasUncertain}<p class="note">{$_("c3d.legend.uncertain")}</p>{/if}
      {#if level === "expert"}<p class="note">{$_("c3d.legend.sigma")}</p>{/if}
      {#if level === "discovery"}<p class="note">{$_("c3d.ly")}</p>{/if}
      <p class="note hint">{$_("c3d.hint")}</p>
    {/if}
    <button class="toggle" onclick={toggleEarth} disabled={closing || failed}>
      {fromEarth ? $_("c3d.to3d") : $_("c3d.fromEarth")}
    </button>
  </footer>

  <!-- The figure's stars and their distances, for screen readers (the canvas is hidden). -->
  <ul class="sr-only" aria-label={$_("c3d.list")}>
    {#each model.stars as s (s.star.hip)}
      <li>{designation(s.star, "expert")} : {distanceText(s.distance, level)}</li>
    {/each}
  </ul>
</div>

<style>
  .view3d {
    position: fixed;
    inset: 0;
    z-index: 10;
    outline: none;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  .overlay {
    pointer-events: none;
  }
  /* The interface appears once the depth has unfolded, and leaves before the way back. */
  .head,
  .foot {
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.35s var(--ast-ease-out),
      visibility 0s 0.35s;
  }
  .ready .head,
  .ready .foot {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.35s var(--ast-ease-out);
  }
  .head {
    position: absolute;
    top: max(12px, env(safe-area-inset-top));
    left: max(16px, env(safe-area-inset-left));
    right: max(16px, env(safe-area-inset-right));
    display: grid;
    gap: 6px;
    padding-right: 44px;
  }
  .meta {
    margin: 0;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .name {
    margin: 4px 0 0;
    font-family: var(--ast-font-display);
    font-weight: 700;
    font-size: 30px;
    line-height: 1;
    text-transform: uppercase;
  }
  button {
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    font-size: 20px;
  }
  .close {
    position: absolute;
    z-index: 1;
    top: max(6px, env(safe-area-inset-top));
    right: max(6px, env(safe-area-inset-right));
    background: color-mix(in srgb, var(--ast-bg) 78%, transparent);
    border: 1px solid var(--ast-hairline);
  }
  .levels {
    display: flex;
    width: fit-content;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 78%, transparent);
  }
  .levels button {
    min-height: 36px;
    padding: 0 10px;
    color: var(--ast-fg-muted);
  }
  .levels button + button {
    border-left: 1px solid var(--ast-hairline);
  }
  .levels button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .foot {
    position: absolute;
    left: max(16px, env(safe-area-inset-left));
    right: max(16px, env(safe-area-inset-right));
    bottom: max(16px, env(safe-area-inset-bottom));
    max-width: 420px;
    margin: 0 auto;
    padding: 10px 14px 12px;
    box-sizing: border-box;
  }
  .lesson {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }
  .note {
    margin: 6px 0 0;
    font: 11px/1.45 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .star {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
    margin: 0;
    font: 12px/1.4 var(--ast-font-mono);
  }
  .star-name {
    font-family: var(--ast-font-display);
    font-weight: 700;
    font-size: 22px;
    text-transform: uppercase;
  }
  .toggle {
    width: 100%;
    min-height: 44px;
    margin-top: 10px;
    border: 1px solid var(--ast-hairline);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
