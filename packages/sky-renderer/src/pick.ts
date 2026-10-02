/**
 * Picking rules shared by the tap and the sensor reticle (#73): only what the shaders draw can be
 * picked, and the search avoids projecting the whole catalogue.
 */
import type { Vec3 } from "@asteria/astro-core";

/**
 * starVert hides a star when its flux relative to the limit, rel = 10^(−0.4 (v − limit)), falls
 * below 0.35: a star is drawn while v ≤ limit + 2.5·log10(1 / 0.35) ≈ limit + 1.14.
 */
export const STAR_SHOWN_MARGIN = 2.5 * Math.log10(1 / 0.35);

/**
 * Faintest magnitude a tap may pick: the field-of-view limit (as before #73), but never a star the
 * shader does not draw (`shaderLimit`: uLimitMag above the horizon, which daylight lowers by up to
 * 7 magnitudes; uLimitMagBelow below it, where it is always night).
 */
export function starPickLimit(fovLimit: number, shaderLimit: number): number {
  return Math.min(fovLimit, shaderLimit + STAR_SHOWN_MARGIN);
}

/** A star is preferred when brighter: its screen distance is reduced by this many px per magnitude. */
export const STAR_BRIGHTNESS_BONUS = 1.5;
/** Score threshold (px) under which a star is picked. */
export const STAR_PICK_RADIUS = 26;

/**
 * Largest angle (radians) from the tap direction at which a point can lie `radiusPx` away on
 * screen. Stereographic projection is conformal and its scale grows away from the centre
 * (sec²(θ/2)), so the centre's scale (scale · height / 2 px per radian) gives an upper bound.
 */
export function coneAngle(radiusPx: number, scale: number, heightPx: number): number {
  return Math.min(Math.PI, (2 * radiusPx) / (scale * heightPx));
}

export interface StarSearch {
  /** Magnitudes, sorted by increasing magnitude (brightest first). */
  mags: ArrayLike<number>;
  /** J2000 unit vectors, same order. */
  dirs: readonly Vec3[];
  /** J2000 unit vector of the tap (or of the view axis, for the reticle). */
  toward: Vec3;
  /** Cosine of the cone around `toward` outside which stars are skipped without projection. */
  cosMax: number;
  /** J2000 → horizontal third row: up · dir is the sine of the altitude. */
  up: Vec3;
  /** Faintest pickable magnitude above the horizon. */
  limitAbove: number;
  /** Below the horizon; null when nothing is drawn there (opaque ground). */
  limitBelow: number | null;
  /** Magnitude the brightness bonus is counted from (the field-of-view limit). */
  bonusFrom: number;
  /** Screen distance (px) from the tap to star `i`, NaN when off screen. Must not allocate. */
  distance: (i: number) => number;
}

/**
 * Index of the star to pick, or −1. The catalogue is sorted, so the scan stops at the first star
 * fainter than both limits; a dot product rejects stars outside the cone before any projection.
 */
export function pickStar(s: StarSearch): number {
  const { mags, dirs, toward, cosMax, up, limitAbove, limitBelow, bonusFrom } = s;
  const stop = limitBelow === null ? limitAbove : Math.max(limitAbove, limitBelow);
  let best = -1;
  let bestScore = STAR_PICK_RADIUS;
  for (let i = 0; i < mags.length; i++) {
    const v = mags[i]!;
    if (v > stop) break;
    const d = dirs[i]!;
    if (d[0] * toward[0] + d[1] * toward[1] + d[2] * toward[2] < cosMax) continue;
    const below = d[0] * up[0] + d[1] * up[1] + d[2] * up[2] <= 0;
    const limit = below ? limitBelow : limitAbove;
    if (limit === null || v > limit) continue;
    const dist = s.distance(i);
    if (!(dist >= 0)) continue;
    const score = dist - (bonusFrom - v) * STAR_BRIGHTNESS_BONUS;
    if (score < bestScore) [best, bestScore] = [i, score];
  }
  return best;
}

/** Spherical cap holding a set of unit vectors: centre and cosine of its angular radius. */
export interface Cap {
  centre: Vec3;
  cosRadius: number;
}

export function boundingCap(points: readonly Vec3[]): Cap {
  let [x, y, z] = [0, 0, 0];
  for (const p of points) [x, y, z] = [x + p[0], y + p[1], z + p[2]];
  const n = Math.hypot(x, y, z) || 1;
  const centre: Vec3 = [x / n, y / n, z / n];
  let cosRadius = 1;
  for (const p of points)
    cosRadius = Math.min(cosRadius, p[0] * centre[0] + p[1] * centre[1] + p[2] * centre[2]);
  return { centre, cosRadius: points.length ? cosRadius : -1 };
}

/** True when `dir` lies in the cap grown by `margin` radians. */
export function inCap(cap: Cap, dir: Vec3, margin: number): boolean {
  const c = cap.centre;
  const dot = Math.max(-1, Math.min(1, c[0] * dir[0] + c[1] * dir[1] + c[2] * dir[2]));
  return Math.acos(dot) <= Math.acos(Math.max(-1, Math.min(1, cap.cosRadius))) + margin;
}

/** View axis and zoom the reticle's target was computed for. */
export interface AimState {
  azimuth: number;
  altitude: number;
  fov: number;
}

/**
 * Throttle of the reticle's target (#73): recomputed when the view axis turned by more than
 * `minAngle` degrees or the zoom changed by more than 1 %, and at least every `maxAge` ms (the
 * sky turns with the date).
 */
export class AimThrottle {
  private last: (AimState & { time: number }) | null = null;

  constructor(
    readonly minAngle = 0.2,
    readonly maxAge = 150,
  ) {}

  /** True when the target must be recomputed for this view at time `now` (ms). */
  due(view: AimState, now: number): boolean {
    const l = this.last;
    if (!l) return true;
    if (now - l.time >= this.maxAge) return true;
    if (Math.abs(view.fov - l.fov) > 0.01 * l.fov) return true;
    return angleBetween(l, view) > this.minAngle;
  }

  /** Records that the target was computed for `view` at `now`. */
  mark(view: AimState, now: number): void {
    if (this.last) Object.assign(this.last, view, { time: now });
    else this.last = { azimuth: view.azimuth, altitude: view.altitude, fov: view.fov, time: now };
  }

  reset(): void {
    this.last = null;
  }
}

const RAD = Math.PI / 180;

/** Angle (degrees) between two view axes. */
export function angleBetween(a: AimState, b: AimState): number {
  const [h1, h2] = [a.altitude * RAD, b.altitude * RAD];
  const c =
    Math.sin(h1) * Math.sin(h2) +
    Math.cos(h1) * Math.cos(h2) * Math.cos((a.azimuth - b.azimuth) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
}
