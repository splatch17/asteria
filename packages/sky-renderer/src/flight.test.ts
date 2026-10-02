import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  FlightPath,
  ORBIT_FOV,
  ORBIT_RADIUS,
  OverZoom,
  SURFACE_RADIUS,
  flightEase,
  flightProgress,
  flightRadius,
  globeDetail,
  headingOf,
  horizonBasis,
  lookQuaternion,
  perspectiveFovForStereo,
  shouldEnterSky,
  skyOpacity,
} from "./flight";
import { stereoScale } from "./view";

const DEG = Math.PI / 180;
const forwardOf = (q: THREE.Quaternion) => new THREE.Vector3(0, 0, -1).applyQuaternion(q);
const upOf = (q: THREE.Quaternion) => new THREE.Vector3(0, 1, 0).applyQuaternion(q);
const rightOf = (q: THREE.Quaternion) => new THREE.Vector3(1, 0, 0).applyQuaternion(q);
/** World direction of (azimuth, altitude) in the observer's horizon. */
const horizontal = (b: ReturnType<typeof horizonBasis>, az: number, alt: number) =>
  new THREE.Vector3()
    .addScaledVector(b.north, Math.cos(alt * DEG) * Math.cos(az * DEG))
    .addScaledVector(b.east, Math.cos(alt * DEG) * Math.sin(az * DEG))
    .addScaledVector(b.up, Math.sin(alt * DEG));
const close = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-9) =>
  expect(a.distanceTo(b)).toBeLessThan(eps);

describe("time curve", () => {
  it("eases in and out, from 0 to 1", () => {
    expect(flightEase(0)).toBe(0);
    expect(flightEase(1)).toBe(1);
    expect(flightEase(0.5)).toBeCloseTo(0.5, 12);
    expect(flightEase(0.1)).toBeLessThan(0.1); // slow start
    expect(flightEase(0.9)).toBeGreaterThan(0.9); // slow end
    expect(flightEase(-1)).toBe(0);
    expect(flightEase(2)).toBe(1);
  });

  it("is monotonic", () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.01) {
      const e = flightEase(t);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
  });

  it("plays the same path backwards when landing", () => {
    for (const t of [0, 0.2, 0.5, 0.8, 1])
      expect(flightProgress(t, "in")).toBeCloseTo(1 - flightProgress(t, "out"), 12);
    expect(flightProgress(0, "out")).toBe(0);
    expect(flightProgress(0, "in")).toBe(1);
  });
});

describe("field of view and distance", () => {
  it("matches the stereographic scale at the centre of the screen", () => {
    for (const fov of [40, 100, 120]) {
      const persp = perspectiveFovForStereo(fov);
      // NDC per radian at the centre: stereographic = stereoScale, perspective = 1/tan(fov/2).
      expect(1 / Math.tan((persp * DEG) / 2)).toBeCloseTo(stereoScale(fov), 9);
    }
    expect(perspectiveFovForStereo(200)).toBeCloseTo(134.48, 2);
  });

  it("never asks a perspective camera for more than 150°", () => {
    expect(perspectiveFovForStereo(300)).toBe(150);
  });

  it("climbs from the ground to the orbit, geometrically", () => {
    expect(flightRadius(0)).toBeCloseTo(SURFACE_RADIUS, 12);
    expect(flightRadius(1)).toBeCloseTo(ORBIT_RADIUS, 12);
    expect(flightRadius(1, 10)).toBeCloseTo(10, 12);
    let prev = 0;
    for (let s = 0; s <= 1; s += 0.02) {
      const r = flightRadius(s);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    // Half way in the curve = geometric mean of the ends.
    const mid = flightRadius(0.52);
    expect(mid).toBeCloseTo(Math.sqrt(SURFACE_RADIUS * ORBIT_RADIUS), 9);
  });

  it("fades the sky map out early in the climb", () => {
    expect(skyOpacity(0)).toBe(1);
    expect(skyOpacity(0.1)).toBeCloseTo(0.5, 9);
    expect(skyOpacity(0.2)).toBe(0);
    expect(skyOpacity(1)).toBe(0);
  });

  it("shows the relief on the globe when close only", () => {
    expect(globeDetail(SURFACE_RADIUS)).toBe(1);
    expect(globeDetail(ORBIT_RADIUS)).toBeCloseTo(2 / 3.5, 12);
    expect(globeDetail(40)).toBe(0);
  });
});

describe("over-zoom", () => {
  it("triggers once the pushes beyond the limit reach the threshold", () => {
    const z = new OverZoom(1.25);
    expect(z.push(1.127, 0)).toBe(false); // one wheel notch
    expect(z.push(1.127, 50)).toBe(true); // two: 1.27
    expect(z.push(1.127, 100)).toBe(false); // starts over after a trigger
  });

  it("starts over when the gesture comes back inside the limit", () => {
    const z = new OverZoom(1.25);
    z.push(1.2, 0);
    expect(z.push(0.9, 10)).toBe(false);
    expect(z.push(1.1, 20)).toBe(false);
  });

  it("forgets an old push after a pause", () => {
    const z = new OverZoom(1.25, 500);
    z.push(1.2, 0);
    expect(z.push(1.1, 1000)).toBe(false);
    expect(z.push(1.1, 1100)).toBe(false); // 1.21
    expect(z.push(1.04, 1200)).toBe(true); // 1.258
  });

  it("ignores pushes within the limit (factor ≤ 1, NaN)", () => {
    const z = new OverZoom(1.25);
    expect(z.push(1, 0)).toBe(false);
    expect(z.push(Number.NaN, 0)).toBe(false);
  });
});

describe("horizon basis", () => {
  it("is orthonormal, north towards the celestial pole", () => {
    const b = horizonBasis(48.8566, 2.3522, 123.4);
    for (const v of [b.north, b.east, b.up]) expect(v.length()).toBeCloseTo(1, 12);
    expect(b.north.dot(b.east)).toBeCloseTo(0, 12);
    expect(b.north.dot(b.up)).toBeCloseTo(0, 12);
    expect(b.east.dot(b.up)).toBeCloseTo(0, 12);
    // The celestial pole is due north at an altitude equal to the latitude.
    close(horizontal(b, 0, 48.8566), new THREE.Vector3(0, 0, 1));
  });

  it("puts the observer's meridian at the local sidereal time", () => {
    const b = horizonBasis(0, 30, 60);
    close(b.up, new THREE.Vector3(Math.cos(90 * DEG), Math.sin(90 * DEG), 0));
  });
});

describe("flight path", () => {
  const basis = horizonBasis(48.8566, 2.3522, 200);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  it("starts at the observer's eye, looking where the map looks", () => {
    for (const view of [
      { azimuth: 180, altitude: 35, fov: 200 },
      { azimuth: 30, altitude: 70, fov: 100 },
      { azimuth: 300, altitude: -10, fov: 60, roll: 15 },
    ]) {
      const path = new FlightPath().setup(basis, view);
      const fov = path.pose(0, pos, quat);
      close(pos, basis.up.clone().multiplyScalar(SURFACE_RADIUS));
      close(forwardOf(quat), horizontal(basis, view.azimuth, view.altitude));
      expect(fov).toBeCloseTo(perspectiveFovForStereo(view.fov), 12);
      if (!view.roll) {
        // No roll: screen right is horizontal, and east when looking north-ish… (to the right
        // of the heading: azimuth + 90°).
        close(rightOf(quat), horizontal(basis, view.azimuth + 90, 0));
      }
    }
  });

  it("ends at the Earth view's orbit: above the observer, centre ahead, north up", () => {
    const path = new FlightPath().setup(basis, { azimuth: 180, altitude: 35, fov: 200 });
    const fov = path.pose(1, pos, quat);
    close(pos, basis.up.clone().multiplyScalar(ORBIT_RADIUS));
    const expected = lookQuaternion(
      pos.clone().negate(),
      new THREE.Vector3(0, 0, 1),
      new THREE.Quaternion(),
    );
    expect(quat.angleTo(expected)).toBeLessThan(1e-6);
    close(upOf(quat), basis.north, 1e-6);
    expect(fov).toBeCloseTo(ORBIT_FOV, 12);
  });

  it("keeps its heading while it tilts down (pure pitch before the turn to north)", () => {
    const view = { azimuth: 150, altitude: 35, fov: 200 };
    const path = new FlightPath().setup(basis, view);
    const right = horizontal(basis, view.azimuth + 90, 0);
    for (const s of [0.1, 0.25, 0.4]) {
      path.pose(s, pos, quat);
      // The screen's right stays the horizontal direction to the right of the heading.
      close(rightOf(quat), right, 1e-6);
    }
    path.pose(0.45, pos, quat);
    expect(forwardOf(quat).dot(basis.up)).toBeLessThan(-0.9); // nearly looking down
  });

  it("moves continuously (no jump between close progress values)", () => {
    const path = new FlightPath().setup(basis, { azimuth: 200, altitude: 10, fov: 200 });
    const p0 = new THREE.Vector3();
    const q0 = new THREE.Quaternion();
    path.pose(0, p0, q0);
    for (let s = 0.005; s <= 1; s += 0.005) {
      path.pose(s, pos, quat);
      expect(quat.angleTo(q0)).toBeLessThan(3 * DEG);
      expect(pos.distanceTo(p0)).toBeLessThan(0.12);
      p0.copy(pos);
      q0.copy(quat);
    }
  });

  it("lands from an orbit off the zenith and reaches that orbit at s = 1", () => {
    const orbitDir = horizontal(basis, 90, 70); // the camera seen from the observer: east, high
    const orbit = orbitDir.clone().multiplyScalar(6);
    const orbitQuat = lookQuaternion(
      orbit.clone().negate(),
      new THREE.Vector3(0, 0, 1),
      new THREE.Quaternion(),
    );
    const heading = headingOf(orbitQuat, basis);
    const path = new FlightPath().setup(
      basis,
      { azimuth: heading, altitude: 20, fov: 120 },
      orbitDir,
      6,
    );
    path.pose(1, pos, quat);
    close(pos, orbit, 1e-9);
    expect(quat.angleTo(orbitQuat)).toBeLessThan(1e-6);
    path.pose(0, pos, quat);
    close(pos, basis.up.clone().multiplyScalar(SURFACE_RADIUS));
    close(forwardOf(quat), horizontal(basis, heading, 20), 1e-9);
  });

  it("does not allocate per pose", () => {
    // Same output objects are filled: the method keeps no references to them.
    const path = new FlightPath().setup(basis, { azimuth: 0, altitude: 0, fov: 100 });
    const a = path.pose(0.3, pos, quat);
    const b = path.pose(0.3, pos, quat);
    expect(a).toBe(b);
  });
});

describe("heading of a camera", () => {
  const basis = horizonBasis(-33.45, -70.67, 15);

  it("is the forward direction when level, the screen's top when looking down", () => {
    const q = new THREE.Quaternion();
    for (const az of [0, 45, 190, 359]) {
      lookQuaternion(horizontal(basis, az, 0), basis.up, q);
      expect(headingOf(q, basis)).toBeCloseTo(az, 9);
      lookQuaternion(horizontal(basis, az, 30), horizontal(basis, az, 120), q);
      expect(headingOf(q, basis)).toBeCloseTo(az, 9);
      // Straight down, the top of the screen towards `az`.
      lookQuaternion(basis.up.clone().negate(), horizontal(basis, az, 0), q);
      expect(headingOf(q, basis)).toBeCloseTo(az, 6);
    }
  });

  it("is north for the Earth view's north-up camera above the observer", () => {
    const q = lookQuaternion(
      basis.up.clone().negate(),
      new THREE.Vector3(0, 0, 1),
      new THREE.Quaternion(),
    );
    expect(headingOf(q, basis)).toBeCloseTo(0, 6);
  });
});

describe("entering the sky from the Earth view", () => {
  const up = new THREE.Vector3(0, 0, 1);
  it("only when the observer faces the camera near the centre", () => {
    expect(shouldEnterSky(new THREE.Vector3(0, 0, 3), up)).toBe(true);
    const tilted = (deg: number) =>
      new THREE.Vector3(Math.sin(deg * DEG), 0, Math.cos(deg * DEG)).multiplyScalar(2);
    expect(shouldEnterSky(tilted(30), up)).toBe(true);
    expect(shouldEnterSky(tilted(40), up)).toBe(false);
    expect(shouldEnterSky(new THREE.Vector3(0, 0, -2), up)).toBe(false); // far side
  });
});
