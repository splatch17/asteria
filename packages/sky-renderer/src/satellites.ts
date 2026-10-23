/**
 * Artificial satellites on the sky map (#12): the ISS for now.
 *
 * Drawn on the labels' canvas (a handful of objects, positions recomputed by the caller):
 * - the satellite: an engraved glyph, a body between two solar panels, solid when the Sun lights
 *   it (it can be seen), outlined when it is in the Earth's shadow (invisible to the eye);
 * - the track of its current or next pass: a dotted line (dots are kept for paths, see
 *   docs/ART_DIRECTION.md), denser where the satellite can be seen, with time ticks and an
 *   arrow at its end showing which way it goes.
 *
 * Geometry is pure (tested); the draw functions only issue canvas calls.
 */

/** Half-width of the glyph (CSS px): panels included. */
export const SATELLITE_GLYPH_HALF_WIDTH = 8;
/** Distance (CSS px) within which a tap picks a satellite. */
export const SATELLITE_PICK_RADIUS = 20;

/** Pieces of the glyph around (0, 0), CSS px: [x, y, w, h] rectangles, body first. */
export const SATELLITE_GLYPH: readonly (readonly [number, number, number, number])[] = [
  [-2, -2, 4, 4], // pressurised modules
  [-8, -1.5, 4.5, 3], // solar panels (left, right)
  [3.5, -1.5, 4.5, 3],
];

/**
 * Engraved satellite glyph at (x, y), turned by `angle` (radians, along its motion): solid when
 * sunlit, outlined (hairline) when in the Earth's shadow, with a thin truss through the body.
 */
export function drawSatelliteGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  sunlit: boolean,
  alpha: number,
  ink: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();
  for (const [rx, ry, w, h] of SATELLITE_GLYPH) {
    if (sunlit) ctx.fillRect(rx, ry, w, h);
    else ctx.strokeRect(rx + 0.5, ry + 0.5, w - 1, h - 1);
  }
  ctx.restore();
}

/** A projected track point (CSS px); NaN when off the projection (behind the view). */
export interface TrackScreenPoint {
  x: number;
  y: number;
  /** The satellite can be seen there (sunlit, dark sky). */
  visible: boolean;
  /** Time label of a tick, if any. */
  label?: string | undefined;
}

/**
 * Splits a projected track into drawable runs: consecutive points both on the projection and
 * of the same visibility (a run ends where the next starts, so the line has no gap).
 */
export function trackRuns(points: readonly TrackScreenPoint[]): {
  visible: boolean;
  from: number;
  to: number;
}[] {
  const runs: { visible: boolean; from: number; to: number }[] = [];
  let from = -1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const ok = Number.isFinite(p.x) && Number.isFinite(p.y);
    if (!ok) {
      if (from >= 0 && i - 1 > from) runs.push({ visible: points[from]!.visible, from, to: i - 1 });
      from = -1;
      continue;
    }
    if (from < 0) {
      from = i;
      continue;
    }
    if (p.visible !== points[from]!.visible) {
      runs.push({ visible: points[from]!.visible, from, to: i });
      from = i;
    }
  }
  if (from >= 0 && points.length - 1 > from)
    runs.push({ visible: points[from]!.visible, from, to: points.length - 1 });
  return runs;
}

/**
 * Dotted track of a pass: fine sparse dots where the satellite is not visible, dense dots where
 * it is, an arrowhead at the last point. Ticks (with their labels drawn by the caller) are small
 * strokes across the line.
 */
export function drawTrack(
  ctx: CanvasRenderingContext2D,
  points: readonly TrackScreenPoint[],
  alpha: number,
  ink: string,
): void {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";
  for (const run of trackRuns(points)) {
    ctx.globalAlpha = alpha * (run.visible ? 0.95 : 0.55);
    ctx.lineWidth = run.visible ? 2 : 1.5;
    ctx.setLineDash(run.visible ? [0.1, 4] : [0.1, 7]);
    ctx.beginPath();
    ctx.moveTo(points[run.from]!.x, points[run.from]!.y);
    for (let i = run.from + 1; i <= run.to; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Ticks across the line at the labelled points.
  ctx.lineWidth = 1;
  ctx.globalAlpha = alpha * 0.9;
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (!p.label || !Number.isFinite(p.x)) continue;
    const [nx, ny] = normalAt(points, i);
    ctx.moveTo(p.x - nx * 4, p.y - ny * 4);
    ctx.lineTo(p.x + nx * 4, p.y + ny * 4);
  }
  ctx.stroke();
  // Arrowhead at the end: where the satellite goes.
  const end = lastDrawable(points);
  if (end > 0) {
    const p = points[end]!;
    const [dx, dy] = directionAt(points, end);
    ctx.globalAlpha = alpha * 0.9;
    ctx.beginPath();
    ctx.moveTo(p.x + dx * 4, p.y + dy * 4);
    ctx.lineTo(p.x - dx * 4 - dy * 4, p.y - dy * 4 + dx * 4);
    ctx.lineTo(p.x - dx * 4 + dy * 4, p.y - dy * 4 - dx * 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function lastDrawable(points: readonly TrackScreenPoint[]): number {
  for (let i = points.length - 1; i >= 0; i--) if (Number.isFinite(points[i]!.x)) return i;
  return -1;
}

/** Unit direction of the track at point i (screen space), from its drawable neighbours. */
export function directionAt(points: readonly TrackScreenPoint[], i: number): [number, number] {
  const a = points[i - 1] && Number.isFinite(points[i - 1]!.x) ? points[i - 1]! : points[i]!;
  const b = points[i + 1] && Number.isFinite(points[i + 1]!.x) ? points[i + 1]! : points[i]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.hypot(dx, dy);
  return n > 0 ? [dx / n, dy / n] : [1, 0];
}

/** Unit normal of the track at point i (screen space). */
export function normalAt(points: readonly TrackScreenPoint[], i: number): [number, number] {
  const [dx, dy] = directionAt(points, i);
  return [-dy, dx];
}
