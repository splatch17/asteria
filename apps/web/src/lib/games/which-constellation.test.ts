import { describe, expect, it } from "vitest";
import { unitVector } from "@asteria/astro-core";
import { CONSTELLATION_LATIN } from "@asteria/content";
import type { ConstellationShape } from "./geometry";
import { DISCOVERY_CONSTELLATIONS } from "./pool";
import { emptyProgress, recordAnswer } from "./progress";
import { mulberry32 } from "./rng";
import { DAY_MS } from "./srs";
import {
  CHOICES,
  SERIES_LENGTH,
  answerQuestion,
  buildSeries,
  distractors,
  outcomeOf,
  randomRoll,
} from "./which-constellation";

const T0 = Date.UTC(2026, 9, 19, 20);
// The 88 abbreviations spread over the sphere (golden spiral): stand-in figure centres.
const SHAPES: Record<string, ConstellationShape> = Object.fromEntries(
  Object.keys(CONSTELLATION_LATIN).map((abbr, i, all) => {
    const dec = (Math.asin(1 - (2 * (i + 0.5)) / all.length) * 180) / Math.PI;
    const ra = (i * 137.508) % 360;
    return [abbr, { abbr, centre: unitVector(ra, dec), radius: 8 }];
  }),
);

describe("« Quelle constellation ? » series", () => {
  it("asks 10 different constellations, 4 distinct choices each with the answer", () => {
    const series = buildSeries({
      level: "amateur",
      shapes: SHAPES,
      progress: emptyProgress(),
      now: T0,
      rng: mulberry32(11),
    });
    expect(series).toHaveLength(SERIES_LENGTH);
    expect(new Set(series.map((q) => q.answer)).size).toBe(SERIES_LENGTH);
    for (const q of series) {
      expect(q.choices).toHaveLength(CHOICES);
      expect(new Set(q.choices).size).toBe(CHOICES);
      expect(q.choices).toContain(q.answer);
    }
  });

  it("stays among the well-known constellations in Découverte, choices included", () => {
    const known = new Set(DISCOVERY_CONSTELLATIONS);
    for (let seed = 1; seed <= 10; seed++) {
      const series = buildSeries({
        level: "discovery",
        shapes: SHAPES,
        progress: emptyProgress(),
        now: T0,
        rng: mulberry32(seed),
      });
      for (const q of series) for (const c of q.choices) expect(known.has(c), c).toBe(true);
    }
  });

  it("puts the answer at every position over a few series", () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 5; seed++)
      for (const q of buildSeries({
        level: "expert",
        shapes: SHAPES,
        progress: emptyProgress(),
        now: T0,
        rng: mulberry32(seed),
      }))
        positions.add(q.choices.indexOf(q.answer));
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it("draws wrong answers among the nearest figures", () => {
    const pool = Object.keys(SHAPES);
    const d = distractors("Ori", pool, SHAPES, mulberry32(2));
    expect(d).toHaveLength(3);
    const far = (a: string) =>
      Math.acos(SHAPES.Ori!.centre.reduce((s, x, i) => s + x * SHAPES[a]!.centre[i]!, 0));
    const ranked = pool
      .filter((a) => a !== "Ori")
      .sort((a, b) => far(a) - far(b))
      .slice(0, 6);
    for (const a of d) expect(ranked).toContain(a);
  });

  it("is reproducible from a seed", () => {
    const opts = { level: "amateur" as const, shapes: SHAPES, progress: emptyProgress(), now: T0 };
    expect(buildSeries({ ...opts, rng: mulberry32(9) })).toEqual(
      buildSeries({ ...opts, rng: mulberry32(9) }),
    );
  });
});

describe("answers", () => {
  const q = { answer: "Ori", choices: ["Tau", "Ori", "Gem", "Mon"], roll: 0 };

  it("records a right answer and says it was learnt", () => {
    const { progress, answer } = answerQuestion(emptyProgress(), q, "Ori", T0);
    expect(progress.items["con:Ori"]?.correct).toBe(1);
    expect(answer).toMatchObject({ correct: true, before: "new", after: "known" });
    expect(outcomeOf(answer)).toBe("learnt");
  });

  it("records a wrong answer against the item shown, not the one chosen", () => {
    const { progress, answer } = answerQuestion(emptyProgress(), q, "Tau", T0);
    expect(progress.items["con:Tau"]).toBeUndefined();
    expect(progress.items["con:Ori"]?.interval).toBe(0);
    expect(outcomeOf(answer)).toBe("review");
  });

  it("says when an item becomes mastered", () => {
    let p = recordAnswer(emptyProgress(), "con:Ori", true, T0);
    p = recordAnswer(p, "con:Ori", true, T0 + DAY_MS);
    const { answer } = answerQuestion(p, q, "Ori", T0 + 4 * DAY_MS);
    expect(outcomeOf(answer)).toBe("mastered");
    const again = answerQuestion(p, q, "Ori", T0 + DAY_MS + 1000).answer;
    expect(outcomeOf(again)).toBe("kept");
  });
});

describe("orientation of the figure (#183)", () => {
  const series = (level: "discovery" | "amateur" | "expert", seed: number) =>
    buildSeries({
      level,
      shapes: SHAPES,
      progress: emptyProgress(),
      now: T0,
      rng: mulberry32(seed),
    });

  it("keeps north up in Découverte and Amateur", () => {
    for (let seed = 1; seed <= 5; seed++)
      for (const level of ["discovery", "amateur"] as const)
        for (const q of series(level, seed)) expect(q.roll).toBe(0);
  });

  it("turns each Expert figure by an angle that depends only on the seed", () => {
    const a = series("expert", 42);
    const b = series("expert", 42);
    expect(b).toEqual(a);
    const c = series("expert", 43);
    expect(c.map((q) => q.roll)).not.toEqual(a.map((q) => q.roll));
    for (const q of a) {
      expect(Number.isInteger(q.roll)).toBe(true);
      expect(q.roll).toBeGreaterThanOrEqual(-180);
      expect(q.roll).toBeLessThan(180);
    }
  });

  it("spreads the angles over the whole turn", () => {
    const rng = mulberry32(5);
    const rolls = Array.from({ length: 2000 }, () => randomRoll(rng));
    const quarters = [0, 0, 0, 0];
    for (const r of rolls) quarters[Math.floor((r + 180) / 90)]!++;
    for (const n of quarters) expect(n).toBeGreaterThan(400);
  });
});
