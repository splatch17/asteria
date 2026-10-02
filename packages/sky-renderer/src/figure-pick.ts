/**
 * Screen-space hit tests for constellation figures (#61): a tap selects a constellation when it
 * lands inside the convex hull of its line stars, or close to one of its segments (thin figures).
 */
import type { Rect } from "./labels";

export type Point = readonly [number, number];

/** Convex hull (Andrew's monotone chain), counter-clockwise in a y-up frame; ≥ 3 points or []. */
export function convexHull(points: readonly Point[]): Point[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return [];
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, q) <= 0)
        out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  const hull = [...half(p), ...half([...p].reverse())];
  return hull.length >= 3 ? hull : [];
}

/** Even-odd rule; works for any simple polygon. */
export function pointInPolygon([x, y]: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed-area magnitude of a polygon (shoelace). */
export function polygonArea(polygon: readonly Point[]): number {
  let s = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++)
    s += polygon[j]![0] * polygon[i]![1] - polygon[i]![0] * polygon[j]![1];
  return Math.abs(s) / 2;
}

export function distanceToSegment([x, y]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

export interface FigureShape {
  abbr: string;
  /** Projected segments of the figure (screen px). */
  segments: readonly (readonly [Point, Point])[];
}

/**
 * The figure a tap falls in: inside a hull (the smallest wins when figures overlap), otherwise the
 * nearest segment within `slop` px. Null when the tap is in empty sky.
 */
export function pickFigure(
  point: Point,
  figures: readonly FigureShape[],
  slop = 14,
): string | null {
  let best: string | null = null;
  let bestArea = Infinity;
  let near: string | null = null;
  let nearDist = slop;
  for (const f of figures) {
    const hull = convexHull(f.segments.flat());
    if (hull.length && pointInPolygon(point, hull)) {
      const area = polygonArea(hull);
      if (area < bestArea) [best, bestArea] = [f.abbr, area];
    }
    for (const [a, b] of f.segments) {
      const d = distanceToSegment(point, a, b);
      if (d < nearDist) [near, nearDist] = [f.abbr, d];
    }
  }
  return best ?? near;
}

/** Label hit test, with the rectangle grown to a comfortable touch target (≥ 36 px high). */
export function pickLabel(
  [x, y]: Point,
  labels: readonly { abbr: string; rect: Rect }[],
  minHeight = 36,
  padX = 6,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const { abbr, rect } of labels) {
    const grow = Math.max(0, (minHeight - rect.h) / 2);
    if (
      x >= rect.x - padX &&
      x <= rect.x + rect.w + padX &&
      y >= rect.y - grow &&
      y <= rect.y + rect.h + grow
    ) {
      // Grown targets may overlap: the label whose middle line is nearest wins.
      const d = Math.abs(y - (rect.y + rect.h / 2));
      if (d < bestDist) [best, bestDist] = [abbr, d];
    }
  }
  return best;
}
