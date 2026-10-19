import { describe, expect, it } from "vitest";
import { applyMat3, j2000ToHorizontalMatrix, unitVector } from "@asteria/astro-core";
import { stereoScale } from "@asteria/sky-renderer";
import { angleBetween, constellationShapes, framingFov, nearest, zenithObserver } from "./geometry";

// Orion's belt and shoulders, J2000 (SIMBAD), as a small figure.
const STARS = [
  { hip: 27989, ra: 88.7929, dec: 7.4071 }, // Betelgeuse
  { hip: 24436, ra: 78.6345, dec: -8.2016 }, // Rigel
  { hip: 26727, ra: 85.1897, dec: -1.9426 }, // Alnitak
  { hip: 26311, ra: 84.0534, dec: -1.2019 }, // Alnilam
  { hip: 25930, ra: 83.0017, dec: -0.2991 }, // Mintaka
  { hip: 91262, ra: 279.2347, dec: 38.7837 }, // Vega
  { hip: 91971, ra: 281.1932, dec: 37.6051 }, // ζ¹ Lyr
];
const LINES = {
  Ori: [
    [27989, 26727, 26311, 25930],
    [24436, 25930],
  ],
  Lyr: [[91262, 91971]],
  Xxx: [[1, 2]], // no known star: left out
};

describe("constellation shapes", () => {
  const shapes = constellationShapes(STARS, LINES);

  it("centres each figure on its stars, counted once", () => {
    expect(Object.keys(shapes).sort()).toEqual(["Lyr", "Ori"]);
    const ori = shapes.Ori!;
    expect(Math.hypot(...ori.centre)).toBeCloseTo(1, 12);
    // Mean of the 5 stars: near Alnilam, radius reaching Betelgeuse or Rigel (~10°).
    expect(angleBetween(ori.centre, unitVector(84.05, -1.2))).toBeLessThan(2);
    expect(ori.radius).toBeGreaterThan(8);
    expect(ori.radius).toBeLessThan(12);
    expect(shapes.Lyr!.radius).toBeLessThan(1.5);
  });

  it("orders neighbours by distance", () => {
    expect(nearest("Ori", shapes, ["Lyr", "Ori"])).toEqual(["Lyr"]);
    expect(nearest("Zzz", shapes, ["Lyr", "Ori"])).toEqual(["Lyr", "Ori"]);
  });
});

describe("zenith observer", () => {
  for (const [ra, dec] of [
    [83.8, -1.2],
    [279.2, 38.8],
    [0.5, -80],
    [200, 89],
  ] as const) {
    for (const iso of ["2026-10-19T20:00:00Z", "1990-01-01T00:00:00Z"]) {
      it(`puts RA ${ra}°, Dec ${dec}° at the zenith on ${iso}`, () => {
        const date = new Date(iso);
        const c = unitVector(ra, dec);
        const obs = zenithObserver(c, date);
        expect(obs.longitude).toBeGreaterThanOrEqual(-180);
        expect(obs.longitude).toBeLessThanOrEqual(180);
        const up = applyMat3(j2000ToHorizontalMatrix(date, obs), c)[2];
        // Within 1″ of the zenith.
        expect(Math.acos(Math.min(1, up)) * (180 / Math.PI) * 3600).toBeLessThan(1);
      });
    }
  }
});

describe("framing", () => {
  it("fits the figure in the given share of the narrow side", () => {
    const aspect = 360 / 420;
    const fov = framingFov(30, aspect);
    // Stereographic radius of 30° on screen, as a fraction of the half-width.
    const r = 2 * Math.tan((30 * Math.PI) / 360) * stereoScale(fov);
    expect(r / aspect).toBeCloseTo(0.78, 6);
  });

  it("keeps small figures in some sky and huge ones bounded", () => {
    expect(framingFov(0.5, 1)).toBe(20);
    expect(framingFov(80, 0.5)).toBe(150);
    expect(framingFov(20, 1)).toBeLessThan(framingFov(30, 1));
  });
});
