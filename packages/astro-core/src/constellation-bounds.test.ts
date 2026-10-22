import { describe, expect, it } from "vitest";
import file from "./data/constellation-bounds.json";
import { constellationOf } from "./bodies";
import {
  b1875Of,
  areaPlace,
  boundsContain,
  boundsOutline,
  constellationAt,
  distanceToOutline,
  j2000OfB1875,
  loadConstellationBounds,
  parseConstellationBounds,
  ringContains,
  type BoundsRing,
  type ConstellationBoundsFile,
} from "./constellation-bounds";
import { unitVector, type Vec3 } from "./matrices";

const bounds = parseConstellationBounds(file as ConstellationBoundsFile);
const at = (ra: number, dec: number) => constellationAt(bounds, unitVector(ra, dec));
const DEG = 180 / Math.PI;
const toRaDec = ([x, y, z]: Vec3) => ({
  ra: (((Math.atan2(y, x) * DEG) % 360) + 360) % 360,
  dec: Math.asin(z) * DEG,
});

/** n nearly uniform points of the sphere (Fibonacci lattice), RA/Dec J2000 degrees. */
function fibonacci(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = i + 0.5;
    out.push([
      (((t * 180 * (1 + Math.sqrt(5))) % 360) + 360) % 360,
      Math.asin(1 - (2 * t) / n) * DEG,
    ]);
  }
  return out;
}

describe("constellation boundaries data (build_bounds.py)", () => {
  it("has the 88 constellations, Serpens in two parts, in B1875", () => {
    expect(bounds.abbrs).toHaveLength(88);
    expect(bounds.rings.filter((r) => r.abbr === "Ser")).toHaveLength(2);
    expect(bounds.rings).toHaveLength(89);
    expect(file.equinox).toBe("B1875");
    expect(file.notice).toContain("Copyright (c) 2015, Olaf Frohn");
  });

  it("has only meridian and parallel edges", () => {
    for (const r of bounds.rings)
      for (let i = 0; i < r.ra.length; i++) {
        const j = (i + 1) % r.ra.length;
        expect(r.ra[i] === r.ra[j] || r.dec[i] === r.dec[j], `${r.abbr} edge ${i}`).toBe(true);
      }
  });

  it("rejects an unknown format", () => {
    expect(() =>
      parseConstellationBounds({ ...(file as ConstellationBoundsFile), version: 2 }),
    ).toThrow();
  });

  it("loads on demand", async () => {
    expect((await loadConstellationBounds()).abbrs).toEqual(bounds.abbrs);
  });
});

describe("J2000 → B1875 (equinox of the boundaries)", () => {
  // References: astropy 8.0 FK5(equinox J2000) → FK5(equinox B1875), tolerance 1″.
  it.each([
    ["Polaris", 37.954561, 89.264109, 18.313420855, 88.642609743],
    ["Betelgeuse", 88.792939, 7.407064, 87.10181813, 7.38213965],
    ["Sirius", 101.287155, -16.716116, 99.89096274, -16.58819778],
  ])("%s", (_, ra, dec, ra1875, dec1875) => {
    const p = b1875Of(unitVector(ra, dec));
    expect(Math.abs(p.dec - dec1875) * 3600).toBeLessThan(1);
    expect(Math.abs(p.ra - ra1875) * 3600 * Math.cos((dec1875 * Math.PI) / 180)).toBeLessThan(1);
    const back = toRaDec(j2000OfB1875(p.ra, p.dec));
    expect(Math.abs(back.dec - dec) * 3600).toBeLessThan(1e-6);
  });

  it("is needed: a point just inside a boundary in B1875 is misplaced without precession", () => {
    // Taurus / Orion meridian at B1875 RA 5 h 0 m... take any meridian edge of Orion.
    const ori = bounds.rings.find((r) => r.abbr === "Ori")!;
    const i = [...ori.ra.keys()].find((k) => ori.ra[k] === ori.ra[(k + 1) % ori.ra.length])!;
    const ra = ori.ra[i]!;
    const dec = (ori.dec[i]! + ori.dec[(i + 1) % ori.ra.length]!) / 2;
    // 0.05° on each side of the meridian: Orion on one side, a neighbour on the other.
    const sides = [ra - 0.05, ra + 0.05].map((a) => constellationAt(bounds, j2000OfB1875(a, dec)));
    expect(sides).toContain("Ori");
    expect(sides[0]).not.toBe(sides[1]);
    // Read as if J2000 were B1875, the same RA/Dec falls 0.6° away (125 years of precession):
    // the naive test gives the same constellation on both sides.
    const naive = [ra - 0.05, ra + 0.05].map((a) => constellationAt(bounds, unitVector(a, dec)));
    expect(naive[0]).toBe(naive[1]);
  });
});

describe("constellationAt (spherical point in polygon)", () => {
  // J2000 positions from SIMBAD.
  it.each([
    ["Betelgeuse", 88.792939, 7.407064, "Ori"],
    ["Polaris", 37.954561, 89.264109, "UMi"],
    ["Sirius", 101.287155, -16.716116, "CMa"],
    ["α Centauri", 219.902058, -60.833976, "Cen"],
    ["Vega", 279.234735, 38.783689, "Lyr"],
    ["Alpheratz", 2.096916, 29.090431, "And"],
    ["Unukalhai (Serpens Caput)", 236.067, 6.4256, "Ser"],
    ["θ Serpentis (Serpens Cauda)", 284.0549, 4.2036, "Ser"],
    ["Rasalhague (Ophiuchus, between the two parts)", 263.7336, 12.56, "Oph"],
    ["σ Octantis", 317.195, -88.956, "Oct"],
  ])("%s → %s", (_, ra, dec, con) => {
    expect(at(ra, dec)).toBe(con);
    expect(boundsContain(bounds, con, unitVector(ra, dec))).toBe(true);
  });

  it("puts both celestial poles where the IAU does, from every side", () => {
    expect(at(0, 90)).toBe("UMi");
    expect(at(0, -90)).toBe("Oct");
    for (let ra = 0; ra < 360; ra += 15) {
      expect(at(ra, 89.5), `+89.5 at ${ra}`).toBe("UMi");
      expect(at(ra, -89.5), `−89.5 at ${ra}`).toBe("Oct");
    }
  });

  it("follows Ursa Minor and Octans around the poles (agrees with Roman 1987)", () => {
    for (let ra = 0; ra < 360; ra += 2.5)
      for (const dec of [86, 87.5, 88.5, -82, -84, -86])
        expect(at(ra, dec)).toBe(constellationOf(ra, dec));
  });

  it("wraps at 0 h", () => {
    for (let dec = -80; dec <= 80; dec += 2.5)
      for (const ra of [359.99, 0.01, 359.5, 0.5])
        expect(at(ra, dec)).toBe(constellationOf(ra, dec));
  });

  it("handles a ring by itself at the pole and at the wrap", () => {
    const square: BoundsRing = {
      abbr: "X",
      ra: Float64Array.from([350, 10, 10, 350]),
      dec: Float64Array.from([10, 10, 20, 20]),
      north: false,
      decMax: 20,
    };
    expect(ringContains(square, 0, 15)).toBe(true);
    expect(ringContains(square, 355, 15)).toBe(true);
    expect(ringContains(square, 15, 15)).toBe(false);
    expect(ringContains(square, 0, 25)).toBe(false);
    expect(ringContains(square, 180, 15)).toBe(false);
    const cap: BoundsRing = {
      abbr: "N",
      ra: Float64Array.from([0, 120, 240]),
      dec: Float64Array.from([80, 80, 80]),
      north: true,
      decMax: 80,
    };
    expect(ringContains(cap, 200, 85)).toBe(true);
    expect(ringContains(cap, 200, 75)).toBe(false);
  });

  it("partitions the sky as Roman 1987 (astronomy-engine)", () => {
    const points = fibonacci(20_000);
    let agree = 0;
    const differ: { ra: number; dec: number; ours: string; roman: string; arcsec: number }[] = [];
    for (const [ra, dec] of points) {
      const dir = unitVector(ra, dec);
      const holders = bounds.abbrs.filter((a) => boundsContain(bounds, a, dir));
      expect(holders, `${ra} ${dec}`).toHaveLength(1);
      const roman = constellationOf(ra, dec);
      if (holders[0] === roman) agree++;
      else
        differ.push({
          ra,
          dec,
          ours: holders[0]!,
          roman,
          arcsec: distanceToOutline(boundsOutline(bounds, roman, 0.25), dir) * 3600,
        });
    }
    // Differences only on the boundary itself (precession models, rounding of Roman's table).
    expect(agree / points.length).toBeGreaterThan(0.999);
    for (const d of differ) expect(d.arcsec, JSON.stringify(d)).toBeLessThan(30);
  });
});

describe("outlines and centres", () => {
  it("draws the boundary itself", () => {
    const outline = boundsOutline(bounds, "Ori", 1);
    expect(outline).toHaveLength(1);
    const line = outline[0]!;
    expect(line[0]).toEqual(line.at(-1));
    for (let i = 0; i + 1 < line.length; i++) {
      const [a, b] = [line[i]!, line[i + 1]!];
      const step = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * DEG;
      expect(step).toBeLessThanOrEqual(1.0001);
    }
    // Points a hair inside and outside of an outline point fall on both sides.
    const p = line[3]!;
    expect(distanceToOutline(outline, p)).toBeLessThan(1e-6);
    expect(distanceToOutline(outline, unitVector(88.792939, 7.407064))).toBeGreaterThan(1);
    expect(boundsOutline(bounds, "Ser")).toHaveLength(2);
  });

  it("finds a point inside every area, away from its edges", () => {
    for (const abbr of bounds.abbrs) {
      const { inner, radius, outline } = areaPlace(bounds, abbr);
      expect(boundsContain(bounds, abbr, inner), abbr).toBe(true);
      expect(distanceToOutline(outline, inner), abbr).toBeGreaterThan(0.3);
      expect(radius).toBeGreaterThan(2);
      expect(radius).toBeLessThan(70);
    }
    // Draco curls round Ursa Minor: its mean point is not in it.
    const dra = areaPlace(bounds, "Dra");
    expect(boundsContain(bounds, "Dra", dra.centre)).toBe(false);
  });
});
