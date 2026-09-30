import { describe, expect, it } from "vitest";
import { bvToTemperature, magnitudeToSize } from "./star-style";

describe("bvToTemperature", () => {
  it("gives ~5800 K for the Sun (B−V = 0.65)", () => {
    expect(Math.abs(bvToTemperature(0.65) - 5800)).toBeLessThan(150);
  });

  it("is hotter for bluer stars (Rigel B−V −0.03) than redder ones (Betelgeuse 1.85)", () => {
    expect(bvToTemperature(-0.03)).toBeGreaterThan(bvToTemperature(1.85));
  });
});

describe("magnitudeToSize", () => {
  it("is monotonic: brighter stars are larger", () => {
    expect(magnitudeToSize(-1.46)).toBeGreaterThan(magnitudeToSize(2));
  });

  it("clamps to the configured bounds", () => {
    expect(magnitudeToSize(10)).toBe(1);
    expect(magnitudeToSize(-30)).toBe(12);
  });
});
