import { describe, expect, it } from "vitest";
import {
  SIDEREAL_DAY_S,
  dmsToDegrees,
  earthRotationAngle,
  equatorialToHorizontal,
  greenwichMeanSiderealTime,
  hmsToDegrees,
  julianDate,
} from "./index";

// Reference values: Meeus, "Astronomical Algorithms", 2nd ed.

describe("julianDate", () => {
  it("matches J2000.0", () => {
    expect(julianDate(new Date("2000-01-01T12:00:00Z"))).toBe(2451545.0);
  });

  it("matches Meeus example 7.a (1957 Oct 4.81, Sputnik)", () => {
    // 1957-10-04 19:26:24 UT = 4.81 d
    expect(julianDate(new Date("1957-10-04T19:26:24Z"))).toBeCloseTo(2436116.31, 6);
  });
});

describe("greenwichMeanSiderealTime", () => {
  it("matches Meeus example 12.a (1987 Apr 10 0h UT → 13h10m46.3668s)", () => {
    const expected = hmsToDegrees(13, 10, 46.3668);
    // tolerance: 0.001 s of time = 0.0000042°
    expect(greenwichMeanSiderealTime(new Date("1987-04-10T00:00:00Z"))).toBeCloseTo(expected, 5);
  });

  it("matches Meeus example 12.b (1987 Apr 10 19:21:00 UT → 128.7378734°)", () => {
    expect(greenwichMeanSiderealTime(new Date("1987-04-10T19:21:00Z"))).toBeCloseTo(128.7378734, 5);
  });
});

// Reference values: SOFA (IAU Standards of Fundamental Astronomy), test program t_sofa_c.c.
describe("earthRotationAngle", () => {
  const RAD = 180 / Math.PI;
  const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

  it("matches SOFA iauEra00(2400000.5, 54388.0) = 0.4022837240028158102 rad (within 1e-9 rad)", () => {
    // MJD 54388.0 = 2007-10-15T00:00:00 UT1.
    const era = earthRotationAngle(new Date("2007-10-15T00:00:00Z"));
    expect(Math.abs(era / RAD - 0.4022837240028158102)).toBeLessThan(1e-9);
  });

  it("differs from GMST by the IAU 2006 precession in RA (SOFA iauGmst06, within 0.01″)", () => {
    // SOFA iauGmst06(2400000.5, 53736.0, 2400000.5, 53736.0) = 1.754174971870091203 rad.
    const date = new Date("2006-01-01T00:00:00Z");
    const gmst = greenwichMeanSiderealTime(date);
    expect(Math.abs(wrap(gmst - 1.754174971870091203 * RAD)) * 3600).toBeLessThan(0.01);
    // GMST − ERA = 0.014506″ + 4612.156534″ t + 1.3915817″ t² … (IERS Conventions 2010, 5.32).
    const t = (julianDate(date) - 2_451_545) / 36_525;
    const drift = (0.014506 + 4612.156534 * t + 1.3915817 * t * t) / 3600;
    expect(Math.abs(wrap(gmst - earthRotationAngle(date) - drift)) * 3600).toBeLessThan(0.01);
  });

  it("turns GMST by 360° in one sidereal day, 86 164.0905 s (within 0.01″)", () => {
    const a = new Date("2026-10-11T00:00:00Z");
    const b = new Date(a.getTime() + SIDEREAL_DAY_S * 1000);
    const turn = greenwichMeanSiderealTime(b) - greenwichMeanSiderealTime(a);
    expect(Math.abs(wrap(turn)) * 3600).toBeLessThan(0.01);
  });
});

describe("equatorialToHorizontal", () => {
  it("matches Meeus example 13.b (Venus from USNO Washington)", () => {
    // Meeus uses apparent sidereal time; we use mean sidereal time. The difference
    // (equation of the equinoxes, ~ -0.9 s here) shifts results by < 0.005°.
    const venus = { ra: hmsToDegrees(23, 9, 16.641), dec: dmsToDegrees(-1, 6, 43, 11.61) };
    const usno = { latitude: dmsToDegrees(1, 38, 55, 17), longitude: -dmsToDegrees(1, 77, 3, 56) };
    const { azimuth, altitude } = equatorialToHorizontal(
      venus,
      usno,
      new Date("1987-04-10T19:21:00Z"),
    );
    // Meeus: A = 68.0337° (from South) → 248.0337° from North; h = 15.1249°
    expect(Math.abs(azimuth - 248.0337)).toBeLessThan(0.005);
    expect(Math.abs(altitude - 15.1249)).toBeLessThan(0.005);
  });

  it("puts Polaris at altitude ≈ latitude", () => {
    const polaris = { ra: hmsToDegrees(2, 31, 49), dec: dmsToDegrees(1, 89, 15, 51) };
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    const { altitude } = equatorialToHorizontal(polaris, paris, new Date("2026-09-30T21:00:00Z"));
    expect(Math.abs(altitude - paris.latitude)).toBeLessThan(0.8);
  });
});
