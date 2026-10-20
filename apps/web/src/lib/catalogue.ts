/**
 * Constellation catalogue (#170): the list of the 88 constellations (search, level, tonight),
 * and the facts of a constellation's page — main stars, best evening period, how high it gets
 * from the user's place — computed from our own catalogue (Hipparcos positions, IAU figures).
 */
import type { CatalogStar } from "@asteria/sky-renderer";
import { DISCOVERY_CONSTELLATIONS } from "./games/pool";
import type { ConstellationShape } from "./games/geometry";
import { matchTier, normalize } from "./search";

const DEG = 180 / Math.PI;

export interface CatalogueEntry {
  abbr: string;
  /** French name. */
  name: string;
  /** Official Latin name. */
  latin: string;
}

/** « Essentielles »: the Découverte list of the games (29); « Toutes »: the 88; « Ce soir ». */
export type CatalogueFilter = "essential" | "all" | "tonight";

/** The filter a level starts on: the short list in Découverte, everything above. */
export const defaultFilter = (level: string): CatalogueFilter =>
  level === "discovery" ? "essential" : "all";

/**
 * Entries kept by a filter and a query, in reading order: alphabetical (French collation) without
 * a query; with one, best match first (name, Latin name or abbreviation: exact, prefix, word
 * prefix, substring, one typo — the search of the map, #99), then alphabetical.
 */
export function filterCatalogue(
  entries: readonly CatalogueEntry[],
  filter: CatalogueFilter,
  query: string,
  tonight: ReadonlySet<string> = new Set(),
): CatalogueEntry[] {
  const essential = new Set(DISCOVERY_CONSTELLATIONS);
  const kept = entries.filter((e) =>
    filter === "essential"
      ? essential.has(e.abbr)
      : filter === "tonight"
        ? tonight.has(e.abbr)
        : true,
  );
  const byName = (a: CatalogueEntry, b: CatalogueEntry) => a.name.localeCompare(b.name, "fr");
  const q = normalize(query);
  if (!q) return kept.sort(byName);
  const tier = (e: CatalogueEntry) => {
    const tiers = [e.name, e.latin, e.abbr]
      .map((k) => matchTier(q, normalize(k)))
      .filter((t) => t >= 0);
    return tiers.length ? Math.min(...tiers) : -1;
  };
  return kept
    .map((e) => ({ e, t: tier(e) }))
    .filter((r) => r.t >= 0)
    .sort((a, b) => a.t - b.t || byName(a.e, b.e))
    .map((r) => r.e);
}

/**
 * Stars listed on a page: the constellation's own stars (IAU boundaries) and those its figure
 * joins, brightest first, keeping the ones with a name or a Bayer letter (what a reader can look
 * for), `max` of them. A faint constellation without any is given its `min` brightest stars.
 */
export function mainStars<S extends CatalogStar>(
  stars: readonly S[],
  lines: Readonly<Record<string, readonly (readonly number[])[]>>,
  abbr: string,
  max = 8,
  min = 3,
): S[] {
  const figure = new Set((lines[abbr] ?? []).flat());
  const own = stars.filter((s) => s.con === abbr || figure.has(s.hip)).sort((a, b) => a.v - b.v);
  const named = own.filter((s) => s.name || s.bayer).slice(0, max);
  if (named.length >= min) return named;
  const others = own.filter((s) => !named.includes(s)).slice(0, min - named.length);
  return [...named, ...others].sort((a, b) => a.v - b.v);
}

/** Stars that can be touched on a page: the constellation's stars and its figure's, V ≤ `limit`. */
export function tappableStars<S extends CatalogStar>(
  stars: readonly S[],
  lines: Readonly<Record<string, readonly (readonly number[])[]>>,
  abbr: string,
  limit = 5.5,
): S[] {
  const figure = new Set((lines[abbr] ?? []).flat());
  return stars.filter((s) => figure.has(s.hip) || (s.con === abbr && s.v <= limit));
}

/**
 * The star under a tap among projected candidates (CSS px): the nearest within `radius`, a
 * brighter star winning over a fainter one a few pixels nearer (2 px per magnitude). Null if none.
 */
export function pickStar<T extends { x: number; y: number; v: number }>(
  tap: { x: number; y: number },
  candidates: readonly T[],
  radius = 24,
): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - tap.x, c.y - tap.y);
    if (d > radius) continue;
    const score = d + 2 * c.v;
    if (score < bestScore) [best, bestScore] = [c, score];
  }
  return best;
}

/** Right ascension and declination (degrees, J2000) of a figure's centre. */
export function centreRaDec(shape: Pick<ConstellationShape, "centre">): {
  ra: number;
  dec: number;
} {
  const [x, y, z] = shape.centre;
  return {
    ra: (((Math.atan2(y, x) * DEG) % 360) + 360) % 360,
    dec: Math.asin(Math.max(-1, Math.min(1, z))) * DEG,
  };
}

/** Day of the year (1 = 1 January) of the March equinox, when the Sun's right ascension is 0. */
const EQUINOX_DAY = 79;
/** Evening hour (local solar time) the « best period » is given for. */
export const EVENING_HOUR = 21;

/**
 * Month (0 = January) when a figure of right ascension `ra` (degrees) is highest in the sky at
 * 21 h local solar time — the usual « best period » of sky guides. The Sun's right ascension grows
 * by about 360° a year from 0 at the March equinox; an object culminates at midnight when it is
 * 180° from the Sun, and three hours earlier each evening 45 days later. A mean Sun (± 2 days)
 * is plenty for a month. Same month in both hemispheres.
 */
export function bestMonth(ra: number): number {
  const midnight = EQUINOX_DAY + ((((ra + 180) % 360) + 360) % 360) * (365.25 / 360);
  const day = (midnight + (24 - EVENING_HOUR) * (365.25 / 24)) % 365;
  // Day of the year (1-based) → month of a common year.
  const ends = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
  const d = Math.max(1, Math.floor(day));
  return ends.findIndex((e) => d <= e);
}

export type Observability = "circumpolar" | "seasonal" | "low" | "never";

/** Below this highest altitude (degrees), a figure stays low on the horizon. */
export const LOW_ALTITUDE = 20;

/**
 * How a figure centred at declination `dec` stands from latitude `latitude` (degrees): always
 * above the horizon (circumpolar), up part of the year, never higher than LOW_ALTITUDE, or never
 * up. Also the highest altitude of its centre (on the meridian). Refraction is ignored.
 */
export function observability(
  dec: number,
  latitude: number,
): { kind: Observability; maxAltitude: number } {
  const maxAltitude = 90 - Math.abs(latitude - dec);
  const minAltitude = Math.abs(latitude + dec) - 90;
  const kind: Observability =
    maxAltitude <= 0
      ? "never"
      : maxAltitude < LOW_ALTITUDE
        ? "low"
        : minAltitude > 0
          ? "circumpolar"
          : "seasonal";
  return { kind, maxAltitude };
}

/**
 * The same for a whole figure, from the declinations of its stars: how high its highest star
 * climbs, never up when none rises, circumpolar when every star stays up.
 */
export function figureObservability(
  decs: readonly number[],
  latitude: number,
): { kind: Observability; maxAltitude: number } {
  if (!decs.length) return observability(0, latitude);
  const each = decs.map((d) => observability(d, latitude));
  const maxAltitude = Math.max(...each.map((o) => o.maxAltitude));
  const kind: Observability = each.every((o) => o.kind === "circumpolar")
    ? "circumpolar"
    : maxAltitude <= 0
      ? "never"
      : maxAltitude < LOW_ALTITUDE
        ? "low"
        : "seasonal";
  return { kind, maxAltitude };
}
