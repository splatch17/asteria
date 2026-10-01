import { describe, expect, it } from "vitest";
import { PLANETS, bodyPath } from "@asteria/astro-core";
import { PlanetPathCache } from "./planet-paths";

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const DAY = 86_400_000;

describe("PlanetPathCache", () => {
  it("covers ±6 months on a 2-day grid for every planet", () => {
    const cache = new PlanetPathCache();
    const date = new Date("2026-10-01T00:00:00Z");
    const paths = cache.get(date, PARIS);
    expect(paths.map((p) => p.name)).toEqual([...PLANETS]);
    for (const { points } of paths) {
      expect(points.length).toBeGreaterThanOrEqual(180);
      expect(points[0]!.date.getTime()).toBeLessThan(date.getTime() - 170 * DAY);
      expect(points.at(-1)!.date.getTime()).toBeGreaterThan(date.getTime() + 170 * DAY);
      expect(points[1]!.date.getTime() - points[0]!.date.getTime()).toBe(2 * DAY);
    }
  });

  it("returns the same object inside a bucket and matches bodyPath", () => {
    const cache = new PlanetPathCache();
    const a = cache.get(new Date("2026-10-01T00:00:00Z"), PARIS);
    const b = cache.get(new Date("2026-10-01T06:00:00Z"), PARIS);
    expect(b).toBe(a);
    const mars = a.find((p) => p.name === "Mars")!.points[10]!;
    const [ref] = bodyPath("Mars", mars.date, mars.date, 1, PARIS);
    expect(mars.ra).toBe(ref!.ra);
    expect(mars.dec).toBe(ref!.dec);
  });

  it("only computes the new samples when the window slides by one bucket", () => {
    const cache = new PlanetPathCache();
    cache.get(new Date("2026-10-01T00:00:00Z"), PARIS);
    const before = cache.computed;
    cache.get(new Date("2026-10-11T00:00:00Z"), PARIS);
    expect(cache.computed - before).toBeLessThanOrEqual(PLANETS.length * 6);
  });
});
