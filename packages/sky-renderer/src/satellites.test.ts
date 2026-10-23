import { describe, expect, it } from "vitest";
import {
  SATELLITE_GLYPH,
  directionAt,
  normalAt,
  trackRuns,
  type TrackScreenPoint,
} from "./satellites";

const pt = (x: number, y: number, visible = false): TrackScreenPoint => ({ x, y, visible });

describe("trackRuns", () => {
  it("splits where the visibility changes, sharing the boundary point (no gap)", () => {
    const points = [pt(0, 0), pt(1, 0), pt(2, 0, true), pt(3, 0, true), pt(4, 0)];
    expect(trackRuns(points)).toEqual([
      { visible: false, from: 0, to: 2 },
      { visible: true, from: 2, to: 4 },
    ]);
  });

  it("breaks around points off the projection and drops single points", () => {
    const points = [pt(0, 0), pt(NaN, NaN), pt(2, 0), pt(3, 0), pt(NaN, NaN), pt(5, 0)];
    expect(trackRuns(points)).toEqual([{ visible: false, from: 2, to: 3 }]);
  });

  it("is empty for an empty or one-point track", () => {
    expect(trackRuns([])).toEqual([]);
    expect(trackRuns([pt(1, 1)])).toEqual([]);
  });
});

describe("track directions", () => {
  it("follows the track at its ends and turns the normal a quarter turn", () => {
    const points = [pt(0, 0), pt(10, 0), pt(10, 10)];
    expect(directionAt(points, 0)).toEqual([1, 0]);
    expect(directionAt(points, 2)).toEqual([0, 1]);
    const [dx, dy] = directionAt(points, 1);
    expect(Math.hypot(dx, dy)).toBeCloseTo(1, 12);
    expect(normalAt(points, 0)).toEqual([-0, 1]);
  });
});

describe("glyph", () => {
  it("is symmetric about its centre (it turns along the motion)", () => {
    const xs = SATELLITE_GLYPH.flatMap(([x, , w]) => [x, x + w]);
    expect(Math.min(...xs)).toBe(-Math.max(...xs));
  });
});
