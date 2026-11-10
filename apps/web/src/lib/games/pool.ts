/**
 * Which constellations a game asks about, by public level (#163).
 *
 * Découverte: the constellations a first sky guide teaches, chosen by three explicit rules so that
 * the list can be checked against our own data (pool.test.ts):
 * 1. the 12 traditional zodiac constellations (the Sun's path, the « signes » everyone knows);
 * 2. every constellation holding a star of magnitude V ≤ 1.5 (the 23 brightest stars of our
 *    catalogue `stars.bin`, Hipparcos magnitudes): Sirius, Canopus, Arcturus, α Centauri, Véga,
 *    Capella, Rigel, Procyon, Achernar, Bételgeuse, Altaïr, Acrux, Aldébaran, Spica, Antarès,
 *    Pollux, Fomalhaut, Deneb, Régulus… — the stars seen first in a city sky, in both hemispheres;
 * 3. the four guide figures used to find one's way: Grande Ourse (Grande Casserole), Petite Ourse
 *    (étoile Polaire), Cassiopée (the « W ») and Pégase (the Great Square of autumn).
 * That is 29 of the 88. Amateur and Expert: all 88 (Expert differs by what the question shows).
 */
import type { FigureLevel } from "@asteria/sky-renderer";

export const ZODIAC = [
  "Ari",
  "Tau",
  "Gem",
  "Cnc",
  "Leo",
  "Vir",
  "Lib",
  "Sco",
  "Sgr",
  "Cap",
  "Aqr",
  "Psc",
] as const;

/** Constellations holding a star of V ≤ 1.5 (rule 2), checked against the catalogue. */
export const FIRST_MAGNITUDE = [
  "CMa",
  "Car",
  "Boo",
  "Cen",
  "Lyr",
  "Aur",
  "Ori",
  "CMi",
  "Eri",
  "Aql",
  "Cru",
  "Tau",
  "Vir",
  "Sco",
  "Gem",
  "PsA",
  "Cyg",
  "Leo",
] as const;

export const GUIDES = ["UMa", "UMi", "Cas", "Peg"] as const;

export const DISCOVERY_CONSTELLATIONS: readonly string[] = [
  ...new Set<string>([...ZODIAC, ...FIRST_MAGNITUDE, ...GUIDES]),
];

/**
 * The order in which constellations are learnt (review of 2026-11-09, point 7): the figures
 * nearly everyone has heard of first, so that a new player's first questions are the Great Bear
 * and Orion, not the Crab. An editorial choice, not a measurement: the two Bears, Orion and
 * Cassiopeia, the summer triangle, the brightest of the zodiac, then the other figures of the
 * Découverte list in its order, then the rest by abbreviation.
 */
export const LEARNING_ORDER: readonly string[] = [
  ...new Set<string>([
    "UMa",
    "Ori",
    "Cas",
    "UMi",
    "Cyg",
    "Lyr",
    "Leo",
    "Sco",
    "Tau",
    "Gem",
    "CMa",
    "Aql",
    "Peg",
    "Boo",
    "Vir",
    "Cru",
    "Cen",
    ...DISCOVERY_CONSTELLATIONS,
  ]),
];
/** New constellations are drawn among the first ones of that order not asked yet (lib/select). */
export const CONSTELLATION_NEW_WINDOW = 10;

/** The level's constellations (constellationPool) in the order they are learnt. */
export function learningPool(level: FigureLevel, all: readonly string[]): string[] {
  const pool = constellationPool(level, all);
  const inPool = new Set(pool);
  const first = LEARNING_ORDER.filter((a) => inPool.has(a));
  const listed = new Set(first);
  return [...first, ...pool.filter((a) => !listed.has(a))];
}

/** Constellations a level asks about, among those the catalogue draws (`all`), sorted. */
export function constellationPool(level: FigureLevel, all: readonly string[]): string[] {
  const known = new Set(all);
  const list = level === "discovery" ? DISCOVERY_CONSTELLATIONS.filter((a) => known.has(a)) : all;
  return [...list].sort();
}
