/**
 * Going from one constellation's page to the next in the catalogue (#186): the order the pages
 * follow (the list as filtered and searched, or the catalogue's default list when the page was
 * opened from the map), a page's neighbours, and the horizontal swipe that turns the pages —
 * when it takes over from scrolling and from taps, how far the page follows the finger and
 * whether, on release, it turns or springs back.
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

/** Movement (CSS px) before a gesture is read as a swipe or a scroll; below it, still a tap. */
export const SLOP = 10;
/** Strip along each side of the screen (CSS px) left to the system's back gesture (Android). */
export const EDGE = 28;

export type GestureKind = "pending" | "horizontal" | "vertical";

/**
 * What a gesture is, from its movement since it started: undecided within SLOP, then decided once
 * by its initial direction — sideways turns the page, anything steeper is the page's scroll (the
 * browser, which only pans vertically here, makes the same call).
 */
export function classifyGesture(dx: number, dy: number, slop = SLOP): GestureKind {
  if (Math.hypot(dx, dy) < slop) return "pending";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

/** A touch starting this close to a side of the screen belongs to the system's back gesture. */
export function inEdgeZone(x: number, screenWidth: number, edge = EDGE): boolean {
  return x < edge || x > screenWidth - edge;
}

/** The page a swipe of `dx` CSS px goes towards: right to left turns to the next page. */
export const directionOf = (dx: number): Direction => (dx < 0 ? "next" : "previous");

/** Share of a movement kept when there is no page on that side: the page resists, then returns. */
export const RESISTANCE = 0.2;

/** How far the page follows the finger: all the way towards a neighbour, a little past an end. */
export function dragOffset(dx: number, has: Readonly<Record<Direction, boolean>>): number {
  return has[directionOf(dx)] ? dx : dx * RESISTANCE;
}

/** A release past this share of the page's width turns it. */
export const DISTANCE = 0.3;
/** …or a flick this fast (CSS px per ms) and this long (CSS px). */
export const FLICK_SPEED = 0.45;
export const FLICK_DISTANCE = 32;

/**
 * On release, the page a swipe turns to, or null to spring back: far enough (DISTANCE of the
 * width) or a quick flick, not thrown back the other way, with a page on that side.
 */
export function swipeOutcome(
  dx: number,
  velocity: number,
  width: number,
  has: Readonly<Record<Direction, boolean>>,
): Direction | null {
  if (dx === 0) return null;
  const dir = directionOf(dx);
  if (!has[dir]) return null;
  const againstMovement = velocity !== 0 && Math.sign(velocity) !== Math.sign(dx);
  if (againstMovement && Math.abs(velocity) > FLICK_SPEED / 3) return null;
  const far = Math.abs(dx) >= DISTANCE * width;
  const flick =
    Math.abs(dx) >= FLICK_DISTANCE && Math.abs(velocity) >= FLICK_SPEED && !againstMovement;
  return far || flick ? dir : null;
}

/** Recent positions of a moving finger, for its speed at release. */
export interface Sample {
  x: number;
  t: number;
}
/** Window of the speed at release (ms): the last movement only, not the whole swipe. */
export const SPEED_WINDOW = 80;

/** Horizontal speed (CSS px per ms) over the last SPEED_WINDOW ms of the samples, 0 if unknown. */
export function releaseVelocity(samples: readonly Sample[], window = SPEED_WINDOW): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find((s) => last.t - s.t <= window) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
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
