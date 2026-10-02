import { describe, expect, it } from "vitest";
import { altitudeOf } from "./horizon";

// Positions J2000 (SIMBAD): Polaris 37.954561, +89.264109; Achernar 24.428523, −57.236753.
const PARIS = { latitude: 48.8566, longitude: 2.3522 };

describe("altitudeOf", () => {
  it("puts Polaris at the observer's latitude (within its 0.74° polar distance)", () => {
    for (const iso of ["2026-10-02T00:00:00Z", "2027-02-19T22:00:00Z", "2027-06-01T12:00:00Z"])
      expect(
        Math.abs(altitudeOf(37.954561, 89.264109, new Date(iso), PARIS) - 48.8566),
      ).toBeLessThan(0.8);
  });

  it("keeps a far-southern star below the Paris horizon all the time", () => {
    // Achernar never rises above 90° − 48.86° − 57.24° = −16.1° from Paris.
    for (let h = 0; h < 24; h += 3) {
      const date = new Date(Date.UTC(2027, 1, 19, h));
      expect(altitudeOf(24.428523, -57.236753, date, PARIS)).toBeLessThan(-15);
    }
  });
});
