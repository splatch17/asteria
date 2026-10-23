import { describe, expect, it } from "vitest";
import {
  CHALLENGE_LENGTH,
  Countdown,
  TIMED_MS,
  answerChallenge,
  autoNextDelay,
  challengeScore,
  clockText,
  endChallenge,
  isChallenge,
  startChallenge,
} from "./challenge";
import { emptyProgress, recordAnswer } from "./progress";
import { mulberry32 } from "./rng";
import { SEQUENCE_BATCH, drawItems, selectSequence } from "./select";
import { buildSeries } from "./which-constellation";
import { buildWhereSeries } from "./where-is-it";
import { unitVector } from "@asteria/astro-core";
import type { ConstellationShape } from "./geometry";

const T0 = Date.UTC(2026, 9, 22, 20);

describe("streak (« Série »)", () => {
  it("counts right answers in a row and ends at the first mistake", () => {
    let s = startChallenge("streak");
    for (let i = 0; i < 7; i++) s = answerChallenge(s, true);
    expect(s).toMatchObject({ right: 7, answered: 7, end: null });
    s = answerChallenge(s, false);
    expect(s).toMatchObject({ right: 7, answered: 8, end: "mistake" });
    // Nothing counts once ended.
    expect(answerChallenge(s, true)).toBe(s);
    expect(challengeScore(s, false)).toBe(7);
    // A points game's streak is still counted in answers.
    expect(challengeScore(answerChallenge(startChallenge("streak"), true, 900), true)).toBe(1);
  });

  it("a first mistake is a streak of 0", () => {
    const s = answerChallenge(startChallenge("streak"), false);
    expect(s.end).toBe("mistake");
    expect(challengeScore(s, false)).toBe(0);
  });
});

describe("timed (« Contre-la-montre »)", () => {
  it("a mistake only costs time; the score is right answers or points", () => {
    let s = startChallenge("timed");
    s = answerChallenge(s, true, 1000);
    s = answerChallenge(s, false, 0);
    s = answerChallenge(s, true, 640);
    expect(s).toMatchObject({ right: 2, points: 1640, answered: 3, end: null });
    expect(challengeScore(s, false)).toBe(2);
    expect(challengeScore(s, true)).toBe(1640);
    s = endChallenge(s, "time");
    expect(s.end).toBe("time");
    expect(endChallenge(s, "exhausted").end).toBe("time"); // the first reason stays
    expect(answerChallenge(s, true, 1000)).toBe(s); // too late
  });

  it("points of a wrong answer never count", () => {
    expect(answerChallenge(startChallenge("timed"), false, 1000).points).toBe(0);
  });

  it("only challenges are challenges", () => {
    expect(isChallenge("training")).toBe(false);
    expect(isChallenge("streak")).toBe(true);
    expect(isChallenge("timed")).toBe(true);
  });

  it("moves on by itself, but leaves a streak's last answer to the player", () => {
    expect(autoNextDelay("streak", true)).toBeGreaterThan(0);
    expect(autoNextDelay("streak", false)).toBeNull();
    expect(autoNextDelay("timed", false)).toBeGreaterThan(autoNextDelay("timed", true)!);
    expect(autoNextDelay("timed", false, true)).toBeGreaterThan(autoNextDelay("timed", false)!);
  });
});

describe("countdown", () => {
  it("runs out after its duration", () => {
    const c = new Countdown(TIMED_MS);
    expect(c.remaining(0)).toBe(60_000);
    expect(c.running).toBe(false);
    c.start(1000);
    expect(c.remaining(31_000)).toBe(30_000);
    expect(c.progress(31_000)).toBeCloseTo(0.5);
    expect(c.expired(60_999)).toBe(false);
    expect(c.expired(61_000)).toBe(true);
    expect(c.remaining(90_000)).toBe(0);
  });

  it("stops while paused (page hidden) and goes on from there", () => {
    const c = new Countdown(60_000);
    c.start(0);
    c.pause(20_000);
    expect(c.running).toBe(false);
    expect(c.remaining(50_000)).toBe(40_000);
    c.start(50_000);
    c.start(55_000); // already running: no effect
    expect(c.remaining(60_000)).toBe(30_000);
    expect(c.expired(89_999)).toBe(false);
    expect(c.expired(90_000)).toBe(true);
  });

  it("writes the clock in whole seconds, rounded up", () => {
    expect(clockText(60_000)).toBe("1:00");
    expect(clockText(59_001)).toBe("1:00");
    expect(clockText(59_000)).toBe("0:59");
    expect(clockText(9_200)).toBe("0:10");
    expect(clockText(1)).toBe("0:01");
    expect(clockText(0)).toBe("0:00");
    expect(clockText(-5)).toBe("0:00");
  });
});

describe("a challenge's sequence", () => {
  const pool = Array.from({ length: 29 }, (_, i) => `con:C${String(i).padStart(2, "0")}`);

  it("cycles the pool, never the same item twice in a row", () => {
    const seq = selectSequence(pool, emptyProgress(), {
      count: CHALLENGE_LENGTH,
      now: T0,
      rng: mulberry32(3),
    });
    expect(seq).toHaveLength(CHALLENGE_LENGTH);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    // Each batch is distinct; the whole pool comes up.
    expect(new Set(seq.slice(0, SEQUENCE_BATCH)).size).toBe(SEQUENCE_BATCH);
    expect(new Set(seq).size).toBe(pool.length);
  });

  it("keeps items apart when the pool is large", () => {
    const big = Array.from({ length: 88 }, (_, i) => `con:K${i}`);
    const seq = selectSequence(big, emptyProgress(), { count: 120, now: T0, rng: mulberry32(8) });
    // No item within SEQUENCE_BATCH of itself (each batch avoids the previous one).
    for (let i = 0; i < seq.length; i++)
      expect(seq.slice(i + 1, i + SEQUENCE_BATCH).includes(seq[i]!)).toBe(false);
  });

  it("works with tiny pools", () => {
    const two = selectSequence(["con:A", "con:B"], emptyProgress(), {
      count: 6,
      now: T0,
      rng: mulberry32(1),
    });
    expect(two).toHaveLength(6);
    for (let i = 1; i < two.length; i++) expect(two[i]).not.toBe(two[i - 1]);
    expect(
      selectSequence(["con:A"], emptyProgress(), { count: 3, now: T0, rng: Math.random }),
    ).toEqual(["con:A", "con:A", "con:A"]);
    expect(selectSequence([], emptyProgress(), { count: 3, now: T0, rng: Math.random })).toEqual(
      [],
    );
  });

  it("reviews what was missed first, as a series does", () => {
    const progress = recordAnswer(emptyProgress(), "con:C07", false, T0 - 3_600_000);
    const firsts = Array.from(
      { length: 40 },
      (_, i) =>
        selectSequence(pool, progress, { count: 30, now: T0, rng: mulberry32(50 + i) }).indexOf(
          "con:C07",
        ) < 5,
    ).filter(Boolean).length;
    expect(firsts).toBeGreaterThan(15);
  });

  it("asks only the items of a sky scope, in the pool's order", () => {
    const ask = ["con:C03", "con:C01", "con:C20", "con:zzz"];
    const drawn = drawItems(pool, emptyProgress(), {
      count: 10,
      now: T0,
      rng: mulberry32(4),
      ask,
    });
    expect([...drawn].sort()).toEqual(["con:C01", "con:C03", "con:C20"]);
    const seq = drawItems(pool, emptyProgress(), {
      count: 12,
      now: T0,
      rng: mulberry32(4),
      ask,
      sequence: true,
    });
    expect(seq).toHaveLength(12);
    expect(new Set(seq)).toEqual(new Set(["con:C01", "con:C03", "con:C20"]));
  });
});

describe("challenge series of the games", () => {
  const SHAPES: Record<string, ConstellationShape> = Object.fromEntries(
    ["Ori", "Tau", "Gem", "Aur", "CMa", "CMi", "Lep", "Eri", "Mon", "Per"].map((a, i) => [
      a,
      { abbr: a, centre: unitVector(60 + i * 8, (i % 5) * 8 - 10), radius: 8 },
    ]),
  );

  it("« Quelle constellation ? »: a long sequence of questions among the scope", () => {
    const series = buildSeries({
      level: "amateur",
      shapes: SHAPES,
      progress: emptyProgress(),
      now: T0,
      rng: mulberry32(2),
      challenge: true,
      ask: ["Ori", "Tau", "Gem", "Aur", "CMa"],
    });
    expect(series).toHaveLength(CHALLENGE_LENGTH);
    expect(new Set(series.map((q) => q.answer))).toEqual(
      new Set(["Ori", "Tau", "Gem", "Aur", "CMa"]),
    );
    // Wrong names still come from the whole pool.
    const offered = new Set(series.flatMap((q) => q.choices));
    expect(offered.size).toBeGreaterThan(5);
    for (const q of series) expect(q.choices).toContain(q.answer);
  });

  it("« Où est-elle ? »: the same, a series stays 10 long", () => {
    const opts = {
      level: "amateur" as const,
      shapes: SHAPES,
      progress: emptyProgress(),
      now: T0,
      rng: mulberry32(2),
    };
    expect(buildWhereSeries(opts)).toHaveLength(10);
    expect(buildWhereSeries({ ...opts, ask: ["Ori", "Lep"] }).sort()).toEqual(["Lep", "Ori"]);
    expect(buildWhereSeries({ ...opts, challenge: true })).toHaveLength(CHALLENGE_LENGTH);
  });
});
