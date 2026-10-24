import latin from "./constellations-latin.json";
import fr from "../fr/constellations.json";
import frOf from "../fr/constellations-of.json";

export const CONTENT_LOCALES = ["fr"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/** Official IAU Latin names, keyed by the IAU three-letter abbreviation. */
export const CONSTELLATION_LATIN: Readonly<Record<string, string>> = latin;

const NAMES: Record<ContentLocale, Record<string, string>> = { fr };

/** Localised common names of the 88 constellations. */
export function constellationNames(locale: ContentLocale): Readonly<Record<string, string>> {
  return NAMES[locale];
}

const NAMES_OF: Record<ContentLocale, Record<string, string>> = { fr: frOf };

/**
 * The names as a complement, « de » with its article and elision in French (« d'Orion », « de
 * l'Aigle », « des Gémeaux »): « Étoile de Pégase », « la plus brillante du Cygne » (#201).
 */
export function constellationNamesOf(locale: ContentLocale): Readonly<Record<string, string>> {
  return NAMES_OF[locale];
}

export * from "./stories";
export * from "./star-names";
export * from "./deepsky-names";
export * from "./finding-hints";
// Credits: separate entry point `@asteria/content/credits`, so that they load with their page.
