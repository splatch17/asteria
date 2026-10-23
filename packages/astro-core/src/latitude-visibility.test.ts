import { describe, expect, it } from "vitest";
import file from "./data/constellation-bounds.json";
import {
  B1875,
  parseConstellationBounds,
  type ConstellationBoundsFile,
} from "./constellation-bounds";
import {
  areaSamplesOf,
  classifyConstellations,
  classifyRange,
  culmination,
  declinationRanges,
  maxAltitude,
  minAltitude,
  zoneLimits,
  zoneOf,
  zoneShares,
  zoneSharesOf,
  type SkyZone,
} from "./latitude-visibility";
import { applyMat3, j2000ToHorizontalMatrix, precessionMatrix, unitVector } from "./matrices";

const DEG = 180 / Math.PI;
const bounds = parseConstellationBounds(file as ConstellationBoundsFile);
const DATE = new Date("2026-10-22T00:00:00Z");
const ranges = declinationRanges(bounds, DATE);
const PARIS = 48.8566;

/** Abbreviations by zone, sorted. */
function byZone(lat: number): Record<SkyZone, string[]> {
  const out: Record<SkyZone, string[]> = { always: [], sometimes: [], never: [] };
  for (const [abbr, v] of Object.entries(classifyConstellations(ranges, lat)))
    out[v.zone].push(abbr);
  for (const list of Object.values(out)) list.sort();
  return out;
}

describe("altitudes of transit and zones (geometric horizon)", () => {
  // Reference: the app's J2000 → horizontal transform (precession of date, mean sidereal time,
  // tested against SOFA and JPL Horizons elsewhere), scanned minute by minute over a sidereal day.
  // SIMBAD J2000 positions (proper motion ignored: the formula and the scan use the same vector).
  const stars = {
    Sirius: [101.28715533, -16.71611586],
    Polaris: [37.95456067, 89.26410897],
    Canopus: [95.98795782, -52.69566138],
    Vega: [279.23473479, 38.78368896],
  } as const;
  for (const [name, [ra, dec]] of Object.entries(stars))
    for (const lat of [PARIS, 0, -33.87, 78.2])
      it(`${name} from ${lat}°: upper and lower transits within 0.02°`, () => {
        const v = unitVector(ra, dec);
        const decOfDate = Math.asin(applyMat3(precessionMatrix(DATE), v)[2]) * DEG;
        let lo = 90;
        let hi = -90;
        for (let m = 0; m < 1437; m++) {
          const t = new Date(DATE.getTime() + m * 60_000);
          const alt =
            Math.asin(
              applyMat3(j2000ToHorizontalMatrix(t, { latitude: lat, longitude: 2.35 }), v)[2],
            ) * DEG;
          lo = Math.min(lo, alt);
          hi = Math.max(hi, alt);
        }
        expect(maxAltitude(decOfDate, lat)).toBeCloseTo(hi, 1);
        expect(Math.abs(maxAltitude(decOfDate, lat) - hi)).toBeLessThan(0.02);
        expect(Math.abs(minAltitude(decOfDate, lat) - lo)).toBeLessThan(0.02);
      });

  it("Sirius culminates at ≈ 24.4° over Paris", () => {
    const decOfDate =
      Math.asin(applyMat3(precessionMatrix(DATE), unitVector(...stars.Sirius))[2]) * DEG;
    expect(maxAltitude(decOfDate, PARIS)).toBeCloseTo(24.4, 1);
  });

  it("puts the limits at ±(90° − |φ|), a grazing direction rising and setting", () => {
    expect(zoneLimits(PARIS)).toEqual({ limit: 90 - PARIS, visiblePole: 1 });
    expect(zoneLimits(-30).visiblePole).toBe(-1);
    expect(zoneLimits(0)).toEqual({ limit: 90, visiblePole: 0 });
    const limit = 90 - PARIS;
    expect(zoneOf(limit + 0.01, PARIS)).toBe("always");
    expect(zoneOf(limit, PARIS)).toBe("sometimes");
    expect(zoneOf(-limit, PARIS)).toBe("sometimes");
    expect(zoneOf(-limit - 0.01, PARIS)).toBe("never");
    expect(zoneOf(-limit - 0.01, -PARIS)).toBe("always");
    expect(zoneOf(limit + 0.01, -PARIS)).toBe("never");
    for (const d of [-90, -45, 0, 45, 90]) expect(zoneOf(d, 0)).toBe("sometimes");
  });

  it("gives each cap (1 − cos φ) / 2 of the sky, checked on 200 000 points", () => {
    const n = 200_000;
    for (const lat of [0, 23.44, PARIS, -66.56, 90]) {
      const count = { always: 0, sometimes: 0, never: 0 };
      for (let i = 0; i < n; i++) count[zoneOf(Math.asin(1 - (2 * (i + 0.5)) / n) * DEG, lat)]++;
      const shares = zoneShares(lat);
      for (const z of ["always", "sometimes", "never"] as const)
        expect(Math.abs(count[z] / n - shares[z]), `${lat} ${z}`).toBeLessThan(1e-4);
    }
    expect(zoneShares(90).always).toBeCloseTo(0.5, 12);
    expect(zoneShares(0).always).toBe(0);
    expect(zoneShares(PARIS).always).toBeCloseTo(0.171, 3);
  });
});

describe("declinations spanned by a constellation's area", () => {
  it("are the B1875 parallels of the boundaries at B1875", () => {
    const at1875 = declinationRanges(bounds, B1875);
    for (const abbr of bounds.abbrs) {
      const rings = bounds.rings.filter((r) => r.abbr === abbr);
      const decs = rings.flatMap((r) => [...r.dec]);
      const expected = {
        min: abbr === "Oct" ? -90 : Math.min(...decs),
        max: abbr === "UMi" ? 90 : Math.max(...decs),
      };
      expect(Math.abs(at1875[abbr]!.min - expected.min), abbr).toBeLessThan(1e-3);
      expect(Math.abs(at1875[abbr]!.max - expected.max), abbr).toBeLessThan(1e-3);
    }
  });

  it("hold every sample point of the area, whose extremes come within 0.6° (2026)", () => {
    const p = precessionMatrix(DATE);
    for (const abbr of ["Cru", "Ori", "UMa", "Ser", "Hya", "Cen", "Oct", "UMi", "Psc"]) {
      const decs = areaSamplesOf(bounds, abbr).map((v) => Math.asin(applyMat3(p, v)[2]) * DEG);
      const r = ranges[abbr]!;
      expect(Math.min(...decs), abbr).toBeGreaterThanOrEqual(r.min - 1e-3);
      expect(Math.max(...decs), abbr).toBeLessThanOrEqual(r.max + 1e-3);
      expect(Math.min(...decs) - r.min, abbr).toBeLessThan(0.6);
      expect(r.max - Math.max(...decs), abbr).toBeLessThan(0.6);
    }
  });

  it("include the celestial pole of date for Ursa Minor and Octans only", () => {
    expect(ranges.UMi!.max).toBe(90);
    expect(ranges.Oct!.min).toBe(-90);
    const poles = Object.entries(ranges).filter(([, r]) => r.max === 90 || r.min === -90);
    expect(poles.map(([a]) => a).sort()).toEqual(["Oct", "UMi"]);
  });

  it("follow precession: Crux was up over Paris 5 000 years ago", () => {
    const old = declinationRanges(bounds, new Date(Date.UTC(-2999, 0, 1)));
    expect(classifyRange(old.Cru!, PARIS).zone).toBe("sometimes");
    expect(classifyRange(ranges.Cru!, PARIS).zone).toBe("never");
  });
});

describe("constellations seen from a latitude", () => {
  it("from Paris: Ursa Minor always, Crux never, Orion part of the year", () => {
    const c = classifyConstellations(ranges, PARIS);
    expect(c.UMi).toEqual({ zone: "always", partlyHidden: false, partlyAlways: false });
    expect(c.Cru).toEqual({ zone: "never", partlyHidden: false, partlyAlways: false });
    expect(c.Ori).toEqual({ zone: "sometimes", partlyHidden: false, partlyAlways: false });
    // The Plough is circumpolar, the bear's feet are not; Centaurus is only seen in part.
    expect(c.UMa).toEqual({ zone: "sometimes", partlyHidden: false, partlyAlways: true });
    expect(c.Cen).toEqual({ zone: "sometimes", partlyHidden: true, partlyAlways: false });
    const z = byZone(PARIS);
    expect(z.always).toEqual(["Cam", "Cas", "Cep", "Dra", "UMi"]);
    expect(z.never).toHaveLength(20);
    expect(z.never).toContain("Oct");
    expect(z.sometimes).toHaveLength(63);
  });

  it("from the equator: none always up, none never up, none in part", () => {
    const c = classifyConstellations(ranges, 0);
    for (const [abbr, v] of Object.entries(c))
      expect(v, abbr).toEqual({ zone: "sometimes", partlyHidden: false, partlyAlways: false });
  });

  it("from the north pole: exactly the northern half of the sky", () => {
    const c = classifyConstellations(ranges, 90);
    for (const [abbr, v] of Object.entries(c)) {
      const r = ranges[abbr]!;
      if (r.min > 0) expect(v.zone, abbr).toBe("always");
      else if (r.max < 0) expect(v.zone, abbr).toBe("never");
      // Straddling the equator: its northern part never sets, its southern part never rises.
      else expect(v, abbr).toEqual({ zone: "sometimes", partlyHidden: true, partlyAlways: true });
    }
    const z = byZone(90);
    expect([z.always.length, z.sometimes.length, z.never.length]).toEqual([28, 15, 45]);
    expect(z.always).toContain("UMa");
    expect(z.sometimes).toContain("Ori");
    expect(z.never).toContain("Cru");
  });

  it("from the south pole: the mirror image", () => {
    const north = byZone(90);
    const south = byZone(-90);
    expect(south.always).toEqual(north.never);
    expect(south.never).toEqual(north.always);
  });

  it("from Sydney: the Cross reaches above its circumpolar limit, the Little Bear never rises", () => {
    const c = classifyConstellations(ranges, -33.87);
    expect(c.UMi!.zone).toBe("never");
    expect(c.Oct!.zone).toBe("always");
    // Crux's area tops out at −55.8°, just above the −56.1° limit.
    expect(c.Cru).toEqual({ zone: "sometimes", partlyHidden: false, partlyAlways: true });
  });

  it("finds where an area culminates", () => {
    // Orion's northern edge (+22.9°) culminates 64° high, due south, from Paris.
    const ori = culmination(ranges.Ori!, PARIS);
    expect(ori.side).toBe("south");
    expect(ori.altitude).toBeCloseTo(90 - (PARIS - ranges.Ori!.max), 6);
    expect(ori.altitude).toBeCloseTo(64.0, 0);
    expect(culmination(ranges.UMa!, PARIS).side).toBe("zenith");
    expect(culmination(ranges.UMi!, 20).side).toBe("north");
    expect(culmination(ranges.Cru!, PARIS).altitude).toBeLessThan(0);
  });

  it("measures the share of an area in each zone", () => {
    const cen = zoneSharesOf(areaSamplesOf(bounds, "Cen"), PARIS, DATE);
    expect(cen.always).toBe(0);
    expect(cen.never).toBeGreaterThan(0.5);
    expect(cen.never).toBeLessThan(0.7);
    expect(cen.sometimes + cen.never).toBeCloseTo(1, 12);
    const uma = zoneSharesOf(areaSamplesOf(bounds, "UMa"), PARIS, DATE);
    expect(uma.always).toBeGreaterThan(0.8);
    expect(zoneSharesOf(areaSamplesOf(bounds, "Ori"), PARIS, DATE).sometimes).toBe(1);
    expect(areaSamplesOf(bounds, "Cru").length).toBeGreaterThan(50);
  });
});
