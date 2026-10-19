import { describe, expect, it } from "vitest";
import {
  DAYLIGHT_EXTINCTION,
  dayInkAlpha,
  daylightFactor,
  physicalStarLimit,
  starsHiddenByDaylight,
} from "./daylight";
import { limitingMagnitude, planetLimitingMagnitude } from "./limits";
import { STAR_SHOWN_MARGIN, starPickLimit } from "./pick";

const FOV = 100;
const NIGHT = limitingMagnitude(FOV);
// SIMBAD V magnitudes: Sirius −1.46, Polaris 1.98.
const SIRIUS = -1.46;
const POLARIS = 1.98;

describe("daylightFactor", () => {
  it("is 0 at night, 1 from sunrise, quadratic in between", () => {
    expect(daylightFactor(-30)).toBe(0);
    expect(daylightFactor(-18)).toBe(0);
    expect(daylightFactor(-9)).toBeCloseTo(0.25, 12);
    expect(daylightFactor(0)).toBe(1);
    expect(daylightFactor(45)).toBe(1);
  });
});

describe("stars by day (#106, #162)", () => {
  it("keeps Polaris drawn and pickable at noon: the stars' limit is the night one", () => {
    // The map feeds uLimitMag with the field's limit whatever the Sun (sky-map.ts render).
    const shown = (mag: number) => mag <= NIGHT + STAR_SHOWN_MARGIN;
    const pickable = (mag: number) => mag <= starPickLimit(NIGHT, NIGHT);
    expect(shown(POLARIS) && pickable(POLARIS)).toBe(true);
    expect(shown(SIRIUS) && pickable(SIRIUS)).toBe(true);
    // Physically, daylight would have drowned Polaris (only mag ≲ −1 remain at full day).
    expect(POLARIS <= physicalStarLimit(NIGHT, daylightFactor(40)) + STAR_SHOWN_MARGIN).toBe(false);
    expect(physicalStarLimit(NIGHT, 1)).toBeCloseTo(NIGHT - DAYLIGHT_EXTINCTION, 12);
  });

  it("leaves the planets on the physical rule (Venus only at noon)", () => {
    const limit = planetLimitingMagnitude(physicalStarLimit(NIGHT, daylightFactor(30)), 30);
    expect(-3.8 <= limit).toBe(true); // Venus at its faintest
    expect(-2.9 <= limit).toBe(false); // Jupiter at its brightest
  });
});

describe("starsHiddenByDaylight", () => {
  it("says so once daylight takes a magnitude from the stars (nautical twilight)", () => {
    expect(starsHiddenByDaylight(-18)).toBe(false);
    expect(starsHiddenByDaylight(-12)).toBe(false);
    expect(starsHiddenByDaylight(-11)).toBe(true);
    expect(starsHiddenByDaylight(-6)).toBe(true);
    expect(starsHiddenByDaylight(40)).toBe(true);
  });
});

describe("dayInkAlpha", () => {
  it("is the night opacity at night and rises by day, never above 1", () => {
    expect(dayInkAlpha(0.55, 0)).toBe(0.55);
    expect(dayInkAlpha(0.55, 1)).toBeCloseTo(0.82, 12);
    expect(dayInkAlpha(1, 1)).toBe(1);
    expect(dayInkAlpha(0.45, 2)).toBe(dayInkAlpha(0.45, 1));
    let prev = 0;
    for (let d = 0; d <= 1; d += 0.1) {
      const a = dayInkAlpha(0.45, d);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});
