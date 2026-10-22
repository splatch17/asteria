/**
 * IAU constellation boundaries as areas of the sky (#184): which constellation holds a direction,
 * the outline of a constellation to draw, its centre.
 *
 * Data: `data/constellation-bounds.json`, built by `packages/sky-data/build_bounds.py` from
 * d3-celestial (BSD-3-Clause), itself from Davenhall & Leggett 1989 (CDS VI/49), the boundaries
 * drawn by Delporte for the IAU (1930). See docs/DATA_SOURCES.md.
 *
 * The boundaries are defined at the equinox **B1875**: each edge is an arc of a meridian (constant
 * right ascension) or of a parallel (constant declination) of the mean equator of 1875. A J2000
 * direction is therefore first precessed to B1875 (`precessionMatrix`, IAU 1976), then tested in
 * that frame, where the test is exact (no approximation of the curved edges):
 *
 * Point in a ring (`ringContains`): from the point, follow its meridian north up to the pole and
 * count the parallel edges crossed (those above the point whose RA span, taken the short way round
 * and half-open, holds the point's RA). An odd count means inside, flipped for the one ring that
 * holds the north celestial pole (Ursa Minor). Meridian edges never cross a meridian ray. The RA
 * wrap at 0 h needs no special case (spans are computed modulo 24 h), and a point on a shared
 * meridian belongs to exactly one neighbour (same half-open span on both sides).
 */
import { applyMat3, precessionMatrix, unitVector, type Mat3, type Vec3 } from "./matrices";

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/** Besselian epoch B1875.0 (JD 2405889.258550475), the equinox of the boundaries. */
export const B1875 = new Date((2_405_889.258550475 - 2_440_587.5) * 86_400_000);

/** The file written by build_bounds.py (format "asteria-constellation-bounds" v1). */
export interface ConstellationBoundsFile {
  format: string;
  version: number;
  equinox: string;
  northPole: string;
  /** Rings by IAU abbreviation: [ra (s of time), dec (″), ra, dec, …], not closed. */
  bounds: Record<string, number[][]>;
}

/** One ring of a constellation's boundary, in B1875 degrees. */
export interface BoundsRing {
  abbr: string;
  ra: Float64Array;
  dec: Float64Array;
  /** The ring holds the north celestial pole (Ursa Minor). */
  north: boolean;
  /** Highest declination of the ring (no parallel edge above it). */
  decMax: number;
}

export interface ConstellationBounds {
  rings: readonly BoundsRing[];
  /** Abbreviations, sorted. */
  abbrs: readonly string[];
}

let toB1875: Mat3 | null = null;
/** J2000 → mean equator and equinox of B1875 (IAU 1976 precession, astro-core). */
export function j2000ToB1875Matrix(): Mat3 {
  return (toB1875 ??= precessionMatrix(B1875));
}

/** B1875 right ascension and declination (degrees, RA in [0, 360)) of a J2000 unit vector. */
export function b1875Of(dir: Vec3): { ra: number; dec: number } {
  const [x, y, z] = applyMat3(j2000ToB1875Matrix(), dir);
  const ra = Math.atan2(y, x) * DEG;
  return { ra: ra < 0 ? ra + 360 : ra, dec: Math.asin(Math.max(-1, Math.min(1, z))) * DEG };
}

/** J2000 unit vector of a B1875 position (degrees). */
export function j2000OfB1875(ra: number, dec: number): Vec3 {
  const m = j2000ToB1875Matrix();
  const [x, y, z] = unitVector(ra, dec);
  // The inverse of a rotation is its transpose.
  return [
    m[0] * x + m[3] * y + m[6] * z,
    m[1] * x + m[4] * y + m[7] * z,
    m[2] * x + m[5] * y + m[8] * z,
  ];
}

/** Checks and converts the file's rings. */
export function parseConstellationBounds(file: ConstellationBoundsFile): ConstellationBounds {
  if (file.format !== "asteria-constellation-bounds" || file.version !== 1)
    throw new Error(`constellation bounds: unknown format ${file.format} v${file.version}`);
  if (file.equinox !== "B1875") throw new Error(`constellation bounds: equinox ${file.equinox}`);
  const rings: BoundsRing[] = [];
  for (const [abbr, list] of Object.entries(file.bounds))
    for (const flat of list) {
      const n = flat.length / 2;
      const ra = new Float64Array(n);
      const dec = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        ra[i] = flat[2 * i]! / 240;
        dec[i] = flat[2 * i + 1]! / 3600;
      }
      rings.push({ abbr, ra, dec, north: abbr === file.northPole, decMax: Math.max(...dec) });
    }
  return { rings, abbrs: Object.keys(file.bounds).sort() };
}

/** Signed RA step from a to b, the short way round (degrees). */
const raStep = (a: number, b: number) => ((((b - a + 180) % 360) + 360) % 360) - 180;
const wrap360 = (x: number) => ((x % 360) + 360) % 360;

/** The ring holds the B1875 position (degrees); see the file header. */
export function ringContains(ring: BoundsRing, ra: number, dec: number): boolean {
  let inside = ring.north;
  if (dec >= ring.decMax) return inside;
  const n = ring.ra.length;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const d = ring.dec[i]!;
    if (d !== ring.dec[j] || d <= dec) continue;
    const step = raStep(ring.ra[i]!, ring.ra[j]!);
    const lo = step > 0 ? ring.ra[i]! : ring.ra[j]!;
    if (wrap360(ra - lo) < Math.abs(step)) inside = !inside;
  }
  return inside;
}

/** The constellation holds the J2000 direction. */
export function boundsContain(bounds: ConstellationBounds, abbr: string, dir: Vec3): boolean {
  const { ra, dec } = b1875Of(dir);
  return bounds.rings.some((r) => r.abbr === abbr && ringContains(r, ra, dec));
}

/** IAU abbreviation of the constellation holding a J2000 direction (null: none, never expected). */
export function constellationAt(bounds: ConstellationBounds, dir: Vec3): string | null {
  const { ra, dec } = b1875Of(dir);
  for (const ring of bounds.rings) if (ringContains(ring, ra, dec)) return ring.abbr;
  return null;
}

/**
 * Outline of a constellation as J2000 unit vectors, one closed polyline per ring (first point
 * repeated at the end), each edge cut into steps of at most `stepDeg` along its meridian or
 * parallel: once projected, edges are curves (a parallel is a small circle).
 */
export function boundsOutline(bounds: ConstellationBounds, abbr: string, stepDeg = 1): Vec3[][] {
  const out: Vec3[][] = [];
  for (const ring of bounds.rings) {
    if (ring.abbr !== abbr) continue;
    const pts: Vec3[] = [];
    const n = ring.ra.length;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const [a0, d0, a1, d1] = [ring.ra[i]!, ring.dec[i]!, ring.ra[j]!, ring.dec[j]!];
      const da = raStep(a0, a1);
      const dd = d1 - d0;
      // Arc length: along the parallel (RA step × cos dec) or the meridian.
      const length = Math.abs(da) * Math.cos(d0 * RAD) + Math.abs(dd);
      const steps = Math.max(1, Math.ceil(length / stepDeg));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        pts.push(j2000OfB1875(a0 + da * t, d0 + dd * t));
      }
    }
    pts.push(pts[0]!);
    out.push(pts);
  }
  return out;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * DEG;

/** Smallest angle (degrees) between a direction and an outline (polylines of short arcs). */
export function distanceToOutline(outline: readonly (readonly Vec3[])[], dir: Vec3): number {
  let best = Infinity;
  for (const line of outline)
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const n = cross(a, b);
      const len = Math.hypot(...n);
      let d: number;
      if (len > 1e-12) {
        const nn: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
        // Within the arc when the point lies between the planes through a and b.
        if (dot(cross(a, dir), nn) >= 0 && dot(cross(dir, b), nn) >= 0)
          d = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(dir, nn))))) * DEG;
        else d = Math.min(angle(dir, a), angle(dir, b));
      } else d = angle(dir, a);
      if (d < best) best = d;
    }
  return best;
}

/** Where a constellation's area lies (J2000 unit vectors, degrees). */
export interface AreaPlace {
  /** Mean of the outline points (may fall outside a concave area: Draco around Ursa Minor). */
  centre: Vec3;
  /** Angle from the centre to the farthest outline point. */
  radius: number;
  /** A point well inside the area, to write its name or aim at it. */
  inner: Vec3;
  /** The constellation's outline (boundsOutline, 1° steps). */
  outline: Vec3[][];
}

/**
 * Centre, radius and an inner point of a constellation's area. The inner point is the centre
 * when it lies inside; otherwise, among points between the centre and the outline, the one
 * farthest from the outline. For Serpens, both parts count.
 */
export function areaPlace(bounds: ConstellationBounds, abbr: string): AreaPlace {
  const outline = boundsOutline(bounds, abbr, 1);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const line of outline)
    for (let i = 0; i + 1 < line.length; i++) {
      const p = line[i]!;
      x += p[0];
      y += p[1];
      z += p[2];
    }
  const n = Math.hypot(x, y, z) || 1;
  const centre: Vec3 = [x / n, y / n, z / n];
  let radius = 0;
  for (const line of outline) for (const p of line) radius = Math.max(radius, angle(centre, p));
  let inner = centre;
  if (!boundsContain(bounds, abbr, centre)) {
    let best = -1;
    for (const line of outline)
      for (let i = 0; i + 1 < line.length; i += 2) {
        const p = line[i]!;
        for (let t = 0.1; t < 0.95; t += 0.1) {
          const q: Vec3 = [
            centre[0] * (1 - t) + p[0] * t,
            centre[1] * (1 - t) + p[1] * t,
            centre[2] * (1 - t) + p[2] * t,
          ];
          const m = Math.hypot(...q);
          if (m < 1e-9) continue;
          const u: Vec3 = [q[0] / m, q[1] / m, q[2] / m];
          if (!boundsContain(bounds, abbr, u)) continue;
          const d = distanceToOutline(outline, u);
          if (d > best) [best, inner] = [d, u];
        }
      }
  }
  return { centre, radius, inner, outline };
}

let loading: Promise<ConstellationBounds> | null = null;
/** The boundaries, loaded on first use (a chunk of its own, ≈ 6 kB gzip). */
export function loadConstellationBounds(): Promise<ConstellationBounds> {
  return (loading ??= import("./data/constellation-bounds.json").then((m) =>
    parseConstellationBounds(m.default as ConstellationBoundsFile),
  )).catch((e: unknown) => {
    loading = null; // a failed load (offline, first visit) is tried again next time
    throw e;
  });
}
