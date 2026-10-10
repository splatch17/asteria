/**
 * Reference frames of the Earth view (#105, #122).
 *
 * The scene's world frame stays the mean equator and equinox of date (z = celestial north pole,
 * x = mean vernal equinox): the globe turns in it by Greenwich mean sidereal time, the stars and
 * bodies sit at infinity. A reference frame only changes where the camera is and which way is
 * up: the orbit camera's angles (lon, lat), its distance and its pan are expressed in the frame,
 * and the frame's rotation (frame → world, a function of the date) turns them into the world.
 *
 * - "stars" (star-fixed, default): the world frame itself; celestial north up, the Earth turns.
 * - "earth" (Earth-fixed): the world frame turned about the pole by GMST, so the camera turns
 *   with the globe: a place stays in front of the camera while the sky scrolls. GMST rather than
 *   the Earth rotation angle (ERA): the globe is turned by GMST in this equinox-based frame (ERA
 *   is measured from the CIO); using the same angle keeps the place exactly still.
 * - "ecliptic": x = vernal equinox, z = ecliptic pole of date; the Earth's axis appears tilted by
 *   the mean obliquity of date (IAU 2006, astro-core meanObliquity).
 * - "body" (#123): the camera orbits the Moon or a planet, at its real distance and size, its
 *   north pole up (body-frame.ts: BodyFrame, owned by the view, which knows the chosen body).
 * - "heliocentric": announced in the selector, not available yet (#124).
 *
 * Pure three.js maths, allocation-free once set up: safe to run every frame.
 */
import * as THREE from "three";
import { greenwichMeanSiderealTime, meanObliquity } from "@asteria/astro-core";

const DEG = Math.PI / 180;

export type ReferenceFrameId = "stars" | "earth" | "ecliptic" | "heliocentric" | "body";

/** The frames in the selector's order; `available`: false until their sub-ticket lands. */
export const REFERENCE_FRAMES: readonly { id: ReferenceFrameId; available: boolean }[] = [
  { id: "stars", available: true },
  { id: "earth", available: true },
  { id: "ecliptic", available: true },
  { id: "heliocentric", available: false }, // TODO(#124): heliocentric frame
  { id: "body", available: true },
];

export const DEFAULT_REFERENCE_FRAME: ReferenceFrameId = "stars";

/** Duration of the slerp between two frames, ms (0 with reduced motion: chosen by the caller). */
export const FRAME_TRANSITION_MS = 800;

export const isReferenceFrameId = (v: unknown): v is ReferenceFrameId =>
  REFERENCE_FRAMES.some((f) => f.id === v);

/** A frame the Earth view can show now. */
export const isAvailableFrame = (v: unknown): v is ReferenceFrameId =>
  REFERENCE_FRAMES.some((f) => f.id === v && f.available);

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * A reference frame of the Earth view: its orientation at a date (rotation frame → world) and
 * the point the camera orbits (world, Earth radii).
 */
export interface ReferenceFrame {
  readonly id: ReferenceFrameId;
  orientation(date: Date, out: THREE.Quaternion): THREE.Quaternion;
  target(date: Date, out: THREE.Vector3): THREE.Vector3;
}

const geocentre = (_date: Date, out: THREE.Vector3) => out.set(0, 0, 0);

export const FRAMES: Readonly<Record<"stars" | "earth" | "ecliptic", ReferenceFrame>> = {
  stars: { id: "stars", orientation: (_d, out) => out.identity(), target: geocentre },
  earth: {
    id: "earth",
    orientation: (d, out) => out.setFromAxisAngle(Z_AXIS, greenwichMeanSiderealTime(d) * DEG),
    target: geocentre,
  },
  ecliptic: {
    id: "ecliptic",
    // Rotation about the equinox by +ε: the ecliptic pole (frame z) goes to (0, −sin ε, cos ε),
    // RA 18h, Dec 90° − ε; ecliptic longitude 90° (summer solstice) to Dec +ε.
    orientation: (d, out) => out.setFromAxisAngle(X_AXIS, meanObliquity(d) * DEG),
    target: geocentre,
  },
};

/**
 * The frame for an id; unavailable ones fall back to the star-fixed frame, and so does "body",
 * whose frame depends on the chosen body (a BodyFrame owned by the view).
 */
export function frameOf(id: ReferenceFrameId): ReferenceFrame {
  return id === "earth" || id === "ecliptic" ? FRAMES[id] : FRAMES.stars;
}

/** Orbit camera in a frame: angles (degrees), distance and pan of the target (Earth radii). */
export interface FrameOrbit {
  lon: number;
  lat: number;
  dist: number;
  /** Pan of the point looked at, frame axes, Earth radii (#107); 0 = the frame's target. */
  tx: number;
  ty: number;
  tz: number;
}

const scratch = {
  m: new THREE.Matrix4(),
  v: new THREE.Vector3(),
  up: new THREE.Vector3(),
  q: new THREE.Quaternion(),
};

/**
 * Camera pose of an orbit in a frame: position round the target, looking at it, the frame's
 * pole (z) up. `frame` rotates frame → world; `origin` is the frame's target in the world.
 * Fills `position`, `quaternion` and `target` (world); allocation-free.
 */
export function orbitPose(
  frame: THREE.Quaternion,
  origin: THREE.Vector3,
  orbit: Readonly<FrameOrbit>,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  target: THREE.Vector3,
): void {
  const { lon, lat, dist, tx, ty, tz } = orbit;
  const l = lon * DEG;
  const b = lat * DEG;
  target.set(tx, ty, tz).applyQuaternion(frame).add(origin);
  position
    .set(dist * Math.cos(b) * Math.cos(l), dist * Math.cos(b) * Math.sin(l), dist * Math.sin(b))
    .applyQuaternion(frame)
    .add(target);
  scratch.up.copy(Z_AXIS).applyQuaternion(frame);
  // As Object3D.lookAt for a camera: −z towards the target, y towards `up`.
  scratch.m.lookAt(position, target, scratch.up);
  quaternion.setFromRotationMatrix(scratch.m);
}

/**
 * The same camera (position and target, world) expressed in another frame: the orbit's angles
 * and pan in `frame` (rotation frame → world, target `origin`). Latitude is held within ±89°.
 */
export function orbitInFrame(
  position: THREE.Vector3,
  target: THREE.Vector3,
  frame: THREE.Quaternion,
  origin: THREE.Vector3,
  out: FrameOrbit,
): FrameOrbit {
  const inv = scratch.q.copy(frame).invert();
  const t = scratch.v.copy(target).sub(origin).applyQuaternion(inv);
  out.tx = t.x;
  out.ty = t.y;
  out.tz = t.z;
  const c = scratch.v.copy(position).sub(target).applyQuaternion(inv);
  const dist = c.length();
  out.dist = dist;
  out.lon = Math.atan2(c.y, c.x) / DEG;
  out.lat = Math.max(-89, Math.min(89, Math.asin(Math.max(-1, Math.min(1, c.z / dist))) / DEG));
  return out;
}

/** Longitude and latitude (degrees) in a frame of a world direction (need not be unit). */
export function directionInFrame(
  dir: THREE.Vector3,
  frame: THREE.Quaternion,
  out: { lon: number; lat: number },
): { lon: number; lat: number } {
  const v = scratch.v.copy(dir).applyQuaternion(scratch.q.copy(frame).invert()).normalize();
  out.lon = Math.atan2(v.y, v.x) / DEG;
  out.lat = Math.asin(Math.max(-1, Math.min(1, v.z))) / DEG;
  return out;
}
