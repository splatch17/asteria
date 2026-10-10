import { describe, expect, it } from "vitest";
import {
  POINT_OF_VIEW_DEMOS,
  RANGES,
  advance,
  clampOffset,
  dateAt,
  offsetParts,
  restartOffset,
  speedIndexOf,
} from "./timeline";

describe("timeline", () => {
  const anchor = new Date("2026-10-01T22:00:00Z");

  it("moves in milliseconds for the 48 h range", () => {
    expect(dateAt(anchor, -3_600_000, "48h").toISOString()).toBe("2026-10-01T21:00:00.000Z");
  });

  it("keeps the calendar date and time of day in the precession range", () => {
    expect(dateAt(anchor, 12_000, "26ky").toISOString()).toBe("+014026-10-01T22:00:00.000Z");
  });

  it("clamps to the range", () => {
    expect(clampOffset(1e12, "48h")).toBe(RANGES["48h"].half);
    expect(clampOffset(-99_999, "26ky")).toBe(-13_000);
  });

  it("splits offsets for display", () => {
    expect(offsetParts(-(26 * 3_600_000 + 5 * 60_000), "48h")).toEqual({
      sign: "−",
      days: 1,
      hours: 2,
      minutes: 5,
    });
    expect(offsetParts(2500.4, "26ky")).toEqual({ sign: "+", years: 2500 });
  });

  const DAY = 86_400_000;
  const HOUR = 3_600_000;

  it("keeps the wall-clock time over whole days of the one-year range", () => {
    // 22:00 local time on 1 Oct, 60 days later: still 22:00 local, whatever the DST change.
    const local = new Date(2026, 9, 1, 22, 0);
    const later = dateAt(local, 60 * DAY, "1y");
    expect([later.getMonth(), later.getDate(), later.getHours(), later.getMinutes()]).toEqual([
      10, 30, 22, 0,
    ]);
    const earlier = dateAt(local, -100 * DAY - 3 * HOUR, "1y");
    expect([earlier.getMonth(), earlier.getDate(), earlier.getHours()]).toEqual([5, 23, 19]);
    // Hours in between are elapsed time.
    expect(dateAt(local, 2 * HOUR, "1y").getTime() - local.getTime()).toBe(2 * HOUR);
  });

  it("plays the one-year range by whole days at day speeds", () => {
    // 1 s = 1 d at 60 fps: nothing moves until a whole day has accumulated…
    let state = { offset: 0, carry: 0, done: false };
    const frames: number[] = [];
    for (let i = 0; i < 150; i++) {
      state = advance(state.offset, state.carry, 1 / 60, "1y", 1);
      frames.push(state.offset);
    }
    // …then it moves by exactly one day: never a fraction of a day (no strobing).
    expect(new Set(frames.map((o) => o % DAY))).toEqual(new Set([0]));
    expect(frames.at(-1)).toBe(2 * DAY);
    // 1 s = 10 d: 10 one-day steps per second, at most one day per frame at 60 fps.
    const fast = advance(0, 0, 0.1, "1y", speedIndexOf("1y", "time.speed.10d"));
    expect(fast.offset).toBe(DAY);
  });

  it("keeps continuous playback at 1 s = 1 h", () => {
    const step = advance(0, 0, 0.5, "1y", 0);
    expect(step).toEqual({ offset: HOUR / 2, carry: 0, done: false });
  });

  it("stops at the end of the range without leaving whole days", () => {
    const end = advance(182 * DAY, 0, 1, "1y", 1);
    expect(end).toEqual({ offset: 182 * DAY, carry: 0, done: true });
    expect(restartOffset("1y")).toBe(-182 * DAY);
    expect(restartOffset("48h")).toBe(-DAY);
    expect(restartOffset("26ky")).toBe(-13_000);
  });
});

describe("point of view demonstrations (#128)", () => {
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  it("plays each at the speed of its phenomenon, on a range that has it", () => {
    const speed = (id: string) => {
      const demo = POINT_OF_VIEW_DEMOS[id]!;
      const i = speedIndexOf(demo.range, demo.speed);
      expect(i).toBeGreaterThanOrEqual(0);
      return RANGES[demo.range].speeds[i]!.value;
    };
    expect(speed("stars")).toBe(HOUR);
    expect(speed("earth")).toBe(HOUR);
    expect(speed("ecliptic")).toBe(7 * DAY);
    expect(speed("heliocentric") / DAY).toBeCloseTo(30.44, 2);
    expect(POINT_OF_VIEW_DEMOS.body).toBeUndefined();
  });

  it("moves the seasons by whole days (the same hour each day: no strobing of the globe)", () => {
    const i = speedIndexOf("1y", "time.speed.1w");
    const step = advance(0, 0, 1 / 60, "1y", i);
    expect(step.offset % DAY).toBe(0);
    let state = { offset: 0, carry: 0, done: false };
    for (let k = 0; k < 60; k++) state = advance(state.offset, state.carry, 1 / 60, "1y", i);
    expect(state.offset).toBe(7 * DAY);
  });
});
