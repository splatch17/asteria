/**
 * Coordinate transformations.
 *
 * Conventions: right ascension and declination in degrees (equinox of date unless stated),
 * azimuth measured from North towards East (0° = N, 90° = E), altitude above the horizon.
 * Longitude east-positive, latitude north-positive.
 */

import { localMeanSiderealTime, normalizeDegrees } from "./time";

const RAD = Math.PI / 180;

export interface Equatorial {
  ra: number;
  dec: number;
}

export interface Horizontal {
  azimuth: number;
  altitude: number;
}

export interface Observer {
  latitude: number;
  longitude: number;
}

/**
 * Equatorial → horizontal, geometric (no refraction), using mean sidereal time.
 * Meeus eq. 13.5/13.6, azimuth converted from south-based to north-based.
 */
export function equatorialToHorizontal(
  { ra, dec }: Equatorial,
  { latitude, longitude }: Observer,
  date: Date,
): Horizontal {
  const hourAngle = (localMeanSiderealTime(date, longitude) - ra) * RAD;
  const phi = latitude * RAD;
  const delta = dec * RAD;

  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(hourAngle),
  );
  const azimuthFromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi),
  );

  return {
    azimuth: normalizeDegrees(azimuthFromSouth / RAD + 180),
    altitude: altitude / RAD,
  };
}

/** Sexagesimal helpers, e.g. hmsToDegrees(5, 55, 10.3). */
export function hmsToDegrees(h: number, m: number, s: number): number {
  return (h + m / 60 + s / 3600) * 15;
}

export function dmsToDegrees(sign: 1 | -1, d: number, m: number, s: number): number {
  return sign * (d + m / 60 + s / 3600);
}
