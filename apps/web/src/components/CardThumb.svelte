<script lang="ts">
  // A constellation's card in small (menu v2, Catalogue tab): the sky of its card in the deck,
  // drawn as the deck's sketch (lib/card-sketch: the same projection as the map, the figure at the
  // zenith of a made-up observer, north up), on a 2D canvas, in the sky's two colours. Decorative:
  // the caller names it.
  import { onMount } from "svelte";
  import {
    applyMat3,
    j2000ToHorizontalMatrix,
    propagateStar,
    unitVector,
    yearsSinceHipparcos,
  } from "@asteria/astro-core";
  import type { CatalogStar, SkyTheme, ViewState } from "@asteria/sky-renderer";
  import { drawSketch, type SketchStar } from "../lib/card-sketch";
  import { screenFraction } from "../lib/constellation";
  import { framingFov, zenithObserver, type ConstellationShape } from "../lib/games/geometry";

  let {
    abbr,
    stars,
    lines,
    shape,
    date,
    theme,
    fill = 0.72,
    faintest = 5.2,
  }: {
    abbr: string;
    stars: readonly CatalogStar[];
    lines: Record<string, number[][]>;
    shape: ConstellationShape;
    date: Date;
    theme: Pick<SkyTheme, "sky" | "ink">;
    /** Share of the narrow side the figure spans. */
    fill?: number;
    /** Faintest star of the field drawn around the figure. */
    faintest?: number;
  } = $props();

  let canvas: HTMLCanvasElement;

  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const observer = zenithObserver(shape.centre, date);
    const view: ViewState = {
      azimuth: 180,
      altitude: 90,
      roll: 0,
      fov: framingFov(shape.radius, w / h, fill),
    };
    const m = j2000ToHorizontalMatrix(date, observer);
    const years = yearsSinceHipparcos(date);
    const at = (ra: number, dec: number) =>
      screenFraction(applyMat3(m, unitVector(ra, dec)), view, w / h);
    const hips = new Set((lines[abbr] ?? []).flat());
    // The field: stars within the picture's half-diagonal of the figure's centre.
    const reach = Math.cos(((view.fov / 2) * Math.SQRT2 * Math.PI) / 180);
    const c = shape.centre;
    const figure: SketchStar[] = [];
    const field: SketchStar[] = [];
    for (const s of stars) {
      const inFigure = hips.has(s.hip);
      if (!inFigure && s.v > faintest) continue;
      const d = unitVector(s.ra, s.dec);
      if (d[0] * c[0] + d[1] * c[1] + d[2] * c[2] < reach) continue;
      const p = inFigure ? propagateStar(s, years) : s;
      const f = at(p.ra, p.dec);
      if (!f) continue;
      (inFigure ? figure : field).push({ hip: s.hip, v: s.v, x: f[0] * w, y: f[1] * h });
    }
    drawSketch(ctx, w, h, figure, lines[abbr] ?? [], theme, field);
  }

  onMount(() => {
    const resize = new ResizeObserver(() => draw());
    resize.observe(canvas);
    return () => resize.disconnect();
  });
  $effect(() => {
    void theme.ink;
    void theme.sky;
    void abbr;
    if (canvas) draw();
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
