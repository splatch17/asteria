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

/** Constellations a level asks about, among those the catalogue draws (`all`), sorted. */
export function constellationPool(level: FigureLevel, all: readonly string[]): string[] {
  const known = new Set(all);
  const list = level === "discovery" ? DISCOVERY_CONSTELLATIONS.filter((a) => known.has(a)) : all;
  return [...list].sort();
}
