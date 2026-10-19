import { describe, expect, it } from "vitest";
import { DAY_MS, MIN_EASE, START_EASE, isDue, isMemory, masteryOf, review } from "./srs";

const T0 = Date.UTC(2026, 9, 19, 20);

describe("SM-2 review", () => {
  it("starts a new item at 1 day, then 3 days, then interval × ease", () => {
    let m = review(undefined, true, T0);
    expect(m).toMatchObject({ reps: 1, interval: 1, seen: 1, correct: 1, ease: START_EASE });
    expect(m.due).toBe(T0 + DAY_MS);
    m = review(m, true, m.due);
    expect(m.interval).toBe(3);
    m = review(m, true, m.due);
    expect(m.interval).toBeCloseTo(7.5, 10);
    expect(masteryOf(m)).toBe("mastered");
  });

  it("sends a missed item back to the start, due in 10 minutes, ease lowered", () => {
    let m = review(undefined, true, T0);
    m = review(m, true, m.due);
    const t = m.due;
    m = review(m, false, t);
    expect(m).toMatchObject({ reps: 0, interval: 0, lapses: 1, seen: 3, correct: 2 });
    expect(m.ease).toBeCloseTo(START_EASE - 0.2, 10);
    expect(m.due).toBe(t + 10 * 60_000);
    expect(masteryOf(m)).toBe("learning");
  });

  it("never lowers the ease below 1.3", () => {
    let m = review(undefined, false, T0);
    for (let i = 0; i < 20; i++) m = review(m, false, T0 + i);
    expect(m.ease).toBe(MIN_EASE);
    expect(m.lapses).toBe(0); // never learnt: not a lapse
  });

  it("barely grows an item reviewed again the same evening", () => {
    let m = review(undefined, true, T0);
    for (let i = 1; i <= 10; i++) m = review(m, true, T0 + i * 60_000);
    expect(m.interval).toBeLessThan(1.1);
    expect(masteryOf(m)).toBe("known");
  });

  it("grows by the elapsed fraction of the interval", () => {
    const m1 = review(undefined, true, T0); // interval 1
    const half = review(m1, true, T0 + DAY_MS / 2); // target 3, half of the day elapsed
    expect(half.interval).toBeCloseTo(2, 10);
    const late = review(m1, true, T0 + 5 * DAY_MS); // overdue: full growth, no more
    expect(late.interval).toBe(3);
  });

  it("classifies mastery and due dates", () => {
    expect(masteryOf(undefined)).toBe("new");
    const m = review(undefined, true, T0);
    expect(isDue(m, T0)).toBe(false);
    expect(isDue(m, T0 + DAY_MS)).toBe(true);
  });

  it("validates stored records", () => {
    expect(isMemory(review(undefined, true, T0))).toBe(true);
    expect(isMemory({ reps: 1 })).toBe(false);
    expect(isMemory(null)).toBe(false);
    expect(isMemory({ ...review(undefined, true, T0), due: Number.NaN })).toBe(false);
  });
});
