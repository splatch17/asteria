/**
 * Body-centred reference frame of the Earth view (#123): the camera orbits the Moon or a planet.
 *
 * The scene stays in the world frame of the Earth view (mean equator and equinox of date, Earth
 * radii, the Earth at the origin). The body sits at its astrometric geocentric position at the
 * date (light-time corrected, astro-core geocentricPosition), precessed J2000 → date, at its
 * real distance and with its real radius: nothing is enlarged. The frame is inertial (it does
 * not turn with the body); its pole is the body's north pole (IAU WGCCRE 2015), so the body's
 * equator, and Saturn's rings, stay level on screen.
 *
 * Pure three.js maths (no renderer) so that it is unit-tested.
 */
import * as THREE from "three";
import {
  PLANETS,
  geocentricPosition,
  precessionMatrix,
  unitVector,
  type GeocentricPosition,
  type Planet,
} from "@asteria/astro-core";
import type { ReferenceFrame } from "./reference-frames";
import { MOON_POLE, PLANET_ROTATION } from "./space-style";

/** Bodies the camera can be centred on: the Moon and the planets (selector order). */
export const BODY_TARGETS = ["Moon", ...PLANETS] as const;
export type BodyTarget = (typeof BODY_TARGETS)[number];

export const isBodyTarget = (v: unknown): v is BodyTarget => BODY_TARGETS.includes(v as BodyTarget);

/** Earth's equatorial radius (IAU 2015 nominal, WGS 84), km: the scene's unit. */
export const EARTH_RADIUS_KM = 6378.137;

/**
 * Radii, km: IAU WGCCRE 2015 (Archinal et al. 2018), equatorial radius for the planets, mean
 * radius for the Moon. The globes are drawn as spheres (flattening ignored: 6.5 % for Saturn).
 */
export const BODY_RADIUS_KM: Readonly<Record<BodyTarget, number>> = Object.freeze({
  Moon: 1737.4,
  Mercury: 2440.53,
  Venus: 6051.8,
  Mars: 3396.19,
  Jupiter: 71_492,
  Saturn: 60_268,
  Uranus: 25_559,
  Neptune: 24_764,
});

/** Saturn's main rings, in Saturn radii: C ring inner edge to A ring outer edge. */
export const SATURN_RINGS = Object.freeze({ inner: 1.239, outer: 2.27 });

/** Radius of a body in Earth radii (the scene's unit). */
export const bodyRadius = (body: BodyTarget): number => BODY_RADIUS_KM[body] / EARTH_RADIUS_KM;

/** Largest extent of what is drawn round a body, in its radii (Saturn: its rings). */
export const bodyExtent = (body: BodyTarget): number =>
  body === "Saturn" ? SATURN_RINGS.outer : 1;

/** Closest and farthest orbit distances round a body, in its radii (the Earth's: 1.6 … 40). */
export const BODY_DIST = Object.freeze({ min: 1.6, max: 40 });

/**
 * Distance (Earth radii) at which the body and its rings fill `fill` of the shorter half-extent
 * of the screen (vertical field `fovDeg`, aspect w/h), and at least 4 of its radii.
 */
export function bodyViewDistance(
  body: BodyTarget,
  fovDeg: number,
  aspect: number,
  fill = 0.5,
): number {
  const half = Math.tan((fovDeg * Math.PI) / 360) * Math.min(1, aspect);
  const r = bodyRadius(body);
  return Math.min(BODY_DIST.max * r, Math.max(4 * r, (bodyExtent(body) * r) / (fill * half)));
}

const scratch: GeocentricPosition = { x: 0, y: 0, z: 0, distanceKm: 0, lightTimeS: 0 };
const prec = new THREE.Matrix3();

/** Precession J2000 → mean equator of date, as a three.js matrix (`out`). */
export function precession(date: Date, out: THREE.Matrix3): THREE.Matrix3 {
  return out.set(...precessionMatrix(date));
}

/**
 * Position of the Sun, the Moon or a planet in the world frame (equator of date, Earth radii,
 * Earth's centre at the origin), light-time corrected. `prec`: J2000 → date (precession()).
 */
export function worldPosition(
  body: "Sun" | BodyTarget,
  date: Date,
  prec: THREE.Matrix3,
  out: THREE.Vector3,
): THREE.Vector3 {
  const p = geocentricPosition(body, date, scratch);
  return out
    .set(p.x, p.y, p.z)
    .multiplyScalar(1 / EARTH_RADIUS_KM)
    .applyMatrix3(prec);
}

/** North pole of a body (IAU WGCCRE 2015, J2000) in the world frame, unit vector. */
export function bodyPole(body: BodyTarget, prec: THREE.Matrix3, out: THREE.Vector3): THREE.Vector3 {
  const r = body === "Moon" ? MOON_POLE : PLANET_ROTATION[body as Planet];
  const [x, y, z] = unitVector(r.ra, r.dec);
  return out.set(x, y, z).applyMatrix3(prec).normalize();
}

const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const basis = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
const m4 = new THREE.Matrix4();

/**
 * Rotation frame → world of the body frame: z = the body's north pole, x = the ascending node
 * of its equator on the Earth's equator of date (z_world × pole), y completes. Inertial.
 */
export function poleUpRotation(pole: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const { x, y, z } = basis;
  z.copy(pole).normalize();
  x.crossVectors(Z, z);
  if (x.lengthSq() < 1e-12) x.copy(X);
  x.normalize();
  y.crossVectors(z, x);
  m4.makeBasis(x, y, z);
  return out.setFromRotationMatrix(m4);
}

/** The body-centred frame for one body; `body` may change (the target is then re-read). */
export class BodyFrame implements ReferenceFrame {
  readonly id = "body" as const;
  private readonly pole = new THREE.Vector3();

  constructor(public body: BodyTarget = "Moon") {}

  orientation(date: Date, out: THREE.Quaternion): THREE.Quaternion {
    return poleUpRotation(bodyPole(this.body, precession(date, prec), this.pole), out);
  }

  target(date: Date, out: THREE.Vector3): THREE.Vector3 {
    return worldPosition(this.body, date, precession(date, prec), out);
  }
}

/**
 * Direction (world, unit) from which the body is first seen: from 50° off the Sun towards the
 * Earth (the lit side, with a terminator to show the relief), raised 15° towards the nearer
 * pole (Saturn's rings open). `sunward`, `toEarth`, `pole`: unit vectors from the body.
 */
export function bodyViewDirection(
  sunward: THREE.Vector3,
  toEarth: THREE.Vector3,
  pole: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  // Perpendicular to the sunward direction, towards the Earth (or the pole if aligned).
  const side = basis.x.copy(toEarth).addScaledVector(sunward, -toEarth.dot(sunward));
  if (side.lengthSq() < 1e-6) side.copy(pole).addScaledVector(sunward, -pole.dot(sunward));
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0).addScaledVector(sunward, -sunward.x);
  side.normalize();
  const a = (50 * Math.PI) / 180;
  out.copy(sunward).multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
  const up = out.dot(pole) >= 0 ? 1 : -1;
  return out.addScaledVector(pole, up * Math.tan((15 * Math.PI) / 180)).normalize();
}

/**
 * True when the segment from `from` to the point `p` (or towards the direction `p` at infinity)
 * passes through the sphere (`centre`, `radius`): the generalisation of "hidden by the Earth".
 */
export function hiddenBySphere(
  from: THREE.Vector3,
  p: THREE.Vector3,
  atInfinity: boolean,
  centre: THREE.Vector3,
  radius: number,
  tmp: { d: THREE.Vector3; o: THREE.Vector3 },
): boolean {
  const o = tmp.o.copy(from).sub(centre);
  const d = tmp.d.copy(p);
  if (!atInfinity) d.sub(from);
  const len = d.length();
  if (len === 0) return false;
  d.multiplyScalar(1 / len);
  const b = o.dot(d);
  const c = o.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 0 && (atInfinity || t < len - 1e-3 * radius);
}
