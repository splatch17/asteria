/**
 * Way back from a visit (#134): from a body's globe (body-centred frame, #123) to the true-scale
 * solar system (#131), by pinching out past the visit's farthest distance or by the caption's
 * « ← Système solaire ».
 *
 * - The camera recedes from the body, its distance interpolated geometrically, and the point
 *   looked at only leaves the body as the distance grows (returnFraction, a travelFraction):
 *   the inverse of the way in. The body stays on screen until its marker takes over.
 * - The visit places the body at its astrometric position (light-time corrected), the solar
 *   system at its geometric one: up to ≈ 12 Earth radii apart for Neptune (its 5.4 km/s during
 *   the ≈ 4 h the light takes). The globe and the point looked at move together from one to the
 *   other at the start of the way back (shiftProgress), so that nothing moves on screen; on the
 *   way in the same offset is absorbed while the body is still far.
 * - The way back ends on the solar system's framing before the visit when the body is well
 *   inside it, else framed on the body with its primary (the Sun, or the Earth for the Moon).
 *
 * Pure three.js maths (no renderer): unit-tested.
 */
import * as THREE from "three";
import { OverZoom } from "./flight";
import { travelFraction } from "./points-of-view";

/**
 * Pinching out past the visit's farthest distance by this factor (the excess accumulated over a
 * gesture, as for the entry into the sky) leaves for the solar system.
 */
export const VISIT_EXIT_THRESHOLD = 1.25;

/** Share of the way back (time) over which the light-time offset is absorbed. */
export const SHIFT_END = 0.35;

/** Elevation of the camera above the ecliptic when the way back frames the body, degrees. */
export const CONTEXT_LAT = 35;

/** Duration of the crossfade that replaces the flight under reduced motion, ms. */
export const CROSSFADE_MS = 220;

const DEG = Math.PI / 180;

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Progress (0 … 1) of the light-time offset at the time fraction `t` of the way back. */
export function shiftProgress(t: number): number {
  return smoothstep(t / SHIFT_END);
}

/**
 * Opacity of the solar system's markers and names for the weight `w` (0 … 1) of its point of
 * view: they fade in over the middle of a transition instead of appearing at once.
 */
export function sceneFade(w: number): number {
  return smoothstep((w - 0.15) / 0.6);
}

/**
 * Share of the way the point looked at has travelled at the progress `k` (0 … 1) of the way
 * back, the camera's distance going from `d0` to `d1` geometrically: (d(k) − d0) / (d1 − d0),
 * i.e. travelFraction with the distance's own growth as its span. The body's angle off the line
 * of sight, offset·f / d, then only grows, up to its place in the final framing: if it is on
 * screen there, it is on screen all the way. Linear when the distance does not grow.
 */
export function returnFraction(k: number, d0: number, d1: number): number {
  const t = Math.min(1, Math.max(0, k));
  if (!(d1 > d0) || !(d0 > 0)) return t;
  return travelFraction(t, d1 - d0, d0, d1);
}

/**
 * Point looked at during the way back (`out`): it starts on `start` (where the visit looked),
 * moved by the light-time offset `shift` × `s` (shiftProgress), and travels to `dest` by the
 * fraction `f` (travelFraction). `out` may be `dest`. Allocation-free.
 */
export function returnTarget(
  dest: THREE.Vector3,
  start: THREE.Vector3,
  shift: THREE.Vector3,
  s: number,
  f: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const x = start.x + shift.x * s;
  const y = start.y + shift.y * s;
  const z = start.z + shift.z * s;
  return out.set(x + (dest.x - x) * f, y + (dest.y - y) * f, z + (dest.z - z) * f);
}

/** Orbit angles (degrees) and half-extents to frame (world units) at the end of the way back. */
export interface ContextFraming {
  lon: number;
  lat: number;
  halfW: number;
  halfH: number;
}

/**
 * Framing on a body with its primary: `rel` is the body minus its primary, in the frame's axes
 * (z = the ecliptic pole). The camera is beyond the body, CONTEXT_LAT above the ecliptic,
 * looking back towards the primary: the body at the centre, the primary above it on screen,
 * at about `rel`·sin(lat) (the half-height leaves room for its glow and name).
 */
export function contextFraming(rel: THREE.Vector3, out: ContextFraming): ContextFraming {
  const r = Math.max(1e-9, rel.length());
  out.lon = Math.atan2(rel.y, rel.x) / DEG;
  out.lat = CONTEXT_LAT;
  const up = r * Math.sin(CONTEXT_LAT * DEG);
  out.halfH = 1.3 * up;
  out.halfW = 0.6 * up;
  return out;
}

const local = new THREE.Vector3();
const inverse = new THREE.Quaternion();

/**
 * True when the world point `p` is seen by a camera at `cam` (orientation `quat`, looking down
 * its −z) within `halfW` × `halfH` CSS px of the centre of the view, less `margin`; `focalPx`
 * is the focal length in CSS px.
 */
export function inView(
  cam: THREE.Vector3,
  quat: THREE.Quaternion,
  p: THREE.Vector3,
  focalPx: number,
  halfW: number,
  halfH: number,
  margin: number,
): boolean {
  const v = local.copy(p).sub(cam).applyQuaternion(inverse.copy(quat).invert());
  if (!(v.z < 0)) return false;
  const x = (focalPx * v.x) / -v.z;
  const y = (focalPx * v.y) / -v.z;
  return Math.abs(x) <= halfW - margin && Math.abs(y) <= halfH - margin;
}

/**
 * Pinch-out exit of a visit: fed with each zoom's requested distance and the visit's farthest,
 * true once the gesture has pushed VISIT_EXIT_THRESHOLD past it (a pause of half a second, or
 * a zoom back in, starts again).
 */
export class PinchExit {
  private readonly over: OverZoom;

  constructor(threshold = VISIT_EXIT_THRESHOLD, gapMs = 500) {
    this.over = new OverZoom(threshold, gapMs);
  }

  push(requested: number, max: number, now: number): boolean {
    return this.over.push(requested / max, now);
  }

  reset(): void {
    this.over.reset();
  }
}
