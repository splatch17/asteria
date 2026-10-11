/**
 * Time scales and sidereal time.
 *
 * Conventions: dates are JS `Date` objects interpreted as UTC. Angles in degrees
 * unless the name says otherwise. Formulas from Meeus, "Astronomical Algorithms" (2nd ed.).
 */

const MS_PER_DAY = 86_400_000;
/** Julian Date of the Unix epoch (1970-01-01T00:00:00Z). */
const JD_UNIX_EPOCH = 2_440_587.5;
/** Julian Date of J2000.0 (2000-01-01T12:00:00 TT, used here on the UT axis). */
export const JD_J2000 = 2_451_545.0;

export function julianDate(date: Date): number {
  return date.getTime() / MS_PER_DAY + JD_UNIX_EPOCH;
}

export function normalizeDegrees(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Greenwich Mean Sidereal Time in degrees (Meeus eq. 12.4). */
export function greenwichMeanSiderealTime(date: Date): number {
  const jd = julianDate(date);
  const t = (jd - JD_J2000) / 36_525;
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - JD_J2000) +
    0.000387933 * t * t -
    (t * t * t) / 38_710_000;
  return normalizeDegrees(gmst);
}

/** J2000.0 (2000-01-01T12:00:00, here on the UT1 ≈ UTC axis) in Unix milliseconds. */
const J2000_MS = Date.UTC(2000, 0, 1, 12);

/**
 * Earth Rotation Angle in degrees (IAU 2000 Resolution B1.8; IERS Conventions 2010, eq. 5.15):
 * θ = 2π (0.7790572732640 + 1.00273781191135448 Du), Du = UT1 days from J2000.0 (UT1 taken as
 * UTC, |UT1 − UTC| < 0.9 s). The angle of the Greenwich meridian from the Celestial Intermediate
 * Origin. Computed as SOFA iauEra00 does (fraction of day first), to ~1e-12 rad.
 *
 * The Earth view's world axes are the mean equator and equinox of date, so the globe turns by
 * GMST there (GMST = ERA + accumulated precession in RA, tested against SOFA iauGmst06).
 */
export function earthRotationAngle(date: Date): number {
  const du = (date.getTime() - J2000_MS) / MS_PER_DAY;
  const frac = du - Math.floor(du);
  return normalizeDegrees(360 * (frac + 0.779057273264 + 0.00273781191135448 * du));
}

/** Length of the mean sidereal day (one turn relative to the mean equinox), seconds of UT1. */
export const SIDEREAL_DAY_S = 86_164.0905;

/** Local Mean Sidereal Time in degrees. `longitude` is east-positive, in degrees. */
export function localMeanSiderealTime(date: Date, longitude: number): number {
  return normalizeDegrees(greenwichMeanSiderealTime(date) + longitude);
}
