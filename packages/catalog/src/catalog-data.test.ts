/**
 * Checks on the generated catalogue (packages/sky-data/out, not versioned: skipped when the
 * pipeline has not run). Reference distances (#75) and radial velocities (#79) as the app sees
 * them, through the TypeScript decoder. The display rules are tested in apps/web (format.test.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  propagateDirections,
  propagateStar,
  starMotion,
  yearsSinceHipparcos,
  type Equatorial,
  type Vec3,
} from "@asteria/astro-core";
import { decodeStarCatalog, type CatalogStar, type StarStrings } from "./index";

const out = (file: string) => fileURLToPath(new URL(`../../sky-data/out/${file}`, import.meta.url));
const available = existsSync(out("stars.bin")) && existsSync(out("star-strings.json"));

function load(): Map<number, CatalogStar> {
  const bin = readFileSync(out("stars.bin"));
  const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const strings = JSON.parse(readFileSync(out("star-strings.json"), "utf-8")) as StarStrings;
  return new Map(decodeStarCatalog(buffer, strings).map((s) => [s.hip, s]));
}

const RAD = Math.PI / 180;
function sepArcsec(a: Equatorial, b: Equatorial): number {
  const dd = (b.dec - a.dec) * RAD;
  const da = (b.ra - a.ra) * RAD;
  const h =
    Math.sin(dd / 2) ** 2 + Math.cos(a.dec * RAD) * Math.cos(b.dec * RAD) * Math.sin(da / 2) ** 2;
  return (2 * Math.asin(Math.sqrt(h)) * 180 * 3600) / Math.PI;
}

describe.skipIf(!available)("generated catalogue (packages/sky-data/out)", () => {
  const stars = available ? load() : new Map<number, CatalogStar>();

  // Reference values and tolerances: docs/DATA_SOURCES.md, build_stars.py CONTROL_DISTANCES.
  it.each([
    ["Sirius", 32349, 8.6, 0.005, "hipparcos"], // Hipparcos 2007, 379.21 ± 1.58 mas
    ["Rigel", 24436, 860, 0.1, "hipparcos"], // Hipparcos 2007, 3.78 ± 0.34 mas
    ["Betelgeuse", 27989, 548, 0.05, "literature"], // Joyce et al. 2020, 168 +27/−15 pc
    ["Deneb", 102098, 2600, 0.1, "literature"], // Schiller & Przybilla 2008, 802 ± 66 pc
  ] as const)("%s: reference distance", (_, hip, ly, tol, source) => {
    const s = stars.get(hip)!;
    expect(Math.abs(s.distanceLy! / ly - 1)).toBeLessThanOrEqual(tol);
    expect(s.distanceSource).toBe(source);
    expect(s.distanceErrorLy).toBeGreaterThan(0);
  });

  it("cites the published distances", () => {
    expect(stars.get(102098)!.distanceReference).toMatch(/^Schiller & Przybilla 2008/);
    expect(stars.get(27989)!.distanceReference).toMatch(/^Joyce et al. 2020/);
    expect(stars.get(32349)!.distanceReference).toBeUndefined();
  });

  it("α Cen A: radial velocity, and the shaders' propagation at +13 000 years", () => {
    const cen = stars.get(71683)!;
    expect(cen.radialVelocity).toBeCloseTo(-22, 0); // BSC5 (SIMBAD −21.4)
    const v: Vec3[] = [[0, 0, 0]];
    propagateDirections(starMotion([cen]), 13_000, v);
    const [x, y, z] = v[0]!;
    const gpu = { ra: (Math.atan2(y, x) / RAD + 360) % 360, dec: Math.asin(z) / RAD };
    expect(sepArcsec(gpu, propagateStar(cen, 13_000))).toBeLessThan(0.05);
  });

  it("current positions: the radial term moves no star by more than 0.15″ in 2026", () => {
    const t = yearsSinceHipparcos(new Date("2026-10-02T00:00:00Z"));
    const over: number[] = [];
    let max = 0;
    for (const s of stars.values()) {
      if (s.radialVelocity === undefined) continue;
      const shift = sepArcsec(propagateStar(s, t), propagateStar({ ...s, radialVelocity: 0 }, t));
      max = Math.max(max, shift);
      if (shift >= 0.1) over.push(s.hip);
    }
    expect(max).toBeLessThan(0.15);
    // Only 61 Cyg A and B (μ = 5.2″/yr at 11.4 ly): 0.12″, which SIMBAD and Gaia include too.
    expect(over.sort()).toEqual([104214, 104217]);
  });
});
