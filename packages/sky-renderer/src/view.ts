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
