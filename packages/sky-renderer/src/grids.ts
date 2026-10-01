// Pure geometry for the reference layers (coordinate grids, ecliptic). No WebGL here: the
// renderers upload these arrays once.

import type { Vec3 } from "@asteria/astro-core";

const DEG = Math.PI / 180;

/** J2000 mean obliquity of the ecliptic, IAU 2006 (ε0 = 84 381.406″), as in astro-core. */
export const OBLIQUITY_J2000_DEG = 23.4392911;
/** General precession in longitude, IAU 2006 linear term, in degrees per Julian century. */
const GENERAL_PRECESSION_DEG = 5028.796195 / 3600;

/** Unit vector of spherical coordinates (lon, lat in degrees) in a frame whose z is the pole. */
export function spherical(lonDeg: number, latDeg: number): Vec3 {
  const [lon, lat] = [lonDeg * DEG, latDeg * DEG];
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

export interface GridOptions {
  /** Spacing of the meridians (lines of constant longitude), degrees. */
  lonStep: number;
  /** Spacing of the parallels (lines of constant latitude), degrees. */
  latStep: number;
  /** Meridians stop at ±latMax, except every 90° where they reach the poles (less clutter). */
  latMax: number;
  /** Lowest parallel drawn (e.g. 0 for altitudes: nothing below the horizon). */
  latMin?: number;
  /** Sampling step along the lines, degrees. */
  sample?: number;
}

/**
 * Line segments (pairs of unit vectors, flattened xyz) of a longitude/latitude grid, in the
 * grid's own frame (equator of date for RA/Dec, horizontal North-East-Up for azimuth/altitude).
 * Longitude is counted from +x towards +y (RA eastwards, azimuth from North towards East).
 */
export function sphericalGrid({
  lonStep,
  latStep,
  latMax,
  latMin = -latMax,
  sample = 2,
}: GridOptions): { positions: Float32Array; dash: Float32Array } {
  const out: number[] = [];
  const dash: number[] = [];
  // dash: abscissa along the line in degrees of arc (for dashed rendering)
  const push = (a: Vec3, b: Vec3, da: number, db: number) => {
    out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    dash.push(da, db);
  };
  // Meridians
  for (let lon = 0; lon < 360 - 1e-9; lon += lonStep) {
    const toPole = Math.abs(lon % 90) < 1e-9;
    const lo = Math.max(latMin, toPole ? -90 : -latMax);
    const hi = toPole ? 90 : latMax;
    const n = Math.max(1, Math.round((hi - lo) / sample));
    for (let i = 0; i < n; i++) {
      const [a, b] = [lo + ((hi - lo) * i) / n, lo + ((hi - lo) * (i + 1)) / n];
      push(spherical(lon, a), spherical(lon, b), a, b);
    }
  }
  // Parallels (the poles themselves are points: skipped)
  const first = Math.ceil(latMin / latStep) * latStep;
  for (let lat = first; lat < 90 - 1e-9; lat += latStep) {
    if (lat <= -90 + 1e-9) continue;
    const n = Math.round(360 / sample);
    const k = Math.cos(lat * DEG); // arc length of one degree of longitude
    for (let i = 0; i < n; i++) {
      const [a, b] = [(360 * i) / n, (360 * (i + 1)) / n];
      push(spherical(a, lat), spherical(b, lat), a * k, b * k);
    }
  }
  return { positions: new Float32Array(out), dash: new Float32Array(dash) };
}

/** J2000 ecliptic (fixed) as segments in J2000 equatorial coordinates, plus λ per vertex. */
export function eclipticCircle(sample = 1): { positions: Float32Array; longitudes: Float32Array } {
  const n = Math.round(360 / sample);
  const positions = new Float32Array(n * 6);
  const longitudes = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 2; k++) {
      const lambda = (360 * (i + k)) / n;
      positions.set(eclipticToJ2000(lambda), (i * 2 + k) * 3);
      longitudes[i * 2 + k] = lambda;
    }
  }
  return { positions, longitudes };
}

/** A point of the J2000 ecliptic (ecliptic longitude λ, latitude 0) in J2000 equatorial axes. */
export function eclipticToJ2000(lambdaDeg: number): Vec3 {
  const [ce, se] = [Math.cos(OBLIQUITY_J2000_DEG * DEG), Math.sin(OBLIQUITY_J2000_DEG * DEG)];
  const [c, s] = [Math.cos(lambdaDeg * DEG), Math.sin(lambdaDeg * DEG)];
  return [c, s * ce, s * se];
}

/**
 * J2000 direction of the point of ecliptic longitude λ *of date* (counted from the equinox of
 * date, which regresses along the ecliptic by the general precession). Used to place the
 * ecliptic's graduation so that 0° stays on the vernal point of the displayed date. The motion of
 * the ecliptic itself (≈ 47″/century) is neglected.
 */
export function eclipticOfDate(lambdaDeg: number, date: Date): Vec3 {
  const centuries = (date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545.0) / 36_525;
  return eclipticToJ2000(lambdaDeg - GENERAL_PRECESSION_DEG * centuries);
}

/**
 * Where to write a grid's graduations: along the two grid lines that cross nearest the view
 * centre. `centre` is the view direction in the grid's frame; returns the longitude of the
 * meridian carrying the latitude labels and the latitude of the parallel carrying the longitude
 * labels (both snapped to the label steps).
 */
export function graduationLines(
  centre: Vec3,
  lonLabelStep: number,
  latLabelStep: number,
  latLimit = 80,
): { lon: number; lat: number } {
  const lon = (Math.atan2(centre[1], centre[0]) / DEG + 360) % 360;
  const lat = Math.asin(Math.max(-1, Math.min(1, centre[2]))) / DEG;
  const snappedLat = Math.round(lat / latLabelStep) * latLabelStep;
  return {
    lon: (Math.round(lon / lonLabelStep) * lonLabelStep) % 360,
    lat: Math.max(-latLimit, Math.min(latLimit, snappedLat)),
  };
}
