import { describe, expect, it } from "vitest";
import { EPHEMERIS_RANGE_YEARS, ephemerisReliable } from "./ephemeris-range";

/** A date `years` Julian years from J2000 (works for negative years too). */
const fromJ2000 = (years: number) =>
  new Date(Date.UTC(2000, 0, 1, 12) + years * 365.25 * 86_400_000);

describe("ephemeris range of the Moon and planets", () => {
  it("is ±3 000 years around J2000", () => {
    expect(EPHEMERIS_RANGE_YEARS).toBe(3000);
    expect(ephemerisReliable(new Date("2026-10-02T00:00:00Z"))).toBe(true);
    expect(ephemerisReliable(fromJ2000(2999))).toBe(true);
    expect(ephemerisReliable(fromJ2000(-2999))).toBe(true);
    expect(ephemerisReliable(fromJ2000(3001))).toBe(false);
    expect(ephemerisReliable(fromJ2000(-3001))).toBe(false);
  });

  it("hides them at both ends of the 26 000-year scale", () => {
    expect(ephemerisReliable(fromJ2000(13_000))).toBe(false);
    expect(ephemerisReliable(fromJ2000(-13_000))).toBe(false);
  });
});
