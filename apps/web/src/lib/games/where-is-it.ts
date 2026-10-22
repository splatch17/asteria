/**
 * Game « Où est-elle ? » (#184): a constellation is named, the player taps its area on the sky
 * map as fast as possible. Pure logic (the screen is WhereGame.svelte).
 *
 * Area = the IAU boundaries (astro-core `constellationAt`, B1875, Delporte 1930). A tap counts as
 * right inside the area, or within TAP_SLOP_PX of its edge (a finger is wider than a boundary
 * line); the slop is converted to degrees at the current field of view.
 *
 * Score of a round: 0 when wrong; when right, MAX_POINTS up to the level's grace time, then down
 * linearly to MIN_POINTS over the level's window, never less (a slow right answer still counts:
 * never punitive). Series of SERIES_LENGTH, record = best total.
 *
 * Memory (spaced repetition, `con:XXX`, shared with the other constellation games):
 * - right within grace + window/2 → « good »;
 * - right but slow, or only within the edge slop → « hard » (SM-2 q = 3);
 * - wrong or given up → « again ».
 */
import type { FigureLevel } from "@asteria/sky-renderer";
import type { Vec3 } from "@asteria/astro-core";
import type { ConstellationShape } from "./geometry";
import { constellationPool } from "./pool";
import { itemKey, type Progress } from "./progress";
import type { Rng } from "./rng";
import { selectItems } from "./select";
import type { Grade } from "./srs";

export const GAME_ID = "whereIsIt";
export const SERIES_LENGTH = 10;
export const MAX_POINTS = 1000;
export const MIN_POINTS = 100;
/** Maximum score of a series. */
export const MAX_SCORE = SERIES_LENGTH * MAX_POINTS;
/** A tap this close (CSS px) to the right area's edge still counts. */
export const TAP_SLOP_PX = 12;

/** Time (ms) with full points, then over which the points fall to MIN_POINTS. */
export const TIMING: Readonly<Record<FigureLevel, { grace: number; window: number }>> = {
  discovery: { grace: 5000, window: 20_000 },
  amateur: { grace: 3000, window: 15_000 },
  expert: { grace: 2000, window: 10_000 },
};

/** Points of a right answer given after `ms`. */
export function pointsFor(ms: number, level: FigureLevel): number {
  const { grace, window } = TIMING[level];
  const t = Math.min(1, Math.max(0, (ms - grace) / window));
  return Math.round(MAX_POINTS - (MAX_POINTS - MIN_POINTS) * t);
}

/** How a round went, for the memory of the constellation. */
export function gradeFor(correct: boolean, ms: number, level: FigureLevel, edge = false): Grade {
  if (!correct) return "again";
  const { grace, window } = TIMING[level];
  return edge || ms > grace + window / 2 ? "hard" : "good";
}

/** The edge slop in degrees at a field of view `fov` (degrees, vertical) over `height` px. */
export function slopDegrees(fov: number, height: number, px = TAP_SLOP_PX): number {
  // Stereographic scale at the centre: the field spans 4·tan(fov/4) over the height.
  const radPerPx = (4 * Math.tan((fov * Math.PI) / 720)) / Math.max(1, height);
  return (px * radPerPx * 180) / Math.PI;
}

export interface Tap {
  /** Constellation holding the tap, null when unknown (no boundaries loaded). */
  tapped: string | null;
  /** Angle (degrees) from the tap to the target's outline. */
  distance: number;
}

/** Judges a tap: right inside the target, or within `slop` degrees of its edge. */
export function judge(
  target: string,
  tap: Tap,
  slop: number,
): { correct: boolean; edge: boolean } {
  if (tap.tapped === target) return { correct: true, edge: false };
  const edge = tap.distance <= slop;
  return { correct: edge, edge };
}

export interface WhereOptions {
  level: FigureLevel;
  shapes: Readonly<Record<string, ConstellationShape>>;
  progress: Progress;
  now: number;
  rng: Rng;
  /** Abbreviations up tonight (preferred). */
  visible?: ReadonlySet<string>;
  length?: number;
}

/** The constellations of a series, for the player's level and memory (pool.ts, select.ts). */
export function buildWhereSeries({
  level,
  shapes,
  progress,
  now,
  rng,
  visible,
  length = SERIES_LENGTH,
}: WhereOptions): string[] {
  const pool = constellationPool(level, Object.keys(shapes));
  return selectItems(
    pool.map((a) => itemKey("con", a)),
    progress,
    {
      count: length,
      now,
      rng,
      visible: visible && new Set([...visible].map((a) => itemKey("con", a))),
      maxNew: level === "discovery" ? 5 : 4,
    },
  ).map((key) => key.slice(4));
}

/** Normalised interpolation between two unit vectors (the camera's path to an area). */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return [...b];
  let p: Vec3;
  if (Math.PI - omega < 1e-6) {
    // Opposite points: any great circle; go through a perpendicular.
    const ref: Vec3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const perp: Vec3 = [
      a[1] * ref[2] - a[2] * ref[1],
      a[2] * ref[0] - a[0] * ref[2],
      a[0] * ref[1] - a[1] * ref[0],
    ];
    const n = Math.hypot(...perp);
    const q: Vec3 = [perp[0] / n, perp[1] / n, perp[2] / n];
    const th = t * Math.PI;
    p = [
      a[0] * Math.cos(th) + q[0] * Math.sin(th),
      a[1] * Math.cos(th) + q[1] * Math.sin(th),
      a[2] * Math.cos(th) + q[2] * Math.sin(th),
    ];
  } else {
    const s = Math.sin(omega);
    const wa = Math.sin((1 - t) * omega) / s;
    const wb = Math.sin(t * omega) / s;
    p = [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
  }
  const n = Math.hypot(...p) || 1;
  return [p[0] / n, p[1] / n, p[2] / n];
}

/**
 * The figure of a constellation as a small drawing (the silhouette card): its lines and stars
 * projected about the figure's centre (gnomonic, north up, east left as on a sky chart), fitted
 * in a unit square [0, 1]², aspect kept and centred. Stars: [x, y, magnitude].
 */
export function silhouette(
  polylines: readonly (readonly number[])[],
  starOf: (hip: number) => { dir: Vec3; v: number } | undefined,
  centre: Vec3,
): { segments: [number, number, number, number][]; stars: [number, number, number][] } {
  const [cx, cy, cz] = centre;
  // East and north unit vectors at the centre.
  const en = Math.hypot(cx, cy) || 1;
  const e: Vec3 = [-cy / en, cx / en, 0];
  const n: Vec3 = [cy * e[2] - cz * e[1], cz * e[0] - cx * e[2], cx * e[1] - cy * e[0]];
  const flat = (d: Vec3): [number, number] | null => {
    const w = d[0] * cx + d[1] * cy + d[2] * cz;
    if (w <= 0.05) return null;
    const x = (d[0] * e[0] + d[1] * e[1] + d[2] * e[2]) / w;
    const y = (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / w;
    return [-x, -y]; // east left, north up (screen y grows downwards)
  };
  const points = new Map<number, { p: [number, number]; v: number }>();
  for (const line of polylines)
    for (const hip of line) {
      if (points.has(hip)) continue;
      const s = starOf(hip);
      const p = s && flat(s.dir);
      if (p && s) points.set(hip, { p, v: s.v });
    }
  const all = [...points.values()].map((s) => s.p);
  if (!all.length) return { segments: [], stars: [] };
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0) || 1;
  const fit = ([x, y]: [number, number]): [number, number] => [
    0.5 + (x - (x0 + x1) / 2) / size,
    0.5 + (y - (y0 + y1) / 2) / size,
  ];
  const segments: [number, number, number, number][] = [];
  for (const line of polylines)
    for (let i = 0; i + 1 < line.length; i++) {
      const a = points.get(line[i]!);
      const b = points.get(line[i + 1]!);
      if (a && b) segments.push([...fit(a.p), ...fit(b.p)]);
    }
  const stars = [...points.values()].map(({ p, v }) => [...fit(p), v] as [number, number, number]);
  return { segments, stars };
}
