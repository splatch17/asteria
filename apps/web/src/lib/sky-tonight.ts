/**
 * « Ce soir » of the Ciel tab (menu v2): one short line of what is worth a look, from the helpers
 * the sheets already use — the constellation standing highest (among the well-known ones of the
 * Découverte list, the figure's centre), and when the Moon sets or rises. By day it is computed
 * for the coming dark night (astro-core nextDarkNight, as « Voir ce soir », #198).
 * Altitudes are geometric (no refraction), from `j2000ToHorizontalMatrix` (precession of date,
 * Meeus 21) as in lib/horizon; the Moon from `bodyPosition` (astronomy-engine, validated against
 * JPL Horizons in astro-core). A rise or set to the minute is plenty for a sentence.
 */
import { applyMat3, j2000ToHorizontalMatrix, type Observer, type Vec3 } from "@asteria/astro-core";
import { nextRiseOf } from "./horizon";

const DEG = 180 / Math.PI;
const HOUR_MS = 3_600_000;

/** Below this the line names nothing from the short list and looks at all the figures. */
export const TONIGHT_MIN_ALTITUDE = 20;
/** From this altitude a figure is « haut » (high). */
export const TONIGHT_HIGH_ALTITUDE = 40;
/** The Sun below this, it is dark enough to name what is up now (civil twilight is over). */
export const TONIGHT_DARK_SUN = -6;
/** A Moon rise further than this is not « tonight ». */
export const TONIGHT_MOON_HOURS = 12;

export interface FigurePick {
  abbr: string;
  /** Degrees above the horizon, and degrees from north through east. */
  altitude: number;
  azimuth: number;
}

/**
 * The figure standing highest at `date`, among `candidates` (abbreviations) whose centre is
 * known; null when none is above `minAltitude`.
 */
export function highestFigure(
  centres: Readonly<Record<string, Vec3>>,
  candidates: readonly string[],
  date: Date,
  observer: Observer,
  minAltitude = 0,
): FigurePick | null {
  const m = j2000ToHorizontalMatrix(date, observer);
  let best: FigurePick | null = null;
  for (const abbr of candidates) {
    const c = centres[abbr];
    if (!c) continue;
    const [n, e, up] = applyMat3(m, c);
    const altitude = Math.asin(Math.max(-1, Math.min(1, up))) * DEG;
    if (altitude < minAltitude || (best && altitude <= best.altitude)) continue;
    best = { abbr, altitude, azimuth: (((Math.atan2(e, n) * DEG) % 360) + 360) % 360 };
  }
  return best;
}

/**
 * The highest figure worth naming: a well-known one (`known`) at least TONIGHT_MIN_ALTITUDE
 * high, else the highest of all.
 */
export function figureToSee(
  centres: Readonly<Record<string, Vec3>>,
  known: readonly string[],
  date: Date,
  observer: Observer,
): FigurePick | null {
  return (
    highestFigure(centres, known, date, observer, TONIGHT_MIN_ALTITUDE) ??
    highestFigure(centres, Object.keys(centres), date, observer)
  );
}

export type MoonEvent = { kind: "sets" | "rises"; at: number } | null;

/**
 * What the Moon does next from `t0` (Unix ms): up, when it sets (within a day); down, when it
 * rises if that is within TONIGHT_MOON_HOURS. `altitude` is its geometric altitude at an instant.
 */
export function moonEvent(altitude: (t: number) => number, t0: number): MoonEvent {
  if (altitude(t0) >= 0) {
    const at = nextRiseOf((t) => -altitude(t), t0);
    return at === null ? null : { kind: "sets", at };
  }
  const at = nextRiseOf(altitude, t0);
  return at !== null && at - t0 <= TONIGHT_MOON_HOURS * HOUR_MS ? { kind: "rises", at } : null;
}

export interface TonightLine {
  /** « Ce soir » / « Cette nuit » now, or the coming dark night's start (`at`) by day. */
  when: "evening" | "night";
  /** The instant described: now in the dark, the night's start by day. */
  at: Date;
  /** By day the line speaks of the coming night (its time is said). */
  later: boolean;
  figure: FigurePick | null;
  high: boolean;
  moon: MoonEvent;
}

/**
 * The line: at `date` when the Sun is down past TONIGHT_DARK_SUN, else at `nightStart` (the
 * coming dark night, null if unknown: then at `date`).
 */
export function tonightLine(o: {
  date: Date;
  observer: Observer;
  sunAltitude: number;
  nightStart: Date | null;
  centres: Readonly<Record<string, Vec3>>;
  known: readonly string[];
  /** The Moon's geometric altitude at an instant, or null (out of the ephemeris' range). */
  moonAltitude: ((t: number) => number) | null;
}): TonightLine {
  const later = o.sunAltitude > TONIGHT_DARK_SUN && o.nightStart !== null;
  const at = later && o.nightStart ? o.nightStart : o.date;
  const figure = figureToSee(o.centres, o.known, at, o.observer);
  const hour = at.getHours();
  return {
    when: hour >= 12 ? "evening" : "night",
    at,
    later,
    figure,
    high: (figure?.altitude ?? 0) >= TONIGHT_HIGH_ALTITUDE,
    moon: o.moonAltitude ? moonEvent(o.moonAltitude, at.getTime()) : null,
  };
}
