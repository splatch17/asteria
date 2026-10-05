/**
 * Library menu (#90): the catalogues listed from the data already loaded by the app (88
 * constellations, named stars, Sun, Moon and planets), their search and sorting, and small helpers
 * for the stories (teaser, reading time, anecdote of the day). Pure functions, tested.
 */
import {
  applyMat3,
  j2000ToHorizontalMatrix,
  propagateStar,
  unitVector,
  type Mat3,
  type Observer,
} from "@asteria/astro-core";
import type { CatalogStar } from "@asteria/sky-renderer";
import { visibility, type Visibility } from "./constellation";

export type CatalogTab = "constellations" | "stars" | "solar";
export const CATALOG_TABS: readonly CatalogTab[] = ["constellations", "stars", "solar"];
export type SortKey = "name" | "bright";

/** What a list entry opens on the map (mirrors the renderer's SkySelection). */
export type LibraryTarget =
  | { kind: "constellation"; abbr: string }
  | { kind: "star"; hip: number }
  | { kind: "body"; body: "Sun" | "Moon" }
  | { kind: "planet"; planet: string };

export interface LibraryItem {
  /** Unique within its tab: abbreviation, HIP number or body name. */
  id: string;
  target: LibraryTarget;
  name: string;
  /** Second line: Latin name, Bayer designation… (may be empty). */
  detail: string;
  /** Apparent magnitude used by the "brightness" sort (brightest star for a constellation). */
  magnitude: number | null;
  /** Above the horizon now; null when unknown (not computed). */
  visibility: Visibility | null;
  /** Normalised text that the search runs on. */
  haystack: string;
}

/** Lower case, no diacritics, punctuation as spaces: "Bételgeuse" and "betelgeuse" match. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const haystack = (...parts: (string | number | undefined | null)[]) =>
  normalize(parts.filter((p) => p !== undefined && p !== null && p !== "").join(" "));

/**
 * How well an item matches a normalised query: 0 = its name starts with it, 1 = a word of the
 * name starts with it, 2 = every query word appears somewhere, null = no match.
 */
export function matchRank(
  item: Pick<LibraryItem, "name" | "haystack">,
  query: string,
): number | null {
  if (!query) return 2;
  const name = normalize(item.name);
  if (name.startsWith(query)) return 0;
  if (name.split(" ").some((w) => w.startsWith(query))) return 1;
  const words = query.split(" ");
  return words.every((w) => item.haystack.includes(w)) ? 2 : null;
}

/**
 * Filters and sorts a list: with a query, the best matches come first (see matchRank), then the
 * chosen order. "bright" puts the lowest magnitude first, unknown magnitudes last.
 */
export function searchItems(
  items: readonly LibraryItem[],
  query: string,
  sort: SortKey,
  locale = "fr",
): LibraryItem[] {
  const q = normalize(query);
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const ranked: { item: LibraryItem; rank: number }[] = [];
  for (const item of items) {
    const rank = matchRank(item, q);
    if (rank !== null) ranked.push({ item, rank: q ? rank : 0 });
  }
  const byMagnitude = (a: LibraryItem, b: LibraryItem) =>
    (a.magnitude ?? Infinity) - (b.magnitude ?? Infinity);
  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (sort === "bright" ? byMagnitude(a.item, b.item) : 0) ||
        collator.compare(a.item.name, b.item.name),
    )
    .map((r) => r.item);
}

/** Brightest V magnitude per constellation, in one pass over the catalogue. */
export function brightestMagnitudes(stars: readonly CatalogStar[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of stars) {
    const v = out.get(s.con);
    if (v === undefined || s.v < v) out.set(s.con, s.v);
  }
  return out;
}

/** Sky context of the lists: whether each object is up, for an observer at a date. */
export interface SkyContext {
  date: Date;
  observer: Observer;
  /** Julian years since the catalogue epoch J1991.25 (proper motion, #78). */
  years: number;
}

const altitude = (m: Mat3, ra: number, dec: number) => applyMat3(m, unitVector(ra, dec))[2];

/** Visibility of every constellation figure (one pass over the catalogue). */
export function constellationVisibilities(
  stars: readonly CatalogStar[],
  lines: Readonly<Record<string, number[][]>>,
  ctx: SkyContext,
): Map<string, Visibility> {
  const m = j2000ToHorizontalMatrix(ctx.date, ctx.observer);
  const byHip = new Map<number, CatalogStar>();
  for (const s of stars) byHip.set(s.hip, s);
  const out = new Map<string, Visibility>();
  for (const [abbr, polylines] of Object.entries(lines)) {
    const alts: number[] = [];
    for (const hip of new Set(polylines.flat())) {
      const s = byHip.get(hip);
      if (!s) continue;
      const p = ctx.years ? propagateStar(s, ctx.years) : s;
      alts.push(altitude(m, p.ra, p.dec));
    }
    if (alts.length) out.set(abbr, visibility(alts));
  }
  return out;
}

export function constellationItems(
  abbrs: readonly string[],
  names: Readonly<Record<string, string>>,
  latin: Readonly<Record<string, string>>,
  magnitudes: ReadonlyMap<string, number>,
  visibilities?: ReadonlyMap<string, Visibility>,
): LibraryItem[] {
  return abbrs.map((abbr) => {
    const name = names[abbr] ?? abbr;
    const la = latin[abbr] ?? abbr;
    return {
      id: abbr,
      target: { kind: "constellation", abbr },
      name,
      detail: la,
      magnitude: magnitudes.get(abbr) ?? null,
      visibility: visibilities?.get(abbr) ?? null,
      haystack: haystack(name, la, abbr),
    };
  });
}

/** The named stars (IAU or localised name), with their designation and constellation. */
export function starItems(
  stars: readonly CatalogStar[],
  conNames: Readonly<Record<string, string>>,
  ctx?: SkyContext,
): LibraryItem[] {
  const m = ctx ? j2000ToHorizontalMatrix(ctx.date, ctx.observer) : null;
  const out: LibraryItem[] = [];
  for (const s of stars) {
    if (!s.name) continue;
    const con = conNames[s.con] ?? s.con;
    let vis: Visibility | null = null;
    if (m && ctx) {
      const p = ctx.years ? propagateStar(s, ctx.years) : s;
      vis = altitude(m, p.ra, p.dec) > 0 ? "up" : "down";
    }
    out.push({
      id: String(s.hip),
      target: { kind: "star", hip: s.hip },
      name: s.name,
      detail: [s.bayer, con].filter(Boolean).join(" · "),
      magnitude: s.v,
      visibility: vis,
      haystack: haystack(s.name, s.bayer, con, s.con, `hip ${s.hip}`),
    });
  }
  return out;
}

export interface SolarBody {
  id: "Sun" | "Moon" | string;
  name: string;
  /** Kind line, e.g. "Planète". */
  detail: string;
  magnitude: number | null;
  /** Degrees above the horizon; null when not computed (out of the ephemeris range). */
  altitude: number | null;
}

/** Sun, Moon and planets, in the order given (from the Sun outwards). */
export function solarItems(bodies: readonly SolarBody[]): LibraryItem[] {
  return bodies.map((b) => ({
    id: b.id,
    target:
      b.id === "Sun" || b.id === "Moon"
        ? { kind: "body", body: b.id }
        : { kind: "planet", planet: b.id },
    name: b.name,
    detail: b.detail,
    magnitude: b.magnitude,
    visibility: b.altitude === null ? null : b.altitude > 0 ? "up" : "down",
    haystack: haystack(b.name, b.detail, b.id),
  }));
}

/**
 * View that shows a direction (altitude, azimuth in degrees) at `yTarget` of the screen height
 * from the top, so that the sheet opened below does not hide it. Same stereographic offset as
 * frameAbove (lib/constellation.ts). The field is narrowed to `maxFov` at most.
 */
export function viewToward(
  altitude: number,
  azimuth: number,
  fov: number,
  { yTarget = 0.3, maxFov = 90 } = {},
): { azimuth: number; altitude: number; fov: number } {
  const f = Math.min(fov, maxFov);
  const rad = Math.PI / 180;
  const offset = (2 * Math.atan((1 - 2 * yTarget) * Math.tan((f * rad) / 4))) / rad;
  return { azimuth, altitude: Math.max(-89.9, Math.min(89.9, altitude - offset)), fov: f };
}

// --- Stories

/** Estimated reading time in whole minutes (≥ 1), at `wpm` words per minute. */
export function readingMinutes(texts: readonly string[], wpm = 200): number {
  const words = texts.reduce((n, t) => n + (t.match(/\S+/g)?.length ?? 0), 0);
  return Math.max(1, Math.round(words / wpm));
}

/**
 * Short teaser of a paragraph: its first sentence if it fits in `max` characters, else the text
 * cut at a word boundary with an ellipsis. Markdown emphasis stars are dropped.
 */
export function teaser(text: string, max = 140): string {
  const plain = text.replace(/\*(\S(?:[^*\n]*\S)?)\*/g, "$1").trim();
  const sentence = /^(.+?[.!?…])(\s|$)/.exec(plain)?.[1];
  if (sentence && sentence.length <= max) return sentence;
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}…`;
}

/** Day number since 1970-01-01 in local time: changes at local midnight. */
export function localDay(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

/**
 * The "anecdote of the day": a story and a seed, the same for everyone on a given local day, and
 * different from one day to the next. The anecdote is `seed % anecdotes.length` once loaded.
 */
export function anecdoteOfTheDay(
  ids: readonly string[],
  date: Date,
): { id: string; seed: number } | null {
  if (!ids.length) return null;
  const day = localDay(date);
  // Knuth's multiplicative hash spreads consecutive days over the stories.
  const h = Math.imul(day, 2654435761) >>> 0;
  return { id: ids[h % ids.length]!, seed: (h >>> 8) % 1009 };
}
