/**
 * Spaced repetition of the games (#163): one memory record per item (a constellation, later a
 * star), updated after each answer.
 *
 * Algorithm: SM-2 (P. Woźniak, SuperMemo 2, 1987), lightened for a multiple-choice game.
 * - Why not FSRS: FSRS models stability and difficulty with ~19 parameters fitted on graded
 *   recalls (Again / Hard / Good / Easy) and on a large review history. A 4-choice quiz only says
 *   right or wrong, and each player has a few hundred answers at most: the fitted parameters would
 *   be someone else's, and the model would be opaque. SM-2 with fixed constants is predictable,
 *   easy to test and good enough to bring weak and due items back.
 * - Right answer (SM-2 quality 4, ease unchanged): intervals 1 day, then 3 days (SM-2 says 6; a
 *   game played every few days should see its items sooner), then interval × ease.
 * - Right but laboured (SM-2 quality 3, « hard », #164: a figure traced with hints or many
 *   wrong segments): the same intervals, ease − 0.14 as SM-2's formula gives for q = 3
 *   (EF' = EF + 0.1 − (5 − q)(0.08 + (5 − q)·0.02)), floor 1.3: the item comes back sooner later.
 * - Wrong answer (quality ≤ 2): back to the start, ease − 0.2 (floor 1.3), due again in 10 min.
 * - Early review: the games may ask an item that is not due yet (a short pool in Découverte,
 *   several games a day). Its interval then grows only by the fraction of it that has elapsed
 *   (`interval + (target − interval) · elapsed / interval`), so that playing ten times the same
 *   evening does not make an item "mastered" (as Anki does for early reviews).
 */

export const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
const EASE_PENALTY = 0.2;
/** SM-2 ease change for a correct answer of quality 3 (hard). */
export const HARD_EASE_PENALTY = 0.14;
/** First intervals (days) after one, then two right answers in a row. */
const FIRST_INTERVALS = [1, 3] as const;
/** A missed item comes back this soon (relearning). */
const RELEARN_MS = 10 * MINUTE_MS;
/** Interval (days) from which an item counts as mastered. */
export const MASTERED_DAYS = 7;

export interface Memory {
  /** Right answers in a row. */
  reps: number;
  /** Wrong answers after the item had been learnt once. */
  lapses: number;
  ease: number;
  /** Current interval, days (0 after a wrong answer). */
  interval: number;
  /** Next review, Unix ms. */
  due: number;
  /** Last answer, Unix ms. */
  last: number;
  /** Answers given, and how many were right. */
  seen: number;
  correct: number;
}

/** How well an item is known, from never seen to mastered. */
export type Mastery = "new" | "learning" | "known" | "mastered";

/**
 * How an answer went: wrong (« again »), right but laboured (« hard », SM-2 q = 3), right
 * (« good », q = 4). A boolean stands for again / good.
 */
export type Grade = "again" | "hard" | "good";

/** Memory after an answer (a new record for an item never asked). */
export function review(memory: Memory | undefined, grade: Grade | boolean, now: number): Memory {
  const g: Grade = grade === true ? "good" : grade === false ? "again" : grade;
  const correct = g !== "again";
  const m = memory ?? {
    reps: 0,
    lapses: 0,
    ease: START_EASE,
    interval: 0,
    due: now,
    last: now,
    seen: 0,
    correct: 0,
  };
  const seen = m.seen + 1;
  if (!correct) {
    return {
      ...m,
      reps: 0,
      lapses: m.reps > 0 ? m.lapses + 1 : m.lapses,
      ease: Math.max(MIN_EASE, m.ease - EASE_PENALTY),
      interval: 0,
      due: now + RELEARN_MS,
      last: now,
      seen,
    };
  }
  const reps = m.reps + 1;
  const target = FIRST_INTERVALS[reps - 1] ?? m.interval * m.ease;
  let interval = target;
  if (m.interval > 0) {
    const elapsed = Math.max(0, (now - m.last) / DAY_MS);
    const done = Math.min(1, elapsed / m.interval);
    interval = Math.max(m.interval, m.interval + (target - m.interval) * done);
  }
  return {
    ...m,
    reps,
    ease: g === "hard" ? Math.max(MIN_EASE, m.ease - HARD_EASE_PENALTY) : m.ease,
    interval,
    due: now + interval * DAY_MS,
    last: now,
    seen,
    correct: m.correct + 1,
  };
}

/** Mastery of an item: never asked, last answer wrong, known (right), mastered (≥ a week). */
export function masteryOf(memory: Memory | undefined): Mastery {
  if (!memory || memory.seen === 0) return "new";
  if (memory.interval >= MASTERED_DAYS) return "mastered";
  return memory.interval > 0 ? "known" : "learning";
}

/** The item should be asked again (its review date has come). */
export const isDue = (memory: Memory, now: number): boolean => now >= memory.due;

/** Shape check of a stored record (storage may hold anything). */
export function isMemory(v: unknown): v is Memory {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return ["reps", "lapses", "ease", "interval", "due", "last", "seen", "correct"].every(
    (k) => typeof r[k] === "number" && Number.isFinite(r[k]),
  );
}
