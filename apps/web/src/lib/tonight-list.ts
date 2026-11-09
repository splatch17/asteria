/**
 * The « Ce soir » page of the Ciel tab (#11): what the coming night offers, in a few rows — the
 * night's hours, the Moon, the planets one can see with the naked eye, and the well-known
 * figures standing highest. Pure: the positions come from the callers (astro-core bodyPosition,
 * astronomy-engine validated against JPL Horizons; figure centres as in lib/sky-tonight).
 *
 * Conventions: Unix ms, degrees, geometric altitudes (no refraction). « Night » is the time the
 * Sun's centre stays below TONIGHT_SUN (the end of civil twilight: planets and bright stars are
 * out); an object « shows » while it is at least TONIGHT_MIN_ALTITUDE above the horizon during
 * that night. Times are found on a 10-minute grid, crossings refined to the minute.
 */
import { applyMat3, j2000ToHorizontalMatrix, type Observer, type Vec3 } from "@asteria/astro-core";
import type { FigurePick } from "./sky-tonight";

const DEG = 180 / Math.PI;
const MINUTE = 60_000;
const HOUR = 3_600_000;

/** End of civil twilight. */
export const TONIGHT_SUN = -6;
/** Lower than this an object is in the haze and behind roofs: not listed. */
export const TONIGHT_MIN_ALTITUDE = 5;
/** Below this at its best, a listed object is said « low ». */
export const TONIGHT_LOW_ALTITUDE = 15;
/**
 * The best moment is not taken in the night's first and last minutes, when the sky is at its
 * brightest (the Sun just past TONIGHT_SUN): 45 minutes later it is about 12° down at mid
 * latitudes, and the map shown then no longer says « étoiles invisibles de jour ».
 */
export const TONIGHT_BEST_MARGIN = 45 * MINUTE;
/** Sampling step of the searches. */
export const TONIGHT_STEP = 10 * MINUTE;

export interface Night {
  start: number;
  end: number;
  /** The night is under way at the instant asked (`start` is that instant). */
  now: boolean;
  /** No dawn found within a day and a half (polar night): `end` is start + 24 h. */
  endless: boolean;
}

/** The instant `f` crosses `level` between `a` and `b` (it does once), to the minute. */
function crossing(f: (t: number) => number, level: number, a: number, b: number): number {
  const rising = f(b) >= level;
  let lo = a;
  let hi = b;
  while (hi - lo > MINUTE) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= level === rising) hi = mid;
    else lo = mid;
  }
  return Math.round(hi / MINUTE) * MINUTE;
}

/**
 * The night under way at `t0`, else the next one starting within a day; null when the Sun does
 * not go below TONIGHT_SUN in that time (midnight sun, white nights).
 */
export function nightOf(sunAltitude: (t: number) => number, t0: number): Night | null {
  let start = t0;
  const now = sunAltitude(t0) < TONIGHT_SUN;
  if (!now) {
    let found: number | null = null;
    for (let t = t0; t < t0 + 24 * HOUR; t += TONIGHT_STEP) {
      if (sunAltitude(t + TONIGHT_STEP) < TONIGHT_SUN) {
        found = crossing(sunAltitude, TONIGHT_SUN, t, t + TONIGHT_STEP);
        break;
      }
    }
    if (found === null) return null;
    start = found;
    // The rounded minute may fall on the bright side: the night starts in the dark.
    while (sunAltitude(start) >= TONIGHT_SUN) start += MINUTE;
  }
  for (let t = start; t < start + 36 * HOUR; t += TONIGHT_STEP) {
    if (sunAltitude(t + TONIGHT_STEP) >= TONIGHT_SUN && t + TONIGHT_STEP > start + MINUTE) {
      let end = crossing(sunAltitude, TONIGHT_SUN, t, t + TONIGHT_STEP);
      while (end > start && sunAltitude(end) >= TONIGHT_SUN) end -= MINUTE;
      if (end > start) return { start, end, now, endless: false };
    }
  }
  return { start, end: start + 24 * HOUR, now, endless: true };
}

export interface Showing {
  /** When it shows during the night (its longest stretch above the minimum altitude). */
  from: number;
  to: number;
  /** Up from the night's first minute / until its last. */
  fromStart: boolean;
  toEnd: boolean;
  /**
   * Its best moment in that stretch and where it is then: the highest one TONIGHT_BEST_MARGIN
   * away from dusk and dawn if it is then well up, else the highest one, in the twilight.
   */
  best: number;
  altitude: number;
  azimuth: number;
}

/**
 * When an object shows during `night`: its longest stretch at `minAltitude` or more; null when
 * it never gets there.
 */
export function showingOf(
  position: (t: number) => { altitude: number; azimuth: number },
  night: Night,
  minAltitude = TONIGHT_MIN_ALTITUDE,
): Showing | null {
  const alt = (t: number) => position(t).altitude;
  let best: Showing | null = null;
  let from: number | null = null;
  // The highest sample of the stretch: `dark` away from dusk and dawn, `any` otherwise.
  const none = { t: 0, altitude: -90 };
  let dark = none;
  let any = none;
  const darkFrom = night.start + TONIGHT_BEST_MARGIN;
  const darkTo = night.end - TONIGHT_BEST_MARGIN;
  const sample = (t: number, altitude: number) => {
    if (altitude > any.altitude) any = { t, altitude };
    if (t >= darkFrom && t <= darkTo && altitude > dark.altitude) dark = { t, altitude };
  };
  const close = (to: number, toEnd: boolean) => {
    if (from === null) return;
    if (!best || to - from > best.to - best.from) {
      // Away from dusk and dawn when the object is then well up; an object that only shows low
      // in the twilight (Venus as the morning star) is at its best in it, ten minutes inside.
      const inside = Math.min(
        Math.max(any.t, night.start + TONIGHT_STEP),
        night.end - TONIGHT_STEP,
      );
      const top =
        dark.altitude >= TONIGHT_LOW_ALTITUDE || dark.altitude >= any.altitude - 1
          ? dark
          : { t: Math.min(Math.max(inside, from), to), altitude: any.altitude };
      const p = position(top.t);
      best = {
        from,
        to,
        fromStart: from === night.start,
        toEnd,
        best: top.t,
        altitude: p.altitude,
        azimuth: p.azimuth,
      };
    }
    from = null;
    dark = none;
    any = none;
  };
  let prev = night.start;
  let prevAlt = alt(prev);
  if (prevAlt >= minAltitude) {
    from = prev;
    sample(prev, prevAlt);
  }
  while (prev < night.end) {
    const t = Math.min(prev + TONIGHT_STEP, night.end);
    const a = alt(t);
    if (from === null && a >= minAltitude) from = crossing(alt, minAltitude, prev, t);
    if (from !== null && a < minAltitude) close(crossing(alt, minAltitude, prev, t), false);
    else if (from !== null) sample(t, a);
    prev = t;
    prevAlt = a;
  }
  close(night.end, true);
  return best;
}

export type MoonPhaseName =
  | "new"
  | "waxingCrescent"
  | "firstQuarter"
  | "waxingGibbous"
  | "full"
  | "waningGibbous"
  | "lastQuarter"
  | "waningCrescent";

/**
 * The phase's name from the Moon's ecliptic elongation east of the Sun (0° new, 90° first
 * quarter, 180° full, 270° last quarter). The four principal phases are named within ± 6.1° of
 * their angle (about half a day), the others in between.
 */
export function moonPhaseName(phaseAngle: number): MoonPhaseName {
  const a = ((phaseAngle % 360) + 360) % 360;
  const HALF = 6.1;
  if (a < HALF || a >= 360 - HALF) return "new";
  if (a < 90 - HALF) return "waxingCrescent";
  if (a < 90 + HALF) return "firstQuarter";
  if (a < 180 - HALF) return "waxingGibbous";
  if (a < 180 + HALF) return "full";
  if (a < 270 - HALF) return "waningGibbous";
  if (a < 270 + HALF) return "lastQuarter";
  return "waningCrescent";
}

/** The `count` figures standing highest at `date` among `candidates`, at `minAltitude` or more. */
export function topFigures(
  centres: Readonly<Record<string, Vec3>>,
  candidates: readonly string[],
  date: Date,
  observer: Observer,
  count: number,
  minAltitude = 20,
): FigurePick[] {
  const m = j2000ToHorizontalMatrix(date, observer);
  const picks: FigurePick[] = [];
  for (const abbr of candidates) {
    const c = centres[abbr];
    if (!c) continue;
    const [n, e, up] = applyMat3(m, c);
    const altitude = Math.asin(Math.max(-1, Math.min(1, up))) * DEG;
    if (altitude < minAltitude) continue;
    picks.push({ abbr, altitude, azimuth: (((Math.atan2(e, n) * DEG) % 360) + 360) % 360 });
  }
  return picks.sort((a, b) => b.altitude - a.altitude).slice(0, count);
}
