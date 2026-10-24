import { describe, expect, it } from "vitest";
import { drawSketch, sketchRadius } from "./card-sketch";
import { stillKey } from "./deck-sky";

describe("card sketch", () => {
  it("draws brighter stars larger, within bounds", () => {
    expect(sketchRadius(0)).toBeGreaterThan(sketchRadius(2));
    expect(sketchRadius(2)).toBeGreaterThan(sketchRadius(4));
    expect(sketchRadius(-1.5)).toBeLessThanOrEqual(3.2);
    expect(sketchRadius(6)).toBeGreaterThanOrEqual(0.9);
  });

  it("draws the figure's segments between projected stars only", () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      globalAlpha: 1,
      lineWidth: 1,
      fillRect: () => calls.push("fillRect"),
      beginPath: () => calls.push("beginPath"),
      moveTo: (x: number, y: number) => calls.push(`moveTo ${x},${y}`),
      lineTo: (x: number, y: number) => calls.push(`lineTo ${x},${y}`),
      stroke: () => calls.push("stroke"),
      arc: () => calls.push("arc"),
      fill: () => calls.push("fill"),
    };
    const stars = [
      { hip: 1, x: 10, y: 10, v: 1 },
      { hip: 2, x: 20, y: 30, v: 2 },
      { hip: 3, x: 40, y: 50, v: 3 },
    ];
    // 4 is off the picture: its segments are left out.
    drawSketch(
      ctx,
      100,
      100,
      stars,
      [
        [1, 2, 3],
        [3, 4],
      ],
      { sky: "#101b52", ink: "#f0e6d2" },
    );
    expect(calls.filter((c) => c.startsWith("moveTo"))).toEqual(["moveTo 10,10", "moveTo 20,30"]);
    expect(calls.filter((c) => c.startsWith("lineTo"))).toEqual(["lineTo 20,30", "lineTo 40,50"]);
    expect(calls.filter((c) => c === "arc")).toHaveLength(6); // ring and star
    expect(calls[0]).toBe("fillRect"); // the sky first
  });
});

describe("still picture key", () => {
  const base = {
    abbr: "Ori",
    observer: { latitude: 0, longitude: 0 },
    fov: 41.2,
    figures: false,
    star: null,
  };
  it("changes with what the card shows and its size", () => {
    const k = stillKey(base, 900, 1100);
    expect(stillKey({ ...base }, 900, 1100)).toBe(k);
    expect(stillKey({ ...base, figures: true }, 900, 1100)).not.toBe(k);
    expect(stillKey({ ...base, abbr: "Tau" }, 900, 1100)).not.toBe(k);
    expect(stillKey(base, 1100, 900)).not.toBe(k);
    expect(stillKey({ ...base, fov: 50 }, 900, 1100)).not.toBe(k);
  });
});
