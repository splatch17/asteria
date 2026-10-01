import { describe, expect, it } from "vitest";
import { CoastlinesError, decodeCoastlines } from "./coastlines";

function encode(polylines: [number, number][][]): ArrayBuffer {
  const points = polylines.reduce((n, p) => n + p.length, 0);
  const buf = new ArrayBuffer(12 + (polylines.length + 1) * 4 + points * 4);
  const v = new DataView(buf);
  "ASTE".split("").forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
  v.setUint16(4, 1, true);
  v.setUint32(8, polylines.length, true);
  let o = 12;
  let index = 0;
  v.setUint32(o, 0, true);
  for (const pl of polylines) v.setUint32((o += 4), (index += pl.length), true);
  o += 4;
  for (const [lon, lat] of polylines.flat()) {
    v.setInt16(o, Math.round(lon * 100), true);
    v.setInt16(o + 2, Math.round(lat * 100), true);
    o += 4;
  }
  return buf;
}

describe("decodeCoastlines", () => {
  it("round-trips polylines at 0.01° resolution", () => {
    const { offsets, coords } = decodeCoastlines(
      encode([
        [
          [2.35, 48.86],
          [-5.5, 36.01],
        ],
        [
          [-179.99, -89.5],
          [180, 90],
          [0, 0],
        ],
      ]),
    );
    expect([...offsets]).toEqual([0, 2, 5]);
    expect(coords[0]).toBeCloseTo(2.35, 5);
    expect(coords[3]).toBeCloseTo(36.01, 5);
    expect(coords[6]).toBeCloseTo(180, 5);
  });

  it("rejects a bad header or a truncated buffer", () => {
    expect(() => decodeCoastlines(new ArrayBuffer(16))).toThrow(CoastlinesError);
    const ok = encode([
      [
        [0, 0],
        [1, 1],
      ],
    ]);
    expect(() => decodeCoastlines(ok.slice(0, ok.byteLength - 2))).toThrow(CoastlinesError);
  });
});
