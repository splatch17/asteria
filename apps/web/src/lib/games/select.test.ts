import { describe, expect, it } from "vitest";
import { emptyProgress, recordAnswer, type Progress } from "./progress";
import { mulberry32, pickWeighted, shuffle } from "./rng";
import { VISIBLE_BOOST, itemWeight, selectItems } from "./select";
import { DAY_MS, review } from "./srs";

const T0 = Date.UTC(2026, 9, 19, 20);
const POOL = Array.from({ length: 30 }, (_, i) => `con:C${i}`);

describe("random helpers", () => {
  it("are reproducible from a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("draw by weight, never a zero weight", () => {
    const rng = mulberry32(7);
    const hits = [0, 0, 0];
    for (let i = 0; i < 3000; i++) hits[pickWeighted([1, 0, 3], rng)]!++;
    expect(hits[1]).toBe(0);
    expect(hits[2]! / hits[0]!).toBeGreaterThan(2.4);
    expect(hits[2]! / hits[0]!).toBeLessThan(3.6);
    expect(pickWeighted([0, 0], rng)).toBe(-1);
  });

  it("shuffle keeps every item", () => {
    expect(shuffle([1, 2, 3, 4], mulberry32(3)).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("item weights", () => {
  it("favour missed, then due, then new, then known items", () => {
    const missed = review(undefined, false, T0);
    const known = review(undefined, true, T0);
    const now = T0 + 2 * DAY_MS; // both due
    const learning = itemWeight(missed, now, false);
    const due = itemWeight(known, now, false);
    const fresh = itemWeight(undefined, now, false);
    const notDue = itemWeight(known, T0 + 1000, false);
    expect(learning).toBeGreaterThan(due);
    expect(due).toBeGreaterThan(fresh);
    expect(fresh).toBeGreaterThan(notDue);
    expect(itemWeight(undefined, now, true)).toBe(fresh * VISIBLE_BOOST);
  });

  it("weigh overdue items more, up to a cap", () => {
    const m = review(undefined, true, T0);
    const w1 = itemWeight(m, m.due + DAY_MS, false);
    const w3 = itemWeight(m, m.due + 3 * DAY_MS, false);
    expect(w3).toBeGreaterThan(w1);
    expect(itemWeight(m, m.due + 100 * DAY_MS, false)).toBe(10);
  });
});

describe("selectItems", () => {
  it("draws distinct items, reproducibly", () => {
    const opts = { count: 10, now: T0, rng: mulberry32(5) };
    const a = selectItems(POOL, emptyProgress(), opts);
    const b = selectItems(POOL, emptyProgress(), { ...opts, rng: mulberry32(5) });
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(10);
  });

  it("returns the whole pool when it is short", () => {
    const got = selectItems(POOL.slice(0, 4), emptyProgress(), {
      count: 10,
      now: T0,
      rng: mulberry32(1),
    });
    expect(got.sort()).toEqual(POOL.slice(0, 4).sort());
  });

  it("brings missed items back first and limits new ones", () => {
    let p: Progress = emptyProgress();
    // 12 known (not due), 3 missed: a returning player.
    for (let i = 0; i < 12; i++) p = recordAnswer(p, POOL[i]!, true, T0);
    for (let i = 12; i < 15; i++) p = recordAnswer(p, POOL[i]!, false, T0);
    const now = T0 + 3_600_000; // the missed ones are due again, the known ones are not
    for (let seed = 1; seed <= 20; seed++) {
      const got = selectItems(POOL, p, { count: 10, now, rng: mulberry32(seed), maxNew: 4 });
      const fresh = got.filter((k) => !p.items[k]).length;
      expect(fresh).toBeLessThanOrEqual(4);
      const missed = got.filter((k) => p.items[k]?.interval === 0).length;
      expect(missed).toBeGreaterThanOrEqual(2);
    }
  });

  it("prefers what is visible tonight", () => {
    const visible = new Set(POOL.slice(0, 15));
    let inSky = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const got = selectItems(POOL, emptyProgress(), {
        count: 1,
        now: T0,
        rng: mulberry32(seed),
        visible,
      });
      if (visible.has(got[0]!)) inSky++;
    }
    // Expected share 2/3 with a ×2 boost on half the pool.
    expect(inSky / 200).toBeGreaterThan(0.55);
    expect(inSky / 200).toBeLessThan(0.78);
  });
});
