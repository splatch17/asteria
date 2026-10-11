import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { heliocentricPosition, meanObliquity } from "@asteria/astro-core";
import {
  FRAMES,
  REFERENCE_FRAMES,
  directionInFrame,
  frameOf,
  isAvailableFrame,
  isReferenceFrameId,
  isSunCentred,
  orbitInFrame,
  orbitPose,
  type FrameOrbit,
} from "./reference-frames";
import { AU } from "./points-of-view";

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const ORIGIN = new THREE.Vector3();

const orientation = (id: "stars" | "ecliptic", date: Date) =>
  FRAMES[id].orientation(date, new THREE.Quaternion());
const raDec = (v: THREE.Vector3) => ({
  ra: (((Math.atan2(v.y, v.x) / DEG) % 360) + 360) % 360,
  dec: Math.asin(v.z / v.length()) / DEG,
});

describe("reference frame list", () => {
  it("offers the four points of view, star-fixed first, all available (#128, #131)", () => {
    expect(REFERENCE_FRAMES.map((f) => f.id)).toEqual([
      "stars",
      "ecliptic",
      "heliocentric",
      "body",
    ]);
    expect(REFERENCE_FRAMES.every((f) => f.available)).toBe(true);
    expect(isReferenceFrameId("body")).toBe(true);
    expect(isAvailableFrame("heliocentric")).toBe(true);
    expect(isAvailableFrame("galactic")).toBe(false);
    // « Vu du sol » was removed (#131): a saved "earth" frame is no longer valid.
    expect(isAvailableFrame("earth")).toBe(false);
    expect(isReferenceFrameId("earth")).toBe(false);
    expect(frameOf("heliocentric").id).toBe("heliocentric");
    expect(frameOf("body").id).toBe("stars");
    expect(isSunCentred("ecliptic") && isSunCentred("heliocentric")).toBe(true);
    expect(isSunCentred("stars") || isSunCentred("body")).toBe(false);
  });
});

describe("sun-centred frames (#128, #131)", () => {
  it("orbit the Sun at its true place, the Earth at the origin", () => {
    const date = new Date("2026-10-10T00:00:00Z");
    const seasons = FRAMES.ecliptic.target(date, new THREE.Vector3());
    const solar = FRAMES.heliocentric.target(date, new THREE.Vector3());
    // True scale: the Sun–Earth distance in Earth radii (≈ 23 455 per au).
    const r = heliocentricPosition("Earth", date).distanceAu * AU;
    expect(seasons.length() / r).toBeCloseTo(1, 9);
    expect(solar.distanceTo(seasons)).toBe(0);
    // Both have the ecliptic pole up, as the ecliptic frame.
    const q = FRAMES.heliocentric.orientation(date, new THREE.Quaternion());
    expect(q.angleTo(orientation("ecliptic", date))).toBeLessThan(1e-7); // acos rounding
  });
});

describe("star-fixed frame", () => {
  it("is the mean equator of date: celestial pole up, x at the equinox", () => {
    const q = orientation("stars", new Date("2026-10-09T21:00:00Z"));
    expect(Z.clone().applyQuaternion(q).distanceTo(Z)).toBeLessThan(1e-15);
    expect(X.clone().applyQuaternion(q).distanceTo(X)).toBeLessThan(1e-15);
  });
});

describe("ecliptic frame", () => {
  it("tilts the celestial pole from the ecliptic pole by the mean obliquity (within 1″)", () => {
    for (const iso of [
      "2000-01-01T12:00:00Z",
      "2026-06-21T00:00:00Z",
      "1850-01-01T00:00:00Z",
      "2350-01-01T00:00:00Z",
    ]) {
      const date = new Date(iso);
      const pole = Z.clone().applyQuaternion(orientation("ecliptic", date));
      expect(Math.abs(pole.angleTo(Z) - meanObliquity(date) * DEG)).toBeLessThan(ARCSEC);
    }
  });

  it("puts the J2000 ecliptic pole at RA 18h, Dec +66°33′38.6″ and keeps x at the equinox", () => {
    // Reference: north ecliptic pole (J2000), α = 18h, δ = 66°33′38.594″ (90° − 84381.406″).
    const q = orientation("ecliptic", new Date("2000-01-01T12:00:00Z"));
    const pole = raDec(Z.clone().applyQuaternion(q));
    expect(Math.abs(pole.ra - 270) * 3600).toBeLessThan(1e-6);
    expect(Math.abs(pole.dec - (66 + 33 / 60 + 38.594 / 3600)) * 3600).toBeLessThan(1);
    expect(X.clone().applyQuaternion(q).distanceTo(X)).toBeLessThan(1e-15);
    // Ecliptic longitude 90° (June solstice point) at RA 6h, Dec +ε.
    const solstice = raDec(new THREE.Vector3(0, 1, 0).applyQuaternion(q));
    expect(solstice.ra).toBeCloseTo(90, 9);
    expect(solstice.dec).toBeCloseTo(meanObliquity(new Date("2000-01-01T12:00:00Z")), 9);
  });
});

describe("orbit camera in a frame", () => {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const target = new THREE.Vector3();
  const up = () => new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const forward = () => new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);

  it("looks at the target with the frame's pole up", () => {
    const date = new Date("2026-10-09T21:00:00Z");
    for (const id of ["stars", "ecliptic"] as const) {
      const q = orientation(id, date);
      const orbit = { lon: 40, lat: 25, dist: 5, tx: 0.2, ty: 0, tz: -0.1 };
      orbitPose(q, ORIGIN, orbit, position, quaternion, target);
      expect(position.distanceTo(target)).toBeCloseTo(5, 12);
      const toTarget = target.clone().sub(position).normalize();
      expect(forward().distanceTo(toTarget)).toBeLessThan(1e-12);
      // Screen up lies in the plane of the forward axis and the frame's pole, towards the pole.
      const pole = Z.clone().applyQuaternion(q);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
      expect(Math.abs(right.dot(pole))).toBeLessThan(1e-12);
      expect(up().dot(pole)).toBeGreaterThan(0);
    }
  });

  it("keeps the camera in place when re-expressed in another frame", () => {
    const date = new Date("2026-10-09T21:00:00Z");
    const from = orientation("stars", date);
    const orbit = { lon: 123, lat: 40, dist: 3.2, tx: 0.1, ty: 0.3, tz: -0.2 };
    orbitPose(from, ORIGIN, orbit, position, quaternion, target);
    const p0 = position.clone();
    const t0 = target.clone();
    for (const id of ["ecliptic"] as const) {
      const to = orientation(id, date);
      const converted = orbitInFrame(p0, t0, to, ORIGIN, { ...orbit });
      orbitPose(to, ORIGIN, converted, position, quaternion, target);
      expect(position.distanceTo(p0)).toBeLessThan(1e-12);
      expect(target.distanceTo(t0)).toBeLessThan(1e-12);
    }
  });

  it("finds the frame coordinates of a direction", () => {
    const date = new Date("2026-06-21T00:00:00Z");
    // The summer solstice point (RA 6h, Dec +ε) lies on the ecliptic at longitude 90°.
    const eps = meanObliquity(date) * DEG;
    const dir = new THREE.Vector3(0, Math.cos(eps), Math.sin(eps));
    const at = directionInFrame(dir, orientation("ecliptic", date), { lon: 0, lat: 0 });
    expect(at.lon).toBeCloseTo(90, 9);
    expect(at.lat).toBeCloseTo(0, 9);
  });
});
