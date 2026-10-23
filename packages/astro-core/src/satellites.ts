/**
 * Artificial satellites (#12): SGP4 propagation of NORAD general perturbation elements (TLE or
 * OMM, as distributed by CelesTrak) and topocentric look angles, visible passes.
 *
 * Imported as `@asteria/astro-core/satellites`, not from the package index: it pulls satellite.js
 * (MIT, ≈ 25 KB gzip of SGP4/SDP4), which the app loads on demand only.
 *
 * Frames and conventions
 * - SGP4 output is in **TEME** (True Equator, Mean Equinox of date), km and km/s, at UTC instants
 *   (UT1 is taken as UTC: |UT1 − UTC| < 0.9 s, i.e. < 0.4 km of Earth rotation at the equator,
 *   well below the error of the elements themselves, ~1 km at epoch growing by a few km a day).
 * - TEME → Earth-fixed (pseudo Earth-fixed, PEF): rotation by GMST (IAU 1982, `greenwichMeanSiderealTime`),
 *   as Vallado et al. 2006 (AIAA 2006-6753, appendix C). Polar motion (< 0.5″, ≈ 15 m at the
 *   ISS) is ignored, so PEF ≈ ITRF.
 * - Observer: WGS-84 geodetic latitude/longitude (east positive), height above the ellipsoid.
 * - Look angles: azimuth from North towards East, geometric altitude (no refraction), as
 *   coords.ts. Range in km.
 * - Directions handed to the sky map (`ra`, `dec`) are J2000 such that the map's own
 *   J2000 → horizontal matrix (`j2000ToHorizontalMatrix`: IAU 1976 precession and mean sidereal
 *   time, no nutation) gives back the true altitude and azimuth: the satellite is drawn where it
 *   is in the observer's sky. They differ from a rigorous astrometric J2000 position by at most
 *   the nutation (≈ 20″). `temeToJ2000` gives the rigorous geocentric position.
 * - Earth's shadow: the satellite is lit when the line to the Sun's centre misses a sphere of
 *   6 378.137 km (cylindrical umbra, no penumbra nor atmosphere; as Skyfield's is_sunlit).
 *
 * Accuracy of the computation (see satellites.test.ts; measured values in brackets): SGP4 matches
 * Vallado's reference implementation to 1 mm on the published verification cases [< 0.01 mm];
 * TEME → Earth-fixed to 20 m (Vallado's appendix C, polar motion ignored) [16 m]; geocentric
 * J2000 to 10 m against JPL Horizons [2 m]; look angles to 0.005° and 50 m [11″, 22 m], rise,
 * culmination and set to 1 s [0.2 s], Earth's shadow to 2 s, against Skyfield.
 * The elements themselves are the real limit: about 1 km at their epoch, growing by a few km a
 * day for the ISS (drag, reboosts), i.e. seconds of timing, then minutes after a week.
 */

import * as Astronomy from "astronomy-engine";
import { json2satrec, sgp4, twoline2satrec, type OMMJsonObject, type SatRec } from "satellite.js";
import type { Horizontal, Observer } from "./coords";
import { j2000ToHorizontalMatrix, type Vec3 } from "./matrices";
import { greenwichMeanSiderealTime } from "./time";

const RAD = Math.PI / 180;
const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;
/** WGS-84 ellipsoid (NIMA TR8350.2): equatorial radius (km) and flattening. */
export const WGS84_A = 6378.137;
export const WGS84_F = 1 / 298.257223563;
/** Radius of the Earth's shadow cylinder (km): the equatorial radius. */
const SHADOW_RADIUS = WGS84_A;
/** GM of the Earth, WGS-72 (km³/s²): the constant SGP4 elements are defined with. */
const GM_WGS72 = 398600.8;
const EARTH_RADIUS_WGS72 = 6378.135;

/** A satellite's mean elements, ready to propagate. */
export interface OrbitalElements {
  /** Name given by the source (e.g. "ISS (ZARYA)"). */
  name: string;
  /** NORAD catalogue number. */
  noradId: number;
  /** Epoch of the elements (UTC, rounded to the millisecond: see epochMs). */
  epoch: Date;
  /** Epoch in Unix milliseconds, unrounded (1 ms is 7.7 m along the ISS's orbit). */
  epochMs: number;
  /** Inclination (degrees). */
  inclination: number;
  /** Eccentricity. */
  eccentricity: number;
  /** Revolutions per day (Kozai mean motion, as in the TLE). */
  meanMotion: number;
  /** satellite.js record (opaque). */
  readonly satrec: SatRec;
}

/** One record of CelesTrak's GP data in JSON (OMM keywords, CCSDS 502.0-B-3). */
export type OmmRecord = OMMJsonObject;

function elements(name: string, satrec: SatRec, meanMotion: number): OrbitalElements {
  if (satrec.error) throw new Error(`Invalid orbital elements (${name}): error ${satrec.error}`);
  const epochMs = (satrec.jdsatepoch - 2_440_587.5) * MS_PER_DAY;
  return {
    name,
    noradId: Number(satrec.satnum),
    epoch: new Date(epochMs),
    epochMs,
    inclination: satrec.inclo / RAD,
    eccentricity: satrec.ecco,
    meanMotion,
    satrec,
  };
}

/** Elements from a two-line element set (TLE); throws on a malformed set. */
export function elementsFromTle(line1: string, line2: string, name = ""): OrbitalElements {
  const satrec = twoline2satrec(line1.trim(), line2.trim());
  const meanMotion = Number(line2.slice(52, 63));
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) throw new Error("Invalid TLE line 2");
  return elements(name.trim() || satrec.satnum, satrec, meanMotion);
}

/** Elements from an OMM record (CelesTrak `FORMAT=JSON`); throws on a malformed record. */
export function elementsFromOmm(omm: OmmRecord): OrbitalElements {
  const meanMotion = Number(omm.MEAN_MOTION);
  if (!omm.EPOCH || !Number.isFinite(meanMotion) || meanMotion <= 0)
    throw new Error("Invalid OMM record");
  const satrec = json2satrec(omm);
  return elements(omm.OBJECT_NAME ?? String(omm.NORAD_CAT_ID), satrec, meanMotion);
}

/** Days between the epoch of the elements and `date` (positive after the epoch). */
export function elementsAgeDays(el: OrbitalElements, date: Date): number {
  return (date.getTime() - el.epochMs) / MS_PER_DAY;
}

export interface OrbitSummary {
  /** Orbital period (minutes). */
  periodMin: number;
  /** Heights of perigee and apogee above the WGS-72 equatorial radius (km). */
  perigeeKm: number;
  apogeeKm: number;
}

/** Period and heights from the mean elements (Kepler, WGS-72: the constants of SGP4). */
export function orbitSummary(el: OrbitalElements): OrbitSummary {
  const n = (el.meanMotion * 2 * Math.PI) / 86_400; // rad/s
  const a = Math.cbrt(GM_WGS72 / (n * n));
  return {
    periodMin: 1440 / el.meanMotion,
    perigeeKm: a * (1 - el.eccentricity) - EARTH_RADIUS_WGS72,
    apogeeKm: a * (1 + el.eccentricity) - EARTH_RADIUS_WGS72,
  };
}

export interface TemeState {
  /** Position (km) and velocity (km/s) in TEME. */
  r: Vec3;
  v: Vec3;
}

/** SGP4 state `minutes` after the epoch; null when the model fails (decay, bad elements). */
export function propagateMinutes(el: OrbitalElements, minutes: number): TemeState | null {
  const pv = sgp4(el.satrec, minutes);
  if (!pv) return null;
  const { position: p, velocity: v } = pv;
  if (!Number.isFinite(p.x)) return null;
  return { r: [p.x, p.y, p.z], v: [v.x, v.y, v.z] };
}

/** SGP4 state at `date` (TEME); null when the model fails. */
export function propagateTeme(el: OrbitalElements, date: Date): TemeState | null {
  return propagateMinutes(el, (date.getTime() - el.epochMs) / MS_PER_MIN);
}

/** TEME → Earth-fixed (PEF ≈ ITRF), rotation by GMST about the pole. `date` on the UT1 axis. */
export function temeToEcef([x, y, z]: Vec3, date: Date): Vec3 {
  const g = greenwichMeanSiderealTime(date) * RAD;
  const c = Math.cos(g);
  const s = Math.sin(g);
  return [c * x + s * y, -s * x + c * y, z];
}

/** Earth-fixed position (km) of a geodetic point on the WGS-84 ellipsoid. */
export function geodeticToEcef({ latitude, longitude }: Observer, heightKm = 0): Vec3 {
  const phi = latitude * RAD;
  const lam = longitude * RAD;
  const e2 = WGS84_F * (2 - WGS84_F);
  const sinPhi = Math.sin(phi);
  const n = WGS84_A / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rc = (n + heightKm) * Math.cos(phi);
  return [rc * Math.cos(lam), rc * Math.sin(lam), (n * (1 - e2) + heightKm) * sinPhi];
}

export interface LookAngles extends Horizontal {
  rangeKm: number;
}

/**
 * Azimuth, altitude and range of an Earth-fixed point (km) seen from a geodetic observer whose
 * Earth-fixed position is `site` (geodeticToEcef). Local axes: North, East, Up of the ellipsoid
 * normal (geodetic vertical).
 */
export function ecefToHorizontal(target: Vec3, site: Vec3, observer: Observer): LookAngles {
  const phi = observer.latitude * RAD;
  const lam = observer.longitude * RAD;
  const dx = target[0] - site[0];
  const dy = target[1] - site[1];
  const dz = target[2] - site[2];
  const [sp, cp, sl, cl] = [Math.sin(phi), Math.cos(phi), Math.sin(lam), Math.cos(lam)];
  const east = -sl * dx + cl * dy;
  const north = -sp * cl * dx - sp * sl * dy + cp * dz;
  const up = cp * cl * dx + cp * sl * dy + sp * dz;
  const rangeKm = Math.hypot(dx, dy, dz);
  const az = Math.atan2(east, north) / RAD;
  return { azimuth: az < 0 ? az + 360 : az, altitude: Math.asin(up / rangeKm) / RAD, rangeKm };
}

/**
 * J2000 (mean equator and equinox of J2000.0, ≈ GCRS) position from a TEME position at `date`:
 * TEME → true of date (rotation by the equation of the equinoxes), then nutation and precession
 * back to J2000 (astronomy-engine, IAU 2000B nutation and IAU 2006 precession).
 */
export function temeToJ2000(r: Vec3, date: Date): Vec3 {
  const time = Astronomy.MakeTime(date);
  const ee = Astronomy.e_tilt(time).ee * 15 * (RAD / 3600); // seconds of time → radians
  const c = Math.cos(ee);
  const s = Math.sin(ee);
  // Right ascensions of date = TEME right ascensions + equation of the equinoxes.
  const tod = new Astronomy.Vector(c * r[0] - s * r[1], s * r[0] + c * r[1], r[2], time);
  const j = Astronomy.RotateVector(Astronomy.Rotation_EQD_EQJ(time), tod);
  return [j.x, j.y, j.z];
}

/** Geocentric direction of the Sun in TEME (unit vector), aberration included (≈ 20″ apart). */
export function sunDirectionTeme(date: Date): Vec3 {
  const time = Astronomy.MakeTime(date);
  const v = Astronomy.RotateVector(
    Astronomy.Rotation_EQJ_EQD(time),
    Astronomy.GeoVector(Astronomy.Body.Sun, time, true),
  );
  const ee = Astronomy.e_tilt(time).ee * 15 * (RAD / 3600);
  const c = Math.cos(ee);
  const s = Math.sin(ee);
  // True of date → TEME: subtract the equation of the equinoxes.
  const x = c * v.x + s * v.y;
  const y = -s * v.x + c * v.y;
  const n = Math.hypot(x, y, v.z);
  return [x / n, y / n, v.z / n];
}

/** True when a position (km) is out of the Earth's shadow, the Sun being along `sun` (unit). */
export function isSunlit(r: Vec3, sun: Vec3): boolean {
  const along = r[0] * sun[0] + r[1] * sun[1] + r[2] * sun[2];
  if (along >= 0) return true;
  const px = r[0] - along * sun[0];
  const py = r[1] - along * sun[1];
  const pz = r[2] - along * sun[2];
  return px * px + py * py + pz * pz > SHADOW_RADIUS * SHADOW_RADIUS;
}

/**
 * The J2000 direction (degrees) that the sky map's J2000 → horizontal matrix brings to `look`:
 * the transpose of that rotation applied to the horizontal unit vector.
 */
export function horizontalToJ2000(
  { azimuth, altitude }: Horizontal,
  date: Date,
  observer: Observer,
): { ra: number; dec: number } {
  const m = j2000ToHorizontalMatrix(date, observer);
  const a = azimuth * RAD;
  const h = altitude * RAD;
  const n = Math.cos(h) * Math.cos(a);
  const e = Math.cos(h) * Math.sin(a);
  const u = Math.sin(h);
  // (North, East, Up) → J2000: transpose of m.
  const x = m[0] * n + m[3] * e + m[6] * u;
  const y = m[1] * n + m[4] * e + m[7] * u;
  const z = m[2] * n + m[5] * e + m[8] * u;
  const ra = Math.atan2(y, x) / RAD;
  return { ra: ra < 0 ? ra + 360 : ra, dec: Math.asin(Math.max(-1, Math.min(1, z))) / RAD };
}

/** Where a satellite is for an observer at an instant. */
export interface SatelliteLook extends LookAngles {
  /** J2000 direction for the sky map (see the file header). */
  ra: number;
  dec: number;
  /** Out of the Earth's shadow. */
  sunlit: boolean;
  /** Height above the WGS-84 ellipsoid's equatorial radius (km, spherical approximation). */
  heightKm: number;
}

/** A satellite's place in the observer's sky at `date` (null when SGP4 fails). */
export function satelliteLook(
  el: OrbitalElements,
  date: Date,
  observer: Observer,
  site: Vec3 = geodeticToEcef(observer),
  sun: Vec3 = sunDirectionTeme(date),
): SatelliteLook | null {
  const state = propagateTeme(el, date);
  if (!state) return null;
  const look = ecefToHorizontal(temeToEcef(state.r, date), site, observer);
  return {
    ...look,
    ...horizontalToJ2000(look, date, observer),
    sunlit: isSunlit(state.r, sun),
    heightKm: Math.hypot(...state.r) - WGS84_A,
  };
}

/** One instant of a pass. */
export interface PassPoint {
  date: Date;
  azimuth: number;
  altitude: number;
  rangeKm: number;
}

/** A pass above the horizon, and its visible part if any. */
export interface SatellitePass {
  rise: PassPoint;
  /** Highest point of the whole pass. */
  culmination: PassPoint;
  set: PassPoint;
  /**
   * Part of the pass where the satellite can be seen with the naked eye: above `minAltitude`,
   * sunlit, the Sun at least 6° below the observer's horizon. null when there is none.
   */
  visible: { start: PassPoint; max: PassPoint; end: PassPoint } | null;
}

export interface PassOptions {
  /** Lowest altitude of the visible part (degrees, default 10: low passes are lost in haze). */
  minAltitude?: number;
  /** Highest Sun altitude for a dark enough sky (degrees, default −6: end of civil twilight). */
  maxSunAltitude?: number;
  /** Coarse search step (s, default 30): passes shorter than this above the horizon may be missed. */
  stepSeconds?: number;
}

/**
 * Passes of a satellite above the observer's horizon (geometric, 0°) between `start` and `end`,
 * in time order. A pass under way at `start` begins there (its rise is `start`), one under way at
 * `end` ends there. Rise and set to 1 ms, culmination to 0.1 s; the visible part to 0.5 s.
 */
export function findPasses(
  el: OrbitalElements,
  observer: Observer,
  start: Date,
  end: Date,
  options: PassOptions = {},
): SatellitePass[] {
  const minAltitude = options.minAltitude ?? 10;
  const maxSunAltitude = options.maxSunAltitude ?? -6;
  const step = (options.stepSeconds ?? 30) * 1000;
  const site = geodeticToEcef(observer);
  const altitudeAt = (t: number): number => {
    const s = propagateTeme(el, new Date(t));
    return s ? ecefToHorizontal(temeToEcef(s.r, new Date(t)), site, observer).altitude : -90;
  };
  const point = (t: number): PassPoint => {
    const date = new Date(t);
    const s = propagateTeme(el, date);
    const look = s
      ? ecefToHorizontal(temeToEcef(s.r, date), site, observer)
      : { azimuth: NaN, altitude: NaN, rangeKm: NaN };
    return { date, azimuth: look.azimuth, altitude: look.altitude, rangeKm: look.rangeKm };
  };
  /** Instant (ms) where `f` changes between a (f false) and b (f true), to `tol` ms. */
  const edge = (a: number, b: number, f: (t: number) => boolean, tol: number) => {
    while (b - a > tol) {
      const mid = (a + b) / 2;
      if (f(mid)) b = mid;
      else a = mid;
    }
    return (a + b) / 2;
  };
  const up = (t: number) => altitudeAt(t) > 0;
  /** Golden-section search of the highest altitude in [a, b] (one maximum in a LEO pass). */
  const highest = (a: number, b: number, tol = 100) => {
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a);
    let d = a + g * (b - a);
    let fc = altitudeAt(c);
    let fd = altitudeAt(d);
    while (b - a > tol) {
      if (fc > fd) {
        b = d;
        d = c;
        fd = fc;
        c = b - g * (b - a);
        fc = altitudeAt(c);
      } else {
        a = c;
        c = d;
        fc = fd;
        d = a + g * (b - a);
        fd = altitudeAt(d);
      }
    }
    return (a + b) / 2;
  };

  /**
   * Time (ms) the satellite needs at least to come above the horizon from where it is at `t`:
   * the geocentric angle between it and the observer shrinks by at most its mean motion plus
   * the Earth's rotation (≈ 4.2°/min for the ISS), and it is above the horizon only within
   * acos(|site| / r) of the observer (≈ 20° for the ISS; 2° spare for the geodetic vertical
   * and the eccentricity). 0 when close.
   */
  const siteNorm = Math.hypot(...site);
  const rate = (el.meanMotion * 360 + 361) / 1440 / 60_000; // degrees per ms, generous
  const timeToHorizon = (t: number): number => {
    const date = new Date(t);
    const s = propagateTeme(el, date);
    if (!s) return 0;
    const r = temeToEcef(s.r, date);
    const norm = Math.hypot(...r);
    const cos = (r[0] * site[0] + r[1] * site[1] + r[2] * site[2]) / (norm * siteNorm);
    const psi = Math.acos(Math.max(-1, Math.min(1, cos))) / RAD;
    const reach = Math.acos(Math.min(1, siteNorm / norm)) / RAD;
    return Math.max(0, (psi - reach - 2) / rate);
  };

  const passes: SatellitePass[] = [];
  const t0 = start.getTime();
  const t1 = end.getTime();
  let prevT = t0;
  let prevUp = up(t0);
  let riseT: number | null = prevUp ? t0 : null;
  const next = (t: number) => Math.min(t + (prevUp ? step : Math.max(step, timeToHorizon(t))), t1);
  for (let t = next(t0); ; t = next(t)) {
    const nowUp = up(t);
    if (nowUp && !prevUp) riseT = edge(prevT, t, up, 1);
    if (!nowUp && prevUp && riseT !== null) {
      passes.push(
        makePass(
          riseT,
          edge(prevT, t, (x) => !up(x), 1),
        ),
      );
      riseT = null;
    }
    prevT = t;
    prevUp = nowUp;
    if (t >= t1) break;
  }
  if (riseT !== null && t1 > riseT) passes.push(makePass(riseT, t1));
  return passes;

  function makePass(rise: number, set: number): SatellitePass {
    const culmination = point(highest(rise, set));
    return {
      rise: point(rise),
      culmination,
      set: point(set),
      visible: culmination.altitude < minAltitude ? null : visiblePart(rise, set),
    };
  }

  function visiblePart(rise: number, set: number): SatellitePass["visible"] {
    // The Sun moves by ≈ 0.04° in a pass: its direction is taken once, at mid-pass.
    const mid = new Date((rise + set) / 2);
    const sun = sunDirectionTeme(mid);
    const sunAlt = (t: number) => {
      const date = new Date(t);
      const s = temeToEcef(sun, date);
      return ecefToHorizontal(
        [site[0] + s[0] * 1e8, site[1] + s[1] * 1e8, site[2] + s[2] * 1e8],
        site,
        observer,
      ).altitude;
    };
    const seen = (t: number) => {
      const date = new Date(t);
      const s = propagateTeme(el, date);
      if (!s || !isSunlit(s.r, sun)) return false;
      if (ecefToHorizontal(temeToEcef(s.r, date), site, observer).altitude < minAltitude)
        return false;
      return sunAlt(t) <= maxSunAltitude;
    };
    // Daylight all along (the Sun's altitude is monotonic over a few minutes): nothing to see.
    if (sunAlt(rise) > maxSunAltitude && sunAlt(set) > maxSunAltitude) return null;
    const sampleStep = 4000;
    let first: number | null = null;
    let last: number | null = null;
    let prev = rise;
    let prevSeen = seen(rise);
    if (prevSeen) first = rise;
    // The first visible stretch (a LEO pass has one: the satellite enters the shadow once).
    for (let t = Math.min(rise + sampleStep, set); ; t = Math.min(t + sampleStep, set)) {
      const s = seen(t);
      if (s && !prevSeen) first = edge(prev, t, seen, 500);
      if (s) last = t;
      if (!s && prevSeen) {
        last = edge(prev, t, (x) => !seen(x), 500);
        break;
      }
      prev = t;
      prevSeen = s;
      if (t >= set) break;
    }
    if (first === null || last === null || last <= first) return null;
    return { start: point(first), max: point(highest(first, last)), end: point(last) };
  }
}
