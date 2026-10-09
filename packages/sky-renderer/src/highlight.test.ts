import { describe, expect, it } from "vitest";
import {
  ARRIVAL_RINGS,
  SELECTION_DIM,
  arrivalProgress,
  arrivalRingAlpha,
  arrivalRingScale,
  figureStarRadius,
  selectionDim,
} from "./highlight";

describe("arrivalProgress", () => {
  it("runs from 0 to 1 over the duration, clamped", () => {
    expect(arrivalProgress(100, 100, 1000)).toBe(0);
    expect(arrivalProgress(600, 100, 1000)).toBe(0.5);
    expect(arrivalProgress(5000, 100, 1000)).toBe(1);
    expect(arrivalProgress(50, 100, 1000)).toBe(0);
  });
  it("is over when not started or without duration", () => {
    expect(arrivalProgress(100, NaN)).toBe(1);
    expect(arrivalProgress(100, 0, 0)).toBe(1);
  });
});

describe("arrival rings", () => {
  it("start wide and close exactly onto the marker", () => {
    for (let k = 0; k < ARRIVAL_RINGS; k++) {
      expect(arrivalRingScale(0, k)).toBe(4);
      expect(arrivalRingScale(1, k)).toBe(1);
    }
  });
  it("shrink monotonically", () => {
    let prev = Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const s = arrivalRingScale(t, 0);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });
  it("are staggered: a later ring is wider at the same instant", () => {
    expect(arrivalRingScale(0.3, 1)).toBeGreaterThan(arrivalRingScale(0.3, 0));
    expect(arrivalRingScale(0.3, 2)).toBeGreaterThan(arrivalRingScale(0.3, 1));
  });
  it("fade in then out, invisible at both ends of the animation", () => {
    for (let k = 0; k < ARRIVAL_RINGS; k++) {
      expect(arrivalRingAlpha(0, k)).toBe(0);
      expect(arrivalRingAlpha(1, k)).toBe(0);
    }
    expect(arrivalRingAlpha(0.32, 0)).toBeCloseTo(1, 5); // middle of ring 0's span (0.64)
    expect(arrivalRingAlpha(0.1, 1)).toBe(0); // ring 1 not started yet
  });
});

describe("selectionDim", () => {
  it("dims the sky for a constellation only", () => {
    expect(selectionDim("constellation")).toBe(SELECTION_DIM);
    expect(SELECTION_DIM).toBeGreaterThan(0);
    expect(SELECTION_DIM).toBeLessThan(0.5); // "slightly": the sky stays readable
    for (const kind of ["star", "planet", "body", null, undefined])
      expect(selectionDim(kind)).toBe(0);
  });
});

describe("figureStarRadius", () => {
  it("grows with brightness, within bounds", () => {
    expect(figureStarRadius(0)).toBeGreaterThan(figureStarRadius(2));
    expect(figureStarRadius(-2)).toBe(4.5);
    expect(figureStarRadius(6)).toBe(2);
  });
});
