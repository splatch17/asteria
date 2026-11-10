/**
 * What the search shows before anything is typed (review of 2026-11-09, point 6; audit P12):
 * the last objects chosen, then what is up in the sky right now. Pure: positions come from the
 * caller.
 */
import type { SearchEntry, SearchIndex, SearchTarget } from "./search";

export const RECENT_SEARCH_KEY = "asteria.search.recent";
export const MAX_RECENT_SEARCHES = 5;

/** A stable key for a target (« star:91262 », « constellation:Ori », « deepsky:M31 »). */
export function targetKey(t: SearchTarget): string {
  switch (t.kind) {
    case "star":
      return `star:${t.hip}`;
    case "constellation":
      return `constellation:${t.abbr}`;
    case "body":
      return `body:${t.body}`;
    case "planet":
      return `planet:${t.planet}`;
    case "satellite":
      return `satellite:${t.id}`;
    case "deepsky":
      return `deepsky:${t.id}`;
  }
}

/** The index's entry of a key, if it still has one (deep-sky objects come with their catalogue). */
export function entryOf(index: SearchIndex, key: string): SearchEntry | undefined {
  if (key.startsWith("star:")) {
    const hip = Number(key.slice(5));
    const known = index.hipEntries.get(hip);
    if (known) return known;
  }
  return index.entries.find((e) => targetKey(e.target) === key);
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** The keys of the last objects chosen, the latest first. */
export function loadRecentSearches(store: Store | null): string[] {
  try {
    const saved: unknown = JSON.parse(store?.getItem(RECENT_SEARCH_KEY) ?? "null");
    return Array.isArray(saved)
      ? saved.filter((k): k is string => typeof k === "string").slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
}

/** Puts a target first in the list (once), keeps MAX_RECENT_SEARCHES, saves and returns it. */
export function rememberSearch(store: Store | null, target: SearchTarget): string[] {
  const key = targetKey(target);
  const next = [key, ...loadRecentSearches(store).filter((k) => k !== key)].slice(
    0,
    MAX_RECENT_SEARCHES,
  );
  try {
    store?.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  } catch {
    // not persisted: acceptable
  }
  return next;
}

export interface UpNow {
  target: SearchTarget;
  /** Degrees above the horizon. */
  altitude: number;
  /** Visual magnitude (lower is brighter). */
  magnitude: number;
}

/**
 * The objects worth proposing among those up now: at `minAltitude` or more, the brightest
 * first, at most `count`.
 */
export function brightestUp(
  candidates: readonly UpNow[],
  count: number,
  minAltitude = 10,
): UpNow[] {
  return candidates
    .filter((c) => c.altitude >= minAltitude)
    .sort((a, b) => a.magnitude - b.magnitude)
    .slice(0, count);
}
