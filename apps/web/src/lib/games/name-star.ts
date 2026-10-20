/**
 * Game « Nomme l'étoile » (#165): a star lights up in its constellation, on the real sky, and the
 * player names it — 4 names to choose from in Découverte and Amateur, typed in Expert. Pure logic
 * (the screen is NameStarGame.svelte); the stars are `star:HIP` items of the shared progress.
 *
 * Stars asked: those with an official IAU (WGSN) name in our catalogue, shown with their French
 * spelling (packages/content/fr/star-names.json), brightest first:
 * - a named star within MIN_SEPARATION of a brighter named one is left out: the two cannot be
 *   told apart on the picture (Toliman beside Rigil Kentaurus, Alcor beside Mizar, the Pleiades
 *   around Alcyone, the « B » companions);
 * - Découverte: the DISCOVERY_COUNT brightest (Sirius … Shaula, all brighter than V ≈ 1.6);
 * - Amateur: every one down to V = AMATEUR_MAX_V;
 * - Expert: every one drawn by the map at the field that frames its constellation (magnitude at
 *   least MAG_MARGIN brighter than `limitingMagnitude`, for a portrait stage of REFERENCE_ASPECT).
 * New stars come brightest first (`selectItems`' `newWindow`); stars up tonight are preferred.
 *
 * Forgiving but not a giveaway (#165, the user found the games « un peu trop stricts »):
 * - wrong names are plausible — near in the sky and of similar brightness; in Amateur the stars
 *   of the same constellation come first; in Découverte they come from other constellations and
 *   never look like the answer's name (no « Alnitak » next to « Alnilam »);
 * - a typed name is matched as the map's search reads names (`normalize`: case, accents, hyphens
 *   and spaces do not matter) and one typo is forgiven (Damerau-Levenshtein ≤ 1, from 4 letters);
 * - every answer, right or wrong, shows the star's name, constellation and a few facts.
 * Grades for SM-2: right (chosen, or typed with at most one typo) → « good »; wrong, or « Je ne
 * sais pas » → « again ».
 */
import { unitVector, type Vec3 } from "@asteria/astro-core";
import { limitingMagnitude, stereoScale, type FigureLevel } from "@asteria/sky-renderer";
import { normalize, typoAllowed, withinOneEdit } from "../search";
import { angleBetween, framingFov, type ConstellationShape } from "./geometry";
import { itemKey, type Progress } from "./progress";
import { shuffle, type Rng } from "./rng";
import { selectItems } from "./select";
import type { Grade } from "./srs";

export const GAME_ID = "nameStar";
export const SERIES_LENGTH = 10;
export const CHOICES = 4;
/** Two named stars closer than this (degrees) cannot be told apart: the fainter is left out. */
export const MIN_SEPARATION = 0.5;
export const DISCOVERY_COUNT = 25;
export const AMATEUR_MAX_V = 3;
export const REFERENCE_ASPECT = 0.75;
export const MAG_MARGIN = 0.3;
/** Room (degrees) kept around a star lying outside its constellation's figure. */
export const FRAME_MARGIN = 2;
/** On screen, the star asked stands at least this far (CSS px) from any other named star. */
export const MIN_SEPARATION_PX = 26;
/** Wrong names are drawn among this many most plausible ones. */
const NEAR_CHOICES = 6;
/** New stars are drawn among the first few never asked, brightest first. */
const NEW_WINDOW: Readonly<Record<FigureLevel, number>> = {
  discovery: 8,
  amateur: 12,
  expert: 16,
};

/** A star of the game: its HIP number, displayed name, constellation, magnitude, direction. */
export interface StarItem {
  hip: number;
  name: string;
  con: string;
  v: number;
  /** J2000 unit vector (epoch of the catalogue; proper motion is negligible here). */
  dir: Vec3;
}

/**
 * The named stars that can be asked, brightest first: every star with a name, except one lying
 * within MIN_SEPARATION of a brighter named star.
 */
export function namedStars(
  stars: readonly { hip: number; ra: number; dec: number; v: number; con: string; name?: string }[],
): StarItem[] {
  const named = stars
    .filter((s): s is typeof s & { name: string } => !!s.name)
    .map((s) => ({ hip: s.hip, name: s.name, con: s.con, v: s.v, dir: unitVector(s.ra, s.dec) }))
    .sort((a, b) => a.v - b.v || a.hip - b.hip);
  const kept: StarItem[] = [];
  for (const s of named)
    if (!kept.some((k) => angleBetween(k.dir, s.dir) < MIN_SEPARATION)) kept.push(s);
  return kept;
}

/**
 * How a question is framed: the star's constellation figure at the zenith (north up), wide enough
 * to hold the star too. When another named star would stand closer than MIN_SEPARATION_PX to it
 * on a stage `halfHeightPx` high (half of it), the view centres on the star and zooms in until
 * they part. Returns the direction put at the zenith and the vertical field of view.
 */
export function starFraming(
  star: StarItem,
  shape: ConstellationShape | undefined,
  others: readonly StarItem[],
  aspect: number,
  halfHeightPx = 260,
): { centre: Vec3; fov: number } {
  const centre = shape?.centre ?? star.dir;
  const radius = Math.max(shape?.radius ?? 0, angleBetween(centre, star.dir) + FRAME_MARGIN);
  const fov = framingFov(radius, aspect);
  let nearest = Infinity;
  for (const o of others)
    if (o.hip !== star.hip) nearest = Math.min(nearest, angleBetween(o.dir, star.dir));
  if (!Number.isFinite(nearest)) return { centre, fov };
  // Near the centre of the stereographic picture: px per degree = (π/180)·scale·half-height.
  const px = (deg: number, f: number) => ((deg * Math.PI) / 180) * stereoScale(f) * halfHeightPx;
  if (px(nearest, fov) >= MIN_SEPARATION_PX) return { centre, fov };
  // scale = MIN_SEPARATION_PX / (nearest in radians · half-height); fov = 4·atan(1 / (2·scale)).
  const scale = MIN_SEPARATION_PX / (((nearest * Math.PI) / 180) * halfHeightPx);
  const zoomed = (4 * Math.atan(1 / (2 * scale)) * 180) / Math.PI;
  return { centre: star.dir, fov: Math.max(4, Math.min(fov, zoomed)) };
}

/** The stars a level asks about, brightest first (see the file header). */
export function starPool(
  level: FigureLevel,
  stars: readonly StarItem[],
  shapes: Readonly<Record<string, ConstellationShape>>,
): StarItem[] {
  if (level === "discovery") return stars.slice(0, DISCOVERY_COUNT);
  if (level === "amateur") return stars.filter((s) => s.v <= AMATEUR_MAX_V);
  return stars.filter((s) => {
    const { fov } = starFraming(s, shapes[s.con], [], REFERENCE_ASPECT);
    return s.v <= limitingMagnitude(fov) - MAG_MARGIN;
  });
}

/** The two names look alike once normalised: one edit apart, or the same first four letters. */
export function namesAlike(a: string, b: string, strict: boolean): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (withinOneEdit(x, y)) return true;
  return strict && x.length >= 4 && y.length >= 4 && x.slice(0, 4) === y.slice(0, 4);
}

/**
 * How plausible a wrong name is for the star asked: lower is more plausible. Near in the sky
 * (25° counts as much as one magnitude of difference), similar brightness, and — in Amateur and
 * Expert — the same constellation first.
 */
export function plausibility(answer: StarItem, other: StarItem, level: FigureLevel): number {
  const sky = angleBetween(answer.dir, other.dir) / 25;
  const brightness = Math.abs(answer.v - other.v);
  const sameFigure = level !== "discovery" && other.con === answer.con ? -0.6 : 0;
  return sky + brightness + sameFigure;
}

/**
 * CHOICES − 1 wrong names for `answer`, drawn among the NEAR_CHOICES most plausible stars of the
 * pool (see the file header for the Découverte rules); the rules are eased one by one when the
 * pool is too small for them.
 */
export function starDistractors(
  answer: StarItem,
  pool: readonly StarItem[],
  level: FigureLevel,
  rng: Rng,
): StarItem[] {
  const n = CHOICES - 1;
  const others = pool.filter((s) => s.hip !== answer.hip);
  const discovery = level === "discovery";
  const rules: ((s: StarItem) => boolean)[] = [
    (s) => !(discovery && s.con === answer.con) && !namesAlike(s.name, answer.name, discovery),
    (s) => !namesAlike(s.name, answer.name, discovery),
    () => true,
  ];
  for (const rule of rules) {
    const kept = others.filter(rule);
    if (kept.length < n && rule !== rules.at(-1)) continue;
    const ranked = kept
      .map((s) => ({ s, p: plausibility(answer, s, level) }))
      .sort((a, b) => a.p - b.p || a.s.hip - b.s.hip)
      .slice(0, Math.max(n, NEAR_CHOICES))
      .map((r) => r.s);
    return shuffle(ranked, rng).slice(0, n);
  }
  return [];
}

/** A typed name against the star's: exact (accents, case, spaces aside), one typo, or wrong. */
export function matchStarName(input: string, name: string): "exact" | "typo" | null {
  const q = normalize(input);
  if (!q) return null;
  const key = normalize(name);
  const compact = (s: string) => s.replaceAll(" ", "");
  if (q === key || compact(q) === compact(key)) return "exact";
  if (typoAllowed(q) && (withinOneEdit(q, key) || withinOneEdit(compact(q), compact(key))))
    return "typo";
  return null;
}

/** How an answer went, for SM-2: a right name (even with a typo) is « good ». */
export function gradeOf(correct: boolean): Grade {
  return correct ? "good" : "again";
}

export interface StarQuestion {
  hip: number;
  /** HIP numbers of the names offered (the answer among them), or null: typed (Expert). */
  choices: number[] | null;
}

export interface StarSeriesOptions {
  level: FigureLevel;
  /** The level's pool, brightest first (starPool). */
  pool: readonly StarItem[];
  progress: Progress;
  now: number;
  rng: Rng;
  /** HIP numbers (as text) of the stars up tonight: preferred. */
  visible?: ReadonlySet<string>;
  length?: number;
}

/** The questions of a series, for the player's level and memory. */
export function buildStarSeries(o: StarSeriesOptions): StarQuestion[] {
  const byHip = new Map(o.pool.map((s) => [s.hip, s]));
  const keys = selectItems(
    o.pool.map((s) => itemKey("star", s.hip)),
    o.progress,
    {
      count: o.length ?? SERIES_LENGTH,
      now: o.now,
      rng: o.rng,
      visible: o.visible && new Set([...o.visible].map((h) => itemKey("star", h))),
      maxNew: o.level === "discovery" ? 5 : 4,
      newWindow: NEW_WINDOW[o.level],
    },
  );
  return keys.map((key) => {
    const answer = byHip.get(Number(key.slice(5)))!;
    if (o.level === "expert") return { hip: answer.hip, choices: null };
    const wrong = starDistractors(answer, o.pool, o.level, o.rng);
    return { hip: answer.hip, choices: shuffle([answer, ...wrong], o.rng).map((s) => s.hip) };
  });
}

/** Stars closer than this (arc minutes) are one point of light to the eye (α Centauri A + B). */
export const MERGE_ARCMIN = 1;

/** Combined magnitude of stars seen as one: their fluxes add up. */
export const combinedMagnitude = (vs: readonly number[]): number =>
  -2.5 * Math.log10(vs.reduce((sum, v) => sum + 10 ** (-0.4 * v), 0));

/**
 * Rank by brightness (1 = brightest) of every catalogue star, in the sky and in its constellation,
 * as the eye sees them: stars closer than MERGE_ARCMIN are first merged into one point of light,
 * of their combined magnitude (Hipparcos lists α Centauri A and B apart: −0.01 and 1.35, together
 * −0.28, 3rd of the sky before Arcturus, as in every reference list). Every member of a merged
 * system gets the system's rank; the game names its brightest member.
 */
export function brightnessRanks(
  stars: readonly { hip: number; v: number; con: string; ra: number; dec: number }[],
): {
  sky: ReadonlyMap<number, number>;
  constellation: ReadonlyMap<number, number>;
} {
  // Group: sweep by declination, test the true angle only within MERGE_ARCMIN of declination.
  const limit = MERGE_ARCMIN / 60;
  const byDec = stars
    .map((s) => ({ s, dir: unitVector(s.ra, s.dec) }))
    .sort((a, b) => a.s.dec - b.s.dec);
  const group = new Map<number, number>(); // index in byDec → group root
  const root = (i: number): number => {
    let r = i;
    while (group.has(r) && group.get(r) !== r) r = group.get(r)!;
    return r;
  };
  for (let i = 0; i < byDec.length; i++) {
    group.set(i, i);
    for (let j = i - 1; j >= 0 && byDec[i]!.s.dec - byDec[j]!.s.dec <= limit; j--)
      if (angleBetween(byDec[i]!.dir, byDec[j]!.dir) < limit) group.set(root(i), root(j));
  }
  const systems = new Map<number, { members: (typeof stars)[number][]; v: number }>();
  byDec.forEach(({ s }, i) => {
    const r = root(i);
    const sys = systems.get(r) ?? { members: [], v: 0 };
    sys.members.push(s);
    systems.set(r, sys);
  });
  const lights = [...systems.values()].map((sys) => {
    const brightest = sys.members.reduce((a, b) => (b.v < a.v ? b : a));
    return { members: sys.members, v: combinedMagnitude(sys.members.map((m) => m.v)), brightest };
  });
  lights.sort((a, b) => a.v - b.v || a.brightest.hip - b.brightest.hip);
  const sky = new Map<number, number>();
  const constellation = new Map<number, number>();
  const counts = new Map<string, number>();
  lights.forEach((light, i) => {
    const con = light.brightest.con;
    const n = (counts.get(con) ?? 0) + 1;
    counts.set(con, n);
    for (const m of light.members) {
      sky.set(m.hip, i + 1);
      constellation.set(m.hip, n);
    }
  });
  return { sky, constellation };
}

export type BrightnessRanks = ReturnType<typeof brightnessRanks>;

/** The ranks worth saying: among the 25 brightest of the sky, else the 5 of its constellation. */
export function rankFact(
  hip: number,
  ranks: BrightnessRanks,
): { kind: "sky" | "constellation"; rank: number } | null {
  const sky = ranks.sky.get(hip);
  if (sky !== undefined && sky <= 25) return { kind: "sky", rank: sky };
  const con = ranks.constellation.get(hip);
  if (con !== undefined && con <= 5) return { kind: "constellation", rank: con };
  return null;
}
