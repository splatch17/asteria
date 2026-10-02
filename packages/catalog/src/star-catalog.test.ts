import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BYTES_PER_STAR,
  StarCatalogError,
  decodeStarCatalog,
  encodeStarCatalog,
  type CatalogStar,
  type StarStrings,
} from "./index";

const ARCSEC = 1 / 3600;

// Hand-built sample covering edge cases (not reference data): RA wrap, poles, missing fields,
// extreme proper motion and parallax.
const SAMPLE: CatalogStar[] = [
  {
    hip: 32349,
    ra: 101.287155,
    dec: -16.716116,
    v: -1.44,
    bv: 0.009,
    plx: 379.21,
    ePlx: 1.58,
    pmRa: -546.01,
    pmDec: -1223.07,
    hd: 48915,
    hr: 2491,
    flamsteed: 9,
    name: "Sirius",
    bayer: "α CMa",
    con: "CMa",
    distanceLy: 8.6,
    distanceErrorLy: 0.04,
    distanceSource: "hipparcos",
    radialVelocity: -8,
    radialVelocitySource: "bsc5",
  },
  {
    hip: 102098,
    ra: 310.357979,
    dec: 45.280338,
    v: 1.25,
    con: "Cyg",
    distanceLy: 2620,
    distanceErrorLy: 220,
    distanceSource: "literature",
    distanceReference: "Schiller & Przybilla 2008, A&A 479, 849",
    radialVelocity: -4.5,
    radialVelocitySource: "gaia-dr3",
  },
  { hip: 1, ra: 359.999999, dec: 89.999999, v: 6.5, con: "UMi" },
  { hip: 2, ra: 0, dec: -90, v: 3.123, bv: -0.31, plx: -52.82, pmRa: 4168.31, con: "Oct" },
  { hip: 3, ra: 180.5, dec: 0.000001, v: 0, bv: 3.332, plx: 796.92, pmDec: -5813.62, con: "Vir" },
];
const CONS = ["CMa", "Cyg", "Oct", "UMi", "Vir"];

function expectClose(actual: CatalogStar[], expected: CatalogStar[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((a, i) => {
    const e = expected[i]!;
    const dra = ((a.ra - e.ra + 540) % 360) - 180;
    expect(Math.abs(dra) * Math.cos((e.dec * Math.PI) / 180)).toBeLessThan(0.1 * ARCSEC);
    expect(Math.abs(a.dec - e.dec)).toBeLessThan(0.1 * ARCSEC);
    expect(a.v).toBeCloseTo(e.v, 3);
    // Every other field is lossless.
    expect({ ...a, ra: e.ra, dec: e.dec }).toEqual(e);
  });
}

describe("star catalogue binary format", () => {
  it("round-trips a small catalogue", () => {
    const { buffer, strings } = encodeStarCatalog(SAMPLE, CONS);
    expect(BYTES_PER_STAR).toBe(51);
    expect(buffer.byteLength).toBe(16 + 4 * 4 + SAMPLE.length * BYTES_PER_STAR);
    expect(strings.name).toEqual({ 32349: "Sirius" });
    const decoded = decodeStarCatalog(buffer, strings);
    expectClose(decoded, SAMPLE);
    expect(decoded[2]).not.toHaveProperty("bv");
    expect(decoded[2]).not.toHaveProperty("hd");
    expect(decoded[2]).not.toHaveProperty("distanceLy");
    expect(decoded[2]).not.toHaveProperty("radialVelocity");
  });

  it("still decodes version 1 files (no distance, no radial velocity)", () => {
    const { buffer, strings } = encodeStarCatalog(SAMPLE, CONS, 1);
    expect(new DataView(buffer).getUint16(4, true)).toBe(1);
    expect(buffer.byteLength).toBe(16 + 4 * 4 + SAMPLE.length * 40);
    const v1 = SAMPLE.map((s) => {
      const copy: Partial<CatalogStar> = { ...s };
      delete copy.distanceLy;
      delete copy.distanceErrorLy;
      delete copy.distanceSource;
      delete copy.distanceReference;
      delete copy.radialVelocity;
      delete copy.radialVelocitySource;
      return copy as CatalogStar;
    });
    expectClose(decodeStarCatalog(buffer, strings), v1);
  });

  it("rejects an invalid header", () => {
    const { buffer, strings } = encodeStarCatalog(SAMPLE, CONS);
    const badMagic = buffer.slice(0);
    new DataView(badMagic).setUint8(0, 0x58);
    expect(() => decodeStarCatalog(badMagic, strings)).toThrow(StarCatalogError);

    const badVersion = buffer.slice(0);
    new DataView(badVersion).setUint16(4, 99, true);
    expect(() => decodeStarCatalog(badVersion, strings)).toThrow(/version/);

    expect(() => decodeStarCatalog(buffer.slice(0, buffer.byteLength - 1), strings)).toThrow(
      /truncated/,
    );
    expect(() => decodeStarCatalog(new ArrayBuffer(8), strings)).toThrow(StarCatalogError);
    const badStrings = { ...strings, version: 2 } as unknown as StarStrings;
    expect(() => decodeStarCatalog(buffer, badStrings)).toThrow(/string table/);
  });
});

const out = (file: string) => fileURLToPath(new URL(`../../sky-data/out/${file}`, import.meta.url));
const pipelineOutput = ["stars.bin", "star-strings.json", "stars.json"].every((f) =>
  existsSync(out(f)),
);

describe("pipeline output (packages/sky-data/out)", () => {
  it.skipIf(!pipelineOutput)(
    "stars.bin matches stars.json",
    () => {
      const bin = readFileSync(out("stars.bin"));
      const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
      const strings = JSON.parse(readFileSync(out("star-strings.json"), "utf-8")) as StarStrings;
      const json = JSON.parse(readFileSync(out("stars.json"), "utf-8")) as CatalogStar[];

      const decoded = decodeStarCatalog(buffer, strings);
      expect(decoded.length).toBe(json.length);
      let maxError = 0;
      decoded.forEach((d, i) => {
        const e = json[i]!;
        expect(d.hip).toBe(e.hip);
        const dra = Math.abs(((d.ra - e.ra + 540) % 360) - 180);
        maxError = Math.max(maxError, dra, Math.abs(d.dec - e.dec));
        expect(Math.abs(d.v - e.v)).toBeLessThanOrEqual(0.001);
        expect(d.name).toBe(e.name);
        expect(d.bayer).toBe(e.bayer);
        expect(d.con).toBe(e.con);
        for (const key of ["bv", "plx", "ePlx", "pmRa", "pmDec"] as const) {
          if (e[key] === undefined) expect(d[key]).toBeUndefined();
          else expect(d[key]).toBeCloseTo(e[key], 6);
        }
        // stars.json keeps the pipeline's short field names.
        const raw = e as unknown as Record<string, number | string | undefined>;
        expect(d.distanceLy).toBe(raw.dist);
        expect(d.distanceErrorLy).toBe(raw.eDist);
        expect(d.distanceReference).toBe(raw.distRef);
        expect(d.radialVelocity).toBe(raw.rv);
        const sources = { hip: "hipparcos", gaia: "gaia-dr3", lit: "literature", bsc: "bsc5" };
        expect(d.distanceSource).toBe(sources[raw.distSrc as keyof typeof sources]);
        expect(d.radialVelocitySource).toBe(sources[raw.rvSrc as keyof typeof sources]);
        expect([d.hd, d.hr, d.flamsteed]).toEqual([e.hd, e.hr, e.flamsteed]);
      });
      expect(maxError).toBeLessThan(0.1 * ARCSEC);
    },
    30_000,
  ); // ~9 000 stars × 20 expectations: slow when the whole suite runs in parallel
});
