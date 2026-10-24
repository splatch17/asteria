/**
 * Going from one constellation's card to the next in the catalogue (#186, #196): the order the
 * cards follow (the list as filtered and searched, or the catalogue's default list when the page
 * was opened from the map), a card's neighbours, which card a scroll offset centres, the cards
 * kept in the page around it and the arrow keys. The swipe itself is the browser's (scroll-snap).
 */
import {
  defaultFilter,
  filterCatalogue,
  type CatalogueEntry,
  type CatalogueFilter,
} from "./catalogue";

/**
 * The pages a swipe goes through from `abbr`: the catalogue list as the user left it (filter and
 * search), or, for a page opened from the map (`outside`), the list the catalogue opens on for the
 * level with no search. A page missing from that list (a search that no longer matches it, a
 * constellation outside the short Découverte list) goes through all 88 in alphabetical order.
 */
export function pageSequence(
  entries: readonly CatalogueEntry[],
  abbr: string,
  list: {
    filter: CatalogueFilter;
    query: string;
    level: string;
    outside: boolean;
    tonight?: ReadonlySet<string>;
  },
): CatalogueEntry[] {
  const shown = list.outside
    ? filterCatalogue(entries, defaultFilter(list.level), "", list.tonight)
    : filterCatalogue(entries, list.filter, list.query, list.tonight);
  return shown.some((e) => e.abbr === abbr) ? shown : filterCatalogue(entries, "all", "");
}

export interface Neighbours<E> {
  previous: E | null;
  next: E | null;
  /** 1-based place of the page in the sequence, 0 if it is not there. */
  index: number;
  count: number;
}

/** The pages before and after `abbr`; none past either end (the list does not wrap). */
export function neighbours<E extends { abbr: string }>(
  sequence: readonly E[],
  abbr: string,
): Neighbours<E> {
  const i = sequence.findIndex((e) => e.abbr === abbr);
  if (i < 0) return { previous: null, next: null, index: 0, count: sequence.length };
  return {
    previous: sequence[i - 1] ?? null,
    next: sequence[i + 1] ?? null,
    index: i + 1,
    count: sequence.length,
  };
}

export type Direction = "previous" | "next";

/**
 * The card centred in the deck (#196) for a horizontal scroll offset, `pitch` being the distance
 * between two cards (a card's width and the gap): the nearest, clamped to the deck.
 */
export function cardAt(scrollLeft: number, pitch: number, count: number): number {
  if (!(pitch > 0) || count < 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / pitch)));
}

/** Cards kept in the page on each side of the centred one; the others are empty slots. */
export const DECK_RADIUS = 2;

/** First and last index of the cards kept in the page around `index`. */
export function deckWindow(
  index: number,
  count: number,
  radius = DECK_RADIUS,
): { from: number; to: number } {
  return { from: Math.max(0, index - radius), to: Math.min(count - 1, index + radius) };
}

/**
 * The cards whose still picture of the sky is prepared once the deck has settled on `index`:
 * the nearest first, the next before the previous (the way a deck is mostly read).
 */
export function stillOrder(index: number, count: number, radius = DECK_RADIUS): number[] {
  const order: number[] = [];
  for (let d = 1; d <= radius; d++)
    for (const i of [index + d, index - d]) if (i >= 0 && i < count) order.push(i);
  return order;
}

/**
 * The page an arrow key turns to on a desktop, or null: ← and → alone, not while typing in a
 * field (where they move the caret) nor with a modifier (Alt+← is the browser's back).
 */
export function arrowDirection(e: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}): Direction | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "")) return null;
  return e.key === "ArrowRight" ? "next" : e.key === "ArrowLeft" ? "previous" : null;
}
