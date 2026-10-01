import { describe, expect, it } from "vitest";
import { clampOffset, dateAt, offsetParts, RANGES } from "./timeline";

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
});
