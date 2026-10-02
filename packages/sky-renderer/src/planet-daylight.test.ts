import { describe, expect, it } from "vitest";
import { PLANET_DAYLIGHT_MARGIN, planetLimitingMagnitude } from "./limits";

// Typical magnitude ranges (JPL Horizons / Mallama & Hilton 2018): Venus −4.9…−3.8,
// Jupiter −2.9…−1.6, Mercury −2.5…+5 (≈ −1…+1 when observable), Mars −2.9…+1.9.
const VENUS_FAINTEST = -3.8;
const JUPITER_BRIGHTEST = -2.9;
const JUPITER_TYPICAL = -2.4;
const MERCURY_TYPICAL = -0.5;

const visible = (mag: number, starLimit: number, sun: number) =>
  mag <= planetLimitingMagnitude(starLimit, sun);

describe("planetLimitingMagnitude", () => {
  it("follows the stars at night, with the margin", () => {
    expect(planetLimitingMagnitude(4.9, -30)).toBe(4.9 + PLANET_DAYLIGHT_MARGIN);
    expect(planetLimitingMagnitude(4.9, -18)).toBe(4.9 + PLANET_DAYLIGHT_MARGIN);
  });

  it("leaves only Venus with the Sun high", () => {
    for (const sun of [10, 25, 60]) {
      const starLimit = 4.9 - 7; // full daylight on the map
      expect(visible(VENUS_FAINTEST, starLimit, sun)).toBe(true);
      expect(visible(JUPITER_BRIGHTEST, starLimit, sun)).toBe(false);
      expect(visible(MERCURY_TYPICAL, starLimit, sun)).toBe(false);
    }
  });

  it("shows Jupiter in twilight but not Mercury at sunrise", () => {
    const twilight = 4.9 - 7 * (12 / 18) ** 2; // Sun at −6°
    expect(visible(JUPITER_TYPICAL, twilight, -6)).toBe(true);
    expect(visible(MERCURY_TYPICAL, twilight, -6)).toBe(true);
    expect(visible(JUPITER_TYPICAL, -2.1, 0)).toBe(true);
    expect(visible(MERCURY_TYPICAL, -2.1, 0)).toBe(false);
  });

  it("decreases monotonically as the Sun rises", () => {
    let prev = Infinity;
    for (let sun = -30; sun <= 40; sun += 0.5) {
      const m = planetLimitingMagnitude(99, sun);
      expect(m).toBeLessThanOrEqual(prev);
      prev = m;
    }
  });
});
