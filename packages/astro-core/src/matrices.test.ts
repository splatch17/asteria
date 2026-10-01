import { describe, expect, it } from "vitest";
import {
  longTermPrecessionMatrix,
  applyMat3,
  equatorialToHorizontal,
  equatorialToHorizontalMatrix,
  precessionMatrix,
  unitVector,
} from "./index";

const DEG = 180 / Math.PI;
const toRaDec = ([x, y, z]: [number, number, number]) => ({
  ra: (Math.atan2(y, x) * DEG + 360) % 360,
  dec: Math.asin(z) * DEG,
});

describe("precessionMatrix", () => {
  it("matches Meeus example 21.b (θ Persei, J2000 → 2028 Nov 13.19)", () => {
    // Meeus's J2000 position with proper motion already applied up to the target epoch
    const ra0 = 41.054063;
    const dec0 = 49.22775;
    const p = precessionMatrix(new Date("2028-11-13T04:33:36Z"));
    const { ra, dec } = toRaDec(applyMat3(p, unitVector(ra0, dec0)));
    // Meeus: α = 41.547214°, δ = 49.348483° — tolerance 0.0005° (1.8″)
    expect(Math.abs(ra - 41.547214)).toBeLessThan(0.0005);
    expect(Math.abs(dec - 49.348483)).toBeLessThan(0.0005);
  });

  it("is the identity at J2000.0", () => {
    const { ra, dec } = toRaDec(
      applyMat3(precessionMatrix(new Date("2000-01-01T12:00:00Z")), unitVector(100, 20)),
    );
    expect(ra).toBeCloseTo(100, 9);
    expect(dec).toBeCloseTo(20, 9);
  });
});

describe("equatorialToHorizontalMatrix", () => {
  it("agrees with the scalar transformation", () => {
    const observer = { latitude: 48.8566, longitude: 2.3522 };
    const date = new Date("2026-09-30T21:00:00Z");
    for (const [ra, dec] of [
      [88.79, 7.41],
      [279.23, 38.78],
      [10, -60],
      [200, 85],
    ] as const) {
      const [n, e, u] = applyMat3(
        equatorialToHorizontalMatrix(date, observer),
        unitVector(ra, dec),
      );
      const ref = equatorialToHorizontal({ ra, dec }, observer, date);
      expect(Math.asin(u) * DEG).toBeCloseTo(ref.altitude, 9);
      expect((Math.atan2(e, n) * DEG + 360) % 360).toBeCloseTo(ref.azimuth, 9);
    }
  });
});

describe("long-term precession", () => {
  it("agrees with IAU 1976 within 0.05° over a century", () => {
    const date = new Date("2100-01-01T12:00:00Z");
    const t = 1.0; // ≈ Julian centuries since J2000
    for (const [ra, dec] of [
      [88.79, 7.41],
      [279.23, 38.78],
      [37.95, 89.26],
    ] as const) {
      const a = applyMat3(precessionMatrix(date), unitVector(ra, dec));
      const b = applyMat3(longTermPrecessionMatrix(t), unitVector(ra, dec));
      const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      expect(Math.acos(Math.min(1, dot)) * DEG).toBeLessThan(0.05);
    }
  });

  it("makes Vega the pole star around AD 14 000 (δ > 83°)", () => {
    const vega = unitVector(279.2347, 38.7837);
    const { dec } = toRaDec(applyMat3(precessionMatrix(new Date("+013800-01-01T00:00:00Z")), vega));
    expect(dec).toBeGreaterThan(83);
  });

  it("brings Polaris back after one full cycle (~25 770 years)", () => {
    const polaris = unitVector(37.9461, 89.2641);
    const years = 360 / (5028.796195 / 3600 / 100);
    const { dec } = toRaDec(applyMat3(longTermPrecessionMatrix(years / 100), polaris));
    expect(dec).toBeCloseTo(89.2641, 6);
  });
});
