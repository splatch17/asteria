import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  ORBITING_BODIES,
  heliocentricPosition,
  meanObliquity,
  precessionMatrix,
  seasons,
} from "@asteria/astro-core";
import {
  SEASONS_EARTH_ENLARGEMENT,
  SEASONS_SCALE,
  compressedRadius,
  diagramPoint,
  diagramSun,
  eclipticLongitude,
  fitDistance,
  lineOfSight,
  planetDrawRadius,
} from "./points-of-view";

const prec = (d: Date) => new THREE.Matrix3().set(...precessionMatrix(d));
const DEG = Math.PI / 180;

describe("scales", () => {
  it("enlarges the Earth ≈ 3 900 times in « Les saisons »", () => {
    // 149 597 870.7 km / 6 378.137 km / 6
    expect(SEASONS_EARTH_ENLARGEMENT).toBeCloseTo(3909.1, 1);
  });

  it("compresses distances monotonically, orbits at least 1.5 Earth radii apart", () => {
    const radii = ORBITING_BODIES.map((b) =>
      compressedRadius(heliocentricPosition(b, new Date("2026-10-10T00:00:00Z")).distanceAu),
    );
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeGreaterThan(radii[i - 1]! + 1.5);
    expect(radii[radii.length - 1]!).toBeLessThan(34);
    expect(compressedRadius(0)).toBe(0);
  });

  it("orders drawn sizes as the true ones, the Earth at 1", () => {
    expect(planetDrawRadius("Earth")).toBe(1);
    expect(planetDrawRadius("Jupiter")).toBeGreaterThan(planetDrawRadius("Saturn"));
    expect(planetDrawRadius("Saturn")).toBeGreaterThan(planetDrawRadius("Uranus"));
    expect(planetDrawRadius("Mercury")).toBeLessThan(planetDrawRadius("Mars"));
    expect(planetDrawRadius("Jupiter")).toBeLessThan(2);
  });
});

describe("diagram geometry", () => {
  const date = new Date("2026-10-10T00:00:00Z");
  const p = prec(date);

  it("places the Sun 1 au × scale from the Earth (seasons), in its true direction", () => {
    const sun = diagramSun("seasons", date, p, new THREE.Vector3());
    const h = heliocentricPosition("Earth", date);
    expect(sun.length()).toBeCloseTo(SEASONS_SCALE * h.distanceAu, 9);
    // Direction: minus the Earth's heliocentric vector, precessed to the date.
    const dir = new THREE.Vector3(-h.x, -h.y, -h.z).applyMatrix3(p).normalize();
    expect(sun.clone().normalize().angleTo(dir)).toBeLessThan(1e-7);
  });

  it("keeps heliocentric directions when compressing", () => {
    const h = heliocentricPosition("Jupiter", date);
    const v = diagramPoint("solar", h, p, new THREE.Vector3());
    expect(v.length()).toBeCloseTo(compressedRadius(h.distanceAu), 9);
    const dir = new THREE.Vector3(h.x, h.y, h.z).applyMatrix3(p);
    expect(v.angleTo(dir)).toBeLessThan(1e-7); // acos rounding
  });

  it("draws the Earth's axis at the mean obliquity (IAU 2006) from the orbit's pole", () => {
    // Orbit pole: normal to two drawn Earth positions a quarter of a year apart, seen from the
    // Sun; the Earth's axis is the world z (pole of date). Tolerance 0.01° (the ecliptic of the
    // orbit differs from the mean ecliptic by the planetary perturbations, < 1″).
    const a = diagramSun("seasons", date, p, new THREE.Vector3()).negate();
    const later = new Date(date.getTime() + 91 * 86_400_000);
    const b = diagramSun("seasons", later, p, new THREE.Vector3()).negate();
    const pole = new THREE.Vector3().crossVectors(a, b).normalize();
    const tilt = pole.angleTo(new THREE.Vector3(0, 0, 1)) / DEG;
    expect(Math.abs(tilt - meanObliquity(date))).toBeLessThan(0.01);
  });

  it("puts the Earth at the solstices where the Sun's ecliptic longitude is 90° and 270°", () => {
    // Heliocentric longitude of the Earth = geocentric longitude of the Sun + 180°.
    const s = seasons(2026);
    const eps = meanObliquity(s.juneSolstice) * DEG;
    const toEcliptic = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -eps);
    for (const [d, sunLon] of [
      [s.marchEquinox, 0],
      [s.juneSolstice, 90],
      [s.septemberEquinox, 180],
      [s.decemberSolstice, 270],
    ] as const) {
      const earth = diagramSun("seasons", d, prec(d), new THREE.Vector3())
        .negate()
        .applyQuaternion(toEcliptic);
      const lon = eclipticLongitude(earth);
      // Aberration (20″) and nutation (≤ 17″) separate the apparent from the geometric
      // longitude: tolerance 0.02°.
      const diff = Math.abs(((lon - sunLon - 180 + 540) % 360) - 180);
      expect(diff).toBeLessThan(0.02);
    }
  });
});

describe("fitDistance", () => {
  it("fits a plane extent in the narrower side of the safe area", () => {
    const d = fitDistance(10, 2, 40, 780, 300, 500, 1);
    const focal = 390 / Math.tan(20 * DEG);
    expect((focal * 10) / d).toBeCloseTo(150, 9);
  });

  it("fits a sphere's limb", () => {
    const d = fitDistance(1, 1, 40, 780, 300, 500, 0.6, true);
    const focal = 390 / Math.tan(20 * DEG);
    expect((focal * 1) / Math.sqrt(d * d - 1)).toBeCloseTo(90, 9);
  });
});

describe("lineOfSight", () => {
  it("meets the backdrop beyond the target", () => {
    const out = new THREE.Vector3();
    expect(lineOfSight(new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0), 5, out)).toBe(true);
    expect(out.x).toBeCloseTo(5, 12);
    expect(lineOfSight(new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), 5, out)).toBe(false);
  });

  it("shows Mars' retrograde motion around its opposition of 2027-02-19 (compressed scale)", () => {
    // The Earth → Mars line drawn in the compressed diagram turns backwards (decreasing
    // ecliptic longitude on the backdrop) for some weeks around the opposition, forwards
    // three months before and after.
    const lonAt = (iso: string) => {
      const d = new Date(iso);
      const p = prec(d);
      const e = diagramPoint("solar", heliocentricPosition("Earth", d), p, new THREE.Vector3());
      const m = diagramPoint("solar", heliocentricPosition("Mars", d), p, new THREE.Vector3());
      const hit = new THREE.Vector3();
      expect(lineOfSight(e, m, 40, hit)).toBe(true);
      return eclipticLongitude(hit.applyAxisAngle(new THREE.Vector3(1, 0, 0), -23.44 * DEG));
    };
    const rate = (a: string, b: string) => ((lonAt(b) - lonAt(a) + 540) % 360) - 180;
    expect(rate("2027-02-12", "2027-02-26")).toBeLessThan(0);
    expect(rate("2026-11-01", "2026-11-15")).toBeGreaterThan(0);
    expect(rate("2027-05-20", "2027-06-03")).toBeGreaterThan(0);
  });
});
