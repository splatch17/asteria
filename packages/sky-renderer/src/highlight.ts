/**
 * Highlight of the selected object (#103), in the 1-bit engraving style (docs/ART_DIRECTION.md).
 *
 * - Star, planet, Sun, Moon: a persistent engraved reticle (dithered band around a solid ring,
 *   four diagonal ticks) while the object is selected, plus an arrival animation after a search:
 *   three rings close in on the marker, one after the other, in ARRIVAL_MS.
 * - Constellation: the rest of the sky is dimmed by a veil of the sky colour (SELECTION_DIM)
 *   while the figure, its stars and its name are drawn above it, stronger.
 *
 * The timing and size laws are pure (tested); drawMarker / drawArrival only issue canvas calls
 * (no allocation, so they can run every frame of the animation).
 */

/** Duration of the arrival animation (ms). */
export const ARRIVAL_MS = 1000;
/** Number of converging rings of the arrival animation. */
export const ARRIVAL_RINGS = 3;
/** Delay between two rings, as a fraction of the animation. */
const RING_STAGGER = 0.18;
/** A ring starts this many marker radii wide and closes onto the marker. */
const RING_SPREAD = 3;

/** Marker radius around a star (CSS px): clears the largest star sprites. */
export const STAR_MARKER_RADIUS = 12;
/** Gap between a disc (planet, Sun, Moon) and its marker ring (CSS px). */
export const MARKER_GAP = 6;
/** Opacity of the veil laid over the rest of the sky while a constellation is selected. */
export const SELECTION_DIM = 0.4;

/** Progress of an animation started at `start` (ms), in [0, 1]; 1 when not started (NaN). */
export function arrivalProgress(now: number, start: number, duration = ARRIVAL_MS): number {
  if (!Number.isFinite(start) || duration <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / duration));
}

/** Local time of ring k in [0, 1] (< 0 before it starts, > 1 after it ends). */
function ringTime(t: number, k: number): number {
  const span = 1 - (ARRIVAL_RINGS - 1) * RING_STAGGER;
  return (t - k * RING_STAGGER) / span;
}

/**
 * Radius of arrival ring k (0 … ARRIVAL_RINGS − 1) at progress t, in marker radii: from
 * 1 + RING_SPREAD down to 1 (ease-out cubic), staggered.
 */
export function arrivalRingScale(t: number, k: number): number {
  const u = Math.min(1, Math.max(0, ringTime(t, k)));
  const e = 1 - (1 - u) ** 3;
  return 1 + RING_SPREAD * (1 - e);
}

/** Opacity of arrival ring k at progress t: fades in then out, 0 outside its own time span. */
export function arrivalRingAlpha(t: number, k: number): number {
  const u = ringTime(t, k);
  return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
}

/** Opacity of the veil over the rest of the sky for a selection kind (constellations only). */
export function selectionDim(kind: string | null | undefined): number {
  return kind === "constellation" ? SELECTION_DIM : 0;
}

/**
 * Radius (CSS px) of a selected figure's star redrawn above the veil, from its magnitude: a
 * little larger than the map's own sprites, so the figure's stars stand out.
 */
export function figureStarRadius(v: number): number {
  return Math.min(4.5, Math.max(2, 3.6 - 0.5 * v));
}

const DIAGONAL = Math.SQRT1_2;

/**
 * Engraved reticle around (x, y): 1-bit dithered band (`pattern`) outside a solid ring of
 * radius r, and four diagonal ticks (labels sit right, left, above or below a point, never on a
 * diagonal). Leaves ctx.globalAlpha / lineWidth / strokeStyle changed.
 */
export function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
  ink: string,
  pattern: CanvasPattern | null,
): void {
  ctx.globalAlpha = alpha * 0.85;
  ctx.lineWidth = 3;
  ctx.strokeStyle = pattern ?? ink;
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  for (let i = 0; i < 4; i++) {
    const dx = i & 1 ? DIAGONAL : -DIAGONAL;
    const dy = i & 2 ? DIAGONAL : -DIAGONAL;
    ctx.moveTo(x + dx * (r + 5), y + dy * (r + 5));
    ctx.lineTo(x + dx * (r + 11), y + dy * (r + 11));
  }
  ctx.stroke();
}

/** Arrival rings at progress t around a marker of radius r (see arrivalRingScale). */
export function drawArrival(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  alpha: number,
  ink: string,
): void {
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ink;
  for (let k = 0; k < ARRIVAL_RINGS; k++) {
    const a = arrivalRingAlpha(t, k);
    if (a <= 0) continue;
    ctx.globalAlpha = a * alpha;
    ctx.beginPath();
    ctx.arc(x, y, r * arrivalRingScale(t, k), 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** 2×2 checkerboard of the ink colour (1-bit dither), cached per ink. */
export function inkPattern(
  ctx: CanvasRenderingContext2D,
  ink: string,
  cache: { ink: string; pattern: CanvasPattern | null } | null,
): { ink: string; pattern: CanvasPattern | null } {
  if (cache?.ink === ink) return cache;
  const tile = document.createElement("canvas");
  tile.width = tile.height = 2;
  const t = tile.getContext("2d");
  if (!t) return { ink, pattern: null };
  t.fillStyle = ink;
  t.fillRect(0, 0, 1, 1);
  t.fillRect(1, 1, 1, 1);
  return { ink, pattern: ctx.createPattern(tile, "repeat") };
}
