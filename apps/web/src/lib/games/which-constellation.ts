/**
 * Game « Quelle constellation ? » (#163): a series of questions, each a constellation shown on
 * the sky with 4 names to choose from. Pure logic (the screen is QuizGame.svelte).
 *
 * Wrong answers are plausible ones: constellations of the same pool whose centre is near the
 * answer's (they share its part of the sky, often its border), drawn among the NEAR_CHOICES
 * nearest so that a series does not always pair the same names.
 */
import type { FigureLevel } from "@asteria/sky-renderer";
import { nearest, type ConstellationShape } from "./geometry";
import { constellationPool } from "./pool";
import { itemKey, recordAnswer, type Progress } from "./progress";
import { shuffle, type Rng } from "./rng";
import { selectItems } from "./select";
import { masteryOf, type Mastery } from "./srs";

export const GAME_ID = "whichConstellation";
export const SERIES_LENGTH = 10;
export const CHOICES = 4;
/** Wrong answers are drawn among this many nearest figures. */
const NEAR_CHOICES = 6;

export interface Question {
  /** IAU abbreviation of the constellation shown. */
  answer: string;
  /** CHOICES abbreviations, the answer among them, in display order. */
  choices: string[];
}

/** CHOICES − 1 neighbours of `answer` in the pool, drawn among the nearest. */
export function distractors(
  answer: string,
  pool: readonly string[],
  shapes: Readonly<Record<string, ConstellationShape>>,
  rng: Rng,
): string[] {
  const near = nearest(answer, shapes, pool);
  return shuffle(near.slice(0, NEAR_CHOICES), rng).slice(0, CHOICES - 1);
}

export interface SeriesOptions {
  level: FigureLevel;
  shapes: Readonly<Record<string, ConstellationShape>>;
  progress: Progress;
  now: number;
  rng: Rng;
  /** Abbreviations up tonight (preferred). */
  visible?: ReadonlySet<string>;
  length?: number;
}

/** The questions of a series, for the player's level and memory. */
export function buildSeries({
  level,
  shapes,
  progress,
  now,
  rng,
  visible,
  length = SERIES_LENGTH,
}: SeriesOptions): Question[] {
  const pool = constellationPool(level, Object.keys(shapes));
  const keys = selectItems(
    pool.map((a) => itemKey("con", a)),
    progress,
    {
      count: length,
      now,
      rng,
      visible: visible && new Set([...visible].map((a) => itemKey("con", a))),
      maxNew: level === "discovery" ? 5 : 4,
    },
  );
  return keys.map((key) => {
    const answer = key.slice(4);
    return { answer, choices: shuffle([answer, ...distractors(answer, pool, shapes, rng)], rng) };
  });
}

/** One answered question, with what it changed. */
export interface Answer {
  answer: string;
  chosen: string;
  correct: boolean;
  before: Mastery;
  after: Mastery;
}

/** Records an answer: the new progress and the summary line of the end screen. */
export function answerQuestion(
  progress: Progress,
  question: Question,
  chosen: string,
  now: number,
): { progress: Progress; answer: Answer } {
  const key = itemKey("con", question.answer);
  const correct = chosen === question.answer;
  const before = masteryOf(progress.items[key]);
  const next = recordAnswer(progress, key, correct, now);
  return {
    progress: next,
    answer: {
      answer: question.answer,
      chosen,
      correct,
      before,
      after: masteryOf(next.items[key]),
    },
  };
}

/** What the end screen says about an answered item. */
export type Outcome = "mastered" | "learnt" | "review" | "kept";

export function outcomeOf(a: Answer): Outcome {
  if (!a.correct) return "review";
  if (a.after === "mastered" && a.before !== "mastered") return "mastered";
  if (a.before === "new" || a.before === "learning") return "learnt";
  return "kept";
}
