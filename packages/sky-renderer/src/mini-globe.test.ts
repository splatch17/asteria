import { describe, expect, it } from "vitest";
import { bodyPosition, subsolarPoint, unitVector, type Vec3 } from "@asteria/astro-core";
import {
  bayer8,
  engravedInk,
  lightsDensity,
  orthographicNormal,
  sunEarthFixed,
} from "./mini-globe";

const DEG = Math.PI / 180;

describe("bayer8", () => {
  it("is the 8×8 ordered-dither matrix: 64 distinct thresholds k/64", () => {
    const seen = new Set<number>();
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const t = bayer8(x, y);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(1);
        expect(Number.isInteger(t * 64)).toBe(true);
        seen.add(t);
      }
    expect(seen.size).toBe(64);
  });

  it("tiles every 8 cells", () => {
    expect(bayer8(3, 5)).toBe(bayer8(11, 13));
  });
});

describe("engraved ink", () => {
  it("shows the relief by day and the lights by night, as the Earth view", () => {
    expect(engravedInk(0.6, 0.9, 1)).toBeCloseTo(0.6 * 0.85 + 0.05, 9);
    expect(engravedInk(0.6, 0.9, -1)).toBeCloseTo(0.9 * 0.95, 9);
    expect(engravedInk(0.6, 0, -1)).toBe(0);
    // Twilight band: some ink even on dark unlit ground at the terminator.
    expect(engravedInk(0, 0, 0)).toBeGreaterThan(0.1);
  });

  it("thresholds city lights from their sharp and blurred samples", () => {
    expect(lightsDensity(0.2, 0.2)).toBe(0);
    expect(lightsDensity(0.8, 0.2)).toBe(1);
    expect(lightsDensity(0.2, 0.6)).toBeCloseTo(0.7, 9);
  });
});

describe("orthographic globe", () => {
  const n: Vec3 = [0, 0, 0];
  it("has the observer at the centre, north up and east right", () => {
    const [lat, lon] = [48.8566, 2.3522];
    expect(orthographicNormal(0, 0, lat, lon, n)).toBe(true);
    const up = unitVector(lon, lat); // same formula as a geographic unit vector
    for (let i = 0; i < 3; i++) expect(n[i]).toBeCloseTo(up[i]!, 12);
    orthographicNormal(0, 1, lat, lon, n); // top edge: 90° north of the observer
    expect(Math.asin(n[2]) / DEG).toBeCloseTo(90 - lat, 9);
    orthographicNormal(0.5, 0, 0, 0, n); // right of an observer at (0, 0): east
    expect(Math.atan2(n[1], n[0]) / DEG).toBeCloseTo(30, 9);
  });

  it("is empty outside the disc", () => {
    expect(orthographicNormal(0.8, 0.8, 0, 0, n)).toBe(false);
  });
});

describe("Sun in the Earth-fixed frame", () => {
  // Reference: subsolar point from astronomy-engine (apparent Sun, apparent sidereal time).
  // Ours uses the astrometric J2000 direction, mean precession and mean sidereal time, as the
  // Earth view does: they differ by aberration and nutation (≈ 0.01°). Tolerance 0.05°.
  for (const iso of ["2026-03-20T14:46:00Z", "2026-06-21T08:24:00Z", "2026-12-21T20:50:00Z"]) {
    it(`points at the subsolar point (${iso})`, () => {
      const date = new Date(iso);
      const sun = bodyPosition("Sun", date, { latitude: 0, longitude: 0 });
      const d = sunEarthFixed(unitVector(sun.ra, sun.dec), date);
      const ref = subsolarPoint(date);
      const lat = Math.asin(d[2]) / DEG;
      const lon = Math.atan2(d[1], d[0]) / DEG;
      expect(Math.abs(lat - ref.latitude)).toBeLessThan(0.05);
      expect(Math.abs(((lon - ref.longitude + 540) % 360) - 180)).toBeLessThan(0.05);
    });
  }
});
