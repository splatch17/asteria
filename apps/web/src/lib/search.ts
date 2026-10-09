/**
 * Sky object search (#99): one in-memory index, built once, matched on every keystroke.
 *
 * Text is compared in a normalised form: compatibility decomposition (NFKD), diacritics removed,
 * lower case, Greek letters spelled out ("α¹ Cen" → "alpha 1 cen"), letters and digits split
 * ("HIP27989" → "hip 27989"). Ranking: exact > prefix > word prefix > substring > one typo
 * (Damerau-Levenshtein ≤ 1, queries of 4 characters or more), then by importance (`weight`).
 *
 * Entries are typed by `target`, so that deep-sky objects (#100) only add a member to the union.
 */
import type { Planet } from "@asteria/astro-core";

export type SearchTarget =
  | { kind: "star"; hip: number }
  | { kind: "constellation"; abbr: string }
  | { kind: "body"; body: "Sun" | "Moon" }
  | { kind: "planet"; planet: Planet };

export type SearchKind = SearchTarget["kind"];

export interface SearchEntry {
  target: SearchTarget;
  /** Name shown in the results. */
  label: string;
  /** Other names and designations, shown under the label. */
  details: string[];
  /** Lower is listed first among equal matches: a magnitude for stars, below them for bodies. */
  weight: number;
  /** Normalised search keys. */
  keys: string[];
  /** The keys joined by line breaks: one substring test rejects most entries at once. */
  text: string;
  /** Words (3 letters or more) of the keys with several words, for the typo test. */
  words: string[];
}

/** The star fields the index reads (a subset of the catalogue record). */
export interface SearchStar {
  hip: number;
  v: number;
  con: string;
  /** Displayed (localised) proper name. */
  name?: string;
  bayer?: string;
  flamsteed?: number;
}

export interface SearchSources {
  stars: readonly SearchStar[];
  /** Official IAU names by HIP, searched too when the displayed name differs. */
  iauNames?: Readonly<Record<string, string>>;
  constellations: readonly { abbr: string; name: string; latin: string }[];
  bodies: readonly { body: "Sun" | "Moon"; name: string }[];
  planets: readonly { planet: Planet; name: string }[];
  /** Label of a star known only by its Hipparcos number. */
  hipLabel: (hip: number) => string;
}

export interface SearchIndex {
  entries: SearchEntry[];
  /** Every catalogue star, for exact "HIP n" lookups (only designated stars are in `entries`). */
  byHip: ReadonlyMap<number, SearchStar>;
  hipEntries: ReadonlyMap<number, SearchEntry>;
  hipLabel: (hip: number) => string;
}

/** Spelled-out names of α (U+03B1) … ω (U+03C9), final sigma included. */
const GREEK_NAMES =
  "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma sigma tau upsilon phi chi psi omega".split(
    " ",
  );
const GREEK_VARIANTS: Readonly<Record<string, string>> = { ϑ: "theta", ϕ: "phi", ϵ: "epsilon" };
const greekName = (c: string) => GREEK_VARIANTS[c] ?? GREEK_NAMES[c.charCodeAt(0) - 0x3b1] ?? c;
/** Other spellings of spelled-out Greek letters (French accents are already gone). */
const SPELLINGS: Readonly<Record<string, string>> = {
  alfa: "alpha",
  ksi: "xi",
  khi: "chi",
  ypsilon: "upsilon",
  omikron: "omicron",
};
const LIGATURES: Readonly<Record<string, string>> = { œ: "oe", æ: "ae", ß: "ss" };

/** Normalised form of a name or a query (see the file header). */
export function normalize(text: string): string {
  const words = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[œæß]/g, (c) => LIGATURES[c]!)
    .replace(/[α-ωϑϕϵ]/g, (c) => ` ${greekName(c)} `)
    .replace(/(\p{L})(\p{N})|(\p{N})(\p{L})/gu, (_, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return words.map((w) => SPELLINGS[w] ?? w).join(" ");
}

const SUPERSCRIPTS = /[¹²³⁴⁵⁶⁷⁸⁹]/g;

/** Builds the index once (≈ 4 000 designated stars, 88 constellations, 9 bodies). */
export function buildSearchIndex(src: SearchSources): SearchIndex {
  const entries: SearchEntry[] = [];
  const keysOf = (...names: (string | undefined)[]) =>
    prepare([...new Set(names.filter((n): n is string => !!n).map(normalize))]);

  src.bodies.forEach(({ body, name }, i) =>
    entries.push({
      target: { kind: "body", body },
      label: name,
      details: [],
      weight: -100 + i,
      ...keysOf(name, body),
    }),
  );
  src.planets.forEach(({ planet, name }, i) =>
    entries.push({
      target: { kind: "planet", planet },
      label: name,
      details: [],
      weight: -50 + i,
      ...keysOf(name, planet),
    }),
  );
  for (const { abbr, name, latin } of src.constellations)
    entries.push({
      target: { kind: "constellation", abbr },
      label: name,
      details: [latin, abbr],
      // Between the first-magnitude stars and the others.
      weight: 1,
      ...keysOf(name, latin, abbr),
    });

  const byHip = new Map<number, SearchStar>();
  const hipEntries = new Map<number, SearchEntry>();
  for (const s of src.stars) {
    byHip.set(s.hip, s);
    const iau = src.iauNames?.[s.hip];
    const flamsteed = s.flamsteed ? `${s.flamsteed} ${s.con}` : undefined;
    if (!s.name && !s.bayer && !flamsteed) continue;
    const label = s.name ?? s.bayer ?? flamsteed!;
    const details = [iau !== label ? iau : undefined, s.bayer, flamsteed, src.hipLabel(s.hip)];
    const entry: SearchEntry = {
      target: { kind: "star", hip: s.hip },
      label,
      details: details.filter((d): d is string => !!d && d !== label),
      weight: s.v,
      ...keysOf(s.name, iau, s.bayer, s.bayer?.replace(SUPERSCRIPTS, ""), flamsteed),
    };
    entries.push(entry);
    hipEntries.set(s.hip, entry);
  }
  return { entries, byHip, hipEntries, hipLabel: src.hipLabel };
}

function prepare(keys: string[]): Pick<SearchEntry, "keys" | "text" | "words"> {
  const words = new Set(keys.filter((k) => k.includes(" ")).flatMap((k) => k.split(" ")));
  return { keys, text: keys.join("\n"), words: [...words].filter((w) => w.length >= 3) };
}

/**
 * True when a and the first `lb` characters of b differ by at most one edit (insertion, deletion,
 * substitution or adjacent swap: Damerau-Levenshtein ≤ 1). Index arithmetic only: no allocation.
 */
export function withinOneEdit(a: string, b: string, lb = b.length): boolean {
  const la = a.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (i === la && i === lb) return true;
  if (la > lb) return sameTail(a, la, i + 1, b, lb, i);
  if (la < lb) return sameTail(a, la, i, b, lb, i + 1);
  if (sameTail(a, la, i + 1, b, lb, i + 1)) return true; // substitution
  return a[i] === b[i + 1] && a[i + 1] === b[i] && sameTail(a, la, i + 2, b, lb, i + 2); // swap
}

/** a[ia..la) equals b[ib..lb). */
function sameTail(a: string, la: number, ia: number, b: string, lb: number, ib: number): boolean {
  if (la - ia !== lb - ib) return false;
  while (ia < la) if (a.charCodeAt(ia++) !== b.charCodeAt(ib++)) return false;
  return true;
}

/** Match quality of a query against a key: 0 exact … 4 one typo; -1 no match. */
export function matchTier(query: string, key: string): number {
  if (key === query) return 0;
  if (key.startsWith(query)) return 1;
  if (key.includes(` ${query}`)) return 2;
  if (key.includes(query)) return 3;
  if (query.length < 4) return -1;
  const n = query.length;
  return withinOneEdit(query, key) || (key.length > n && withinOneEdit(query, key, n)) ? 4 : -1;
}

export interface SearchResult {
  entry: SearchEntry;
  tier: number;
}

export const MAX_RESULTS = 20;

/** Best entries for a query, at most `limit`. */
export function search(index: SearchIndex, query: string, limit = MAX_RESULTS): SearchResult[] {
  const q = normalize(query);
  if (!q) return [];
  const hip = /^hip (\d+)$/.exec(q);
  if (hip) {
    const n = Number(hip[1]);
    const entry = index.hipEntries.get(n) ?? hipOnlyEntry(index, n);
    return entry ? [{ entry, tier: 0 }] : [];
  }
  const found: SearchResult[] = [];
  for (const entry of index.entries) {
    let tier = -1;
    if (entry.text.includes(q)) {
      for (const key of entry.keys) {
        const t = matchTier(q, key);
        if (t >= 0 && (tier < 0 || t < tier)) tier = t;
      }
    } else if (q.length >= 4) {
      // Most entries do not contain the query: only the typo test remains for them.
      const n = q.length;
      for (const key of entry.keys)
        if (withinOneEdit(q, key) || (key.length > n && withinOneEdit(q, key, n))) tier = 4;
      if (tier < 0) for (const w of entry.words) if (withinOneEdit(q, w)) tier = 4;
    }
    if (tier >= 0) found.push({ entry, tier });
  }
  found.sort((a, b) => a.tier - b.tier || a.entry.weight - b.entry.weight);
  return found.slice(0, limit);
}

function hipOnlyEntry(index: SearchIndex, hip: number): SearchEntry | null {
  const s = index.byHip.get(hip);
  if (!s) return null;
  return {
    target: { kind: "star", hip },
    label: index.hipLabel(hip),
    details: [],
    weight: s.v,
    ...prepare([]),
  };
}
