/**
 * « Tes dernières cartes » of the Catalogue tab (menu v2): the last constellations whose card was
 * looked at in the deck, most recent first. Kept on the device (`asteria.catalogue.recent`); for
 * someone who used the catalogue before this list existed, it starts from the cards already
 * consulted (`seen` of the games' progress, #170), the most recently first seen first.
 */

export const RECENT_KEY = "asteria.catalogue.recent";
export const RECENT_MAX = 3;

export const isRecentList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** The list with `abbr` first (moved there if it was in it), at most `max` long. */
export function pushRecent(list: readonly string[], abbr: string, max = RECENT_MAX): string[] {
  return [abbr, ...list.filter((a) => a !== abbr)].slice(0, max);
}

/**
 * The cards to show: the stored list, then (when it is short) the cards consulted before it
 * existed, by the time they were first seen; only constellations the catalogue knows.
 */
export function recentCards(
  stored: readonly string[],
  seen: Readonly<Record<string, number>>,
  known: (abbr: string) => boolean,
  max = RECENT_MAX,
): string[] {
  const out = stored.filter(known).slice(0, max);
  if (out.length >= max) return out;
  const older = Object.entries(seen)
    .filter(([key]) => key.startsWith("con:"))
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key.slice(4))
    .filter((abbr) => known(abbr) && !out.includes(abbr));
  return [...out, ...older].slice(0, max);
}
