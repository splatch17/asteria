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

/** Local Mean Sidereal Time in degrees. `longitude` is east-positive, in degrees. */
export function localMeanSiderealTime(date: Date, longitude: number): number {
  return normalizeDegrees(greenwichMeanSiderealTime(date) + longitude);
}
