import { describe, expect, it } from "vitest";
import { LabelLayout, overlaps } from "./labels";

describe("LabelLayout", () => {
  it("detects overlapping rectangles", () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it("falls back to the next free candidate, then gives up", () => {
    const layout = new LabelLayout();
    const a = { x: 0, y: 0, w: 50, h: 10 };
    expect(layout.place([a])).toEqual(a);
    const below = { x: 0, y: 20, w: 50, h: 10 };
    expect(layout.place([a, below])).toEqual(below);
    expect(layout.place([a, below])).toBeNull();
  });

  it("keeps labels out of reserved areas", () => {
    const layout = new LabelLayout();
    layout.reserve([{ x: 0, y: 0, w: 100, h: 40 }]);
    const inside = { x: 10, y: 10, w: 20, h: 10 };
    const outside = { x: 10, y: 60, w: 20, h: 10 };
    expect(layout.place([inside])).toBeNull();
    expect(layout.place([inside, outside])).toEqual(outside);
  });
});
