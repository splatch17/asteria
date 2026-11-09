import { describe, expect, it } from "vitest";
import { bodyPosition, type Vec3 } from "@asteria/astro-core";
import {
  moonPhaseName,
  nightOf,
  showingOf,
  TONIGHT_BEST_MARGIN,
  TONIGHT_MIN_ALTITUDE,
  TONIGHT_SUN,
  topFigures,
  type Night,
} from "./tonight-list";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const sunAt = (observer: typeof PARIS) => (t: number) =>
  bodyPosition("Sun", new Date(t), observer).altitude;

describe("nightOf", () => {
  // A Sun on a 24 h sine: below −6° from 18:00 + δ to 06:00 − δ (t = 0 at noon).
  const amplitude = 40;
  const sine = (t: number) => amplitude * Math.cos((t / (24 * HOUR)) * 2 * Math.PI);
  const delta = (Math.asin(-TONIGHT_SUN / amplitude) / (2 * Math.PI)) * 24 * HOUR;

  it("finds the coming night from the afternoon, to the minute", () => {
    const night = nightOf(sine, 2 * HOUR)!;
    expect(night.now).toBe(false);
    expect(Math.abs(night.start - (6 * HOUR + delta))).toBeLessThanOrEqual(MINUTE);
    expect(Math.abs(night.end - (18 * HOUR - delta))).toBeLessThanOrEqual(MINUTE);
    expect(night.endless).toBe(false);
  });

  it("starts now when the night is under way", () => {
    const t0 = 11 * HOUR;
    const night = nightOf(sine, t0)!;
    expect(night.now).toBe(true);
    expect(night.start).toBe(t0);
    expect(Math.abs(night.end - (18 * HOUR - delta))).toBeLessThanOrEqual(MINUTE);
  });

  it("returns null under a Sun that does not set, and an endless night under one that does not rise", () => {
    expect(nightOf(() => 10, 0)).toBeNull();
    const polar = nightOf(() => -20, 0)!;
    expect(polar.endless).toBe(true);
    expect(polar.end - polar.start).toBe(24 * HOUR);
  });

  it("brackets the night of 9 November 2026 in Paris by the Sun at −6°", () => {
    // Reference: astronomy-engine SearchAltitude(-6°), itself checked against JPL Horizons in
    // astro-core; tolerance 2 minutes (10-minute grid refined to the minute).
    const noon = Date.UTC(2026, 10, 9, 12, 0);
    const night = nightOf(sunAt(PARIS), noon)!;
    const sun = sunAt(PARIS);
    expect(Math.abs(sun(night.start) - TONIGHT_SUN)).toBeLessThan(0.3);
    expect(Math.abs(sun(night.end) - TONIGHT_SUN)).toBeLessThan(0.3);
    // Both ends are in the dark, whatever the rounding to the minute.
    expect(sun(night.start)).toBeLessThan(TONIGHT_SUN);
    expect(sun(night.end)).toBeLessThan(TONIGHT_SUN);
    expect(new Date(night.start).getUTCHours()).toBe(16);
    expect(new Date(night.end).getUTCDate()).toBe(10);
    expect(night.end - night.start).toBeGreaterThan(13 * HOUR);
    expect(night.end - night.start).toBeLessThan(14 * HOUR);
  });
});

describe("showingOf", () => {
  const night: Night = { start: 0, end: 10 * HOUR, now: false, endless: false };
  // Rises through 0° at 2 h, tops at 30° at 5 h, sets at 8 h.
  const arc = (t: number) => ({
    altitude: 30 * Math.sin(((t - 2 * HOUR) / (6 * HOUR)) * Math.PI),
    azimuth: 90 + (t / HOUR) * 18,
  });

  it("gives the stretch above the minimum altitude and the highest moment", () => {
    const s = showingOf(arc, night)!;
    const up = (Math.asin(TONIGHT_MIN_ALTITUDE / 30) / Math.PI) * 6 * HOUR;
    expect(Math.abs(s.from - (2 * HOUR + up))).toBeLessThanOrEqual(MINUTE);
    expect(Math.abs(s.to - (8 * HOUR - up))).toBeLessThanOrEqual(MINUTE);
    expect(Math.abs(s.best - 5 * HOUR)).toBeLessThanOrEqual(10 * MINUTE);
    expect(s.altitude).toBeGreaterThan(29.8);
    expect(s.fromStart).toBe(false);
    expect(s.toEnd).toBe(false);
  });

  it("flags an object up from dusk or until dawn", () => {
    const high = showingOf(() => ({ altitude: 40, azimuth: 180 }), night)!;
    expect(high).toMatchObject({ from: 0, to: 10 * HOUR, fromStart: true, toEnd: true });
    const setting = showingOf((t) => ({ altitude: 20 - (t / HOUR) * 10, azimuth: 250 }), night)!;
    expect(setting.fromStart).toBe(true);
    expect(setting.toEnd).toBe(false);
    expect(Math.abs(setting.to - 1.5 * HOUR)).toBeLessThanOrEqual(MINUTE);
    // Low once the sky is dark (12.5° at the margin): its best moment is in the twilight, ten
    // minutes after dusk.
    expect(setting.best).toBe(10 * MINUTE);
    expect(setting.altitude).toBeCloseTo(20 - 10 / 6, 5);
  });

  it("takes the best moment away from dusk for an object that is then still well up", () => {
    const high = showingOf((t) => ({ altitude: 60 - (t / HOUR) * 10, azimuth: 250 }), night)!;
    expect(high.best).toBeGreaterThanOrEqual(TONIGHT_BEST_MARGIN);
    expect(high.best).toBeLessThan(TONIGHT_BEST_MARGIN + 10 * MINUTE);
    expect(high.altitude).toBeCloseTo(60 - (high.best / HOUR) * 10, 5);
  });

  it("returns null for an object that stays low", () => {
    expect(showingOf(() => ({ altitude: 3, azimuth: 0 }), night)).toBeNull();
  });

  it("keeps the longest of two stretches", () => {
    // Up for the first hour, down, then up from 4 h to the end.
    const twice = (t: number) => ({ altitude: t < HOUR || t > 4 * HOUR ? 20 : -20, azimuth: 0 });
    const s = showingOf(twice, night)!;
    expect(s.toEnd).toBe(true);
    expect(s.from).toBeGreaterThan(3.8 * HOUR);
  });
});

describe("moonPhaseName", () => {
  it("names the eight phases", () => {
    expect(moonPhaseName(0)).toBe("new");
    expect(moonPhaseName(357)).toBe("new");
    expect(moonPhaseName(45)).toBe("waxingCrescent");
    expect(moonPhaseName(90)).toBe("firstQuarter");
    expect(moonPhaseName(135)).toBe("waxingGibbous");
    expect(moonPhaseName(180)).toBe("full");
    expect(moonPhaseName(225)).toBe("waningGibbous");
    expect(moonPhaseName(270)).toBe("lastQuarter");
    expect(moonPhaseName(315)).toBe("waningCrescent");
    expect(moonPhaseName(-45)).toBe("waningCrescent");
  });
});

describe("topFigures", () => {
  it("lists the highest first and leaves out the low ones", () => {
    // Directions in J2000: the celestial pole (altitude = latitude from Paris), and its opposite.
    const centres: Record<string, Vec3> = { UMi: [0, 0, 1], Oct: [0, 0, -1], Cep: [0.3, 0, 0.954] };
    const picks = topFigures(
      centres,
      ["UMi", "Oct", "Cep", "Xxx"],
      new Date("2026-11-09T21:00Z"),
      PARIS,
      3,
    );
    expect(picks.map((p) => p.abbr)).not.toContain("Oct");
    expect(picks.length).toBe(2);
    expect(picks[0]!.altitude).toBeGreaterThanOrEqual(picks[1]!.altitude);
    const pole = picks.find((p) => p.abbr === "UMi")!;
    expect(Math.abs(pole.altitude - PARIS.latitude)).toBeLessThan(0.5);
  });
});
