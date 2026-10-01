import { describe, expect, it } from "vitest";
import { PLANETS, bodyPath } from "@asteria/astro-core";
import { PlanetPathCache, monthStarts } from "./planet-paths";

const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const DAY = 86_400_000;

describe("monthStarts", () => {
  it("lists the 1st of each month at local midnight inside the range", () => {
    const start = new Date(2026, 9, 15).getTime();
    const end = new Date(2027, 2, 1).getTime(); // inclusive bound
    const months = monthStarts(start, end).map((t) => new Date(t));
    expect(months.map((d) => [d.getFullYear(), d.getMonth()])).toEqual([
      [2026, 10],
      [2026, 11],
      [2027, 0],
      [2027, 1],
      [2027, 2],
    ]);
    for (const d of months) expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([1, 0, 0]);
  });

  it("includes a start falling exactly on the lower bound", () => {
    const t = new Date(2026, 0, 1).getTime();
    expect(monthStarts(t, t + DAY)).toEqual([t]);
    expect(monthStarts(t + 1, t + 20 * DAY)).toEqual([]);
  });
});

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
      for (const p of points) if (!p.mark) expect(p.date.getTime() % (2 * DAY)).toBe(0);
      for (let i = 1; i < points.length; i++) {
        const gap = points[i]!.date.getTime() - points[i - 1]!.date.getTime();
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThanOrEqual(2 * DAY);
      }
    }
  });

  it("puts a mark exactly at the start of each month", () => {
    const cache = new PlanetPathCache();
    const { points } = cache.path("Mars", new Date("2026-10-01T00:00:00Z"), PARIS);
    const marks = points.filter((p) => p.mark);
    expect(marks.length).toBeGreaterThanOrEqual(11);
    expect(marks.length).toBeLessThanOrEqual(13);
    for (const m of marks) expect([m.date.getDate(), m.date.getHours()]).toEqual([1, 0]);
    // The mark position is the planet's position at that very instant.
    const [ref] = bodyPath("Mars", marks[3]!.date, marks[3]!.date, 1, PARIS);
    expect(marks[3]!.ra).toBe(ref!.ra);
    expect(marks[3]!.dec).toBe(ref!.dec);
  });

  it("returns the same objects inside a bucket and matches bodyPath", () => {
    const cache = new PlanetPathCache();
    const a = cache.get(new Date("2026-10-01T00:00:00Z"), PARIS);
    const b = cache.get(new Date("2026-10-01T06:00:00Z"), PARIS);
    expect(b).toBe(a);
    const mars = cache.path("Mars", new Date("2026-10-01T07:00:00Z"), PARIS);
    expect(mars).toBe(a.find((p) => p.name === "Mars"));
    const pt = mars.points.find((p) => !p.mark)!;
    const [ref] = bodyPath("Mars", pt.date, pt.date, 1, PARIS);
    expect(pt.ra).toBe(ref!.ra);
    expect(pt.dec).toBe(ref!.dec);
  });

  it("computes only the selected planet", () => {
    const cache = new PlanetPathCache();
    const { points } = cache.path("Venus", new Date("2026-10-01T00:00:00Z"), PARIS);
    expect(cache.computed).toBe(points.length);
  });

  it("only computes the new samples when the window slides by one bucket", () => {
    const cache = new PlanetPathCache();
    cache.get(new Date("2026-10-01T00:00:00Z"), PARIS);
    const before = cache.computed;
    cache.get(new Date("2026-10-11T00:00:00Z"), PARIS);
    // ≤ 5 new grid samples and ≤ 1 new month start per planet
    expect(cache.computed - before).toBeLessThanOrEqual(PLANETS.length * 7);
  });
});
