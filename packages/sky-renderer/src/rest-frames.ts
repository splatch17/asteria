/**
 * Rest frames of the true-scale scene (#139): what stays still on screen while time runs.
 *
 * The point of view (reference-frames.ts: « Les saisons », « Le système solaire », a visit)
 * says what is shown; the rest frame says what the camera is attached to:
 * - "stars" — Étoiles (default): inertial axes, the stars still; the camera only follows the
 *   body it looks at in translation, so the Earth and the planets are seen turning on their
 *   axes (the Earth by GMST, the planets by their IAU rotation) and moving on their orbits.
 * - "sun" — Soleil: inertial axes, the camera's origin fixed to the Sun; the planets move along
 *   their orbits across the screen.
 * - "earth" — Terre: the camera turns with the Earth (Earth-fixed axes: z = the celestial pole,
 *   x = the Greenwich meridian, turned by GMST about the pole of date; an ITRS without polar
 *   motion). The Earth stands still; the stars turn round it in a sidereal day, the Sun in a
 *   solar day.
 * - "body" — the Moon or a planet: the camera turns with it (z = its north pole, x = its prime
 *   meridian, IAU WGCCRE 2015; the Moon's prime meridian at the mean sub-Earth point).
 *
 * The world frame stays the mean equator and equinox of date (Earth radii, the Earth at the
 * origin), so the Earth-fixed frame turns by GMST (the Greenwich meridian's angle from the mean
 * equinox; astro-core, tested against SOFA iauGmst06), not by the ERA (from the CIO).
 *
 * Pure three.js maths, allocation-free: unit-tested.
 */
import * as THREE from "three";
import {
  JD_J2000,
  PLANETS,
  SIDEREAL_DAY_S,
  greenwichMeanSiderealTime,
  julianDate,
  type Planet,
} from "@asteria/astro-core";
import { PLANET_ROTATION } from "./space-style";
import type { BodyTarget } from "./body-frame";
import type { ReferenceFrameId } from "./reference-frames";

const DEG = Math.PI / 180;

export type RestFrameId = "stars" | "sun" | "earth" | "body";

/** The rest frames in the chooser's order. */
export const REST_FRAMES: readonly RestFrameId[] = ["stars", "sun", "earth", "body"];

export const DEFAULT_REST_FRAME: RestFrameId = "stars";

export const isRestFrameId = (v: unknown): v is RestFrameId =>
  REST_FRAMES.includes(v as RestFrameId);

/**
 * A rest frame the view can take in a point of view: all of them round the Sun (the body's
 * only when a Moon or a planet is looked at, `focus`); in a visit, the stars, the Sun or the
 * body visited (attached to the Earth, the camera near another body would sweep round the Earth
 * at its distance once a day).
 */
export function restFrameOffered(
  id: RestFrameId,
  pov: ReferenceFrameId,
  focus: BodyTarget | null,
): boolean {
  if (id === "body") return focus !== null;
  if (id === "earth") return pov !== "body";
  return true;
}

/** Sidereal rotation of the Moon (synchronous), IAU WGCCRE 2015: Ẇ = 13.17635815°/day. */
const MOON_W_DOT = 13.17635815;

/**
 * Sidereal rotation period in hours (negative: retrograde), from the IAU WGCCRE 2015 rates
 * Ẇ (°/day) for the Moon and the planets, the mean sidereal day for the Earth.
 */
export function rotationPeriodHours(body: "Earth" | BodyTarget): number {
  if (body === "Earth") return SIDEREAL_DAY_S / 3600;
  const wDot = body === "Moon" ? MOON_W_DOT : PLANET_ROTATION[body].wDot;
  return (360 / wDot) * 24;
}

/** Prime meridian angle W of a planet at a date, degrees in [0, 360) (IAU WGCCRE 2015). */
export function rotationAngle(planet: Planet, date: Date): number {
  const r = PLANET_ROTATION[planet];
  const w = (r.w0 + r.wDot * (julianDate(date) - JD_J2000)) % 360;
  return w < 0 ? w + 360 : w;
}

const node = new THREE.Vector3();
const quadrature = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Prime meridian of a planet (J2000, unit): at the angle W, eastwards along its equator, from
 * the ascending node ẑ × pole of that equator on the ICRF equator; the same as planetAxes
 * (space-style.ts), without allocating. `pole`: the planet's pole, J2000 unit.
 */
export function primeMeridian(
  planet: Planet,
  date: Date,
  pole: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  const w = rotationAngle(planet, date) * DEG;
  node.crossVectors(Z, pole).normalize();
  quadrature.crossVectors(pole, node);
  return out
    .copy(node)
    .multiplyScalar(Math.cos(w))
    .addScaledVector(quadrature, Math.sin(w))
    .normalize();
}

/**
 * Earth-fixed axes (frame → world, equator of date): a turn of GMST about the pole of date, so
 * the frame's x axis is the Greenwich meridian on the equator, as the globe (rotated by GMST).
 */
export function earthFixedRotation(date: Date, out: THREE.Quaternion): THREE.Quaternion {
  return out.setFromAxisAngle(Z, greenwichMeanSiderealTime(date) * DEG);
}

const basis = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
const m4 = new THREE.Matrix4();

/**
 * Body-fixed axes (frame → world): z = the north pole, x = the prime meridian (made square to
 * the pole), y = z × x. `pole` and `prime` are world vectors.
 */
export function bodyFixedRotation(
  pole: THREE.Vector3,
  prime: THREE.Vector3,
  out: THREE.Quaternion,
): THREE.Quaternion {
  const { x, y, z } = basis;
  z.copy(pole).normalize();
  x.copy(prime).addScaledVector(z, -prime.dot(z));
  if (x.lengthSq() < 1e-18) x.set(1, 0, 0).addScaledVector(z, -z.x);
  x.normalize();
  y.crossVectors(z, x);
  return out.setFromRotationMatrix(m4.makeBasis(x, y, z));
}

/** Planets whose rotation is retrograde (negative Ẇ): Venus and Uranus. */
export const RETROGRADE: readonly Planet[] = PLANETS.filter((p) => PLANET_ROTATION[p].wDot < 0);
