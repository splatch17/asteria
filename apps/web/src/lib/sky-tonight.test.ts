import { describe, expect, it } from "vitest";
import { unitVector } from "@asteria/astro-core";
import { zenithObserver } from "./games/geometry";
import { figureToSee, highestFigure, moonEvent, tonightLine } from "./sky-tonight";

const HOUR = 3_600_000;
const PARIS = { latitude: 48.8566, longitude: 2.3522 };
// 24 October 2026, 21:30 in Paris (CEST, UTC+2): the evening of the sketch.
const EVENING = new Date("2026-10-24T19:30:00Z");
// Figure centres, J2000 (approximate centres of the figures' stars).
const CENTRES = {
  Peg: unitVector(340, 20),
  Ori: unitVector(84, 3),
  Cru: unitVector(187, -60),
  UMa: unitVector(175, 55),
};

describe("« Ce soir » of the Ciel tab", () => {
  it("picks the figure at the zenith of a made-up observer (exact geometry)", () => {
    const observer = zenithObserver(CENTRES.Ori, EVENING);
    const pick = highestFigure(CENTRES, Object.keys(CENTRES), EVENING, observer)!;
    expect(pick.abbr).toBe("Ori");
    expect(pick.altitude).toBeGreaterThan(89.9); // tolerance 0.1°: precession of date vs J2000
  });

  it("names Pegasus high in the south from Paris on an October evening", () => {
    // Its centre (22 h 40 of right ascension) transits when the local sidereal time is 22 h 40; at
    // 21:30 CEST that day it is about 21 h 50 in Paris (GMST ≈ 21 h 43 at 19:30 UT, + 9 min of
    // longitude): 50 min before transit, about 60° high (90 − 48.9 + 20 = 61° at transit), a
    // little east of south.
    const pick = figureToSee(CENTRES, ["Peg", "Ori", "Cru"], EVENING, PARIS)!;
    expect(pick.abbr).toBe("Peg");
    expect(pick.altitude).toBeGreaterThan(55);
    expect(pick.altitude).toBeLessThan(65);
    expect(pick.azimuth).toBeGreaterThan(140);
    expect(pick.azimuth).toBeLessThan(180);
  });

  it("falls back to all the figures when no well-known one is high enough", () => {
    // From Paris the Southern Cross never rises: the highest of all is named instead.
    expect(figureToSee(CENTRES, ["Cru"], EVENING, PARIS)!.abbr).toBe("Peg");
    expect(highestFigure(CENTRES, ["Cru"], EVENING, PARIS)).toBeNull();
  });

  it("tells when the Moon sets, or rises tonight, to the minute", () => {
    const t0 = EVENING.getTime();
    // A made-up Moon, up at 10° and setting 6.2 h later (a cosine of period 24.8 h).
    const period = 24.8 * HOUR;
    const up = (t: number) => 10 * Math.cos((2 * Math.PI * (t - t0)) / period);
    const set = moonEvent(up, t0)!;
    expect(set.kind).toBe("sets");
    expect(Math.abs(set.at - (t0 + period / 4))).toBeLessThan(60_000);
    // Down now and rising 6.2 h later: within tonight.
    const down = (t: number) => -up(t);
    const rise = moonEvent(down, t0)!;
    expect(rise.kind).toBe("rises");
    expect(Math.abs(rise.at - (t0 + period / 4))).toBeLessThan(60_000);
    // Rising only after 18.6 h: not tonight.
    const late = (t: number) => -10 * Math.sin((2 * Math.PI * (t - t0)) / period) - 0.1;
    expect(moonEvent((t) => (t - t0 < 12 * HOUR ? -5 : late(t)), t0)).toBeNull();
  });

  it("speaks of now in the dark, of the coming night by day", () => {
    const common = {
      observer: PARIS,
      centres: CENTRES,
      known: ["Peg", "Ori"],
      moonAltitude: null,
    };
    const dark = tonightLine({ ...common, date: EVENING, sunAltitude: -25, nightStart: null });
    expect(dark).toMatchObject({ later: false, when: "evening", high: true, moon: null });
    expect(dark.at).toBe(EVENING);
    const noon = new Date("2026-10-24T10:00:00Z");
    const day = tonightLine({ ...common, date: noon, sunAltitude: 30, nightStart: EVENING });
    expect(day).toMatchObject({ later: true, at: EVENING });
    expect(day.figure?.abbr).toBe("Peg");
  });
});
