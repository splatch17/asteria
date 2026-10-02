/**
 * Stellar proper motion: catalogue epoch → any date.
 *
 * Conventions
 * - Frame: ICRS (≈ J2000 equator), cartesian unit vectors p = (cosδ cosα, cosδ sinα, sinδ),
 *   the same as `unitVector` (matrices.ts). Angles in degrees unless the name says otherwise.
 * - Catalogue epoch: Hipparcos new reduction (van Leeuwen 2007, VizieR I/311) positions are
 *   given at epoch J1991.25 (JD 2448349.0625 TT). Positions are *not* at J2000: J2000 is only
 *   the frame orientation.
 * - Proper motions: μα* = μα·cosδ and μδ, in mas/yr (Julian years), as in I/311 and Gaia.
 * - Parallax ϖ in mas, radial velocity v_r in km/s (positive = receding).
 * - Time: Julian years of 365.25 days; dates on the UTC axis (TT − UTC ≈ 1 min is negligible).
 *
 * Model (ESA 1997, The Hipparcos and Tycho Catalogues, Vol. 1 §1.5.5, without light-time):
 * the star moves on a straight line at constant velocity. Its direction at t years from the
 * epoch is the direction of
 *
 *   u(t) = p·(1 + ζ t) + μ t,   μ = μα*·e + μδ·n (rad/yr, tangent to the sphere at p),
 *   ζ = v_r·ϖ / A (rad/yr: radial velocity over distance, A = 4.740470446 km/s per AU/yr),
 *
 * with e, n the local East and North unit vectors. Without a radial velocity (ζ = 0) the parallax
 * plays no role at all: u(t) = p + μ t, which is what the GPU computes (shaders: aDir + uYears·aPm,
 * normalised).
 *
 * Accuracy (validated against SIMBAD, see proper-motion.test.ts)
 * - Over decades the model reproduces SIMBAD's own epoch propagation to < 0.01″; the real error
 *   is then the catalogue's (Hipparcos: ~1 mas/yr on μ, so < 0.1″ by 2026) plus unmodelled
 *   orbital motion of binaries (61 Cyg A vs Gaia: 0.6″ in 2026).
 * - Without radial velocity, the perspective acceleration is missed: the error grows as μ·ζ·t².
 *   At ±13 000 years it stays below 0.2° for most bright stars (Arcturus 0.05°, Sirius 0.14°) but
 *   reaches several degrees for the nearest fast stars (α Cen 3.4°, 61 Cyg 5.6°).
 * - The catalogue's μ errors (Hipparcos ≲ 1 mas/yr → ≲ 13″ at 13 000 years) and the
 *   straight-line model itself (no Galactic orbit, no orbital motion in multiple systems) stay
 *   small compared with the radial-velocity term. Over the 26 000-year scale the figures deform
 *   in the right direction, with the right amplitude to ~2 % for most stars (Arcturus 0.6 %,
 *   Sirius 3 %) but ~25 % off for α Cen and 61 Cyg: their far positions are illustrative.
 */

import { julianDate } from "./time";
import type { Equatorial } from "./coords";
import type { Vec3 } from "./matrices";

const RAD = Math.PI / 180;
/** One milliarcsecond in radians. */
export const MAS = RAD / 3_600_000;
/** 1 AU/yr in km/s (IAU 2012 au, Julian year). */
const AU_PER_YEAR_KM_S = 4.740470446;

/** Hipparcos (I/311) catalogue epoch, Julian year (TT). */
export const HIPPARCOS_EPOCH = 1991.25;
/** Julian Date of J1991.25. */
export const JD_HIPPARCOS_EPOCH = 2_448_349.0625;
const JD_J2000 = 2_451_545.0;

/** Julian years from Julian epoch `epoch` (e.g. 1991.25) to `date`. */
export function julianYearsSince(epoch: number, date: Date): number {
  return (julianDate(date) - JD_J2000) / 365.25 + 2000 - epoch;
}

/** Julian years from the Hipparcos catalogue epoch J1991.25 to `date`. */
export function yearsSinceHipparcos(date: Date): number {
  return julianYearsSince(HIPPARCOS_EPOCH, date);
}

/** Astrometric parameters of a star at its catalogue epoch. */
export interface Astrometry extends Equatorial {
  /** μα* = μα·cosδ, mas/yr. */
  pmRa?: number;
  /** μδ, mas/yr. */
  pmDec?: number;
  /** Parallax, mas (only used with `radialVelocity`). */
  plx?: number;
  /** Radial velocity, km/s, positive receding. */
  radialVelocity?: number;
}

/**
 * Proper-motion vector μ = μα*·e + μδ·n in rad/yr (ICRS cartesian), tangent to the sphere at
 * (ra, dec). `out` is filled and returned (no allocation when given).
 */
export function properMotionVector(
  raDeg: number,
  decDeg: number,
  pmRa: number,
  pmDec: number,
  out: Vec3 = [0, 0, 0],
): Vec3 {
  const a = raDeg * RAD;
  const d = decDeg * RAD;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const sd = Math.sin(d);
  const ea = pmRa * MAS;
  const nd = pmDec * MAS;
  // e = (−sinα, cosα, 0), n = (−sinδ cosα, −sinδ sinα, cosδ)
  out[0] = -ea * sa - nd * sd * ca;
  out[1] = ea * ca - nd * sd * sa;
  out[2] = nd * Math.cos(d);
  return out;
}

/**
 * Rigorous propagation of one star by `years` (Julian years, negative = past), see module notes.
 * The radial velocity is used only when both it and the parallax are known.
 */
export function propagateStar(star: Astrometry, years: number): Equatorial {
  const a = star.ra * RAD;
  const d = star.dec * RAD;
  const mu = properMotionVector(star.ra, star.dec, star.pmRa ?? 0, star.pmDec ?? 0);
  const zeta =
    star.radialVelocity !== undefined && star.plx !== undefined && star.plx > 0
      ? (star.radialVelocity / AU_PER_YEAR_KM_S) * star.plx * MAS
      : 0;
  const k = 1 + zeta * years;
  const x = Math.cos(d) * Math.cos(a) * k + mu[0] * years;
  const y = Math.cos(d) * Math.sin(a) * k + mu[1] * years;
  const z = Math.sin(d) * k + mu[2] * years;
  const ra = Math.atan2(y, x) / RAD;
  return { ra: ra < 0 ? ra + 360 : ra, dec: Math.atan2(z, Math.hypot(x, y)) / RAD };
}

/** Packed epoch directions and proper-motion vectors (3 floats per star), for the renderers. */
export interface StarMotion {
  /** Unit vectors at the catalogue epoch. */
  dirs: Float32Array;
  /** Proper-motion vectors, rad/yr (zero when the catalogue has no proper motion). */
  pm: Float32Array;
}

/** Builds the packed arrays of `propagateDirections` from catalogue records. */
export function starMotion(stars: readonly Astrometry[]): StarMotion {
  const dirs = new Float32Array(stars.length * 3);
  const pm = new Float32Array(stars.length * 3);
  const v: Vec3 = [0, 0, 0];
  stars.forEach((s, i) => {
    const a = s.ra * RAD;
    const d = s.dec * RAD;
    dirs[3 * i] = Math.cos(d) * Math.cos(a);
    dirs[3 * i + 1] = Math.cos(d) * Math.sin(a);
    dirs[3 * i + 2] = Math.sin(d);
    properMotionVector(s.ra, s.dec, s.pmRa ?? 0, s.pmDec ?? 0, v);
    pm.set(v, 3 * i);
  });
  return { dirs, pm };
}

/**
 * Vectorised propagation without radial velocity: out_i = normalise(dirs_i + years·pm_i), the
 * exact CPU twin of the shaders. `out` may be a packed array (3 per star) or an array of Vec3
 * updated in place; no allocation.
 */
export function propagateDirections(
  motion: StarMotion,
  years: number,
  out: Float32Array | Float64Array | Vec3[],
): void {
  const { dirs, pm } = motion;
  const n = dirs.length / 3;
  const packed = !Array.isArray(out);
  for (let i = 0; i < n; i++) {
    const j = 3 * i;
    const x = dirs[j]! + years * pm[j]!;
    const y = dirs[j + 1]! + years * pm[j + 1]!;
    const z = dirs[j + 2]! + years * pm[j + 2]!;
    const k = 1 / Math.sqrt(x * x + y * y + z * z);
    if (packed) {
      out[j] = x * k;
      out[j + 1] = y * k;
      out[j + 2] = z * k;
    } else {
      const v = out[i]!;
      v[0] = x * k;
      v[1] = y * k;
      v[2] = z * k;
    }
  }
}
