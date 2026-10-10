import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { greenwichMeanSiderealTime, hmsToDegrees, meanObliquity } from "@asteria/astro-core";
import {
  FRAMES,
  REFERENCE_FRAMES,
  directionInFrame,
  frameOf,
  isAvailableFrame,
  isReferenceFrameId,
  orbitInFrame,
  orbitPose,
  type FrameOrbit,
} from "./reference-frames";
import { ORBIT_FOV } from "./flight";

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const ORIGIN = new THREE.Vector3();

const orientation = (id: "stars" | "earth" | "ecliptic", date: Date) =>
  FRAMES[id].orientation(date, new THREE.Quaternion());
const raDec = (v: THREE.Vector3) => ({
  ra: (((Math.atan2(v.y, v.x) / DEG) % 360) + 360) % 360,
  dec: Math.asin(v.z / v.length()) / DEG,
});

describe("reference frame list", () => {
  it("offers five entries in the selector, star-fixed first; heliocentric not available yet", () => {
    expect(REFERENCE_FRAMES.map((f) => f.id)).toEqual([
      "stars",
      "earth",
      "ecliptic",
      "heliocentric",
      "body",
    ]);
    expect(REFERENCE_FRAMES.filter((f) => f.available).map((f) => f.id)).toEqual([
      "stars",
      "earth",
      "ecliptic",
      "body",
    ]);
    expect(isReferenceFrameId("body")).toBe(true);
    expect(isAvailableFrame("body")).toBe(true);
    expect(isAvailableFrame("heliocentric")).toBe(false);
    expect(isAvailableFrame("earth")).toBe(true);
    expect(isAvailableFrame("galactic")).toBe(false);
    expect(frameOf("heliocentric").id).toBe("stars");
  });
});

describe("star-fixed frame", () => {
  it("is the mean equator of date: celestial pole up, x at the equinox", () => {
    const q = orientation("stars", new Date("2026-10-09T21:00:00Z"));
    expect(Z.clone().applyQuaternion(q).distanceTo(Z)).toBeLessThan(1e-15);
    expect(X.clone().applyQuaternion(q).distanceTo(X)).toBeLessThan(1e-15);
  });
});

describe("Earth-fixed frame", () => {
  it("puts its x axis on the Greenwich meridian (Meeus 12.a: GMST 13h10m46.3668s)", () => {
    const q = orientation("earth", new Date("1987-04-10T00:00:00Z"));
    const x = X.clone().applyQuaternion(q);
    // Reference: Meeus, Astronomical Algorithms, example 12.a. Tolerance 0.001 s of time.
    expect(Math.abs(raDec(x).ra - hmsToDegrees(13, 10, 46.3668))).toBeLessThan(0.0000042);
    expect(Math.abs(raDec(x).dec)).toBeLessThan(1e-12);
    // Celestial north stays up: the Earth's axis.
    expect(Z.clone().applyQuaternion(q).distanceTo(Z)).toBeLessThan(1e-15);
  });

  it("keeps the observer's place still on screen within 0.1° over 24 h", () => {
    const observer = { latitude: 48.8566, longitude: 2.3522 };
    const start = Date.parse("2026-03-20T00:00:00Z");
    // Camera above the place, a little off it and panned, as after a few gestures.
    const orbit: FrameOrbit = {
      lon: observer.longitude + 12,
      lat: observer.latitude - 8,
      dist: 4,
      tx: 0.1,
      ty: -0.05,
      tz: 0.02,
    };
    const camera = new THREE.PerspectiveCamera(ORBIT_FOV, 360 / 780, 0.01, 100);
    const q = new THREE.Quaternion();
    const target = new THREE.Vector3();
    const place = new THREE.Vector3();
    /** Direction of the place in the camera's axes, at a date. */
    const seen = (time: number) => {
      const date = new Date(time);
      FRAMES.earth.orientation(date, q);
      orbitPose(q, ORIGIN, orbit, camera.position, camera.quaternion, target);
      camera.updateMatrixWorld();
      // The place on the globe, turned by sidereal time as SpaceView turns the globe.
      const lon = (observer.longitude + greenwichMeanSiderealTime(date)) * DEG;
      const lat = observer.latitude * DEG;
      place.set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
      return place.clone().applyMatrix4(camera.matrixWorldInverse).normalize();
    };
    const first = seen(start);
    let worst = 0;
    for (let minutes = 0; minutes <= 24 * 60; minutes += 10) {
      const v = seen(start + minutes * 60_000);
      worst = Math.max(worst, v.angleTo(first) / DEG);
    }
    expect(worst).toBeLessThan(0.1);
    // The star-fixed frame, by contrast, lets the place turn away.
    FRAMES.stars.orientation(new Date(start), q);
    orbitPose(q, ORIGIN, orbit, camera.position, camera.quaternion, target);
    camera.updateMatrixWorld();
    const lon = (observer.longitude + greenwichMeanSiderealTime(new Date(start + 6 * 3.6e6))) * DEG;
    const lat = observer.latitude * DEG;
    place.set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
    const later = place.applyMatrix4(camera.matrixWorldInverse).normalize();
    expect(later.angleTo(first) / DEG).toBeGreaterThan(10);
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
    for (const id of ["stars", "earth", "ecliptic"] as const) {
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
    for (const id of ["earth", "ecliptic"] as const) {
      const to = orientation(id, date);
      const converted = orbitInFrame(p0, t0, to, ORIGIN, { ...orbit });
      orbitPose(to, ORIGIN, converted, position, quaternion, target);
      expect(position.distanceTo(p0)).toBeLessThan(1e-12);
      expect(target.distanceTo(t0)).toBeLessThan(1e-12);
    }
  });

  it("finds the frame coordinates of a direction", () => {
    const date = new Date("1987-04-10T00:00:00Z");
    const gst = greenwichMeanSiderealTime(date);
    // Paris on the turned globe → its geographic coordinates in the Earth-fixed frame.
    const lon = (2.3522 + gst) * DEG;
    const lat = 48.8566 * DEG;
    const dir = new THREE.Vector3(
      Math.cos(lat) * Math.cos(lon),
      Math.cos(lat) * Math.sin(lon),
      Math.sin(lat),
    );
    const at = directionInFrame(dir, orientation("earth", date), { lon: 0, lat: 0 });
    expect(at.lon).toBeCloseTo(2.3522, 9);
    expect(at.lat).toBeCloseTo(48.8566, 9);
  });
});
