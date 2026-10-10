/**
 * Sun and Moon via astronomy-engine (MIT, Don Cross), validated against JPL Horizons.
 *
 * Conventions as in coords.ts: degrees, azimuth from North towards East, longitude east-positive.
 */

import * as Astronomy from "astronomy-engine";
import type { Observer } from "./coords";

export const PLANETS = [
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
] as const;
export type Planet = (typeof PLANETS)[number];
export type SolarSystemBody = "Sun" | "Moon" | Planet;

export interface BodyPosition {
  /** Astrometric J2000 right ascension / declination, topocentric (feeds the J2000 → view pipeline). */
  ra: number;
  dec: number;
  /** Apparent azimuth / altitude of date, without refraction. */
  azimuth: number;
  altitude: number;
  /** Distance from the observer in km. */
  distanceKm: number;
  /** Apparent visual magnitude (geocentric). */
  magnitude: number;
}

const toAstroObserver = ({ latitude, longitude }: Observer) =>
  new Astronomy.Observer(latitude, longitude, 0);

export function bodyPosition(body: SolarSystemBody, date: Date, observer: Observer): BodyPosition {
  const obs = toAstroObserver(observer);
  const b = Astronomy.Body[body];
  const j2000 = Astronomy.Equator(b, date, obs, false, false);
  const ofDate = Astronomy.Equator(b, date, obs, true, true);
  const hor = Astronomy.Horizon(date, obs, ofDate.ra, ofDate.dec);
  return {
    ra: j2000.ra * 15,
    dec: j2000.dec,
    azimuth: hor.azimuth,
    altitude: hor.altitude,
    distanceKm: j2000.dist * Astronomy.KM_PER_AU,
    magnitude: Astronomy.Illumination(b, date).mag,
  };
}

export interface MoonPhase {
  /** Illuminated fraction of the disc, 0…1. */
  illumination: number;
  /** Sun–Moon ecliptic elongation, 0° = new, 90° = first quarter, 180° = full, 270° = last quarter. */
  phaseAngle: number;
  /** True between new and full Moon. */
  waxing: boolean;
}

export function moonPhase(date: Date): MoonPhase {
  const phaseAngle = Astronomy.MoonPhase(date);
  return {
    illumination: Astronomy.Illumination(Astronomy.Body.Moon, date).phase_fraction,
    phaseAngle,
    waxing: phaseAngle < 180,
  };
}

/** Geographic point where the Sun is at the zenith (drives the day/night terminator on the globe). */
export function subsolarPoint(date: Date): { latitude: number; longitude: number } {
  const sun = Astronomy.Equator(
    Astronomy.Body.Sun,
    date,
    new Astronomy.Observer(0, 0, 0),
    true,
    true,
  );
  const gast = Astronomy.SiderealTime(date) * 15;
  const longitude = ((((sun.ra * 15 - gast) % 360) + 540) % 360) - 180;
  return { latitude: sun.dec, longitude };
}

export interface PathPoint {
  date: Date;
  ra: number;
  dec: number;
}

/**
 * Apparent path of a body across the sky (astrometric J2000, topocentric), sampled every
 * `stepDays` between `start` and `end`. Shows retrograde loops of the outer planets.
 */
export function bodyPath(
  body: SolarSystemBody,
  start: Date,
  end: Date,
  stepDays: number,
  observer: Observer,
): PathPoint[] {
  const obs = toAstroObserver(observer);
  const b = Astronomy.Body[body];
  const points: PathPoint[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += stepDays * 86_400_000) {
    const date = new Date(t);
    const eq = Astronomy.Equator(b, date, obs, false, false);
    points.push({ date, ra: eq.ra * 15, dec: eq.dec });
  }
  return points;
}

/**
 * IAU constellation (3-letter abbreviation, e.g. "Ori") containing a J2000 position, from the
 * official boundaries (Delporte 1930, as tabulated by Roman 1987, CDS VI/42) via astronomy-engine.
 * Positions are J2000 (as returned by bodyPosition), so no date is needed: astronomy-engine
 * precesses them to B1875, the epoch of the boundaries.
 */
export function constellationOf(ra: number, dec: number): string {
  return Astronomy.Constellation((((ra % 360) + 360) % 360) / 15, dec).symbol;
}

/** Speed of light, au per day (IAU 2012: c = 299 792 458 m/s, au = 149 597 870 700 m). */
const C_AU_PER_DAY = 173.1446326846693;

/** Geocentric position of a body, J2000 mean equator (EQJ, as astronomy-engine), km. */
export interface GeocentricPosition {
  x: number;
  y: number;
  z: number;
  /** Distance from the Earth's centre, km. */
  distanceKm: number;
  /** Light time from the body to the Earth's centre, seconds. */
  lightTimeS: number;
}

/**
 * Astrometric geocentric position of the Sun, the Moon or a planet at `date`: where the body was
 * when the light now reaching the Earth's centre left it (light-time corrected, no aberration,
 * no nutation), J2000 mean equator, km. Same quantity as JPL Horizons' astrometric RA/Dec
 * (quantity 1) seen from the geocentre (500@399).
 *
 * astronomy-engine's GeoVector corrects the planets and the Sun for light time but returns the
 * Moon's geometric position: the Moon is backdated here (≈ 1.3 s, a shift of about 0.7″).
 * Writes into `out` when given.
 */
export function geocentricPosition(
  body: SolarSystemBody,
  date: Date,
  out: GeocentricPosition = { x: 0, y: 0, z: 0, distanceKm: 0, lightTimeS: 0 },
): GeocentricPosition {
  let v: Astronomy.Vector;
  if (body === "Moon") {
    const t = Astronomy.MakeTime(date);
    v = Astronomy.GeoMoon(t);
    // Two iterations: the light time then changes by far less than a microsecond.
    for (let i = 0; i < 2; i++) v = Astronomy.GeoMoon(t.AddDays(-v.Length() / C_AU_PER_DAY));
  } else {
    v = Astronomy.GeoVector(Astronomy.Body[body], date, false);
  }
  const au = Astronomy.KM_PER_AU;
  const length = v.Length();
  out.x = v.x * au;
  out.y = v.y * au;
  out.z = v.z * au;
  out.distanceKm = length * au;
  out.lightTimeS = (length / C_AU_PER_DAY) * 86_400;
  return out;
}
