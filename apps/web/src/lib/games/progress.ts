/**
 * The player's progress (#163), kept on the device only (no account, no network): the memory of
 * each item and the records of each game. Stored as versioned JSON in localStorage; storage that
 * is missing, full or blocked never breaks a game (progress is then kept for the session only).
 *
 * Items are keyed by kind: `con:Ori` (IAU abbreviation), `star:32349` (HIP number, #165), so
 * that every game (and every mode of a game) shares the same memory of an item.
 *
 * Records (#187) are kept per game × mode × level: `whichConstellation:streak:expert`.
 */
import type { FigureLevel } from "@asteria/sky-renderer";
import { isMemory, masteryOf, review, type Grade, type Mastery, type Memory } from "./srs";

export const PROGRESS_KEY = "asteria.games.progress";
/**
 * 2 (#170): adds `seen`, the constellations opened in the catalogue.
 * 3 (#187): `games` (one record per game, whatever the level) becomes `records`, one per game,
 * mode and level (`recordKey`).
 */
export const PROGRESS_VERSION = 3;

/** How a game is played (#187): a series of questions, or one of the two challenges. */
export type GameMode = "training" | "streak" | "timed";
export const GAME_MODES: readonly GameMode[] = ["training", "streak", "timed"];
const LEVELS: readonly FigureLevel[] = ["discovery", "amateur", "expert"];

/** Key of a record: game, mode and level. */
export const recordKey = (game: string, mode: GameMode, level: FigureLevel): string =>
  `${game}:${mode}:${level}`;
const RECORD_KEY = /^[A-Za-z]\w*:(training|streak|timed):(discovery|amateur|expert)$/;
const GAME_ID = /^[A-Za-z]\w*$/;

export type ItemKind = "con" | "star";
export const itemKey = (kind: ItemKind, id: string | number): string => `${kind}:${id}`;

export interface GameStats {
  played: number;
  /** Best score: right answers or points of a series, longest streak, most within the time. */
  best: number;
}

export interface Progress {
  version: typeof PROGRESS_VERSION;
  items: Record<string, Memory>;
  /** By `recordKey(game, mode, level)`. */
  records: Record<string, GameStats>;
  /**
   * Items whose catalogue page was opened (#170), with the first time (ms): « vue ». Kept apart
   * from `items`: reading a page never changes the review schedule of the games.
   */
  seen: Record<string, number>;
}

export const emptyProgress = (): Progress => ({
  version: PROGRESS_VERSION,
  items: {},
  records: {},
  seen: {},
});

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

const isStats = (v: unknown): v is GameStats => {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return Number.isFinite(g.played) && Number.isFinite(g.best);
};

/**
 * Progress read back from storage: unknown keys and malformed records are dropped, an unknown
 * (future) version or unreadable JSON starts afresh.
 * - Version 1 (#163): nothing seen yet.
 * - Versions 1 and 2: their one record per game did not say at which level it was made; it
 *   becomes that game's training record at `legacyLevel` (the level the player has chosen, most
 *   likely the one they played at). Records of games since removed (« Relie les étoiles »,
 *   #184) are carried over the same way, and simply never read.
 */
export function parseProgress(raw: unknown, legacyLevel: FigureLevel = "amateur"): Progress {
  const p = emptyProgress();
  if (typeof raw !== "object" || raw === null) return p;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 && r.version !== 2 && r.version !== PROGRESS_VERSION) return p;
  if (typeof r.items === "object" && r.items !== null)
    for (const [key, value] of Object.entries(r.items))
      if (/^(con|star):/.test(key) && isMemory(value)) p.items[key] = value;
  if (r.version === PROGRESS_VERSION && typeof r.records === "object" && r.records !== null)
    for (const [key, value] of Object.entries(r.records))
      if (RECORD_KEY.test(key) && isStats(value))
        p.records[key] = { played: value.played, best: value.best };
  const level = LEVELS.includes(legacyLevel) ? legacyLevel : "amateur";
  if (r.version !== PROGRESS_VERSION && typeof r.games === "object" && r.games !== null)
    for (const [id, value] of Object.entries(r.games))
      if (GAME_ID.test(id) && isStats(value))
        p.records[recordKey(id, "training", level)] = { played: value.played, best: value.best };
  if (typeof r.seen === "object" && r.seen !== null)
    for (const [key, value] of Object.entries(r.seen))
      if (/^(con|star):/.test(key) && Number.isFinite(value)) p.seen[key] = value as number;
  return p;
}

/**
 * Progress from storage. An older version is written back at once in the new one, so that its
 * records keep the level they were given (`parseProgress`) even if the player changes level.
 */
export function loadProgress(
  store: KeyValueStore | null = defaultStore(),
  legacyLevel: FigureLevel = "amateur",
): Progress {
  try {
    const text = store?.getItem(PROGRESS_KEY);
    if (!text || !store) return emptyProgress();
    const raw: unknown = JSON.parse(text);
    const p = parseProgress(raw, legacyLevel);
    const version = (raw as { version?: unknown } | null)?.version;
    if (version === 1 || version === 2) saveProgress(p, store);
    return p;
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

/** Progress after a finished series or challenge; `key` from `recordKey`. */
export function recordGame(p: Progress, key: string, score: number): Progress {
  const g = p.records[key] ?? { played: 0, best: 0 };
  return {
    ...p,
    records: { ...p.records, [key]: { played: g.played + 1, best: Math.max(g.best, score) } },
  };
}

/** Best score of a game in a mode at a level (0: never played); `key` from `recordKey`. */
export const bestScore = (p: Progress, key: string): number => p.records[key]?.best ?? 0;

/** Progress with an item marked as seen (first time kept); the same object when already seen. */
export function markSeen(p: Progress, key: string, now: number): Progress {
  if (p.seen[key] !== undefined) return p;
  return { ...p, seen: { ...p.seen, [key]: now } };
}

export const isSeen = (p: Progress, key: string): boolean => p.seen[key] !== undefined;

export const masteryOfItem = (p: Progress, key: string): Mastery => masteryOf(p.items[key]);

export type MasteryCounts = Record<Mastery, number> & { total: number };

/** How many of the given items are new, learning, known, mastered. */
export function countMastery(p: Progress, keys: readonly string[]): MasteryCounts {
  const counts: MasteryCounts = { new: 0, learning: 0, known: 0, mastered: 0, total: keys.length };
  for (const key of keys) counts[masteryOfItem(p, key)]++;
  return counts;
}
