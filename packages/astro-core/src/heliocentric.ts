/**
 * Heliocentric positions and the seasons (#128, #124), via astronomy-engine (MIT, Don Cross).
 *
 * - heliocentricPosition: geometric position of the Earth or a planet from the Sun's centre,
 *   J2000 mean equator (EQJ, as astronomy-engine), astronomical units. "Geometric": where the
 *   body is at that instant (no light time), the quantity JPL Horizons gives for
 *   "GEOMETRIC cartesian states" with centre @10 (Sun body centre), ICRF frame.
 * - seasons: instants of the equinoxes and solstices of a calendar year (astronomy-engine
 *   Seasons(), the Sun's apparent geocentric ecliptic longitude crossing 0°, 90°, 180°, 270°).
 */
import * as Astronomy from "astronomy-engine";
import type { Planet } from "./bodies";

export interface HeliocentricPosition {
  x: number;
  y: number;
  z: number;
  /** Distance from the Sun's centre, au. */
  distanceAu: number;
}

/** Bodies with a heliocentric orbit drawn by the Earth view: the Earth and the planets. */
export type OrbitingBody = "Earth" | Planet;

/** Orbiting bodies from the Sun outwards. */
export const ORBITING_BODIES: readonly OrbitingBody[] = [
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
];

/**
 * Sidereal orbital periods, days (JPL Horizons physical data, "Sidereal orb period"; Earth
 * 365.25636 d): only used to sample an orbit once round, not for positions.
 */
export const ORBITAL_PERIOD_DAYS: Readonly<Record<OrbitingBody, number>> = Object.freeze({
  Mercury: 87.969,
  Venus: 224.701,
  Earth: 365.25636,
  Mars: 686.98,
  Jupiter: 4332.589,
  Saturn: 10755.698,
  Uranus: 30685.4,
  Neptune: 60189,
});

/**
 * Geometric heliocentric position of the Earth or a planet at `date` (UTC), J2000 mean
 * equator, au. Writes into `out` when given.
 */
export function heliocentricPosition(
  body: OrbitingBody,
  date: Date,
  out: HeliocentricPosition = { x: 0, y: 0, z: 0, distanceAu: 0 },
): HeliocentricPosition {
  const v = Astronomy.HelioVector(Astronomy.Body[body], date);
  out.x = v.x;
  out.y = v.y;
  out.z = v.z;
  out.distanceAu = Math.hypot(v.x, v.y, v.z);
  return out;
}

export interface Seasons {
  marchEquinox: Date;
  juneSolstice: Date;
  septemberEquinox: Date;
  decemberSolstice: Date;
}

/** The four seasons' kinds, in calendar order. */
export const SEASON_KINDS = [
  "marchEquinox",
  "juneSolstice",
  "septemberEquinox",
  "decemberSolstice",
] as const;
export type SeasonKind = (typeof SEASON_KINDS)[number];

/** Equinoxes and solstices of a UTC calendar year (astronomy-engine Seasons, ≈ 1 min). */
export function seasons(year: number): Seasons {
  const s = Astronomy.Seasons(year);
  return {
    marchEquinox: s.mar_equinox.date,
    juneSolstice: s.jun_solstice.date,
    septemberEquinox: s.sep_equinox.date,
    decemberSolstice: s.dec_solstice.date,
  };
}
