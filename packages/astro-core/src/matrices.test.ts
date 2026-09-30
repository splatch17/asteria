import { describe, expect, it } from "vitest";
import {
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
