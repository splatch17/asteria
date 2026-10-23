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
 * With `newWindow`, only the first `newWindow` never-asked items of the pool, in the pool's order,
 * can be drawn as new: a pool listed brightest first is then learnt brightest first (#165).
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
  /** New items are drawn among the first `newWindow` never-asked ones of the pool (pool order). */
  newWindow?: number;
}

/** `count` distinct keys of `pool` (fewer if the pool is smaller), in draw order. */
export function selectItems(
  pool: readonly string[],
  progress: Progress,
  { count, now, rng, visible, maxNew = 4, newWindow = Infinity }: SelectOptions,
): string[] {
  // The window grows when the series could not be filled otherwise (a first series).
  const seen = pool.filter((k) => progress.items[k]).length;
  const window = Math.max(newWindow, count - seen);
  const eligibleNew = new Set(pool.filter((k) => !progress.items[k]).slice(0, window));
  const left = pool.filter((k) => progress.items[k] || eligibleNew.has(k));
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

/**
 * The draw of a game (#187): a series (selectItems) or a challenge's long sequence
 * (selectSequence), among the pool's keys or only those of `ask` (a sky scope), pool order kept.
 */
export function drawItems(
  pool: readonly string[],
  progress: Progress,
  {
    ask,
    sequence = false,
    ...options
  }: SelectOptions & { ask?: readonly string[] | undefined; sequence?: boolean },
): string[] {
  const wanted = ask && new Set(ask);
  const asked = wanted ? pool.filter((k) => wanted.has(k)) : pool;
  return sequence
    ? selectSequence(asked, progress, options)
    : selectItems(asked, progress, options);
}

/** A challenge's sequence is drawn in batches of this many (each like a series). */
export const SEQUENCE_BATCH = 20;

/**
 * A long sequence for a challenge (#187): `count` keys drawn in batches of SEQUENCE_BATCH with
 * the rules of a series (selectItems), the pool cycled as often as needed. A batch avoids the
 * items of the one before when the pool leaves enough others, and never starts with the item
 * just asked: no item comes back right away.
 */
export function selectSequence(
  pool: readonly string[],
  progress: Progress,
  options: SelectOptions,
): string[] {
  const out: string[] = [];
  let recent = new Set<string>();
  while (out.length < options.count && pool.length) {
    const batch = Math.min(SEQUENCE_BATCH, pool.length, options.count - out.length);
    const rest = pool.filter((k) => !recent.has(k));
    const last = out.at(-1);
    const others = pool.filter((k) => k !== last);
    const from = rest.length >= batch ? rest : others.length ? others : pool;
    const drawn = selectItems(from, progress, { ...options, count: Math.min(batch, from.length) });
    if (!drawn.length) break;
    out.push(...drawn);
    recent = new Set(drawn);
  }
  return out;
}
