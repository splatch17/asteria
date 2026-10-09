/**
 * 3D view of a constellation (#8): pure geometry, shared by the renderer (constellation-3d.ts),
 * its tests and the UI. No WebGL, no DOM.
 *
 * Distances
 * - The catalogue's reference distance first (#75, `@asteria/catalog`: `distanceLy` ± 1σ
 *   `distanceErrorLy`, `distanceSource` "hipparcos" | "gaia-dr3" | "literature"): the more precise
 *   of the Hipparcos 2007 and Gaia DR3 parallaxes, or a published distance for stars whose parallax
 *   is biased (Deneb, Betelgeuse). Its ±1σ interval is d ± σ, as published.
 * - Otherwise (catalogues without reference distance, or a parallax error above the parallax):
 *   the Hipparcos parallax (van Leeuwen 2007, VizieR I/311), d = 1000 / ϖ pc, ϖ in mas,
 *   1 pc = 3.261 563 777 ly (IAU 2015 B2 parsec, Julian-year light-year); ±1σ is the parallax
 *   interval mapped through 1/ϖ, asymmetric: [1000/(ϖ+σ), 1000/(ϖ−σ)] pc, unbounded when σ ≥ ϖ.
 * - Quality from the relative error σd/d (= σϖ/ϖ to first order): ≤ 0.1 precise; ≤ 0.5
 *   approximate (flagged); beyond, or ϖ ≤ 0, the distance is barely an order of magnitude: the
 *   star is placed with an explicit uncertainty segment.
 *
 * Frames
 * - Positions are cartesian in light-years, in the frame given by `frame` (a rotation applied to
 *   ICRS unit vectors): the UI passes J2000 → horizontal at the displayed date and place, so the
 *   3D view starts exactly as the sky map shows the figure. Origin = the Sun (= the Earth at
 *   these scales: 1 au = 1.6·10⁻⁵ ly).
 * - Camera rotations are Mat3 whose rows are (right, up, forward), the sky map's convention
 *   (view.ts): forward = right × up.
 */
import { applyMat3, propagateStar, unitVector, type Mat3, type Vec3 } from "@asteria/astro-core";
import { zoomAnchorShift } from "./gestures";
import type { CatalogStar } from "./sky-map";
import { stereoScale, viewMatrix, type ViewState } from "./view";

/** Light-years per parsec (IAU 2015: 1 pc = 648 000/π au; 1 ly = 63 241.077 au). */
export const LY_PER_PARSEC = 3.261_563_777;
/** Distance in ly of a 1 mas parallax: d(ly) = PARALLAX_LY / ϖ(mas). */
export const PARALLAX_LY = 1000 * LY_PER_PARSEC;
/** σd/d (σϖ/ϖ) above which a distance is only approximate (flagged). */
export const PARALLAX_APPROX = 0.1;
/** σd/d (σϖ/ϖ) above which the distance is placed with an explicit uncertainty segment. */
export const PARALLAX_UNRELIABLE = 0.5;

export type DistanceQuality = "precise" | "approx" | "uncertain";

/** Origin of a distance: the catalogue's reference distance source, or the parallax itself. */
export type DistanceOrigin = "hipparcos" | "gaia-dr3" | "literature" | "parallax";

/**
 * Distance fields of a catalogue record (`CatalogStar` of `@asteria/catalog`, #75), all optional:
 * catalogues of format v1 only have the parallax.
 */
export interface DistanceInput {
  /** Hipparcos parallax and its standard error, mas. */
  plx?: number | undefined;
  ePlx?: number | undefined;
  /** Reference distance and its 1σ uncertainty, light-years. */
  distanceLy?: number | undefined;
  distanceErrorLy?: number | undefined;
  distanceSource?: "hipparcos" | "gaia-dr3" | "literature" | undefined;
  /** Citation of a "literature" distance. */
  distanceReference?: string | undefined;
}

export interface StellarDistance {
  /** Best distance, ly; NaN when only a lower bound is known (ϖ ≤ 0). */
  ly: number;
  /** −1σ bound (ly). */
  nearLy: number;
  /** +1σ bound (ly); Infinity when unbounded (σϖ ≥ ϖ). */
  farLy: number;
  quality: DistanceQuality;
  /** σd/d (σϖ/ϖ for a parallax); NaN when unknown. */
  relError: number;
  source: DistanceOrigin;
  /** Citation of a "literature" distance. */
  reference?: string;
}

const finitePositive = (x: number | undefined): x is number =>
  x !== undefined && Number.isFinite(x) && x > 0;

const grade = (relError: number): DistanceQuality =>
  relError <= PARALLAX_APPROX
    ? "precise"
    : relError <= PARALLAX_UNRELIABLE
      ? "approx"
      : "uncertain";

/** Distance of a star and its ±1σ interval; null when nothing is known. */
export function stellarDistance(s: DistanceInput): StellarDistance | null {
  if (finitePositive(s.distanceLy)) {
    const ly = s.distanceLy;
    const e = finitePositive(s.distanceErrorLy) ? s.distanceErrorLy : NaN;
    const relError = e / ly;
    return {
      ly,
      nearLy: Number.isNaN(e) ? ly : Math.max(0, ly - e),
      farLy: Number.isNaN(e) ? ly : ly + e,
      // Without a stated error a published distance is taken as precise.
      quality: Number.isNaN(e) ? "precise" : grade(relError),
      relError,
      source: s.distanceSource ?? "parallax",
      ...(s.distanceReference !== undefined && { reference: s.distanceReference }),
    };
  }
  const plx = s.plx;
  if (plx === undefined || !Number.isFinite(plx)) return null;
  const e = s.ePlx !== undefined && Number.isFinite(s.ePlx) && s.ePlx >= 0 ? s.ePlx : NaN;
  if (plx <= 0) {
    // Only a lower bound: the +1σ parallax, if positive.
    if (!(plx + e > 0)) return null;
    return {
      ly: NaN,
      nearLy: PARALLAX_LY / (plx + e),
      farLy: Infinity,
      quality: "uncertain",
      relError: Infinity,
      source: "parallax",
    };
  }
  const ly = PARALLAX_LY / plx;
  if (Number.isNaN(e))
    return { ly, nearLy: ly, farLy: ly, quality: "approx", relError: NaN, source: "parallax" };
  const relError = e / plx;
  return {
    ly,
    nearLy: PARALLAX_LY / (plx + e),
    farLy: plx > e ? PARALLAX_LY / (plx - e) : Infinity,
    quality: grade(relError),
    relError,
    source: "parallax",
  };
}

/** (ra, dec) in degrees and a distance → cartesian position (same unit as `distance`). */
export function equatorialToCartesian(raDeg: number, decDeg: number, distance: number): Vec3 {
  const u = unitVector(raDeg, decDeg);
  return [u[0] * distance, u[1] * distance, u[2] * distance];
}

export interface Star3D<S extends CatalogStar = CatalogStar> {
  star: S;
  /** Unit direction at the date, in the model's frame. */
  dir: Vec3;
  distance: StellarDistance | null;
  /** Distance at which the star is drawn (ly): its distance, or the scene limit if beyond. */
  placedLy: number;
  /** dir × placedLy. */
  position: Vec3;
  /** Drawn closer than its nominal distance (too far or unknown): the label says so. */
  clamped: boolean;
  /** Drawn with an explicit uncertainty (σϖ/ϖ > 0.5, ϖ ≤ 0, or no distance). */
  uncertain: boolean;
}

export interface Constellation3DModel<S extends CatalogStar = CatalogStar> {
  abbr: string;
  stars: Star3D<S>[];
  /** Figure segments, as index pairs into `stars`. */
  segments: [number, number][];
  /** Angular centre of the figure (unit vector, model frame). */
  centre: Vec3;
  /** Distance beyond which uncertain stars are drawn at the limit (ly). */
  limitLy: number;
  /** Nearest and farthest stars with a usable distance (indices), -1 if none. */
  nearest: number;
  farthest: number;
}

export interface BuildOptions {
  /** Julian years since J1991.25 (proper motion), 0 = catalogue epoch. */
  years?: number;
  /** Rotation applied to the ICRS directions (default: identity, ICRS frame). */
  frame?: Mat3;
}

/** Scene limit for uncertain stars: 25 % beyond the farthest reliable one. */
const LIMIT_FACTOR = 1.25;
/** Scene limit when no star has a usable distance. */
const DEFAULT_LIMIT_LY = 1000;

/**
 * The stars of a constellation's figure (`lines`: polylines of HIP numbers) at their distances,
 * moved to the date by their proper motion.
 */
export function buildConstellation3D<S extends CatalogStar & DistanceInput>(
  stars: readonly S[],
  lines: Readonly<Record<string, number[][]>>,
  abbr: string,
  { years = 0, frame }: BuildOptions = {},
): Constellation3DModel<S> {
  const polylines = lines[abbr] ?? [];
  const order: number[] = [];
  const index = new Map<number, number>();
  for (const hip of polylines.flat()) if (!index.has(hip)) index.set(hip, -1);
  const records = new Map<number, S>();
  for (const s of stars) if (index.has(s.hip)) records.set(s.hip, s);

  const out: Star3D<S>[] = [];
  for (const hip of index.keys()) {
    const s = records.get(hip);
    if (!s) continue;
    index.set(hip, out.length);
    order.push(hip);
    const p = years ? propagateStar(s, years) : s;
    const u = unitVector(p.ra, p.dec);
    const dir = frame ? applyMat3(frame, u) : u;
    const distance = stellarDistance(s);
    out.push({
      star: s,
      dir,
      distance,
      placedLy: 0,
      position: [0, 0, 0],
      clamped: false,
      uncertain: !distance || distance.quality === "uncertain",
    });
  }

  let maxReliable = 0;
  let nearest = -1;
  let farthest = -1;
  out.forEach((s, i) => {
    if (s.uncertain || !s.distance) return;
    const ly = s.distance.ly;
    if (ly > maxReliable) maxReliable = ly;
    if (nearest < 0 || ly < out[nearest]!.distance!.ly) nearest = i;
    if (farthest < 0 || ly > out[farthest]!.distance!.ly) farthest = i;
  });
  const limitLy = maxReliable > 0 ? maxReliable * LIMIT_FACTOR : DEFAULT_LIMIT_LY;
  for (const s of out) {
    const ly = s.distance?.ly ?? NaN;
    s.clamped = !(ly <= limitLy);
    s.placedLy = s.clamped ? limitLy : ly;
    s.position = [s.dir[0] * s.placedLy, s.dir[1] * s.placedLy, s.dir[2] * s.placedLy];
  }

  const segments: [number, number][] = [];
  const seen = new Set<string>();
  for (const line of polylines) {
    for (let k = 1; k < line.length; k++) {
      const a = index.get(line[k - 1]!) ?? -1;
      const b = index.get(line[k]!) ?? -1;
      if (a < 0 || b < 0 || a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push([a, b]);
    }
  }

  const c: Vec3 = [0, 0, 0];
  for (const s of out) for (let k = 0; k < 3; k++) c[k] = c[k]! + s.dir[k]!;
  const n = Math.hypot(...c) || 1;
  return {
    abbr,
    stars: out,
    segments,
    centre: [c[0] / n, c[1] / n, c[2] / n],
    limitLy,
    nearest,
    farthest,
  };
}

/** Radii (ly) of the distance rings: 1-2-5 steps, the last one reaching `maxLy`. */
export function scaleRings(maxLy: number, target = 4): number[] {
  if (!(maxLy > 0)) return [];
  const raw = maxLy / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw * 0.999)!;
  const rings: number[] = [];
  for (let r = step; rings.length < 12; r += step) {
    rings.push(Math.round(r * 1e6) / 1e6);
    if (r >= maxLy) break;
  }
  return rings;
}

// --- Camera

const RAD = Math.PI / 180;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** Rotation rows (right, up, forward) looking along `forward`, `up` kept as vertical as possible. */
export function lookRotation(forward: Vec3, up: Vec3): Mat3 {
  const f = normalize(forward);
  let u: Vec3 = [up[0] - dot(up, f) * f[0], up[1] - dot(up, f) * f[1], up[2] - dot(up, f) * f[2]];
  if (Math.hypot(...u) < 1e-6) u = Math.abs(f[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  u = normalize([u[0] - dot(u, f) * f[0], u[1] - dot(u, f) * f[1], u[2] - dot(u, f) * f[2]]);
  const r = cross(u, f);
  return [r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]];
}

/**
 * Orbit around the figure: angles in degrees, distance in ly. yaw = pitch = 0: from the Earth.
 * Gestures (#107) add a roll round the line of sight (degrees, positive: the scene turns
 * counter-clockwise on screen) and a pan of the target point, an offset from the frame's pivot
 * (ly, model frame).
 */
export interface OrbitState {
  yaw: number;
  pitch: number;
  distance: number;
  roll?: number;
  target?: Vec3;
}

/** Orbit frame: pivot C on the figure's line of sight, forward f = direction of C, up U ⟂ f. */
export interface OrbitFrame {
  pivot: Vec3;
  forward: Vec3;
  up: Vec3;
  right: Vec3;
}

/**
 * Pivot halfway (in depth) between the nearest and farthest drawn star, on the figure's centre
 * line; up = the zenith (z of the model frame) made perpendicular to the line of sight.
 */
export function orbitFrame(model: Constellation3DModel, zenith: Vec3 = [0, 0, 1]): OrbitFrame {
  const f = model.centre;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of model.stars) {
    const d = dot(s.position, f);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  const depth = Number.isFinite(lo) ? (lo + hi) / 2 : model.limitLy / 2;
  const rot = lookRotation(f, Math.abs(dot(zenith, f)) > 0.995 ? [1, 0, 0] : zenith);
  return {
    pivot: [f[0] * depth, f[1] * depth, f[2] * depth],
    forward: [rot[6], rot[7], rot[8]],
    up: [rot[3], rot[4], rot[5]],
    right: [rot[0], rot[1], rot[2]],
  };
}

/** Camera of an orbit: position (ly) and rotation (rows right, up, forward), looking at the pivot. */
export function orbitCamera(
  frame: OrbitFrame,
  orbit: OrbitState,
): { position: Vec3; rotation: Mat3 } {
  const y = orbit.yaw * RAD;
  const p = orbit.pitch * RAD;
  const { forward: f, up: u, right: r } = frame;
  const t = orbit.target;
  const pivot: Vec3 = t
    ? [frame.pivot[0] + t[0], frame.pivot[1] + t[1], frame.pivot[2] + t[2]]
    : frame.pivot;
  // Unit offset from the pivot to the camera: −f at (0, 0), towards +right with yaw, +up with pitch.
  const o: Vec3 = [0, 1, 2].map(
    (k) =>
      -Math.cos(p) * Math.cos(y) * f[k]! + Math.cos(p) * Math.sin(y) * r[k]! + Math.sin(p) * u[k]!,
  ) as Vec3;
  const d = orbit.distance;
  const position: Vec3 = [pivot[0] + o[0] * d, pivot[1] + o[1] * d, pivot[2] + o[2] * d];
  // Screen up: the orbit's up tilted with the pitch (no flip near the poles, |pitch| < 90°).
  const screenUp: Vec3 = [0, 1, 2].map(
    (k) => Math.cos(p) * u[k]! + Math.sin(p) * (Math.cos(y) * f[k]! - Math.sin(y) * r[k]!),
  ) as Vec3;
  const rotation = lookRotation([-o[0], -o[1], -o[2]], screenUp);
  return { position, rotation: orbit.roll ? rollRotation(rotation, orbit.roll) : rotation };
}

/**
 * A camera rotation (rows right, up, forward) rolled by `deg` round its forward axis: positive
 * turns the image counter-clockwise (a point on the right of the screen goes up).
 */
export function rollRotation(m: Mat3, deg: number): Mat3 {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [
    c * m[0] - s * m[3], c * m[1] - s * m[4], c * m[2] - s * m[5],
    s * m[0] + c * m[3], s * m[1] + c * m[4], s * m[2] + c * m[5],
    m[6], m[7], m[8],
  ]; // prettier-ignore
}

// --- Gestures (#107): orbit, pan and zoom of the 3D view, in screen terms

const ZOOM_SHIFT = { x: 0, y: 0 };

/** Orbit angles from a one-finger drag (CSS px, y down), whatever the camera's roll. */
export function dragOrbit(
  orbit: OrbitState,
  dx: number,
  dy: number,
  degPerPx: number,
  pitchLimit: number,
): void {
  // The drag in the unrolled screen frame: dragging right always turns the scene to the right.
  const r = (orbit.roll ?? 0) * RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const ux = c * dx - s * dy;
  const uy = s * dx + c * dy;
  orbit.yaw -= ux * degPerPx;
  orbit.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, orbit.pitch + uy * degPerPx));
}

/** Moves the target by `units` along the camera's right and up rows (rotation `m`). */
function shiftTarget(orbit: OrbitState, m: Mat3, right: number, up: number, limit: number) {
  const t = (orbit.target ??= [0, 0, 0]);
  t[0] += right * m[0] + up * m[3];
  t[1] += right * m[1] + up * m[4];
  t[2] += right * m[2] + up * m[5];
  const n = Math.hypot(t[0], t[1], t[2]);
  if (n > limit) {
    const k = limit / n;
    t[0] *= k;
    t[1] *= k;
    t[2] *= k;
  }
}

/**
 * Pans the target parallel to the screen by a drag of (dx, dy) CSS px: the plane of the target
 * follows the fingers. `camRot`: the camera's rotation (rows right, up, forward); `unitsPerPx`:
 * see panScale (gestures.ts); the target stays within `limit` ly of the pivot.
 */
export function panOrbit(
  orbit: OrbitState,
  camRot: Mat3,
  dx: number,
  dy: number,
  unitsPerPx: number,
  limit: number,
): void {
  shiftTarget(orbit, camRot, -dx * unitsPerPx, dy * unitsPerPx, limit);
}

/**
 * Zooms (distance × factor, kept in [min, max]) towards a point of the screen: the point of the
 * target plane under the anchor (NDC relative to the image centre, x right, y up) stays put.
 */
export function zoomOrbit(
  orbit: OrbitState,
  camRot: Mat3,
  factor: number,
  ndcX: number,
  ndcY: number,
  aspect: number,
  focal: number,
  min: number,
  max: number,
  limit: number,
): void {
  const d = orbit.distance;
  const next = Math.min(max, Math.max(min, d * factor));
  const shift = zoomAnchorShift(ndcX, ndcY, aspect, d, focal, next / d, ZOOM_SHIFT);
  orbit.distance = next;
  shiftTarget(orbit, camRot, shift.x, shift.y, limit);
}

/**
 * Rolls the view by the fingers' clockwise rotation `rad` about the point between them, (rx, ry)
 * CSS px from the image centre (y down): the roll turns the image about its centre, and a pan
 * brings the point under the fingers back under them. `camRot`: the rotation before the roll.
 */
export function rollOrbitAbout(
  orbit: OrbitState,
  camRot: Mat3,
  rad: number,
  rx: number,
  ry: number,
  unitsPerPx: number,
  limit: number,
): void {
  orbit.roll = (orbit.roll ?? 0) - rad / RAD; // clockwise on screen: negative roll
  // The pan, in the screen frame before the roll, that shows as r − R·r after it: R⁻¹·r − r.
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const qx = c * rx + s * ry;
  const qy = -s * rx + c * ry;
  panOrbit(orbit, camRot, qx - rx, qy - ry, unitsPerPx, limit);
}

/**
 * Everything the projection needs for one frame. The view morphs from the sky map's projection
 * (stereographic, from the Earth: `stereoRot`, `stereoScale`) to a perspective camera
 * (`camPos`, `camRot`, `focal` = 1 / tan(vertical fov / 2)) as `morph` goes 0 → 1.
 */
export interface Pose {
  stereoRot: Mat3;
  stereoScale: number;
  morph: number;
  camPos: Vec3;
  camRot: Mat3;
  focal: number;
  /** Vertical shift of the perspective image (NDC): centres the scene between header and legend. */
  shiftY: number;
}

/** Projected point: normalised device coordinates and the camera depth (ly, > 0 in front). */
export interface Projected {
  x: number;
  y: number;
  depth: number;
}

/** Near limit of the perspective camera, ly. */
export const NEAR_LY = 0.5;

/**
 * CPU twin of the vertex shader's project3d (constellation-3d-shaders.ts). `out` is filled and
 * returned; null when the point is behind the camera (or at the eye in the stereographic view).
 */
export function projectPose(
  pose: Pose,
  p: Vec3,
  aspect: number,
  out: Projected = { x: 0, y: 0, depth: 0 },
): Projected | null {
  const m = pose.camRot;
  const dx = p[0] - pose.camPos[0];
  const dy = p[1] - pose.camPos[1];
  const dz = p[2] - pose.camPos[2];
  const cx = m[0] * dx + m[1] * dy + m[2] * dz;
  const cy = m[3] * dx + m[4] * dy + m[5] * dz;
  const cz = m[6] * dx + m[7] * dy + m[8] * dz;
  const px = (cx * pose.focal) / aspect;
  const py = cy * pose.focal + pose.shiftY * cz;
  if (pose.morph >= 1) {
    if (cz < NEAR_LY) return null;
    out.x = px / cz;
    out.y = py / cz;
    out.depth = cz;
    return out;
  }
  const len = Math.hypot(p[0], p[1], p[2]);
  if (len === 0) return null;
  const s = pose.stereoRot;
  const vx = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / len;
  const vy = (s[3] * p[0] + s[4] * p[1] + s[5] * p[2]) / len;
  const vz = (s[6] * p[0] + s[7] * p[1] + s[8] * p[2]) / len;
  const k = (2 / (1 + Math.max(vz, -0.999))) * pose.stereoScale;
  const sx = (vx * k) / aspect;
  const sy = vy * k;
  const w = Math.max(cz, 1e-3);
  out.x = sx + (px / w - sx) * pose.morph;
  out.y = sy + (py / w - sy) * pose.morph;
  out.depth = cz;
  return out;
}

// --- Rotations as quaternions (slerp between the map's view and the centred view)

type Quat = [number, number, number, number];

/** Quaternion of a rotation matrix (rows), Shepperd's method. */
function toQuat(m: Mat3): Quat {
  const [a, b, c, d, e, f, g, h, i] = m;
  const t = a + e + i;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    return [0.25 * s, (h - f) / s, (c - g) / s, (d - b) / s];
  }
  if (a > e && a > i) {
    const s = Math.sqrt(1 + a - e - i) * 2;
    return [(h - f) / s, 0.25 * s, (b + d) / s, (c + g) / s];
  }
  if (e > i) {
    const s = Math.sqrt(1 + e - a - i) * 2;
    return [(c - g) / s, (b + d) / s, 0.25 * s, (f + h) / s];
  }
  const s = Math.sqrt(1 + i - a - e) * 2;
  return [(d - b) / s, (c + g) / s, (f + h) / s, 0.25 * s];
}

function fromQuat([w, x, y, z]: Quat): Mat3 {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ]; // prettier-ignore
}

/** Spherical interpolation between two rotations (shortest arc). */
export function slerpRotation(a: Mat3, b: Mat3, t: number): Mat3 {
  const qa = toQuat(a);
  let qb = toQuat(b);
  let cos = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  if (cos < 0) {
    qb = qb.map((v) => -v) as Quat;
    cos = -cos;
  }
  let ka = 1 - t;
  let kb = t;
  if (cos < 0.9995) {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    ka = Math.sin((1 - t) * angle) / sin;
    kb = Math.sin(t * angle) / sin;
  }
  const q = qa.map((v, k) => ka * v + kb * qb[k]!) as Quat;
  const n = Math.hypot(...q);
  return fromQuat(q.map((v) => v / n) as Quat);
}

// --- Transition 2D → 3D

/** Progress marks of the transition (t in [0, 1]). */
export const PHASES = {
  /** 0 → centre: the sky map's view turns and zooms onto the figure (still stereographic). */
  centre: 0.22,
  /** centre → morph: stereographic → perspective, the camera still at the Earth. */
  morph: 0.38,
  /** Recede: the camera backs away from the Earth along the line of sight. */
  recede: [0.38, 0.72],
  /** Turn: the camera orbits round the figure: depth unfolds. */
  turn: [0.55, 1],
} as const;

export interface TransitionPlan {
  frame: OrbitFrame;
  /** The sky map's view (rows right, up, forward) and stereographic scale. */
  startRot: Mat3;
  startScale: number;
  /** Centred on the figure, zenith up. */
  centredRot: Mat3;
  centredScale: number;
  /** At the Earth, looking at the pivot (yaw = pitch = 0). */
  earthOrbit: OrbitState;
  /** Focal length of the 3D view (1 / tan(fov/2)). */
  focal: number;
  /** Free screen band of the 3D view (NDC): its centre (the image's shift) and half-height. */
  shiftY: number;
  fitY: number;
}

/** Vertical field of view of the 3D view, degrees. */
export const FOV_3D = 40;
/** Screen area the figure must fit in, as |ndc| bounds (room left for the header and legend). */
export const FIT_X = 0.82;
export const FIT_Y = 0.58;

/** Free vertical band of the screen, in NDC (y up): between the header and the legend. */
export interface ScreenBand {
  top: number;
  bottom: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Smooth ease-in-out (cubic smoothstep). */
export const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const phase = (t: number, [a, b]: readonly [number, number]) => ease((t - a) / (b - a));

/** The transition from the sky map's view (`view`) to the 3D view of `model`. */
export function planTransition(
  model: Constellation3DModel,
  view: ViewState,
  aspect: number,
  band: ScreenBand = { top: FIT_Y, bottom: -FIT_Y },
): TransitionPlan {
  const frame = orbitFrame(model);
  const centredRot = lookRotation(frame.forward, frame.up);
  // Stereographic scale fitting the figure's angular radius in the screen.
  let theta = 0;
  for (const s of model.stars)
    theta = Math.max(theta, Math.acos(Math.min(1, Math.max(-1, dot(s.dir, frame.forward)))));
  theta = Math.max(theta, 2 * RAD);
  const room = Math.min(FIT_X * aspect, FIT_Y);
  const centredScale = Math.min(room / (2 * Math.tan(theta / 2)), stereoScale(10));
  return {
    frame,
    startRot: viewMatrix(view),
    startScale: stereoScale(view.fov),
    centredRot,
    centredScale,
    earthOrbit: { yaw: 0, pitch: 0, distance: Math.hypot(...frame.pivot) },
    focal: 1 / Math.tan((FOV_3D * RAD) / 2),
    shiftY: (band.top + band.bottom) / 2,
    // 8 % margin inside the band, and never less than a fifth of the screen.
    fitY: Math.max(0.2, ((band.top - band.bottom) / 2) * 0.92),
  };
}

/** Pose at progress t ∈ [0, 1] of the transition towards the orbit `target`. */
export function poseAt(plan: TransitionPlan, t: number, target: OrbitState): Pose {
  const a = ease(t / PHASES.centre);
  const morph = ease((t - PHASES.centre) / (PHASES.morph - PHASES.centre));
  const r = phase(t, PHASES.recede);
  const u = phase(t, PHASES.turn);
  const e = plan.earthOrbit;
  const orbit: OrbitState = {
    // Log-lerp: the backing away looks uniform at every scale.
    distance: e.distance * (target.distance / e.distance) ** r,
    yaw: target.yaw * u,
    pitch: target.pitch * u,
    // Roll and pan (#107) unwind with the turn: from the Earth the figure is centred, zenith up.
    roll: (target.roll ?? 0) * u,
    ...(target.target && {
      target: [target.target[0] * u, target.target[1] * u, target.target[2] * u] as Vec3,
    }),
  };
  const cam = orbitCamera(plan.frame, orbit);
  // Perspective focal: matches the centred stereographic scale at the Earth, then the 3D fov.
  const focal = plan.centredScale + (plan.focal - plan.centredScale) * r;
  return {
    stereoRot: slerpRotation(plan.startRot, plan.centredRot, a),
    stereoScale: plan.startScale * (plan.centredScale / plan.startScale) ** a,
    morph,
    camPos: cam.position,
    camRot: cam.rotation,
    focal,
    shiftY: plan.shiftY * r,
  };
}

/** Pose of the 3D view itself (end of the transition) for an orbit. */
export function orbitPose(plan: TransitionPlan, orbit: OrbitState): Pose {
  const cam = orbitCamera(plan.frame, orbit);
  return {
    stereoRot: plan.centredRot,
    stereoScale: plan.centredScale,
    morph: 1,
    camPos: cam.position,
    camRot: cam.rotation,
    focal: plan.focal,
    shiftY: plan.shiftY,
  };
}

/**
 * Smallest orbit distance at which every point fits the screen area (|x| ≤ FIT_X, and the band),
 * for the given angles. Bisection on the distance (the projected extent shrinks with it).
 */
export function fitOrbitDistance(
  plan: TransitionPlan,
  points: readonly Vec3[],
  yaw: number,
  pitch: number,
  aspect: number,
): number {
  const r = Math.max(1, ...points.map((p) => Math.hypot(...sub(p, plan.frame.pivot))));
  const fits = (distance: number) => {
    const pose = orbitPose(plan, { yaw, pitch, distance });
    const out: Projected = { x: 0, y: 0, depth: 0 };
    return points.every((p) => {
      const q = projectPose(pose, p, aspect, out);
      return q !== null && Math.abs(q.x) <= FIT_X && Math.abs(q.y - plan.shiftY) <= plan.fitY;
    });
  };
  let lo = r * 0.05;
  let hi = r * 200;
  for (let k = 0; k < 40; k++) {
    const mid = Math.sqrt(lo * hi);
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
