/**
 * Drawing the items of a series (#163), shared by every game: weighted draw without repeats.
 *
 * Weights (relative):
 * - missed last time (learning) and due again: 8 — what was just got wrong comes back first;
 * - due for review: 5, plus 1 per overdue day (up to +5);
 * - never asked (new): 3;
 * - known, not yet due: 0.5; mastered, not yet due: 0.15 — still asked now and then, so that a
 *   short pool (Découverte) always fills a series;
 * - × VISIBLE_BOOST when the item is up in tonight's sky at the player's place.
 * At most `maxNew` new items per series while seen items remain, so that a returning player
 * reviews before discovering (all new on the first series, of course).
 */
import type { Progress } from "./progress";
import { pickWeighted, type Rng } from "./rng";
import { DAY_MS, isDue, masteryOf, type Memory } from "./srs";

export const VISIBLE_BOOST = 2;

/** Draw weight of an item (see the file header). */
export function itemWeight(memory: Memory | undefined, now: number, visible: boolean): number {
  const mastery = masteryOf(memory);
  let w: number;
  if (!memory || mastery === "new") w = 3;
  else if (isDue(memory, now)) {
    const overdue = Math.min(5, Math.max(0, (now - memory.due) / DAY_MS));
    w = mastery === "learning" ? 8 : 5 + overdue;
  } else w = mastery === "mastered" ? 0.15 : mastery === "learning" ? 1 : 0.5;
  return visible ? w * VISIBLE_BOOST : w;
}

export interface SelectOptions {
  count: number;
  now: number;
  rng: Rng;
  /** Item keys up tonight (preferred); empty: no preference. */
  visible?: ReadonlySet<string> | undefined;
  maxNew?: number;
}

/** `count` distinct keys of `pool` (fewer if the pool is smaller), in draw order. */
export function selectItems(
  pool: readonly string[],
  progress: Progress,
  { count, now, rng, visible, maxNew = 4 }: SelectOptions,
): string[] {
  const left = [...pool];
  const chosen: string[] = [];
  let fresh = 0;
  while (chosen.length < count && left.length) {
    const seenLeft = left.some((k) => progress.items[k]);
    const weights = left.map((k) => {
      const m = progress.items[k];
      if (!m && fresh >= maxNew && seenLeft) return 0;
      return itemWeight(m, now, visible?.has(k) ?? false);
    });
    const i = pickWeighted(weights, rng);
    if (i < 0) break;
    const [key] = left.splice(i, 1);
    if (!progress.items[key!]) fresh++;
    chosen.push(key!);
  }
  return chosen;
}
