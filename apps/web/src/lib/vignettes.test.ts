import { describe, expect, it } from "vitest";
import { GAMES } from "./games/catalog";
import { DITHER_RES, DITHER_STEPS, VIGNETTE_SIZE, vignette } from "./vignettes";

/** Pixel rectangles of a path made of `M x y h w v h h -w z` runs. */
function runs(d: string): { x: number; y: number; w: number; h: number }[] {
  return [...d.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+z/g)].map((m) => ({
    x: +m[1]!,
    y: +m[2]!,
    w: +m[3]!,
    h: +m[4]!,
  }));
}

describe("Apprendre vignettes (#185)", () => {
  const ids = ["catalogue", ...GAMES.map((g) => g.id), "someFutureGame"];

  it("draws every card, and a starry sky for a game without its own scene", () => {
    for (const id of ids) {
      const v = vignette(id);
      expect(v.dither, id).toHaveLength(DITHER_STEPS);
      expect(v.ink.length, id).toBeGreaterThan(0);
    }
    expect(vignette("someFutureGame")).toBe(vignette("anotherOne"));
    expect(vignette("catalogue")).not.toBe(vignette("someFutureGame"));
  });

  it("is deterministic (the same vignette on every opening)", () => {
    expect(vignette("whichConstellation")).toBe(vignette("whichConstellation"));
  });

  it("keeps every dot and star inside the grid, dots on the fine screen", () => {
    const u = 1 / DITHER_RES;
    for (const id of ids) {
      const v = vignette(id);
      for (const r of v.dither.flatMap(runs)) {
        expect(r.x, id).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, id).toBeLessThanOrEqual(VIGNETTE_SIZE);
        expect(r.y + r.h, id).toBeLessThanOrEqual(VIGNETTE_SIZE);
        expect(r.h, id).toBe(u);
        expect((r.x / u) % 1, id).toBe(0);
      }
      for (const r of runs(v.ink)) {
        expect(r.x, id).toBeGreaterThanOrEqual(0);
        expect(r.x, id).toBeLessThan(VIGNETTE_SIZE);
        expect(r.y, id).toBeGreaterThanOrEqual(0);
        expect(r.y, id).toBeLessThan(VIGNETTE_SIZE);
      }
    }
  });

  it("reveals the ground in disjoint, growing steps, light enough for the stars to read", () => {
    for (const id of ids) {
      const steps = vignette(id).dither.map((d) => new Set(runs(d).map((r) => `${r.x},${r.y}`)));
      for (let a = 0; a < steps.length; a++)
        for (let b = a + 1; b < steps.length; b++)
          for (const key of steps[a]!) expect(steps[b]!.has(key), `${id} ${key}`).toBe(false);
      const area = vignette(id)
        .dither.flatMap(runs)
        .reduce((s, r) => s + r.w * r.h, 0);
      expect(area / VIGNETTE_SIZE ** 2, id).toBeGreaterThan(0.03);
      expect(area / VIGNETTE_SIZE ** 2, id).toBeLessThan(0.4);
    }
  });
});
