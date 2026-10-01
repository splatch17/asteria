import { describe, expect, it } from "vitest";
import { bodyPath, bodyPosition, constellationOf, moonPhase, subsolarPoint } from "./index";

// Reference: JPL Horizons, observer Paris (2.3522°E, 48.8566°N, 35 m), 2026-10-01 00:00 UT.
// Quantities 1 (astrometric RA/Dec J2000), 4 (airless azimuth/elevation), 10 (illuminated %).
const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const DATE = new Date("2026-10-01T00:00:00Z");

describe("bodyPosition vs JPL Horizons", () => {
  it("Sun within 0.01°", () => {
    const sun = bodyPosition("Sun", DATE, PARIS);
    expect(Math.abs(sun.ra - 186.85884466)).toBeLessThan(0.01);
    expect(Math.abs(sun.dec - -2.964574987)).toBeLessThan(0.01);
    expect(Math.abs(sun.azimuth - 6.813529467)).toBeLessThan(0.01);
    expect(Math.abs(sun.altitude - -44.063121994)).toBeLessThan(0.01);
  });

  it("Moon (topocentric) within 0.02°", () => {
    const moon = bodyPosition("Moon", DATE, PARIS);
    expect(Math.abs(moon.ra - 60.974531838)).toBeLessThan(0.02);
    expect(Math.abs(moon.dec - 25.425071115)).toBeLessThan(0.02);
    expect(Math.abs(moon.azimuth - 103.170442798)).toBeLessThan(0.02);
    expect(Math.abs(moon.altitude - 45.360578138)).toBeLessThan(0.02);
  });
});

describe("moonPhase", () => {
  it("matches Horizons illumination (77.62 %) within 0.5 %", () => {
    expect(Math.abs(moonPhase(DATE).illumination - 0.7762)).toBeLessThan(0.005);
  });
});

describe("subsolarPoint", () => {
  it("puts the Sun at the zenith there", () => {
    const p = subsolarPoint(DATE);
    expect(bodyPosition("Sun", DATE, p).altitude).toBeGreaterThan(89.9);
  });
});

describe("planets vs JPL Horizons (Paris, 2026-10-01 0 h UT)", () => {
  // RA/Dec astrometric J2000, apparent magnitude, distance (au) — Horizons quantities 1, 9, 20
  const REF = {
    Mars: { ra: 123.786393913, dec: 20.853191985, mag: 1.097, au: 1.66543730787509 },
    Jupiter: { ra: 141.834286135, dec: 15.624165707, mag: -1.871, au: 5.92083936263814 },
    Venus: { ra: 213.214738701, dec: -20.850372721, mag: -4.768, au: 0.34769571079072 },
  } as const;
  const AU = 149_597_870.7;

  it.each(Object.entries(REF))(
    "%s position < 0.01°, magnitude ± 0.1, distance ± 0.1 %%",
    (name, ref) => {
      const p = bodyPosition(name as keyof typeof REF, DATE, PARIS);
      expect(Math.abs(p.ra - ref.ra)).toBeLessThan(0.01);
      expect(Math.abs(p.dec - ref.dec)).toBeLessThan(0.01);
      expect(Math.abs(p.magnitude - ref.mag)).toBeLessThan(0.1);
      expect(Math.abs(p.distanceKm / AU - ref.au) / ref.au).toBeLessThan(0.001);
    },
  );
});

describe("bodyPath", () => {
  it("samples the requested period and shows Mars' retrograde motion in early 2027", () => {
    const path = bodyPath("Mars", new Date("2026-12-01"), new Date("2027-05-01"), 5, PARIS);
    expect(path.length).toBe(31);
    // Mars opposition: 2027-02-19 — RA decreases for some weeks around it (retrograde)
    const ras = path.map((p) => p.ra);
    const retro = ras.some((ra, i) => i > 0 && ra < ras[i - 1]!);
    expect(retro).toBe(true);
  });
});

describe("constellationOf (IAU boundaries, Roman 1987)", () => {
  // J2000 positions from SIMBAD.
  it.each([
    ["Betelgeuse", 88.792939, 7.407064, "Ori"],
    ["Vega", 279.234735, 38.783689, "Lyr"],
    ["Polaris", 37.954561, 89.264109, "UMi"],
    ["Sirius", 101.287155, -16.716116, "CMa"],
    ["Antares", 247.351915, -26.432003, "Sco"],
    ["Alpheratz", 2.096916, 29.090431, "And"],
  ])("%s → %s", (_name, ra, dec, con) => {
    expect(constellationOf(ra, dec)).toBe(con);
  });
});
