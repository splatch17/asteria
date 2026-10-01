/**
 * Rotation matrices for GPU-side projection.
 *
 * Matrices are row-major `Mat3` tuples applied to unit vectors v = (cosδ cosα, cosδ sinα, sinδ).
 * Horizontal frame axes are (North, East, Up): azimuth = atan2(E, N), altitude = asin(Up).
 */

import { JD_J2000, julianDate, localMeanSiderealTime } from "./time";
import type { Observer } from "./coords";

export type Vec3 = [number, number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

const RAD = Math.PI / 180;
const ARCSEC = RAD / 3600;

export function unitVector(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * RAD;
  const d = decDeg * RAD;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

export function applyMat3(m: Mat3, [x, y, z]: Vec3): Vec3 {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
    }
  }
  return out as Mat3;
}

/** Beyond ±5 centuries the IAU 1976 polynomials diverge: switch to the long-term model. */
const IAU1976_VALID_CENTURIES = 5;
const OBLIQUITY_J2000 = 23.4392911 * RAD;
/** General precession in longitude, IAU 2006 linear term (″ per Julian century). */
const GENERAL_PRECESSION = 5028.796195 * ARCSEC;

/**
 * Precession J2000.0 → mean equator and equinox of `date`.
 * Within ±5 centuries: IAU 1976 (Meeus eq. 21.2–21.4, arcsecond-level).
 * Beyond: simplified long-term model (uniform rotation about the J2000 ecliptic pole);
 * it ignores the motion of the ecliptic and the change of obliquity, so it is only good to
 * about a degree over millennia — enough to show the ~26 000-year cycle of the celestial pole.
 */
export function precessionMatrix(date: Date): Mat3 {
  const t = (julianDate(date) - JD_J2000) / 36_525;
  if (Math.abs(t) > IAU1976_VALID_CENTURIES) return longTermPrecessionMatrix(t);
  return iau1976PrecessionMatrix(t);
}

/** Uniform precession of the equinox about the J2000 ecliptic pole, `t` in Julian centuries. */
export function longTermPrecessionMatrix(t: number): Mat3 {
  const p = GENERAL_PRECESSION * t;
  const [ce, se] = [Math.cos(OBLIQUITY_J2000), Math.sin(OBLIQUITY_J2000)];
  const toEcliptic: Mat3 = [1, 0, 0, 0, ce, se, 0, -se, ce];
  const toEquator: Mat3 = [1, 0, 0, 0, ce, -se, 0, se, ce];
  // Ecliptic longitudes of date grow by p (the equinox regresses).
  const rotate: Mat3 = [Math.cos(p), -Math.sin(p), 0, Math.sin(p), Math.cos(p), 0, 0, 0, 1];
  return multiplyMat3(toEquator, multiplyMat3(rotate, toEcliptic));
}

/** IAU 1976 precession matrix, built by precessing the three basis vectors (exact: it is a rotation). */
function iau1976PrecessionMatrix(t: number): Mat3 {
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * ARCSEC;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * ARCSEC;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * ARCSEC;

  const precess = ([x, y, zz]: Vec3): Vec3 => {
    const alpha = Math.atan2(y, x);
    const delta = Math.asin(zz);
    const a = Math.cos(delta) * Math.sin(alpha + zeta);
    const b =
      Math.cos(theta) * Math.cos(delta) * Math.cos(alpha + zeta) -
      Math.sin(theta) * Math.sin(delta);
    const c =
      Math.sin(theta) * Math.cos(delta) * Math.cos(alpha + zeta) +
      Math.cos(theta) * Math.sin(delta);
    const alpha2 = Math.atan2(a, b) + z;
    const delta2 = Math.asin(c);
    return [
      Math.cos(delta2) * Math.cos(alpha2),
      Math.cos(delta2) * Math.sin(alpha2),
      Math.sin(delta2),
    ];
  };

  const cx = precess([1, 0, 0]);
  const cy = precess([0, 1, 0]);
  const cz = precess([0, 0, 1]);
  return [cx[0], cy[0], cz[0], cx[1], cy[1], cz[1], cx[2], cy[2], cz[2]];
}

/** Equatorial (of date) → horizontal (North, East, Up), using mean sidereal time. */
export function equatorialToHorizontalMatrix(date: Date, { latitude, longitude }: Observer): Mat3 {
  const lst = localMeanSiderealTime(date, longitude) * RAD;
  const phi = latitude * RAD;
  // Rotate so the local meridian is at x, then express in (North, East, Up).
  const rz: Mat3 = [Math.cos(lst), Math.sin(lst), 0, -Math.sin(lst), Math.cos(lst), 0, 0, 0, 1];
  const neu: Mat3 = [
    -Math.sin(phi), 0, Math.cos(phi),
    0, 1, 0,
    Math.cos(phi), 0, Math.sin(phi),
  ]; // prettier-ignore
  return multiplyMat3(neu, rz);
}

/** J2000 (ICRS) → horizontal of `date`, including precession. */
export function j2000ToHorizontalMatrix(date: Date, observer: Observer): Mat3 {
  return multiplyMat3(equatorialToHorizontalMatrix(date, observer), precessionMatrix(date));
}
