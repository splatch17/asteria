import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PLANETS, greenwichMeanSiderealTime, unitVector } from "@asteria/astro-core";
import {
  REST_FRAMES,
  RETROGRADE,
  bodyFixedRotation,
  earthFixedRotation,
  isRestFrameId,
  primeMeridian,
  restFrameOffered,
  rotationAngle,
  rotationPeriodHours,
} from "./rest-frames";
import { planetAxes, PLANET_ROTATION } from "./space-style";
import { precession, worldPosition } from "./body-frame";

const DEG = Math.PI / 180;
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
const lonIn = (q: THREE.Quaternion, dir: THREE.Vector3) => {
  const v = dir.clone().applyQuaternion(q.clone().invert());
  return Math.atan2(v.y, v.x) / DEG;
};

describe("rest frame list (#139)", () => {
  it("offers the stars, the Sun, the Earth and a body, the stars first", () => {
    expect(REST_FRAMES).toEqual(["stars", "sun", "earth", "body"]);
    expect(isRestFrameId("earth")).toBe(true);
    expect(isRestFrameId("galactic")).toBe(false);
  });

  it("offers a body only when one is looked at, and not the Earth during a visit", () => {
    expect(restFrameOffered("body", "heliocentric", null)).toBe(false);
    expect(restFrameOffered("body", "heliocentric", "Mars")).toBe(true);
    expect(restFrameOffered("earth", "ecliptic", null)).toBe(true);
    expect(restFrameOffered("earth", "body", "Mars")).toBe(false);
    expect(restFrameOffered("sun", "body", "Mars")).toBe(true);
  });
});

describe("Earth-fixed frame (Terre)", () => {
  it("turns with the globe: x is the Greenwich meridian at RA = GMST", () => {
    const date = new Date("2026-10-11T18:30:00Z");
    const q = earthFixedRotation(date, new THREE.Quaternion());
    const globe = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, 0, greenwichMeanSiderealTime(date) * DEG),
    );
    expect(q.angleTo(globe)).toBeLessThan(1e-7);
  });

  it("comes back to the same orientation after one sidereal day, 86 164.0905 s (0.01″)", () => {
    const a = new Date("2026-10-11T00:00:00Z");
    const b = new Date(a.getTime() + 86_164_090.5);
    const qa = earthFixedRotation(a, new THREE.Quaternion());
    const qb = earthFixedRotation(b, new THREE.Quaternion());
    expect(qa.angleTo(qb) / DEG / (1 / 3600)).toBeLessThan(0.01);
  });

  it("puts the Sun where the equation of time says (Meeus ex. 28.b, within 0.03°)", () => {
    // 1992 Oct 13.0 TD (ΔT ≈ 59 s): E = +13 min 42.6 s. The Sun's Greenwich hour angle
    // H = 15° · UT − 180° + E, so its longitude in the Earth-fixed frame is −H.
    const date = new Date(Date.UTC(1992, 9, 13) - 59_000);
    const sun = worldPosition(
      "Sun",
      date,
      precession(date, new THREE.Matrix3()),
      new THREE.Vector3(),
    );
    const q = earthFixedRotation(date, new THREE.Quaternion());
    const e = (13 * 60 + 42.6) / 240; // seconds of time → degrees
    const h = (-59 / 3600) * 15 - 180 + e;
    expect(Math.abs(wrap(lonIn(q, sun) + h))).toBeLessThan(0.03);
  });

  it("makes the Sun turn round the still Earth in 24 h, the stars in 23 h 56 min", () => {
    const a = new Date("2026-10-11T12:00:00Z");
    const solar = new Date(a.getTime() + 86_400_000);
    const sidereal = new Date(a.getTime() + 86_164_090.5);
    const prec = precession(a, new THREE.Matrix3());
    const sunA = worldPosition("Sun", a, prec, new THREE.Vector3());
    const sunB = worldPosition("Sun", solar, prec, new THREE.Vector3());
    const qa = earthFixedRotation(a, new THREE.Quaternion());
    // The Sun back to (nearly) the same longitude a solar day later: the equation of time
    // changes by < 30 s a day, i.e. < 0.13°.
    expect(
      Math.abs(
        wrap(lonIn(earthFixedRotation(solar, new THREE.Quaternion()), sunB) - lonIn(qa, sunA)),
      ),
    ).toBeLessThan(0.13);
    // A star (fixed in the world frame) back to the same longitude after a sidereal day.
    const star = new THREE.Vector3(...unitVector(101.2875, -16.7161)); // Sirius
    const qs = earthFixedRotation(sidereal, new THREE.Quaternion());
    expect(Math.abs(wrap(lonIn(qs, star) - lonIn(qa, star))) * 3600).toBeLessThan(0.01);
  });
});

describe("body-fixed frames (planète)", () => {
  // Sidereal rotation periods, JPL Horizons physical data / NASA planetary fact sheets, hours.
  const PUBLISHED: Record<string, number> = {
    Mercury: 1407.5112,
    Venus: -5832.443616,
    Mars: 24.622962,
    Jupiter: 9.925,
    Saturn: 10.656,
    Uranus: -17.24,
    Neptune: 16.11,
  };

  it("turns at the IAU WGCCRE 2015 rate, matching the published sidereal periods (0.2 %)", () => {
    for (const p of PLANETS) {
      const h = rotationPeriodHours(p);
      // Neptune: the WGCCRE rate (541.14°/d, 15.97 h) is 0.9 % off the Voyager radio period
      // (16.11 h) on purpose of the report; its longitudes are conventional anyway.
      const tolerance = p === "Neptune" ? 0.01 : 0.002;
      expect(Math.abs(h / PUBLISHED[p]! - 1), p).toBeLessThan(tolerance);
    }
    expect(Math.abs(rotationPeriodHours("Mars") - 24.622962) * 3600).toBeLessThan(1);
    expect(rotationPeriodHours("Moon") / 24).toBeCloseTo(27.3217, 3);
    expect(rotationPeriodHours("Earth")).toBeCloseTo(23.9345, 4);
    expect(RETROGRADE).toEqual(["Venus", "Uranus"]);
  });

  it("puts the prime meridian where planetAxes does, without allocating", () => {
    const date = new Date("2026-10-11T07:00:00Z");
    const pole = new THREE.Vector3();
    const prime = new THREE.Vector3();
    for (const p of PLANETS) {
      const r = PLANET_ROTATION[p];
      pole.set(...unitVector(r.ra, r.dec));
      primeMeridian(p, date, pole, prime);
      const ref = new THREE.Vector3(...planetAxes(p, date).prime);
      expect(prime.distanceTo(ref), p).toBeLessThan(1e-12);
      expect(Math.abs(prime.dot(pole))).toBeLessThan(1e-12);
    }
    // W at J2000.0 is W0 (Mars: 176.049863°).
    expect(rotationAngle("Mars", new Date("2000-01-01T12:00:00Z"))).toBeCloseTo(176.049863, 6);
  });

  it("has the pole up and the prime meridian on x; a Mars day later, the same orientation", () => {
    const r = PLANET_ROTATION.Mars;
    const pole = new THREE.Vector3(...unitVector(r.ra, r.dec));
    const prime = new THREE.Vector3();
    const a = new Date("2026-10-11T00:00:00Z");
    const qa = bodyFixedRotation(
      pole,
      primeMeridian("Mars", a, pole, prime),
      new THREE.Quaternion(),
    );
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(qa).distanceTo(pole)).toBeLessThan(1e-12);
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(qa).distanceTo(prime)).toBeLessThan(1e-12);
    const b = new Date(a.getTime() + rotationPeriodHours("Mars") * 3_600_000);
    const qb = bodyFixedRotation(
      pole,
      primeMeridian("Mars", b, pole, prime),
      new THREE.Quaternion(),
    );
    expect(qa.angleTo(qb) / DEG).toBeLessThan(1e-4);
    // Half a Mars day later: turned by 180° about the pole.
    const c = new Date(a.getTime() + rotationPeriodHours("Mars") * 1_800_000);
    const qc = bodyFixedRotation(
      pole,
      primeMeridian("Mars", c, pole, prime),
      new THREE.Quaternion(),
    );
    expect(qa.angleTo(qc) / DEG).toBeCloseTo(180, 3);
  });
});
