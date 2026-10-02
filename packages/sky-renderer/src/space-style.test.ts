import { describe, expect, it } from "vitest";
import { bodyPosition, moonPhase, unitVector, type Vec3 } from "@asteria/astro-core";
import {
  bvToRgb,
  illuminatedFraction,
  isSpaceStyle,
  moonAxes,
  planckianXy,
  planetAxes,
  sunwardDirection,
} from "./space-style";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const GEOCENTRE = { latitude: 0, longitude: 0 };

describe("isSpaceStyle", () => {
  it("accepts the two styles only", () => {
    expect(isSpaceStyle("engraving")).toBe(true);
    expect(isSpaceStyle("realistic")).toBe(true);
    expect(isSpaceStyle("deep")).toBe(false);
    expect(isSpaceStyle(null)).toBe(false);
  });
});

describe("planckianXy", () => {
  // CIE 15:2004 / Kim et al. (2002) reference: 6500 K black body ≈ (0.3135, 0.3236),
  // 2856 K (illuminant A) ≈ (0.4476, 0.4074). Tolerance 0.002.
  it("matches the Planckian locus at reference temperatures", () => {
    const [x65, y65] = planckianXy(6500);
    expect(Math.abs(x65 - 0.3135)).toBeLessThan(0.002);
    expect(Math.abs(y65 - 0.3236)).toBeLessThan(0.002);
    const [xA, yA] = planckianXy(2856);
    expect(Math.abs(xA - 0.4476)).toBeLessThan(0.002);
    expect(Math.abs(yA - 0.4074)).toBeLessThan(0.002);
  });
});

describe("bvToRgb", () => {
  it("normalises the brightest channel to 1", () => {
    for (const bv of [-0.3, 0, 0.65, 1.5]) expect(Math.max(...bvToRgb(bv))).toBeCloseTo(1, 6);
  });

  it("is bluish for hot stars and orange for cool ones", () => {
    const [r1, , b1] = bvToRgb(-0.03); // Rigel
    expect(b1).toBeGreaterThan(r1);
    const [r2, g2, b2] = bvToRgb(1.85); // Betelgeuse
    expect(r2).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(b2);
  });

  it("keeps a Sun-like star (B−V 0.65) close to white", () => {
    const [r, g, b] = bvToRgb(0.65);
    expect(r).toBeCloseTo(1, 6);
    expect(g).toBeGreaterThan(0.85);
    expect(b).toBeGreaterThan(0.7);
  });

  it("falls back to white without B−V", () => {
    expect(bvToRgb(undefined)).toEqual([1, 1, 1]);
  });
});

describe("sunlight on the Moon", () => {
  // Reference: astronomy-engine Illumination().phase_fraction (validated against JPL Horizons
  // in astro-core), exposed as moonPhase(). Our geometry uses geometric directions and
  // distances only; tolerance 0.015 (topocentric vs geocentric parallax, light-time).
  const dates = [
    "2026-01-03T10:00:00Z", // near full
    "2026-01-10T15:00:00Z", // near last quarter
    "2026-01-18T19:00:00Z", // near new
    "2026-01-26T04:00:00Z", // near first quarter
    "2026-05-01T00:00:00Z",
  ];
  for (const iso of dates) {
    it(`gives the illuminated fraction on ${iso}`, () => {
      const date = new Date(iso);
      const sun = bodyPosition("Sun", date, GEOCENTRE);
      const moon = bodyPosition("Moon", date, GEOCENTRE);
      const moonDir = unitVector(moon.ra, moon.dec);
      const sunward = sunwardDirection(
        moonDir,
        moon.distanceKm,
        unitVector(sun.ra, sun.dec),
        sun.distanceKm,
      );
      expect(
        Math.abs(illuminatedFraction(moonDir, sunward) - moonPhase(date).illumination),
      ).toBeLessThan(0.015);
    });
  }

  it("turns the Moon's near side towards the Earth", () => {
    const moon = unitVector(120, 20);
    const { pole, prime } = moonAxes(moon);
    expect(dot(prime, moon)).toBeLessThan(-0.9);
    expect(Math.abs(dot(prime, pole))).toBeLessThan(1e-12);
  });
});

describe("planet orientation", () => {
  // Saturn's ring-plane crossing as seen from the Earth: 2025-03-23 (ring opening B ≈ 0°);
  // maximum opening ≈ 27° in October 2017 (IMCCE / NASA). Tolerance 0.6°.
  const ringOpening = (iso: string) => {
    const date = new Date(iso);
    const saturn = bodyPosition("Saturn", date, GEOCENTRE);
    const { pole } = planetAxes("Saturn", date);
    const toEarth = unitVector(saturn.ra, saturn.dec).map((c) => -c) as Vec3;
    return (Math.asin(dot(toEarth, pole)) * 180) / Math.PI;
  };

  it("puts the Earth in Saturn's ring plane on 2025-03-23", () => {
    expect(Math.abs(ringOpening("2025-03-23T12:00:00Z"))).toBeLessThan(0.6);
  });

  it("opens Saturn's rings by about 27° in October 2017", () => {
    expect(Math.abs(Math.abs(ringOpening("2017-10-16T00:00:00Z")) - 27)).toBeLessThan(0.6);
  });

  it("returns orthonormal axes", () => {
    const { pole, prime } = planetAxes("Mars", new Date("2026-10-02T00:00:00Z"));
    expect(dot(pole, pole)).toBeCloseTo(1, 12);
    expect(dot(prime, prime)).toBeCloseTo(1, 12);
    expect(Math.abs(dot(pole, prime))).toBeLessThan(1e-12);
  });

  it("gives Venus a crescent near inferior conjunction (2026-10-24)", () => {
    const date = new Date("2026-10-10T00:00:00Z");
    const sun = bodyPosition("Sun", date, GEOCENTRE);
    const venus = bodyPosition("Venus", date, GEOCENTRE);
    const dir = unitVector(venus.ra, venus.dec);
    const k = illuminatedFraction(
      dir,
      sunwardDirection(dir, venus.distanceKm, unitVector(sun.ra, sun.dec), sun.distanceKm),
    );
    expect(k).toBeLessThan(0.15);
  });
});
