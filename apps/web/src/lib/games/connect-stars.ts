/**
 * Game « Relie les étoiles » (#164): the player traces a constellation's figure on the real sky,
 * star to star. Pure logic (the screen is ConnectGame.svelte).
 *
 * - Segments: the figure lines the map draws (Stellarium, constellation-lines.json), as
 *   unordered pairs of HIP numbers, each counted once. Either direction is right.
 * - Which figures are played (`connectable`):
 *   - at least MIN_SEGMENTS segments (one stroke is no puzzle: Petit Chien, Sextant…);
 *   - at most MAX_SEGMENTS for the level: 12 in Découverte (Cassiopée, Lyre, Lion, Scorpion…;
 *     Orion's 24 segments or the Great Bear's 19 are too long for a child's game), 20 in Amateur,
 *     no limit in Expert;
 *   - every star of the figure drawn by the map at the field that frames it (its magnitude at
 *     least MAG_MARGIN brighter than `limitingMagnitude`, for a portrait stage of
 *     REFERENCE_ASPECT): otherwise a star to reach would be missing (Poissons, Pégase).
 * - Grade fed to the shared memory (`con:XXX`, as « Quelle constellation ? »), SM-2-consistent:
 *   traced without hint and with at most CLEAN_ERRORS wrong segments → « good » (q = 4);
 *   traced with hints or more errors → « hard » (q = 3); solution shown → « again ».
 * - Hints: on demand, and offered after AUTO_HINT_ERRORS wrong segments in a row.
 */
import type { FigureLevel } from "@asteria/sky-renderer";
import { limitingMagnitude } from "@asteria/sky-renderer";
import { framingFov, type ConstellationShape } from "./geometry";
import { constellationPool } from "./pool";
import { itemKey, type Progress } from "./progress";
import type { Rng } from "./rng";
import { selectItems } from "./select";
import type { Grade } from "./srs";

export const GAME_ID = "connectStars";
export const SERIES_LENGTH = 5;
export const MIN_SEGMENTS = 2;
export const MAX_SEGMENTS: Readonly<Record<FigureLevel, number>> = {
  discovery: 12,
  amateur: 20,
  expert: Infinity,
};
export const REFERENCE_ASPECT = 0.75;
export const MAG_MARGIN = 0.4;
export const CLEAN_ERRORS = 2;
export const AUTO_HINT_ERRORS = 3;
/** Tracing frames figures larger than the quiz (fill) and lets small ones zoom in (min field). */
export const TRACE_FILL = 0.82;
export const TRACE_MIN_FOV = 12;

/** A figure segment: two HIP numbers, smaller first. */
export type Segment = readonly [number, number];

export const segmentKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Unique segments of a figure's polylines, leaving out stars the catalogue lacks. */
export function figureSegments(
  polylines: readonly (readonly number[])[],
  known: (hip: number) => boolean,
): Segment[] {
  const seen = new Set<string>();
  const out: Segment[] = [];
  for (const line of polylines)
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      if (a === b || !known(a) || !known(b)) continue;
      const key = segmentKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a < b ? [a, b] : [b, a]);
    }
  return out;
}

/** Field of view framing a figure for tracing. */
export const traceFov = (radius: number, aspect: number): number =>
  framingFov(radius, aspect, TRACE_FILL, TRACE_MIN_FOV);

/** The figure can be played at this level (see the file header). */
export function connectable(
  segments: readonly Segment[],
  magnitudes: (hip: number) => number,
  radius: number,
  level: FigureLevel,
): boolean {
  if (segments.length < MIN_SEGMENTS || segments.length > MAX_SEGMENTS[level]) return false;
  const limit = limitingMagnitude(traceFov(radius, REFERENCE_ASPECT)) - MAG_MARGIN;
  return segments.every(([a, b]) => magnitudes(a) <= limit && magnitudes(b) <= limit);
}

export interface Trace {
  segments: readonly Segment[];
  /** Keys of the segments found. */
  found: ReadonlySet<string>;
  errors: number;
  /** Wrong segments since the last one found or the last hint. */
  streak: number;
  hints: number;
  /** The solution was shown. */
  revealed: boolean;
}

export const newTrace = (segments: readonly Segment[]): Trace => ({
  segments,
  found: new Set(),
  errors: 0,
  streak: 0,
  hints: 0,
  revealed: false,
});

/** found: a new segment; again: already found; wrong: not in the figure; same: one star. */
export type AttemptResult = "found" | "again" | "wrong" | "same";

/** The trace after joining stars a and b. */
export function attempt(
  trace: Trace,
  a: number,
  b: number,
): { trace: Trace; result: AttemptResult } {
  if (a === b) return { trace, result: "same" };
  const key = segmentKey(a, b);
  if (trace.found.has(key)) return { trace, result: "again" };
  if (trace.segments.some(([x, y]) => segmentKey(x, y) === key))
    return {
      trace: { ...trace, found: new Set([...trace.found, key]), streak: 0 },
      result: "found",
    };
  return {
    trace: { ...trace, errors: trace.errors + 1, streak: trace.streak + 1 },
    result: "wrong",
  };
}

export const isComplete = (t: Trace): boolean => t.found.size === t.segments.length;

/** A hint is offered on its own after AUTO_HINT_ERRORS misses in a row. */
export const needsHint = (t: Trace): boolean =>
  !isComplete(t) && !t.revealed && t.streak >= AUTO_HINT_ERRORS;

/**
 * Next stroke to suggest: an unfound segment from the selected star, else one that continues
 * the trace (touching a star already joined), else the first one left. `from` is the star to
 * start at, `to` the star to reach (the one highlighted).
 */
export function nextHint(t: Trace, selected: number | null): { from: number; to: number } | null {
  const left = t.segments.filter(([a, b]) => !t.found.has(segmentKey(a, b)));
  if (!left.length) return null;
  const joined = new Set<number>();
  for (const [a, b] of t.segments) if (t.found.has(segmentKey(a, b))) joined.add(a).add(b);
  const orient = ([a, b]: Segment, start: number) =>
    start === a ? { from: a, to: b } : { from: b, to: a };
  if (selected !== null) {
    const s = left.find(([a, b]) => a === selected || b === selected);
    if (s) return orient(s, selected);
  }
  const cont = left.find(([a, b]) => joined.has(a) || joined.has(b));
  if (cont) return orient(cont, joined.has(cont[0]) ? cont[0] : cont[1]);
  return orient(left[0]!, left[0]![0]);
}

/** The trace after a hint was given (counts it, clears the miss streak). */
export const withHint = (t: Trace): Trace => ({ ...t, hints: t.hints + 1, streak: 0 });

/** The trace once the solution is shown: every segment found, marked revealed. */
export const withSolution = (t: Trace): Trace => ({
  ...t,
  revealed: true,
  found: new Set(t.segments.map(([a, b]) => segmentKey(a, b))),
});

/** How the figure went, for the shared memory (see the file header). */
export function gradeOf(t: Trace): Grade {
  if (t.revealed) return "again";
  return t.hints === 0 && t.errors <= CLEAN_ERRORS ? "good" : "hard";
}

/** A star on screen (CSS px) that a touch may snap to. */
export interface ScreenStar {
  hip: number;
  x: number;
  y: number;
}

/** The star nearest to (x, y) within `radius` px, or null. */
export function snap(
  x: number,
  y: number,
  stars: readonly ScreenStar[],
  radius: number,
): number | null {
  let best: number | null = null;
  let bestD = radius * radius;
  for (const s of stars) {
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = s.hip;
    }
  }
  return best;
}

export interface ConnectSeriesOptions {
  level: FigureLevel;
  /** Segments of each figure the catalogue can draw. */
  figures: Readonly<Record<string, readonly Segment[]>>;
  shapes: Readonly<Record<string, ConstellationShape>>;
  magnitudes: (hip: number) => number;
  progress: Progress;
  now: number;
  rng: Rng;
  visible?: ReadonlySet<string>;
  length?: number;
}

/** The constellations of a series: the level's pool, playable ones only, drawn by the engine. */
export function buildConnectSeries(o: ConnectSeriesOptions): string[] {
  const pool = constellationPool(o.level, Object.keys(o.shapes)).filter((abbr) => {
    const segs = o.figures[abbr];
    const shape = o.shapes[abbr];
    return !!segs && !!shape && connectable(segs, o.magnitudes, shape.radius, o.level);
  });
  return selectItems(
    pool.map((a) => itemKey("con", a)),
    o.progress,
    {
      count: o.length ?? SERIES_LENGTH,
      now: o.now,
      rng: o.rng,
      visible: o.visible && new Set([...o.visible].map((a) => itemKey("con", a))),
      maxNew: 3,
    },
  ).map((key) => key.slice(4));
}
