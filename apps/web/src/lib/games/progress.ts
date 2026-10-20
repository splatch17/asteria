/**
 * The player's progress (#163), kept on the device only (no account, no network): the memory of
 * each item and a few counters per game. Stored as versioned JSON in localStorage; storage that
 * is missing, full or blocked never breaks a game (progress is then kept for the session only).
 *
 * Items are keyed by kind: `con:Ori` (IAU abbreviation), `star:32349` (HIP number, #165), so
 * that every game shares the same memory of an item.
 */
import { isMemory, masteryOf, review, type Grade, type Mastery, type Memory } from "./srs";

export const PROGRESS_KEY = "asteria.games.progress";
export const PROGRESS_VERSION = 1;

export type ItemKind = "con" | "star";
export const itemKey = (kind: ItemKind, id: string | number): string => `${kind}:${id}`;

export interface GameStats {
  played: number;
  /** Best score of a series. */
  best: number;
}

export interface Progress {
  version: typeof PROGRESS_VERSION;
  items: Record<string, Memory>;
  games: Record<string, GameStats>;
}

export const emptyProgress = (): Progress => ({ version: PROGRESS_VERSION, items: {}, games: {} });

/** Minimal storage interface (localStorage, or a stand-in in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // access itself can throw (blocked site data)
  }
}

/**
 * Progress read back from storage: unknown keys and malformed records are dropped, an unknown
 * (future) version or unreadable JSON starts afresh. Version 1 is the first; later versions add
 * their migration here.
 */
export function parseProgress(raw: unknown): Progress {
  const p = emptyProgress();
  if (typeof raw !== "object" || raw === null) return p;
  const r = raw as Record<string, unknown>;
  if (r.version !== PROGRESS_VERSION) return p;
  if (typeof r.items === "object" && r.items !== null)
    for (const [key, value] of Object.entries(r.items))
      if (/^(con|star):/.test(key) && isMemory(value)) p.items[key] = value;
  if (typeof r.games === "object" && r.games !== null)
    for (const [id, value] of Object.entries(r.games)) {
      const g = value as Record<string, unknown> | null;
      if (g && Number.isFinite(g.played) && Number.isFinite(g.best))
        p.games[id] = { played: g.played as number, best: g.best as number };
    }
  return p;
}

export function loadProgress(store: KeyValueStore | null = defaultStore()): Progress {
  try {
    const text = store?.getItem(PROGRESS_KEY);
    return text ? parseProgress(JSON.parse(text)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

/** Saves; false when storage refused it (private mode, quota): the game goes on regardless. */
export function saveProgress(p: Progress, store: KeyValueStore | null = defaultStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(PROGRESS_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** Progress after an answer about an item (the input is left untouched). */
export function recordAnswer(
  p: Progress,
  key: string,
  grade: Grade | boolean,
  now: number,
): Progress {
  return { ...p, items: { ...p.items, [key]: review(p.items[key], grade, now) } };
}

/** Progress after a finished series of a game. */
export function recordGame(p: Progress, game: string, score: number): Progress {
  const g = p.games[game] ?? { played: 0, best: 0 };
  return {
    ...p,
    games: { ...p.games, [game]: { played: g.played + 1, best: Math.max(g.best, score) } },
  };
}

export const masteryOfItem = (p: Progress, key: string): Mastery => masteryOf(p.items[key]);

export type MasteryCounts = Record<Mastery, number> & { total: number };

/** How many of the given items are new, learning, known, mastered. */
export function countMastery(p: Progress, keys: readonly string[]): MasteryCounts {
  const counts: MasteryCounts = { new: 0, learning: 0, known: 0, mastered: 0, total: keys.length };
  for (const key of keys) counts[masteryOfItem(p, key)]++;
  return counts;
}
