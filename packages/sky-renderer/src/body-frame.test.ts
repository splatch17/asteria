import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { geocentricPosition, precessionMatrix } from "@asteria/astro-core";
import {
  BODY_DIST,
  BODY_TARGETS,
  BodyFrame,
  EARTH_RADIUS_KM,
  bodyPole,
  bodyRadius,
  bodyViewDirection,
  bodyViewDistance,
  hiddenBySphere,
  poleUpRotation,
  precession,
  worldPosition,
} from "./body-frame";
import { orbitPose } from "./reference-frames";

const DATE = new Date("2026-10-01T00:00:00Z");
const Z = new THREE.Vector3(0, 0, 1);

describe("body positions in the world frame", () => {
  it("are the light-time corrected geocentric positions, precessed, in Earth radii", () => {
    const prec = precession(DATE, new THREE.Matrix3());
    for (const body of ["Sun", ...BODY_TARGETS] as const) {
      const p = worldPosition(body, DATE, prec, new THREE.Vector3());
      const g = geocentricPosition(body, DATE);
      // Precession keeps lengths; the unit is the Earth's equatorial radius.
      expect(p.length() * EARTH_RADIUS_KM).toBeCloseTo(g.distanceKm, 3);
      const m = precessionMatrix(DATE);
      const expected = new THREE.Vector3(
        m[0] * g.x + m[1] * g.y + m[2] * g.z,
        m[3] * g.x + m[4] * g.y + m[5] * g.z,
        m[6] * g.x + m[7] * g.y + m[8] * g.z,
      ).multiplyScalar(1 / EARTH_RADIUS_KM);
      expect(p.distanceTo(expected) / expected.length()).toBeLessThan(1e-12);
    }
  });

  it("puts the Moon about 60 Earth radii away and Jupiter about 6 au away", () => {
    const prec = precession(DATE, new THREE.Matrix3());
    const moon = worldPosition("Moon", DATE, prec, new THREE.Vector3()).length();
    expect(moon).toBeGreaterThan(55);
    expect(moon).toBeLessThan(64);
    const jupiter = worldPosition("Jupiter", DATE, prec, new THREE.Vector3()).length();
    const au = 149_597_870.7 / EARTH_RADIUS_KM;
    expect(Math.abs(jupiter / au - 5.9208)).toBeLessThan(0.01); // Horizons: 5.92084 au
  });
});

describe("body-centred frame", () => {
  it("targets the body and follows it over time", () => {
    const frame = new BodyFrame("Moon");
    const t0 = frame.target(DATE, new THREE.Vector3());
    const later = new Date(DATE.getTime() + 3_600_000);
    const t1 = frame.target(later, new THREE.Vector3());
    const prec = precession(later, new THREE.Matrix3());
    expect(t1.distanceTo(worldPosition("Moon", later, prec, new THREE.Vector3()))).toBeLessThan(
      1e-9,
    );
    // The Moon moves ≈ 1 km/s round the Earth (plus the precession of the frame): 3 600 km
    // in an hour, ≈ 0.56 Earth radii; never more than 1.
    const moved = t0.distanceTo(t1);
    expect(moved).toBeGreaterThan(0.4);
    expect(moved).toBeLessThan(1);
    // Another body: the target changes with it.
    frame.body = "Saturn";
    expect(frame.target(DATE, new THREE.Vector3()).length()).toBeGreaterThan(1e5);
  });

  it("puts the body's north pole up (IAU WGCCRE), the frame inertial", () => {
    const frame = new BodyFrame("Jupiter");
    const q = frame.orientation(DATE, new THREE.Quaternion());
    const pole = bodyPole("Jupiter", precession(DATE, new THREE.Matrix3()), new THREE.Vector3());
    expect(Z.clone().applyQuaternion(q).distanceTo(pole)).toBeLessThan(1e-12);
    // Inertial: an hour later, the same axes (Jupiter turns 36° on itself meanwhile).
    const q1 = frame.orientation(new Date(DATE.getTime() + 3_600_000), new THREE.Quaternion());
    expect(q.angleTo(q1)).toBeLessThan(1e-6);
  });

  it("poleUpRotation is a rotation taking z to the pole, even for the celestial pole", () => {
    const q = poleUpRotation(new THREE.Vector3(0, 0, 1), new THREE.Quaternion());
    expect(Z.clone().applyQuaternion(q).distanceTo(Z)).toBeLessThan(1e-12);
    const pole = new THREE.Vector3(0.3, -0.5, 0.8).normalize();
    const r = poleUpRotation(pole, new THREE.Quaternion());
    expect(Z.clone().applyQuaternion(r).distanceTo(pole)).toBeLessThan(1e-12);
    expect(r.length()).toBeCloseTo(1, 12);
  });
});

describe("camera round a body", () => {
  it("stays outside the body at every orbit allowed (angles, distance limits, pan)", () => {
    const frame = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const target = new THREE.Vector3();
    for (const body of BODY_TARGETS) {
      const r = bodyRadius(body);
      const centre = new THREE.Vector3(1234.5, -987.6, 42).multiplyScalar(r);
      poleUpRotation(new THREE.Vector3(0.2, 0.1, 1).normalize(), frame);
      for (const dist of [BODY_DIST.min * r, 4 * r, BODY_DIST.max * r]) {
        for (let lon = -180; lon < 180; lon += 30) {
          for (const lat of [-89, -45, 0, 45, 89]) {
            // Pan at its limit (panLimit: 0.6 · distance · tan 20° at most) towards the body.
            const pan = 0.6 * dist * Math.tan((20 * Math.PI) / 180);
            const l = (lon * Math.PI) / 180;
            const b = (lat * Math.PI) / 180;
            const orbit = {
              lon,
              lat,
              dist,
              tx: -pan * Math.cos(b) * Math.cos(l),
              ty: -pan * Math.cos(b) * Math.sin(l),
              tz: -pan * Math.sin(b),
            };
            orbitPose(frame, centre, orbit, position, quaternion, target);
            expect(position.distanceTo(centre), body).toBeGreaterThan(r);
          }
        }
      }
    }
  });

  it("opens at a distance that frames the body (and Saturn's rings), at least 4 radii", () => {
    for (const body of BODY_TARGETS) {
      const r = bodyRadius(body);
      for (const aspect of [360 / 780, 1440 / 900]) {
        const d = bodyViewDistance(body, 40, aspect);
        expect(d).toBeGreaterThanOrEqual(4 * r);
        expect(d).toBeLessThanOrEqual(BODY_DIST.max * r);
        // Its angular extent fits in the shorter half-field.
        const extent = body === "Saturn" ? 2.27 * r : r;
        const half = Math.atan(Math.tan((20 * Math.PI) / 180) * Math.min(1, aspect));
        expect(Math.atan(extent / d)).toBeLessThan(half);
      }
    }
  });

  it("first looks at the lit side, 50° from the Sun, raised towards the pole", () => {
    const sun = new THREE.Vector3(1, 0, 0);
    const earth = new THREE.Vector3(0.99, 0.14, 0).normalize(); // outer planet: small phase
    const pole = new THREE.Vector3(0, 0, 1);
    const dir = bodyViewDirection(sun, earth, pole, new THREE.Vector3());
    expect(dir.length()).toBeCloseTo(1, 12);
    const fromSun = (Math.acos(dir.dot(sun)) * 180) / Math.PI;
    expect(fromSun).toBeGreaterThan(45);
    expect(fromSun).toBeLessThan(55);
    expect(dir.y).toBeGreaterThan(0); // towards the Earth's side
    expect(dir.z).toBeGreaterThan(0.2); // raised towards the pole
    // New Moon: Sun and Earth opposite; still a defined, lit direction.
    const moon = bodyViewDirection(sun, sun.clone().negate(), pole, new THREE.Vector3());
    expect(Number.isFinite(moon.x)).toBe(true);
    expect(moon.dot(sun)).toBeGreaterThan(0.5);
  });
});

describe("hiddenBySphere (Earth or body globe)", () => {
  const tmp = { d: new THREE.Vector3(), o: new THREE.Vector3() };
  const centre = new THREE.Vector3(60, 0, 0);
  const cam = new THREE.Vector3(62, 0, 0);

  it("hides directions and points behind the body, not in front or beside", () => {
    expect(hiddenBySphere(cam, new THREE.Vector3(-1, 0, 0), true, centre, 0.27, tmp)).toBe(true);
    expect(hiddenBySphere(cam, new THREE.Vector3(1, 0, 0), true, centre, 0.27, tmp)).toBe(false);
    expect(hiddenBySphere(cam, new THREE.Vector3(0, 1, 0), true, centre, 0.27, tmp)).toBe(false);
    // The Earth seen from beyond the Moon, through it: hidden; a point before the Moon: not.
    expect(hiddenBySphere(cam, new THREE.Vector3(0, 0, 0), false, centre, 0.27, tmp)).toBe(true);
    expect(hiddenBySphere(cam, new THREE.Vector3(61, 0, 0), false, centre, 0.27, tmp)).toBe(false);
  });

  it("matches the Earth-only test it generalises (centre at the origin, radius 1)", () => {
    const o = new THREE.Vector3(0, 0, 4);
    expect(hiddenBySphere(o, new THREE.Vector3(0, 0, -1), true, new THREE.Vector3(), 1, tmp)).toBe(
      true,
    );
    expect(hiddenBySphere(o, new THREE.Vector3(1, 0, 0), true, new THREE.Vector3(), 1, tmp)).toBe(
      false,
    );
  });
});
