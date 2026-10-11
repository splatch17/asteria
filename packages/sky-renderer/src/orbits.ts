/**
 * Orbits of the true-scale solar system (#131): each one is drawn as the osculating Kepler
 * ellipse at the displayed date, built from the body's position and velocity at that instant
 * (two-body problem). It passes exactly through the body, along its true direction of motion,
 * whatever the zoom; elsewhere it departs from the true path only by the perturbations of the
 * other bodies (tested: < 0.5 % of the distance a quarter of a period away for the planets).
 *
 * The line is sampled densely near the body (eccentric anomaly offsets in geometric
 * progression from 3·10⁻⁷ rad, then evenly to π on each side) and written relative to the body, so that, once
 * placed on the body (three.js composes the model-view matrix in double precision), the line
 * through a planet seen from a few of its radii is as exact and as steady as the planet itself.
 *
 * Pure maths, allocation-free once the buffers exist: unit-tested in orbits.test.ts.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Osculating ellipse: shape, orientation and the body's place on it. */
export interface Ellipse {
  /** Semi-major axis and eccentricity (0 ≤ e < 1). */
  a: number;
  e: number;
  /** Unit vector towards the periapsis, and the unit vector 90° ahead in the motion. */
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  /** Eccentric anomaly of the body at the epoch, radians. */
  e0: number;
  /** Gravitational parameter (length³ / time²) and mean motion (rad / time). */
  mu: number;
  n: number;
}

export const ellipse = (): Ellipse => ({
  a: 1,
  e: 0,
  px: 1,
  py: 0,
  pz: 0,
  qx: 0,
  qy: 1,
  qz: 0,
  e0: 0,
  mu: 1,
  n: 1,
});

/** Gaussian gravitational constant squared: GM☉ in au³ / day² (IAU 1976, k = 0.01720209895). */
export const GM_SUN_AU3_D2 = 0.01720209895 ** 2;

/**
 * Sun / body mass ratios (IAU 2009 system of astronomical constants, Luzum et al. 2011): the
 * two-body parameter of a planet's heliocentric orbit is GM☉ (1 + m / M☉). The Earth's value is
 * the Earth–Moon system's.
 */
export const SUN_MASS_RATIO: Readonly<Record<string, number>> = Object.freeze({
  Mercury: 6_023_600,
  Venus: 408_523.719,
  Earth: 328_900.56,
  Mars: 3_098_703.59,
  Jupiter: 1_047.348_644,
  Saturn: 3_497.901_8,
  Uranus: 22_902.98,
  Neptune: 19_412.26,
});

/** GM of the Earth + Moon, km³/s² (IAU 2009: GM⊕ 398 600.4418, GM☾ = GM⊕ / 81.300 569). */
export const GM_EARTH_MOON_KM3_S2 = 398_600.4418 * (1 + 1 / 81.300_569);

/**
 * Osculating ellipse of a body at position `r` and velocity `v` relative to its primary, with
 * the two-body parameter `mu` (consistent units). Fills `out`; false when the orbit is not
 * bound (e ≥ 1) or degenerate.
 */
export function osculate(r: Vec3Like, v: Vec3Like, mu: number, out: Ellipse): boolean {
  const rn = Math.hypot(r.x, r.y, r.z);
  const v2 = v.x * v.x + v.y * v.y + v.z * v.z;
  // Angular momentum h = r × v.
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;
  const hz = r.x * v.y - r.y * v.x;
  const hn = Math.hypot(hx, hy, hz);
  if (!(rn > 0) || !(hn > 0)) return false;
  const inv = 1 / (2 / rn - v2 / mu);
  if (!(inv > 0)) return false;
  // Eccentricity vector e = (v × h) / mu − r / |r|.
  let ex = (v.y * hz - v.z * hy) / mu - r.x / rn;
  let ey = (v.z * hx - v.x * hz) / mu - r.y / rn;
  let ez = (v.x * hy - v.y * hx) / mu - r.z / rn;
  const e = Math.hypot(ex, ey, ez);
  if (!(e < 1)) return false;
  if (e < 1e-12) {
    // Circular: measure from the body itself.
    ex = r.x / rn;
    ey = r.y / rn;
    ez = r.z / rn;
  } else {
    ex /= e;
    ey /= e;
    ez /= e;
  }
  // q = ĥ × p.
  const qx = (hy * ez - hz * ey) / hn;
  const qy = (hz * ex - hx * ez) / hn;
  const qz = (hx * ey - hy * ex) / hn;
  out.a = inv;
  out.e = e;
  out.px = ex;
  out.py = ey;
  out.pz = ez;
  out.qx = qx;
  out.qy = qy;
  out.qz = qz;
  const b = inv * Math.sqrt(1 - e * e);
  const x = r.x * ex + r.y * ey + r.z * ez;
  const y = r.x * qx + r.y * qy + r.z * qz;
  out.e0 = Math.atan2(y / b, x / inv + e);
  out.mu = mu;
  out.n = Math.sqrt(mu / (inv * inv * inv));
  return true;
}

/** Position on the ellipse at eccentric anomaly `E`, relative to the primary. Fills `out`. */
export function pointAt<T extends Vec3Like>(el: Ellipse, E: number, out: T): T {
  const x = el.a * (Math.cos(E) - el.e);
  const y = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  out.x = x * el.px + y * el.qx;
  out.y = x * el.py + y * el.qy;
  out.z = x * el.pz + y * el.qz;
  return out;
}

/**
 * Position `dt` time units after the epoch on the ellipse (Kepler's equation, Newton), relative
 * to the primary. Fills `out`.
 */
export function positionAfter<T extends Vec3Like>(el: Ellipse, dt: number, out: T): T {
  const M0 = el.e0 - el.e * Math.sin(el.e0);
  const M = M0 + el.n * dt;
  let E = M + el.e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const f = E - el.e * Math.sin(E) - M;
    E -= f / (1 - el.e * Math.cos(E));
    if (Math.abs(f) < 1e-14) break;
  }
  return pointAt(el, E, out);
}

/** Samples on each side of the body; a line holds 2·ORBIT_SIDE + 1 points. */
export const ORBIT_SIDE = 160;
export const ORBIT_POINTS = 2 * ORBIT_SIDE + 1;
/** Samples in geometric progression next to the body, then evenly spaced to π. */
const NEAR_SAMPLES = 80;
/** Smallest eccentric anomaly offset from the body, and the end of the progression, radians. */
const NEAREST = 3e-7;
const NEAR_END = 0.03;

/**
 * Eccentric anomaly offset of sample `i` (0 … ORBIT_POINTS − 1) from the body: 0 at the middle;
 * on each side NEAR_SAMPLES offsets in geometric progression from NEAREST to NEAR_END (the line
 * stays exact through the body seen from a few of its radii), then evenly spaced to π (≈ 2°
 * apart: smooth seen from afar).
 */
export function sampleOffset(i: number): number {
  const k = i - ORBIT_SIDE;
  if (k === 0) return 0;
  const j = Math.abs(k);
  const off =
    j <= NEAR_SAMPLES
      ? NEAREST * (NEAR_END / NEAREST) ** ((j - 1) / (NEAR_SAMPLES - 1))
      : NEAR_END + ((Math.PI - NEAR_END) * (j - NEAR_SAMPLES)) / (ORBIT_SIDE - NEAR_SAMPLES);
  return k < 0 ? -off : off;
}

const at = { x: 0, y: 0, z: 0 };
const base = { x: 0, y: 0, z: 0 };

/**
 * Writes the ellipse into `out` (3 · ORBIT_POINTS floats) relative to the body (the point at
 * e0), multiplied by `scale`: half an orbit behind the body, then half an orbit ahead. The two
 * ends meet opposite the body.
 */
export function sampleOrbit(el: Ellipse, scale: number, out: Float32Array): Float32Array {
  pointAt(el, el.e0, base);
  for (let i = 0; i < ORBIT_POINTS; i++) {
    pointAt(el, el.e0 + sampleOffset(i), at);
    out[3 * i] = (at.x - base.x) * scale;
    out[3 * i + 1] = (at.y - base.y) * scale;
    out[3 * i + 2] = (at.z - base.z) * scale;
  }
  return out;
}
