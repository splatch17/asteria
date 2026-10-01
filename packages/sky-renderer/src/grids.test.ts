import { describe, expect, it } from "vitest";
import { applyMat3, precessionMatrix, type Vec3 } from "@asteria/astro-core";
import {
  OBLIQUITY_J2000_DEG,
  eclipticCircle,
  eclipticOfDate,
  eclipticToJ2000,
  graduationLines,
  sphericalGrid,
} from "./grids";

const deg = (rad: number) => (rad * 180) / Math.PI;
const angle = (a: Vec3, b: Vec3) =>
  deg(Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

describe("sphericalGrid", () => {
  const { positions: grid, dash } = sphericalGrid({ lonStep: 15, latStep: 10, latMax: 80 });

  it("is made of short segments between unit vectors", () => {
    expect(grid.length % 6).toBe(0);
    for (let i = 0; i < grid.length; i += 3)
      expect(Math.hypot(grid[i]!, grid[i + 1]!, grid[i + 2]!)).toBeCloseTo(1, 5);
    for (let i = 0; i < grid.length; i += 6) {
      const a: Vec3 = [grid[i]!, grid[i + 1]!, grid[i + 2]!];
      const b: Vec3 = [grid[i + 3]!, grid[i + 4]!, grid[i + 5]!];
      expect(angle(a, b)).toBeLessThanOrEqual(2.01);
    }
  });

  it("has 24 meridians and 17 parallels (−80° … +80°)", () => {
    const meridians = 24 * 80 + 4 * 5; // 160° in 2° steps; 4 of them reach the poles (180°)
    const parallels = 17 * 180;
    expect(grid.length / 6).toBe(meridians + parallels);
    expect(dash.length).toBe(grid.length / 3);
  });

  it("stays above latMin (altitude grid: nothing below the horizon)", () => {
    const alt = sphericalGrid({ lonStep: 15, latStep: 10, latMax: 80, latMin: 0 }).positions;
    for (let i = 2; i < alt.length; i += 3) expect(alt[i]!).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe("ecliptic", () => {
  it("reaches the obliquity at the solstices", () => {
    const summer = eclipticToJ2000(90);
    expect(deg(Math.asin(summer[2]))).toBeCloseTo(OBLIQUITY_J2000_DEG, 6);
    expect(eclipticToJ2000(0)).toEqual([1, 0, 0]);
    const { positions, longitudes } = eclipticCircle(1);
    expect(positions.length).toBe(360 * 6);
    expect(longitudes[1]).toBeCloseTo(1, 6);
  });

  // The 0° graduation must sit on the vernal equinox of the displayed date: once precessed with
  // astro-core's matrix, its direction is RA 0h, Dec 0° of date.
  it.each([
    ["2026-10-02T00:00:00Z", 0.02], // IAU 1976 precession; ecliptic motion neglected (≈ 0.01°)
    ["2400-01-01T00:00:00Z", 0.1],
    ["1500-01-01T00:00:00Z", 0.1],
  ])("puts 0° on the equinox of %s (± %s°)", (iso, tol) => {
    const date = new Date(iso);
    const p = applyMat3(precessionMatrix(date), eclipticOfDate(0, date));
    expect(angle(p, [1, 0, 0])).toBeLessThan(tol);
  });

  it("follows the long-term precession model over millennia", () => {
    const date = new Date("+014000-01-01T00:00:00Z");
    const p = applyMat3(precessionMatrix(date), eclipticOfDate(0, date));
    expect(angle(p, [1, 0, 0])).toBeLessThan(0.05);
  });
});

describe("graduationLines", () => {
  it("snaps to the label steps around the view centre", () => {
    const c: Vec3 = [Math.cos(0.7) * Math.cos(1.0), Math.cos(0.7) * Math.sin(1.0), Math.sin(0.7)];
    // lon 57.3°, lat 40.1°
    expect(graduationLines(c, 30, 20)).toEqual({ lon: 60, lat: 40 });
    expect(graduationLines([0, 0, 1], 30, 20)).toEqual({ lon: 0, lat: 80 });
    expect(graduationLines([1, -1e-3, 0], 30, 20).lon).toBe(0);
  });
});
