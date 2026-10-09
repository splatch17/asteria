import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DeepSkyCatalogError,
  decodeDeepSkyCatalog,
  deepSkyTarget,
  loadDeepSkyCatalog,
  type DeepSkyObject,
} from "./deepsky-catalog";

const FIELDS = [
  "id",
  "type",
  "ra",
  "dec",
  "v",
  "b",
  "maj",
  "min",
  "pa",
  "con",
  "designations",
  "names",
];
const doc = (objects: unknown[]) => ({
  format: "asteria-deepsky",
  version: 1,
  fields: FIELDS,
  objects,
});
const M31 = [
  "M31",
  "galaxy",
  10.68479,
  41.26906,
  3.44,
  4.29,
  177.83,
  69.66,
  35,
  "And",
  ["M 31", "NGC 224"],
  ["Andromeda Galaxy"],
];
const B33 = [
  "B33",
  "dark-nebula",
  85.24583,
  -2.45833,
  null,
  null,
  6,
  4,
  90,
  "Ori",
  ["B 33"],
  ["Horsehead Nebula"],
];

describe("decodeDeepSkyCatalog", () => {
  it("decodes rows, Messier number and optional fields", () => {
    const [m31, b33] = decodeDeepSkyCatalog(doc([M31, B33]));
    expect(m31).toEqual({
      id: "M31",
      type: "galaxy",
      ra: 10.68479,
      dec: 41.26906,
      mag: 3.44,
      vMag: 3.44,
      bMag: 4.29,
      majorAxis: 177.83,
      minorAxis: 69.66,
      positionAngle: 35,
      con: "And",
      messier: 31,
      designations: ["M 31", "NGC 224"],
      names: ["Andromeda Galaxy"],
    } satisfies DeepSkyObject);
    expect(b33).not.toHaveProperty("mag");
    expect(b33).not.toHaveProperty("messier");
    expect(b33!.positionAngle).toBe(90);
  });

  it("falls back to the B magnitude", () => {
    const row = [...M31.slice(0, 4), null, 7.94, ...M31.slice(6)];
    expect(decodeDeepSkyCatalog(doc([row]))[0]!.mag).toBe(7.94);
  });

  it("rejects malformed documents", () => {
    expect(() => decodeDeepSkyCatalog({ ...doc([]), format: "x" })).toThrow(DeepSkyCatalogError);
    expect(() => decodeDeepSkyCatalog({ ...doc([]), version: 2 })).toThrow(/version/);
    expect(() => decodeDeepSkyCatalog({ ...doc([]), fields: FIELDS.slice(1) })).toThrow(/field/);
    expect(() => decodeDeepSkyCatalog(doc([M31, M31]))).toThrow(/duplicate/);
    expect(() => decodeDeepSkyCatalog(doc([M31.slice(1)]))).toThrow(/fields/);
    const badType = ["X", "comet", ...M31.slice(2)];
    expect(() => decodeDeepSkyCatalog(doc([badType]))).toThrow(/type/);
    const badRa = [...M31.slice(0, 2), 360, ...M31.slice(3)];
    expect(() => decodeDeepSkyCatalog(doc([badRa]))).toThrow(/position/);
  });

  it("gives the search target of an object", () => {
    expect(deepSkyTarget({ id: "M31" })).toEqual({ kind: "deepsky", id: "M31" });
  });

  it("loads over fetch", async () => {
    const ok = async () => ({ ok: true, status: 200, json: async () => doc([M31]) });
    expect((await loadDeepSkyCatalog("data/deepsky.json", ok))[0]!.id).toBe("M31");
    const missing = async () => ({ ok: false, status: 404, json: async () => null });
    await expect(loadDeepSkyCatalog("data/deepsky.json", missing)).rejects.toThrow(/404/);
  });
});

// Generated catalogue (packages/sky-data/out, not versioned): skipped when the pipeline has not run.
const out = fileURLToPath(new URL("../../sky-data/out/deepsky.json", import.meta.url));

const RAD = Math.PI / 180;
function sepArcmin(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const h =
    Math.sin(((dec2 - dec1) * RAD) / 2) ** 2 +
    Math.cos(dec1 * RAD) * Math.cos(dec2 * RAD) * Math.sin(((ra2 - ra1) * RAD) / 2) ** 2;
  return ((2 * Math.asin(Math.sqrt(h))) / RAD) * 60;
}
const hms = (h: number, m: number, s: number) => 15 * (h + m / 60 + s / 3600);
const dms = (sign: number, d: number, m: number, s: number) => sign * (d + m / 60 + s / 3600);

describe.skipIf(!existsSync(out))("generated deep-sky catalogue (packages/sky-data/out)", () => {
  const objects = existsSync(out)
    ? decodeDeepSkyCatalog(JSON.parse(readFileSync(out, "utf-8")))
    : [];
  const byId = new Map(objects.map((o) => [o.id, o]));

  it("holds the 110 Messier numbers", () => {
    const messier = objects.flatMap((o) => o.designations).filter((d) => /^M \d+$/.test(d));
    expect(messier.map((d) => Number(d.slice(2))).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 110 }, (_, i) => i + 1),
    );
    expect(byId.get("M101")!.designations).toContain("M 102");
  });

  // SIMBAD coordinates (ICRS J2000), tolerance 1′: same constants as build_deepsky.py.
  it.each([
    ["M31", hms(0, 42, 44.33), dms(1, 41, 16, 7.5), "galaxy"],
    ["M42", hms(5, 35, 17.3), dms(-1, 5, 23, 28), "cluster-nebula"],
    ["M1", hms(5, 34, 31.94), dms(1, 22, 0, 52.2), "supernova-remnant"],
    ["M13", hms(16, 41, 41.634), dms(1, 36, 27, 40.75), "globular-cluster"],
    ["M45", hms(3, 47, 29.0765), dms(1, 24, 6, 18.494), "open-cluster"], // OpenNGC centre: Alcyone
  ] as const)("%s within 1′ of SIMBAD", (id, ra, dec, type) => {
    const o = byId.get(id)!;
    expect(sepArcmin(o.ra, o.dec, ra, dec)).toBeLessThanOrEqual(1);
    expect(o.type).toBe(type);
  });
});
