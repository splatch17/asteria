import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  PLANETS,
  geocentricPosition,
  heliocentricPosition,
  meanObliquity,
  precessionMatrix,
  seasons,
} from "@asteria/astro-core";
import {
  AU,
  AU_KM,
  GLOBE_MIN_PX,
  MARKER_FADE_START_PX,
  apparentRadiusPx,
  fitDistance,
  markerOpacity,
  scaleBar,
  travelFraction,
  trueRadius,
  trueScalePosition,
} from "./points-of-view";
import { EARTH_RADIUS_KM } from "./body-frame";

const prec = (d: Date) => new THREE.Matrix3().set(...precessionMatrix(d));
const DEG = Math.PI / 180;
const date = new Date("2026-10-10T00:00:00Z");

describe("true scale (#131)", () => {
  it("puts 1 au at 23 454.8 Earth radii (IAU 2012 au, WGS 84 radius)", () => {
    expect(AU).toBeCloseTo(149_597_870.7 / 6378.137, 6);
    expect(AU).toBeCloseTo(23_454.8, 1);
  });

  it("uses the true radii: Sun 109.08, Jupiter 11.21, Moon 0.2724 Earth radii", () => {
    expect(trueRadius("Earth")).toBe(1);
    expect(trueRadius("Sun")).toBeCloseTo(695_700 / 6378.137, 9);
    expect(trueRadius("Sun")).toBeCloseTo(109.08, 2);
    expect(trueRadius("Jupiter")).toBeCloseTo(11.209, 3);
    expect(trueRadius("Moon")).toBeCloseTo(0.2724, 4);
    // Ratios of true radii: Jupiter / Earth 11.2, Sun / Jupiter 9.73.
    expect(trueRadius("Sun") / trueRadius("Jupiter")).toBeCloseTo(9.731, 3);
  });

  it("places the Sun at the Earth–Sun distance, in its true direction", () => {
    const p = prec(date);
    const sun = trueScalePosition("Sun", date, p, new THREE.Vector3());
    const h = heliocentricPosition("Earth", date);
    // The true distance in Earth radii (≈ 1.0 au in October).
    expect(sun.length() / (h.distanceAu * AU)).toBeCloseTo(1, 12);
    // The same as the astrometric geocentric Sun within 30 km (light time: the Sun's motion
    // about the barycentre in 8.3 min is a few km), i.e. 0.005 Earth radii.
    const g = geocentricPosition("Sun", date);
    const geo = new THREE.Vector3(g.x, g.y, g.z).divideScalar(EARTH_RADIUS_KM).applyMatrix3(p);
    expect(sun.distanceTo(geo)).toBeLessThan(0.005);
  });

  it("keeps the true ratios of the planets' distances from the Sun", () => {
    const p = prec(date);
    const sun = trueScalePosition("Sun", date, p, new THREE.Vector3());
    const d = (planet: (typeof PLANETS)[number]) =>
      trueScalePosition(planet, date, p, new THREE.Vector3()).distanceTo(sun);
    for (const planet of PLANETS) {
      const r = heliocentricPosition(planet, date).distanceAu;
      expect(d(planet) / AU / r).toBeCloseTo(1, 9);
    }
    // Neptune / Earth ≈ 30, Jupiter / Mercury ≈ 13 (at that date, from the JPL-tested positions).
    const earth = heliocentricPosition("Earth", date).distanceAu;
    expect(d("Neptune") / AU / earth).toBeGreaterThan(29);
    expect(d("Neptune") / AU / earth).toBeLessThan(31);
  });

  it("draws the Earth's axis at the mean obliquity (IAU 2006) from the orbit's pole", () => {
    // Orbit pole: normal to two Earth positions a quarter of a year apart, seen from the Sun;
    // the Earth's axis is the world z (pole of date). Tolerance 0.01°.
    const p = prec(date);
    const a = trueScalePosition("Sun", date, p, new THREE.Vector3()).negate();
    const later = new Date(date.getTime() + 91 * 86_400_000);
    const b = trueScalePosition("Sun", later, p, new THREE.Vector3()).negate();
    const pole = new THREE.Vector3().crossVectors(a, b).normalize();
    const tilt = pole.angleTo(new THREE.Vector3(0, 0, 1)) / DEG;
    expect(Math.abs(tilt - meanObliquity(date))).toBeLessThan(0.01);
  });

  it("puts the Earth at the solstices where the Sun's ecliptic longitude is 90° and 270°", () => {
    const s = seasons(2026);
    const eps = meanObliquity(s.juneSolstice) * DEG;
    const toEcliptic = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -eps);
    for (const [d, sunLon] of [
      [s.marchEquinox, 0],
      [s.juneSolstice, 90],
      [s.septemberEquinox, 180],
      [s.decemberSolstice, 270],
    ] as const) {
      const earth = trueScalePosition("Sun", d, prec(d), new THREE.Vector3())
        .negate()
        .applyQuaternion(toEcliptic);
      const lon = (Math.atan2(earth.y, earth.x) / DEG + 360) % 360;
      // Aberration (20″) and nutation (≤ 17″): tolerance 0.02°.
      const diff = Math.abs(((lon - sunLon - 180 + 540) % 360) - 180);
      expect(diff).toBeLessThan(0.02);
    }
  });
});

describe("markers (#131)", () => {
  it("fades the marker out between 3 px and GLOBE_MIN_PX (6 px) of the true globe", () => {
    expect(GLOBE_MIN_PX).toBe(6);
    expect(markerOpacity(0)).toBe(1);
    expect(markerOpacity(MARKER_FADE_START_PX)).toBe(1);
    expect(markerOpacity(4.5)).toBeCloseTo(0.5, 12);
    expect(markerOpacity(GLOBE_MIN_PX)).toBe(0);
    expect(markerOpacity(100)).toBe(0);
    expect(markerOpacity(Infinity)).toBe(0);
  });

  it("measures the apparent radius of a globe (its limb)", () => {
    expect(apparentRadiusPx(1, 2, 100)).toBeCloseTo(100 / Math.sqrt(3), 12);
    expect(apparentRadiusPx(1, 0.5, 100)).toBe(Infinity);
    // Jupiter seen from the Earth at opposition (4.2 au) with a 1000 px focal: 0.11 px — a marker.
    const px = apparentRadiusPx(trueRadius("Jupiter"), 4.2 * AU, 1000);
    expect(markerOpacity(px)).toBe(1);
    // From 1.5 million km, the same Jupiter is 48 px: its globe, no marker.
    const near = apparentRadiusPx(trueRadius("Jupiter"), 1.5e6 / EARTH_RADIUS_KM, 1000);
    expect(near).toBeGreaterThan(40);
    expect(markerOpacity(near)).toBe(0);
  });
});

describe("scaleBar", () => {
  const bar = { value: 0, unit: "km" as "km" | "au", px: 0 };
  it("rounds to 1, 2 or 5 × 10ⁿ km, not longer than the room given", () => {
    scaleBar(1000, 110, bar); // 110 000 km
    expect(bar).toEqual({ value: 100_000, unit: "km", px: 100 });
    scaleBar(30, 110, bar); // 3 300 km
    expect(bar.value).toBe(2000);
    scaleBar(0.5, 110, bar); // 55 km
    expect(bar.value).toBe(50);
  });

  it("switches to au from 0.1 au", () => {
    scaleBar(AU_KM / 100, 110, bar); // 1.1 au
    expect(bar).toEqual({ value: 1, unit: "au", px: 100 });
    scaleBar(AU_KM / 5, 110, bar); // 22 au
    expect(bar.value).toBe(20);
    expect(bar.unit).toBe("au");
    scaleBar(AU_KM / 600, 110, bar); // 0.18 au
    expect(bar.value).toBeCloseTo(0.1, 12);
    expect(bar.unit).toBe("au");
  });
});

describe("travelFraction", () => {
  it("starts at 0, ends at 1, linear for a short move", () => {
    for (const [d0, d1] of [
      [4, 2e6],
      [2e6, 4],
      [10, 10],
    ]) {
      expect(travelFraction(0, 23_000, d0!, d1!)).toBeCloseTo(0, 12);
      expect(travelFraction(1, 23_000, d0!, d1!)).toBeCloseTo(1, 12);
    }
    expect(travelFraction(0.3, 1e-3, 100, 50)).toBeCloseTo(0.3, 4);
  });

  it("keeps the target near its start while zooming out, near its end while zooming in", () => {
    // From the Earth (4 R⊕) out to the whole system (2·10⁶ R⊕), 1 au of travel: at mid-way the
    // camera is at 2 800 R⊕ and the target has moved less than 2 % of the way.
    expect(travelFraction(0.5, 23_455, 4, 2e6)).toBeLessThan(0.02);
    // Back in: the target is already 99 % there.
    expect(travelFraction(0.5, 23_455, 2e6, 4)).toBeGreaterThan(0.98);
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
