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

  // A phone-sized HUD (CSS px): header strip, column of round buttons on the right, bottom row.
  const header = { x: 12, y: 12, w: 280, h: 100 };
  const dials = { x: 300, y: 12, w: 52, h: 216 };
  const bottom = { x: 12, y: 640, w: 336, h: 128 };
  const hud = [header, dials, bottom];

  it("reserves the HUD from the constructor, for the first label too", () => {
    const layout = new LabelLayout(hud);
    // A constellation name over the title, with its vertical fallbacks (as in SkyMap).
    const lynx = [0, -16, 16, -32, 32].map((dy) => ({ x: 140, y: 50 + dy, w: 40, h: 12 }));
    expect(layout.place(lynx)).toBeNull();
    // Just below the header (padding included), it fits.
    const free = { x: 140, y: 115, w: 40, h: 12 };
    expect(layout.place([...lynx, free])).toEqual(free);
  });

  it("hides a label under the buttons or the bottom row, keeps a fallback outside", () => {
    const layout = new LabelLayout(hud);
    const right = { x: 310, y: 100, w: 40, h: 12 }; // under the dials
    const left = { x: 250, y: 120, w: 40, h: 12 }; // below the header, left of the dials
    expect(layout.place([right, left])).toEqual(left);
    expect(layout.place([{ x: 100, y: 700, w: 60, h: 12 }])).toBeNull();
    expect(layout.place([{ x: 100, y: 600, w: 60, h: 12 }])).not.toBeNull();
  });

  it("ignores empty reserved areas", () => {
    const layout = new LabelLayout([{ x: 150, y: 300, w: 0, h: 0 }, header]);
    expect(layout.isFree({ x: 20, y: 20, w: 5, h: 5 })).toBe(false); // under the header
    expect(layout.isFree({ x: 150, y: 300, w: 5, h: 5 })).toBe(true);
  });

  it("occupies areas (planet discs) even when they cross the HUD", () => {
    const layout = new LabelLayout(hud);
    layout.occupy({ x: 280, y: 100, w: 30, h: 30 }); // disc straddling the header edge
    expect(layout.place([{ x: 285, y: 125, w: 20, h: 10 }])).toBeNull();
    expect(layout.place([{ x: 200, y: 150, w: 20, h: 10 }])).not.toBeNull();
  });
});
