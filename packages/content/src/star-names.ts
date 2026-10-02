/**
 * Localised common names of stars (#67), keyed by Hipparcos number. The catalogue carries the
 * official IAU (WGSN) names; a locale table only lists the names to show instead, e.g.
 * "Bételgeuse" for Betelgeuse. Built by packages/sky-data/build_star_names_fr.py (IAU WGSN +
 * Wikidata), see docs/DATA_SOURCES.md.
 */
import fr from "../fr/star-names.json";
import type { ContentLocale } from "./index";

interface StarNameTable {
  format: "asteria-star-names";
  version: 1;
  names: Record<string, string>;
}

const TABLES: Record<ContentLocale, StarNameTable> = { fr: fr as StarNameTable };

/** Name to display for a star in a locale: the localised name if any, else the IAU name. */
export function starName(locale: ContentLocale, hip: number, iauName: string): string {
  return TABLES[locale].names[hip] ?? iauName;
}

/** French common name of a star ("Bételgeuse", "Véga"…), falling back to its IAU name. */
export function starNameFr(hip: number, iauName: string): string {
  return starName("fr", hip, iauName);
}

/**
 * Returns a copy of a star string table (`{ name: { [hip]: iauName }, … }`, as decoded by
 * `@asteria/catalog`) whose names are localised. Only stars that already have an IAU name are
 * named: the table never names an unnamed star.
 */
export function localizeStarStrings<T extends { name: Record<string, string> }>(
  locale: ContentLocale,
  strings: T,
): T {
  const name: Record<string, string> = {};
  for (const [hip, iau] of Object.entries(strings.name)) name[hip] = starName(locale, +hip, iau);
  return { ...strings, name };
}
