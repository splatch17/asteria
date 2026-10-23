/**
 * Which constellations can be seen from a latitude (#188).
 *
 * A direction of declination δ, seen from latitude φ (both of date, degrees, north positive),
 * turns once a day around the celestial pole: it culminates at altitude 90° − |φ − δ| (upper
 * transit) and passes lowest at |φ + δ| − 90° (lower transit). Hence three zones of the sky:
 *  - always up (circumpolar): the lowest altitude stays above the horizon, |δ| > 90° − |φ| on the
 *    side of the visible pole;
 *  - never up: the highest altitude stays below, |δ| > 90° − |φ| on the other side;
 *  - rises and sets: in between, a band of half-width 90° − |φ| around the celestial equator.
 * The horizon is the geometric one (altitude 0°): no refraction (it lifts a star by ≈ 0.6° at the
 * horizon), no relief, no extinction. A direction exactly on a limit grazes the horizon and counts
 * as rising and setting.
 *
 * A constellation is an area (IAU boundaries, constellation-bounds.ts), so it is classed by the
 * declinations its area spans, of date: J2000 directions precessed to the mean equator of the date
 * (`precessionMatrix`, as everywhere in the app), nutation and aberration ignored (< 30″):
 *  - « always »: its whole area is always up;
 *  - « never »: its whole area stays below the horizon;
 *  - « sometimes »: anything else; at least part of it gets above the horizon at some hour, so it
 *    is seen part of the year (when the Sun is elsewhere), possibly only in part
 *    (`partlyHidden`: some of the area never rises) or with part of it always up
 *    (`partlyAlways`).
 * The zones being declination intervals that reach a pole, only the lowest and highest
 * declinations of an area matter.
 *
 * The explorer's lists (#188) class the figures with the games' rule instead (5° high for half
 * the figure, apps/web lib/games/visibility.ts); these area classes describe the IAU region.
 */
import { boundsContain, boundsOutline } from "./constellation-bounds";
import type { ConstellationBounds } from "./constellation-bounds";
import { applyMat3, precessionMatrix, type Mat3, type Vec3 } from "./matrices";

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export type SkyZone = "always" | "sometimes" | "never";

/** Altitude (degrees) of the upper transit of declination `dec` seen from latitude `lat`. */
export const maxAltitude = (dec: number, lat: number): number => 90 - Math.abs(lat - dec);
/** Altitude (degrees) of the lower transit: below 0, the direction sets. */
export const minAltitude = (dec: number, lat: number): number => Math.abs(lat + dec) - 90;

/** Zone of a declination of date from a latitude (geometric horizon). */
export function zoneOf(dec: number, lat: number): SkyZone {
  if (minAltitude(dec, lat) > 0) return "always";
  if (maxAltitude(dec, lat) < 0) return "never";
  return "sometimes";
}

/**
 * Declination limits of the zones from a latitude: `limit` = 90° − |φ|. North of the equator,
 * δ > limit is always up and δ < −limit never; south of it, the reverse. `visiblePole` is +1
 * when the north celestial pole is up, −1 for the south one, 0 on the equator (no cap).
 */
export function zoneLimits(lat: number): { limit: number; visiblePole: -1 | 0 | 1 } {
  return { limit: 90 - Math.abs(lat), visiblePole: lat > 0 ? 1 : lat < 0 ? -1 : 0 };
}

/**
 * Share of the whole sky in each zone: each cap is a cap of angular radius |φ| around a pole,
 * (1 − cos φ) / 2 of the sphere. At the equator nothing is circumpolar; at a pole, half.
 */
export function zoneShares(lat: number): Record<SkyZone, number> {
  const cap = (1 - Math.cos(lat * RAD)) / 2;
  return { always: cap, never: cap, sometimes: 1 - 2 * cap };
}

/** Lowest and highest declination of date reached by a constellation's area (degrees). */
export interface DecRange {
  min: number;
  max: number;
}

/**
 * Declinations of date spanned by each constellation's area: its outline (B1875 parallels and
 * meridians, cut every `stepDeg`) precessed to the equator of `date`, and ±90° when the area holds
 * the celestial pole of date. Edges are curves in the frame of date (a B1875 parallel is no longer
 * one), sampled finely enough that the extremes are off by less than 0.001° for 0.5° steps.
 */
export function declinationRanges(
  bounds: ConstellationBounds,
  date: Date,
  stepDeg = 0.5,
): Record<string, DecRange> {
  const p = precessionMatrix(date);
  // Poles of date as J2000 directions: rows of the precession matrix.
  const north: Vec3 = [p[6], p[7], p[8]];
  const south: Vec3 = [-p[6], -p[7], -p[8]];
  const out: Record<string, DecRange> = {};
  for (const abbr of bounds.abbrs) {
    let min = 90;
    let max = -90;
    for (const line of boundsOutline(bounds, abbr, stepDeg))
      for (const v of line) {
        const z = p[6] * v[0] + p[7] * v[1] + p[8] * v[2];
        const d = Math.asin(Math.max(-1, Math.min(1, z))) * DEG;
        if (d < min) min = d;
        if (d > max) max = d;
      }
    if (boundsContain(bounds, abbr, north)) max = 90;
    if (boundsContain(bounds, abbr, south)) min = -90;
    out[abbr] = { min, max };
  }
  return out;
}

/** How much of a constellation a latitude can see. */
export interface ConstellationVisibility {
  zone: SkyZone;
  /** Part of the area never rises (only for « sometimes »). */
  partlyHidden: boolean;
  /** Part of the area never sets (only for « sometimes »). */
  partlyAlways: boolean;
}

/** Class of an area spanning `range` seen from `lat` (see the file header). */
export function classifyRange(range: DecRange, lat: number): ConstellationVisibility {
  const lo = zoneOf(range.min, lat);
  const hi = zoneOf(range.max, lat);
  if (lo === hi && lo !== "sometimes")
    return { zone: lo, partlyHidden: false, partlyAlways: false };
  return {
    zone: "sometimes",
    partlyHidden: lo === "never" || hi === "never",
    partlyAlways: lo === "always" || hi === "always",
  };
}

/** Classes of all constellations from a latitude, by IAU abbreviation. */
export function classifyConstellations(
  ranges: Readonly<Record<string, DecRange>>,
  lat: number,
): Record<string, ConstellationVisibility> {
  const out: Record<string, ConstellationVisibility> = {};
  for (const [abbr, range] of Object.entries(ranges)) out[abbr] = classifyRange(range, lat);
  return out;
}

/**
 * Highest point an area reaches: the altitude of the upper transit of the declination of its
 * range closest to the latitude, and where it culminates (towards the north or south point of the
 * horizon, or at the zenith when the range holds the latitude).
 */
export function culmination(
  range: DecRange,
  lat: number,
): { altitude: number; side: "north" | "south" | "zenith" } {
  if (lat >= range.min && lat <= range.max) return { altitude: 90, side: "zenith" };
  const dec = lat < range.min ? range.min : range.max;
  return { altitude: maxAltitude(dec, lat), side: dec > lat ? "north" : "south" };
}

/**
 * Nearly uniform sample points of a constellation's area: the points of a Fibonacci lattice of
 * `n` points of the whole sphere that fall inside it (J2000 unit vectors), about n / 41 253 per
 * square degree (Crux, the smallest, gets ≈ 65 of 40 000). Only the lattice points near the area
 * (within the angle from the mean of its outline to its farthest outline point) are tested.
 */
export function areaSamplesOf(bounds: ConstellationBounds, abbr: string, n = 40_000): Vec3[] {
  const outline = boundsOutline(bounds, abbr, 2);
  let [x, y, z] = [0, 0, 0];
  for (const line of outline) for (const p of line) [x, y, z] = [x + p[0], y + p[1], z + p[2]];
  const len = Math.hypot(x, y, z);
  const centre: Vec3 = len > 1e-9 ? [x / len, y / len, z / len] : [0, 0, 1];
  let cosRadius = 1;
  for (const line of outline)
    for (const p of line)
      cosRadius = Math.min(cosRadius, p[0] * centre[0] + p[1] * centre[1] + p[2] * centre[2]);
  // An area around a pole (Ursa Minor, Octans) is not inside the cone of its outline.
  const everywhere = len < 1e-9 || boundsContain(bounds, abbr, [0, 0, Math.sign(centre[2]) || 1]);
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const vz = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - vz * vz);
    const v: Vec3 = [r * Math.cos(i * golden), r * Math.sin(i * golden), vz];
    if (!everywhere && v[0] * centre[0] + v[1] * centre[1] + v[2] * centre[2] < cosRadius - 1e-6)
      continue;
    if (boundsContain(bounds, abbr, v)) out.push(v);
  }
  return out;
}

/**
 * Share of each zone in an area seen from `lat` at `date`, from its sample points (areaSamplesOf):
 * e.g. the part of Centaurus that never rises from Paris.
 */
export function zoneSharesOf(
  samples: readonly Vec3[],
  lat: number,
  date: Date,
  precession: Mat3 = precessionMatrix(date),
): Record<SkyZone, number> {
  const count = { always: 0, sometimes: 0, never: 0 };
  for (const v of samples) {
    const z = applyMat3(precession, v)[2];
    count[zoneOf(Math.asin(Math.max(-1, Math.min(1, z))) * DEG, lat)]++;
  }
  const n = samples.length || 1;
  return { always: count.always / n, sometimes: count.sometimes / n, never: count.never / n };
}
