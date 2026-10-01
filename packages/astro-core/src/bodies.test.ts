import { describe, expect, it } from "vitest";
import { bodyPosition, moonPhase, subsolarPoint } from "./index";

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
