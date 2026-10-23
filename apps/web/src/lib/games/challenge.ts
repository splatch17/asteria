/**
 * Challenges of the games (#187), next to the training series. Pure logic, shared by the three
 * games (the screens keep the timer and call these on each answer):
 * - « Série » (streak, sudden death): questions follow one another until the first mistake
 *   (a wrong answer, or « Je ne sais pas »); score = right answers in a row.
 * - « Contre-la-montre » (timed): as many right answers as possible in TIMED_MS; a wrong one only
 *   costs time. Score = right answers, or the points won (« Où est-elle ? », scored in points).
 * Every answer of a challenge feeds the spaced repetition as in a series (same grades). A
 * question still unanswered when the time runs out is not recorded (it was not answered).
 *
 * Records: per game × mode × level (progress.ts `recordKey`).
 */
import type { GameMode } from "./progress";

export type ChallengeMode = Exclude<GameMode, "training">;
export const isChallenge = (mode: GameMode): mode is ChallengeMode => mode !== "training";

/** Length of the timed challenge (ms). */
export const TIMED_MS = 60_000;
/** The clock turns « urgent » (larger digits, the bar thickens) for the last this many ms. */
export const URGENT_MS = 10_000;
/** Questions prepared for a challenge (the pool is cycled): more than anyone answers. */
export const CHALLENGE_LENGTH = 200;

/** Why a challenge ended: a mistake (streak), the time (timed), every prepared question asked. */
export type ChallengeEnd = "mistake" | "time" | "exhausted";

export interface ChallengeState {
  mode: ChallengeMode;
  /** Right answers (in a row, for a streak). */
  right: number;
  /** Points won (points games). */
  points: number;
  answered: number;
  end: ChallengeEnd | null;
}

export const startChallenge = (mode: ChallengeMode): ChallengeState => ({
  mode,
  right: 0,
  points: 0,
  answered: 0,
  end: null,
});

/** The state after an answer; a streak ends on a mistake. Nothing changes once ended. */
export function answerChallenge(s: ChallengeState, correct: boolean, points = 0): ChallengeState {
  if (s.end) return s;
  return {
    ...s,
    right: s.right + (correct ? 1 : 0),
    points: s.points + (correct ? points : 0),
    answered: s.answered + 1,
    end: s.mode === "streak" && !correct ? "mistake" : null,
  };
}

/** The state once ended for `why` (the first reason is kept). */
export const endChallenge = (s: ChallengeState, why: ChallengeEnd): ChallengeState =>
  s.end ? s : { ...s, end: why };

/** The score kept as a record: the streak, or right answers / points within the time. */
export function challengeScore(s: ChallengeState, inPoints: boolean): number {
  return s.mode === "timed" && inPoints ? s.points : s.right;
}

/**
 * How long an answer stays on screen before the next question comes by itself (ms), in a
 * challenge: short when right (the rhythm is the fun), longer when wrong in the timed mode (the
 * right answer must be seen); null when the player moves on (a streak's last answer).
 * `slow`: the game flies the view to the answer (« Où est-elle ? »).
 */
export function autoNextDelay(mode: ChallengeMode, correct: boolean, slow = false): number | null {
  if (correct) return slow ? 650 : 550;
  if (mode === "streak") return null;
  return slow ? 1500 : 1100;
}

/**
 * A countdown that pauses (the page hidden: a phone call should not cost the challenge). Times
 * are passed in (performance.now() in the app, numbers in the tests).
 */
export class Countdown {
  readonly duration: number;
  #left: number;
  #since: number | null = null;

  constructor(duration: number) {
    this.duration = duration;
    this.#left = duration;
  }

  get running(): boolean {
    return this.#since !== null;
  }

  /** Starts, or resumes after a pause. */
  start(now: number): void {
    if (this.#since === null && this.#left > 0) this.#since = now;
  }

  pause(now: number): void {
    if (this.#since === null) return;
    this.#left = this.remaining(now);
    this.#since = null;
  }

  remaining(now: number): number {
    const spent = this.#since === null ? 0 : Math.max(0, now - this.#since);
    return Math.max(0, this.#left - spent);
  }

  /** Share of the time spent, 0 → 1. */
  progress(now: number): number {
    return 1 - this.remaining(now) / this.duration;
  }

  expired(now: number): boolean {
    return this.remaining(now) <= 0;
  }
}

/** « 0:42 », the countdown's digits (whole seconds, rounded up: 0:00 only at the very end). */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
