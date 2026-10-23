import { describe, expect, it } from "vitest";
import { decodeStarCatalog, type StarStrings } from "@asteria/catalog";
import { unitVector } from "@asteria/astro-core";
import { figureStars, type ConstellationShape } from "./geometry";
import {
  HOME_MIN_ALTITUDE,
  culmination,
  upFromLatitude,
  upTonight,
  visibleFromLatitude,
  visibleTonight,
} from "./visibility";

const shape = (abbr: string, ra: number, dec: number): ConstellationShape => ({
  abbr,
  centre: unitVector(ra, dec),
  radius: 5,
});
// Approximate figure centres (J2000).
const SHAPES = Object.fromEntries(
  [
    shape("Cyg", 305, 42), // summer evenings
    shape("UMa", 170, 55), // circumpolar from Paris
    shape("Cru", 187, -60), // far south
    shape("Ori", 84, 0), // winter (rises late in October, before dawn)
    shape("Sgr", 285, -28), // low and set early in October from Paris
  ].map((s) => [s.abbr, s]),
);

describe("visible tonight", () => {
  it("Paris, 19 October 2026 evening", () => {
    const v = visibleTonight(SHAPES, new Date("2026-10-19T17:00:00Z"), {
      latitude: 48.85,
      longitude: 2.35,
    });
    expect(v.has("Cyg")).toBe(true);
    expect(v.has("UMa")).toBe(true);
    expect(v.has("Ori")).toBe(true); // up after 1 h, before dawn
    expect(v.has("Cru")).toBe(false); // never rises
    expect(v.has("Sgr")).toBe(false); // < 20° high once dark
  });

  it("Sydney sees the Southern Cross", () => {
    const v = visibleTonight(SHAPES, new Date("2026-04-10T08:00:00Z"), {
      latitude: -33.87,
      longitude: 151.21,
    });
    expect(v.has("Cru")).toBe(true);
    expect(v.has("UMa")).toBe(false);
  });

  it("works for any direction, e.g. stars by HIP number", () => {
    const v = upTonight(
      { "91262": unitVector(279.23, 38.78), "30438": unitVector(95.99, -52.7) }, // Véga, Canopus
      new Date("2026-10-19T17:00:00Z"),
      { latitude: 48.85, longitude: 2.35 },
    );
    expect([...v]).toEqual(["91262"]);
  });

  it("prefers nothing when the night never gets dark (Svalbard, June)", () => {
    const v = visibleTonight(SHAPES, new Date("2026-06-21T00:00:00Z"), {
      latitude: 78.2,
      longitude: 15.6,
    });
    expect(v.size).toBe(0);
  });
});

describe("visible from home, by latitude (#187)", () => {
  const DATE = new Date("2026-10-22T20:00:00Z");
  const fig = (...stars: [number, number, number][]) =>
    stars.map(([ra, dec, v]) => ({ dir: unitVector(ra, dec), v }));
  // Small figures with approximate J2000 positions and magnitudes.
  const FIGURES = {
    Cru: fig(
      [186.65, -63.1, 0.8],
      [191.93, -59.69, 1.25],
      [187.79, -57.11, 1.6],
      [183.79, -58.75, 2.8],
    ),
    UMi: fig([37.95, 89.26, 2.0], [222.68, 74.16, 2.1], [230.18, 71.83, 3.0], [263.05, 86.59, 4.4]),
    // Antares and the head high from Paris, the long tail low: half the light, not half the stars.
    Sco: fig(
      [247.35, -26.43, 1.06],
      [240.08, -22.62, 2.29],
      [241.36, -19.81, 2.56],
      [252.54, -34.29, 2.29],
      [253.08, -38.05, 3.0],
      [263.4, -37.1, 1.62],
      [264.33, -42.99, 1.86],
      [266.9, -40.13, 3.0],
      [265.62, -39.03, 2.39],
      [254.66, -42.36, 3.6],
    ),
  };

  it("culminates at 90° − |φ − δ|", () => {
    expect(culmination(38.78, 48.85)).toBeCloseTo(79.93, 6); // Véga from Paris
    expect(culmination(-52.7, 48.85)).toBeCloseTo(-11.55, 6); // Canopus never rises
    expect(culmination(89.26, 0)).toBeCloseTo(0.74, 6); // Polaris on the equator's horizon
    expect(culmination(-60, -60)).toBe(90);
  });

  it("from Paris: never the Southern Cross, always the Little Bear, Scorpius by its light", () => {
    const v = visibleFromLatitude(FIGURES, 48.85, DATE);
    expect(v.has("Cru")).toBe(false);
    expect(v.has("UMi")).toBe(true);
    expect(v.has("Sco")).toBe(true);
  });

  it("from Sydney: the Cross, not the Little Bear", () => {
    const v = visibleFromLatitude(FIGURES, -33.87, DATE);
    expect([...v].sort()).toEqual(["Cru", "Sco"]);
  });

  it("from the North Pole, only what is north of the threshold", () => {
    const v = visibleFromLatitude(FIGURES, 90, DATE);
    expect([...v]).toEqual(["UMi"]);
    const stars = upFromLatitude(
      { pol: unitVector(37.95, 89.26), veg: unitVector(279.23, 38.78), lim: unitVector(0, 4) },
      90,
      DATE,
    );
    expect([...stars].sort()).toEqual(["pol", "veg"]); // δ ≈ 4° culminates below 5°
    expect(HOME_MIN_ALTITUDE).toBe(5);
  });

  it("uses declinations of date (precession)", () => {
    // At RA 0h the declination grows by 20.04″ a year: 0° in 2000, ≈ +2.8° in 2500.
    const star = { s: unitVector(0, 0) };
    expect(upFromLatitude(star, 87, new Date("2000-01-01T12:00:00Z")).size).toBe(0); // 3°
    expect(upFromLatitude(star, 87, new Date("2500-01-01T12:00:00Z")).size).toBe(1); // ≈ 5.8°
  });
});

// The rule against the real figures (public/data, gitignored: skipped when absent).
type Fs = { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };
const fs = (
  globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
).process?.getBuiltinModule?.("node:fs") as Fs | undefined;
const data = (f: string) =>
  decodeURIComponent(new URL(`../../../public/data/${f}`, import.meta.url).pathname);
const available =
  !!fs &&
  ["stars.bin", "star-strings.json", "constellation-lines.json"].every((f) =>
    fs.existsSync(data(f)),
  );

describe.skipIf(!available)("visible from home, the 88 figures (public/data)", () => {
  const text = (f: string) => new TextDecoder().decode(fs!.readFileSync(data(f)));
  const load = () => {
    const bin = fs!.readFileSync(data("stars.bin"));
    const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
    const stars = decodeStarCatalog(buffer, JSON.parse(text("star-strings.json")) as StarStrings);
    const lines = JSON.parse(text("constellation-lines.json")) as Record<string, number[][]>;
    return figureStars(stars, lines);
  };
  const DATE = new Date("2026-10-22T20:00:00Z");

  it("all 88 from the equator", () => {
    const figures = load();
    expect(Object.keys(figures)).toHaveLength(88);
    expect(visibleFromLatitude(figures, 0, DATE).size).toBe(88);
  });

  it("from Paris: 59, the southern ones that never clear the horizon left out", () => {
    const v = visibleFromLatitude(load(), 48.85, DATE);
    for (const a of ["UMi", "UMa", "Cas", "Ori", "Sco", "Sgr", "Eri", "CMa", "PsA", "Col"])
      expect(v.has(a), a).toBe(true);
    for (const a of ["Cru", "Car", "Cen", "Lup", "Ara", "Oct", "Pav", "Tuc", "Phe", "Gru", "CrA"])
      expect(v.has(a), a).toBe(false);
    expect(v.size).toBe(59);
  });

  it("from Sydney: the far north is out", () => {
    const v = visibleFromLatitude(load(), -33.87, DATE);
    for (const a of ["UMi", "Cas", "Cep", "Dra", "Cam"]) expect(v.has(a), a).toBe(false);
    for (const a of ["Cru", "Oct", "Ori", "Leo", "Cyg"]) expect(v.has(a), a).toBe(true);
  });
});
