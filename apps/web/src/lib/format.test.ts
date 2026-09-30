import { describe, expect, it } from "vitest";
import { formatDec, formatRa, parallaxToLightYears } from "./format";

describe("format", () => {
  it("formats Betelgeuse coordinates", () => {
    expect(formatRa(88.792871)).toBe("05h 55m 10.3s");
    expect(formatDec(7.407037)).toBe("+07° 24′ 25″");
  });

  it("converts Sirius parallax (379.21 mas) to ~8.6 ly", () => {
    expect(parallaxToLightYears(379.21)).toBeCloseTo(8.6, 1);
    expect(parallaxToLightYears(undefined)).toBeNull();
  });
});
