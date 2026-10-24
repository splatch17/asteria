import { describe, expect, it } from "vitest";
import { rgb, washColor, zonePixels } from "./latitude-sphere";

/** ImageData pixel (little-endian ABGR) → [r, g, b, a]. */
const unpack = (p: number) => [p & 255, (p >>> 8) & 255, (p >>> 16) & 255, p >>> 24];

describe("zone washes (#197)", () => {
  const always = { color: "#63c2b0", alpha: 0.3 };
  const never = { color: "#e0745a", alpha: 0.28 };

  it("reads hex and computed rgb() colours", () => {
    expect(rgb("#63c2b0")).toEqual([99, 194, 176]);
    expect(rgb(" rgb(166, 27, 17)")).toEqual([166, 27, 17]);
    expect(rgb("#f00")).toEqual([255, 0, 0]);
  });

  it("writes a wash as a translucent CSS colour", () => {
    expect(washColor(always)).toBe("rgba(99, 194, 176, 0.3)");
    expect(washColor(never, 0.5)).toBe("rgba(224, 116, 90, 0.14)");
  });

  it("leaves the band that rises and sets clear, front and back", () => {
    expect(zonePixels(always, never)[0]).toBe(0);
  });

  it("paints a front cap at its wash, a back one through the glass more faintly", () => {
    const px = zonePixels(always, never);
    const front = unpack(px[1 * 3 + 0]!);
    expect(front.slice(0, 3)).toEqual([99, 194, 176]);
    expect(front[3]).toBe(Math.round(0.3 * 255));
    const back = unpack(px[0 * 3 + 2]!);
    expect(back.slice(0, 3)).toEqual([224, 116, 90]);
    expect(back[3]! / 255).toBeLessThan(0.28 / 2);
    expect(back[3]).toBeGreaterThan(0);
  });

  it("lays the front wash over the back one where both are seen", () => {
    const [r, g, b, a] = unpack(zonePixels(always, never)[1 * 3 + 2]!);
    // More opaque than either alone, and leaning to the front colour.
    expect(a! / 255).toBeGreaterThan(0.3);
    expect(g).toBeGreaterThan(116);
    expect(r).toBeLessThan(224);
    expect(b).toBeGreaterThan(90);
  });

  it("keeps the night's two strengths of the same red apart", () => {
    const red = "#a61b11";
    const px = zonePixels({ color: red, alpha: 0.3 }, { color: red, alpha: 0.1 });
    expect(unpack(px[3]!)[3]).toBeGreaterThan(unpack(px[6]!)[3]! * 2.5);
  });
});
