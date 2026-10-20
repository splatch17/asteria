/**
 * Recording a played item and telling the player what it changed, shared by every game (#163,
 * #164): the end screen lists each item with its outcome.
 */
import { itemKey, recordAnswer, type ItemKind, type Progress } from "./progress";
import { masteryOf, type Grade, type Mastery } from "./srs";

/** One played item and its mastery before and after. */
export interface ItemResult {
  /** IAU abbreviation (or HIP number as text, for stars). */
  item: string;
  correct: boolean;
  before: Mastery;
  after: Mastery;
}

/** Records how an item went; returns the new progress and the end-screen line. */
export function recordItem(
  progress: Progress,
  kind: ItemKind,
  item: string,
  grade: Grade,
  now: number,
): { progress: Progress; result: ItemResult } {
  const key = itemKey(kind, item);
  const before = masteryOf(progress.items[key]);
  const next = recordAnswer(progress, key, grade, now);
  return {
    progress: next,
    result: { item, correct: grade !== "again", before, after: masteryOf(next.items[key]) },
  };
}

/** What the end screen says about a played item. */
export type Outcome = "mastered" | "learnt" | "review" | "kept";

export function outcomeOf(a: Pick<ItemResult, "correct" | "before" | "after">): Outcome {
  if (!a.correct) return "review";
  if (a.after === "mastered" && a.before !== "mastered") return "mastered";
  if (a.before === "new" || a.before === "learning") return "learnt";
  return "kept";
}
