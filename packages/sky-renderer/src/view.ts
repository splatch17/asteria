/**
 * View geometry for the sky map (pure math, shared by the GPU shaders and CPU picking).
 *
 * Horizontal frame: (North, East, Up). The camera looks towards (azimuth, altitude);
 * view frame: x = screen right, y = screen up, z = forward.
 * Projection: stereographic, r = 2·tan(θ/2), scaled so that θ = fov/2 reaches the half-height.
 */

import type { Mat3, Vec3 } from "@asteria/astro-core";

const RAD = Math.PI / 180;

export interface ViewState {
  azimuth: number;
  altitude: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Screen rotation in degrees: positive when the top of the screen leans towards the right. */
  roll?: number;
}

/** Rows: right, up, forward — expressed in (North, East, Up). */
export function viewMatrix({ azimuth, altitude, roll = 0 }: ViewState): Mat3 {
  const a = azimuth * RAD;
  const h = altitude * RAD;
  const r = roll * RAD;
  // Unrolled basis: right is horizontal, up leans towards the zenith.
  const right0 = [-Math.sin(a), Math.cos(a), 0];
  const up0 = [-Math.sin(h) * Math.cos(a), -Math.sin(h) * Math.sin(a), Math.cos(h)];
  const [c, s] = [Math.cos(r), Math.sin(r)];
  const right = right0.map((v, i) => c * v - s * up0[i]!);
  const up = up0.map((v, i) => c * v + s * right0[i]!);
  return [
    right[0]!, right[1]!, right[2]!,
    up[0]!, up[1]!, up[2]!,
    Math.cos(h) * Math.cos(a), Math.cos(h) * Math.sin(a), Math.sin(h),
  ]; // prettier-ignore
}

export function stereoScale(fovDeg: number): number {
  return 1 / (2 * Math.tan((fovDeg * RAD) / 4));
}

/** View-frame direction → normalized device coords (y up, x scaled by aspect). */
export function projectStereo([x, y, z]: Vec3, scale: number, aspect: number): [number, number] {
  const k = (2 / (1 + z)) * scale;
  return [(x * k) / aspect, y * k];
}

/** Inverse of projectStereo: NDC → unit view-frame direction. */
export function unprojectStereo(nx: number, ny: number, scale: number, aspect: number): Vec3 {
  const px = (nx * aspect) / scale;
  const py = ny / scale;
  const r2 = px * px + py * py;
  return [(4 * px) / (4 + r2), (4 * py) / (4 + r2), (4 - r2) / (4 + r2)];
}

/**
 * Widest field across the narrow side of the screen (#89): a little more than the 180° of the
 * whole sky above the horizon, so that looking at the zenith shows it as a disc with a margin
 * (~210° ⇒ the hemisphere spans ~77 % of the narrow side).
 */
export const FOV_MAX_NARROW = 210;
/** Never wider vertically than this, whatever the screen (very tall screens). */
export const FOV_MAX_VERTICAL = 300;

/**
 * Widest vertical field of view (degrees) for a screen of the given aspect (width / height):
 * FOV_MAX_NARROW across the narrow side. Portrait 1080×2340 (aspect 0.46): ~282°; landscape:
 * 210°. A fixed vertical limit would stretch landscape screens far beyond the antipode.
 */
export function maxFov(aspect: number): number {
  if (!(aspect < 1)) return FOV_MAX_NARROW;
  const fov = (4 * Math.atan(Math.tan((FOV_MAX_NARROW * RAD) / 4) / aspect)) / RAD;
  return Math.min(FOV_MAX_VERTICAL, fov);
}

/** Angle (degrees) between the view centre and the screen corners. */
export function cornerAngle(fovDeg: number, aspect: number): number {
  const r = Math.hypot(aspect, 1) / stereoScale(fovDeg); // corner radius, r = 2·tan(θ/2)
  return (2 * Math.atan(r / 2)) / RAD;
}

/** Beyond the screen corners, what is still projected: a figure segment may end out there. */
const BACK_MARGIN_DEG = 25;
/** Never closer to the antipode of the view centre (where the projection diverges). */
const BACK_MAX_DEG = 172;

/**
 * Smallest view-frame z (cosine of the angle from the view centre) still projected, for the
 * shaders and the CPU twins (labels, picking). Narrow fields keep the historical −0.6
 * (~127°); very wide ones (#89) reach their corners plus BACK_MARGIN_DEG, up to BACK_MAX_DEG.
 */
export function backCutoff(fovDeg: number, aspect: number): number {
  const angle = Math.min(BACK_MAX_DEG, cornerAngle(fovDeg, aspect) + BACK_MARGIN_DEG);
  return Math.min(-0.6, Math.cos(angle * RAD));
}

/**
 * Eased progress (ease-out cubic, 0 → 1) of a view animation started at `start` (ms) lasting
 * `duration` ms; a duration of 0 or less ends at once (reduced motion) instead of giving NaN.
 */
export function viewAnimationProgress(now: number, start: number, duration: number): number {
  const t = duration > 0 ? Math.min(1, Math.max(0, (now - start) / duration)) : 1;
  return 1 - (1 - t) ** 3;
}

/** Above this altitude (and below its opposite) the sky follows the finger freely (#152). */
export const FREE_PAN_ALTITUDE = 60;

/**
 * Pans the view by a finger's drag, the drag already turned into degrees of the field: `yaw`
 * towards the screen's right, `pitch` towards its top.
 *
 * Near the horizon the horizon stays level: yaw turns the azimuth (scaled by 1 / cos(altitude),
 * so the sky at the centre follows the finger), pitch the altitude. Higher up, where an
 * alt-azimuth view has no "up", the camera turns about its own axes (#152): the sky follows the
 * finger in every direction around the zenith, without spinning about it nor flipping over; the
 * screen may then be rolled. A rolled view keeps panning that way; SkyMap levels it again once
 * the finger lifts below FREE_PAN_ALTITUDE.
 */
export function panView(view: ViewState, yaw: number, pitch: number): ViewState {
  const roll = view.roll ?? 0;
  if (Math.abs(roll) < 1e-6 && Math.abs(view.altitude) < FREE_PAN_ALTITUDE) {
    const azimuth = view.azimuth + yaw / Math.cos(view.altitude * RAD);
    return {
      ...view,
      azimuth: ((azimuth % 360) + 360) % 360,
      altitude: view.altitude + pitch,
      roll: 0,
    };
  }
  const [r0, r1, r2, u0, u1, u2, f0, f1, f2] = viewMatrix(view);
  const [cy, sy] = [Math.cos(yaw * RAD), Math.sin(yaw * RAD)];
  const [cp, sp] = [Math.cos(pitch * RAD), Math.sin(pitch * RAD)];
  // Yaw: forward turns towards right; then pitch: forward turns towards up.
  const fy: Vec3 = [f0 * cy + r0 * sy, f1 * cy + r1 * sy, f2 * cy + r2 * sy];
  const f: Vec3 = [fy[0] * cp + u0 * sp, fy[1] * cp + u1 * sp, fy[2] * cp + u2 * sp];
  const u: Vec3 = [u0 * cp - fy[0] * sp, u1 * cp - fy[1] * sp, u2 * cp - fy[2] * sp];
  const altitude = Math.asin(Math.max(-1, Math.min(1, f[2]))) / RAD;
  const azimuth = (((Math.atan2(f[1], f[0]) / RAD) % 360) + 360) % 360;
  // Roll as in viewMatrix: up = cos ρ · up0 + sin ρ · right0.
  const a = azimuth * RAD;
  const h = altitude * RAD;
  const right0: Vec3 = [-Math.sin(a), Math.cos(a), 0];
  const up0: Vec3 = [-Math.sin(h) * Math.cos(a), -Math.sin(h) * Math.sin(a), Math.cos(h)];
  const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  return { ...view, azimuth, altitude, roll: Math.atan2(dot(u, right0), dot(u, up0)) / RAD };
}
