import { describe, expect, it } from "vitest";
import {
  formatDec,
  formatRa,
  greekRuns,
  parallaxToLightYears,
  starDistance,
  yearLabel,
} from "./format";

describe("format", () => {
  it("formats Betelgeuse coordinates", () => {
    expect(formatRa(88.792871)).toBe("05h 55m 10.3s");
    expect(formatDec(7.407037)).toBe("+07° 24′ 25″");
  });

  it("rounds before splitting into minutes and seconds", () => {
    // 7° 24′ 59.98″: rounds up to 25′ 00″ (not 24′ 00″).
    expect(formatDec(7.41666)).toBe("+07° 25′ 00″");
    expect(formatDec(-0.99999)).toBe("−01° 00′ 00″");
    // 5 h 55 m 59.96 s: never "60.0s".
    expect(formatRa((5 + 55 / 60 + 59.96 / 3600) * 15)).toBe("05h 56m 00.0s");
    // 23 h 59 m 59.97 s wraps to 0 h.
    expect(formatRa((24 - 0.03 / 3600) * 15)).toBe("00h 00m 00.0s");
    expect(formatRa(-15)).toBe("23h 00m 00.0s");
  });

  it("converts Sirius parallax (379.21 mas) to ~8.6 ly", () => {
    expect(parallaxToLightYears(379.21)).toBeCloseTo(8.6, 1);
    expect(parallaxToLightYears(undefined)).toBeNull();
  });

  it("marks distances from imprecise parallaxes as approximate", () => {
    // Sirius: 379.21 ± 1.58 mas → exact.
    expect(starDistance(379.21, 1.58)).toEqual({ ly: 9, approx: false });
    // Deneb (Hipparcos 2007): 2.31 ± 0.32 mas → ≈ 1 400 ly.
    expect(starDistance(2.31, 0.32)).toEqual({ ly: 1400, approx: true });
    // Betelgeuse: 6.55 ± 0.83 mas → ≈ 500 ly.
    expect(starDistance(6.55, 0.83)).toEqual({ ly: 500, approx: true });
    // Error larger than half the parallax: no distance.
    expect(starDistance(1.2, 0.9)).toBeNull();
    expect(starDistance(-0.5, 0.9)).toBeNull();
    // No error known: shown as is.
    expect(starDistance(10, undefined)).toEqual({ ly: 326, approx: false });
  });

  it("keeps Greek letters apart from the rest of a designation", () => {
    expect(greekRuns("HIP 27989 // α Ori")).toEqual([
      { text: "HIP 27989 // ", greek: false },
      { text: "α", greek: true },
      { text: " Ori", greek: false },
    ]);
    expect(greekRuns("α¹ Cen")).toEqual([
      { text: "α¹", greek: true },
      { text: " Cen", greek: false },
    ]);
    expect(greekRuns("Deneb")).toEqual([{ text: "Deneb", greek: false }]);
  });

  it("labels years before our era", () => {
    expect(yearLabel(2026)).toEqual({ key: "time.year", year: 2026 });
    expect(yearLabel(-1974)).toEqual({ key: "time.yearBce", year: 1975 });
    expect(yearLabel(0)).toEqual({ key: "time.yearBce", year: 1 });
  });
});
