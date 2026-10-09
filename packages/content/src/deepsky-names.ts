/**
 * Localised common names of deep-sky objects (#100), keyed by the catalogue id of
 * `@asteria/catalog` (`DeepSkyObject.id`: "M31", "NGC5139", "C41"…). Only famous objects that
 * OpenNGC names (in English) have an entry; build_deepsky.py fails if a key is not in the
 * catalogue. See docs/DATA_SOURCES.md.
 */
import fr from "../fr/deepsky-names.json";
import type { ContentLocale } from "./index";

interface DeepSkyNameTable {
  format: "asteria-deepsky-names";
  version: 1;
  names: Record<string, string>;
}

const TABLES: Record<ContentLocale, DeepSkyNameTable> = { fr: fr as DeepSkyNameTable };

/** Localised common name of a deep-sky object ("Galaxie d'Andromède" for M31), if it has one. */
export function deepSkyName(locale: ContentLocale, id: string): string | undefined {
  return TABLES[locale].names[id];
}

/** Every localised name of a locale, by catalogue id (for the search index). */
export function deepSkyNames(locale: ContentLocale): Readonly<Record<string, string>> {
  return TABLES[locale].names;
}
