import latin from "./constellations-latin.json";
import fr from "../fr/constellations.json";

export const CONTENT_LOCALES = ["fr"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/** Official IAU Latin names, keyed by the IAU three-letter abbreviation. */
export const CONSTELLATION_LATIN: Readonly<Record<string, string>> = latin;

const NAMES: Record<ContentLocale, Record<string, string>> = { fr };

/** Localised common names of the 88 constellations. */
export function constellationNames(locale: ContentLocale): Readonly<Record<string, string>> {
  return NAMES[locale];
}

export * from "./stories";
