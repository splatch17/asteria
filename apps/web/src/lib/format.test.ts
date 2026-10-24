import { describe, expect, it } from "vitest";
import {
  clockParts,
  decimalMark,
  formatDec,
  formatNumber,
  formatRa,
  placeParts,
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

  it("shows the reference distance, approximate when uncertain (#75)", () => {
    // Catalogue values (packages/sky-data/out/stars.json).
    // Sirius: Hipparcos 8.60 ± 0.04 ly → three significant figures.
    expect(starDistance({ distanceLy: 8.6, distanceErrorLy: 0.04 })).toEqual({
      ly: 8.6,
      errorLy: 0.04,
      approx: false,
    });
    // Deneb: Schiller & Przybilla 2008, 2 620 ± 220 ly → ≈ 2 600 ly (not 1 400 from Hipparcos).
    expect(starDistance({ distanceLy: 2620, distanceErrorLy: 220, plx: 2.31, ePlx: 0.32 })).toEqual(
      { ly: 2600, errorLy: 220, approx: true },
    );
    // Rigel: Hipparcos 863 ± 78 ly → ≈ 860 ly. Betelgeuse: Joyce et al. 2020, 548 ± 68 → ≈ 550.
    expect(starDistance({ distanceLy: 863, distanceErrorLy: 78 })).toMatchObject({
      ly: 860,
      approx: true,
    });
    expect(starDistance({ distanceLy: 548, distanceErrorLy: 68 })).toMatchObject({
      ly: 550,
      approx: true,
    });
    // Vega (Gaia/Hipparcos, ± 0.5 %): 25.0 ly.
    expect(starDistance({ distanceLy: 25.04, distanceErrorLy: 0.12 })).toMatchObject({ ly: 25 });
    // Error above half the distance, or no distance: nothing shown.
    expect(starDistance({ distanceLy: 3000, distanceErrorLy: 1600 })).toBeNull();
    expect(starDistance({})).toBeNull();
  });

  it("falls back to the parallax for a catalogue without reference distances", () => {
    // Deneb (Hipparcos 2007): 2.31 ± 0.32 mas → ≈ 1 400 ly.
    expect(starDistance({ plx: 2.31, ePlx: 0.32 })).toMatchObject({ ly: 1400, approx: true });
    expect(starDistance({ plx: 379.21, ePlx: 1.58 })).toMatchObject({ ly: 8.6, approx: false });
    expect(starDistance({ plx: 1.2, ePlx: 0.9 })).toBeNull();
    expect(starDistance({ plx: -0.5, ePlx: 0.9 })).toBeNull();
    // No error known: shown as is.
    expect(starDistance({ plx: 10 })).toEqual({ ly: 326, errorLy: null, approx: false });
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

describe("numbers in the reader's language (#198)", () => {
  it("writes a decimal comma and a true minus sign in French", () => {
    expect(formatNumber(0.45, 2)).toBe("0,45");
    expect(formatNumber(-1.456, 2)).toBe("−1,46");
    expect(formatNumber(1.5, 1, "en")).toBe("1.5");
    expect(formatNumber(12, 1)).toBe("12,0");
    expect(formatNumber(-0.001, 2)).toBe("0,00"); // Vega's B−V
  });
  it("gives the decimal mark of a language", () => {
    expect(decimalMark("fr")).toBe(",");
    expect(decimalMark("en")).toBe(".");
  });
  it("puts it in the seconds of a right ascension", () => {
    expect(formatRa(88.792871, ",")).toBe("05h 55m 10,3s");
  });
});

describe("a place by its coordinates (#198)", () => {
  it("rounds to the tenth of a degree, decimal comma, with its sides", () => {
    expect(placeParts(48.85, 2.35)).toEqual({ lat: "48,9", ns: "n", lon: "2,4", ew: "e" });
    expect(placeParts(-33.87, 151.21)).toEqual({ lat: "33,9", ns: "s", lon: "151,2", ew: "e" });
    expect(placeParts(40.71, -74.01, "en")).toEqual({ lat: "40.7", ns: "n", lon: "74.0", ew: "w" });
  });
  it("gives no south or west to a value shown as zero", () => {
    expect(placeParts(-0.01, -0.04)).toEqual({ lat: "0,0", ns: "n", lon: "0,0", ew: "e" });
  });
});

describe("clock (#198)", () => {
  it("gives the hour as written and the minutes on two digits", () => {
    expect(clockParts(new Date(2026, 9, 24, 20, 5))).toEqual({ h: "20", m: "05" });
    expect(clockParts(new Date(2026, 9, 25, 0, 35))).toEqual({ h: "0", m: "35" });
  });
});
