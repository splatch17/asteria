import { describe, expect, it } from "vitest";
import { bodyPosition, type SolarSystemBody } from "@asteria/astro-core";
import { horizontalOf, nextRiseOf } from "./horizon";
import { RiseMemo, darkBelow, sightOf } from "./sight";

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const FROM = Date.parse("2026-10-24T19:30:00Z");

// Reference: Skyfield 1.55 / JPL DE421, geometric rising at 0° from Paris
// (tools/rise-reference/build_rise_reference.py). bodyPosition (astronomy-engine) gives the
// apparent altitude without refraction, like Skyfield's: the tolerance is one minute, the
// precision of the time the sheet shows.
describe("nextRiseOf the Sun, Moon and planets (#201)", () => {
  it.each([
    ["Sun", "2026-10-25T06:31:38Z"],
    ["Moon", "2026-10-25T16:03:26Z"],
    ["Venus", "2026-10-25T06:42:36Z"],
    ["Mars", "2026-10-24T23:22:56Z"],
    ["Jupiter", "2026-10-25T00:12:47Z"],
    ["Saturn", "2026-10-25T16:08:00Z"],
  ] as const)("%s rises within a minute of Skyfield", (body, iso) => {
    const alt = (t: number) => bodyPosition(body as SolarSystemBody, new Date(t), PARIS).altitude;
    const rise = nextRiseOf(alt, FROM);
    expect(Math.abs(rise! - Date.parse(iso))).toBeLessThan(60_000);
  });
});

describe("horizontalOf (#201)", () => {
  it("agrees with astro-core's bodyPosition on the azimuth and altitude of Jupiter", () => {
    for (const iso of ["2026-10-24T19:30:00Z", "2026-10-25T04:00:00Z"]) {
      const date = new Date(iso);
      const p = bodyPosition("Jupiter", date, PARIS);
      const h = horizontalOf(p.ra, p.dec, date, PARIS);
      // bodyPosition is of date with nutation and aberration, horizontalOf mean J2000 → of date.
      expect(Math.abs(h.altitude - p.altitude)).toBeLessThan(0.02);
      expect(Math.abs(h.azimuth - p.azimuth)).toBeLessThan(0.05);
    }
  });
  it("puts Polaris due north, in [0, 360)", () => {
    const h = horizontalOf(37.954561, 89.264109, new Date(FROM), PARIS);
    expect(Math.min(h.azimuth, 360 - h.azimuth)).toBeLessThan(1.2);
    expect(h.azimuth).toBeGreaterThanOrEqual(0);
    expect(h.azimuth).toBeLessThan(360);
  });
});

describe("sightOf (#201)", () => {
  const up = { altitude: 30, azimuth: 135, rise: () => null };
  it("says visible only when the Sun is low enough for the object's brightness", () => {
    // Sirius (−1.4) at the end of civil twilight; a 4.8 star needs a dark sky.
    expect(sightOf({ ...up, sunAltitude: -7, darkBelow: darkBelow("star", -1.4) }).state).toBe(
      "visible",
    );
    expect(sightOf({ ...up, sunAltitude: -7, darkBelow: darkBelow("star", 4.8) }).state).toBe(
      "daylight",
    );
    expect(sightOf({ ...up, sunAltitude: -13, darkBelow: darkBelow("star", 2.5) }).state).toBe(
      "visible",
    );
    expect(sightOf({ ...up, sunAltitude: -15, darkBelow: darkBelow("deepsky") }).state).toBe(
      "daylight",
    );
    // The Moon by day.
    expect(sightOf({ ...up, sunAltitude: 30, darkBelow: darkBelow("moon") }).state).toBe("visible");
  });
  it("searches the rising only when the object is down", () => {
    let searched = 0;
    const rise = () => (searched++, 1000);
    expect(sightOf({ altitude: 10, azimuth: 0, sunAltitude: -20, darkBelow: -6, rise })).toEqual({
      state: "visible",
      altitude: 10,
      azimuth: 0,
    });
    expect(searched).toBe(0);
    expect(sightOf({ altitude: -10, azimuth: 0, sunAltitude: -20, darkBelow: -6, rise })).toEqual({
      state: "rises",
      at: 1000,
    });
    const never = sightOf({
      altitude: -10,
      azimuth: 0,
      sunAltitude: 0,
      darkBelow: -6,
      rise: () => null,
    });
    expect(never).toEqual({ state: "down" });
  });
});

describe("RiseMemo (#201)", () => {
  it("reuses the rising while the date moves on towards it, and searches again otherwise", () => {
    const memo = new RiseMemo();
    let searches = 0;
    const search = (from: number) => (searches++, from + 5 * 3_600_000);
    const t0 = 1_000_000;
    const at = memo.get("star:1", t0, search);
    expect(memo.get("star:1", t0 + 60_000, search)).toBe(at); // a minute later
    expect(searches).toBe(1);
    memo.get("star:1", t0 - 60_000, search); // backwards
    expect(searches).toBe(2);
    memo.get("star:2", t0, search); // another object
    expect(searches).toBe(3);
    memo.get("star:2", t0 + 2 * 3_600_000, search); // more than an hour later
    expect(searches).toBe(4);
  });
});
