/**
 * Finding hints (#198): one line to find a constellation in the sky, from its asterism or a
 * bright star (« Pégase : cherche le Grand Carré… »), shown after a wrong answer in the quiz.
 * Each hint cites its sources (`<lang>/finding-hints.json`); a constellation without one has
 * no hint.
 */
import type { ContentLocale } from "./index";
import fr from "../fr/finding-hints.json";

export interface HintSource {
  title: string;
  url: string;
  license: string;
}

export interface FindingHint {
  /** The hint, to follow « <name> : » (lower-case start, one line). */
  text: string;
  /** Keys of `findingHintSources`. */
  sources: string[];
}

interface HintFile {
  sources: Record<string, HintSource>;
  hints: Record<string, FindingHint>;
}

const FILES: Record<ContentLocale, HintFile> = { fr };

/** The hint for a constellation (IAU abbreviation), or null. */
export function findingHint(locale: ContentLocale, abbr: string): FindingHint | null {
  return FILES[locale].hints[abbr] ?? null;
}

/** All the hints, by abbreviation. */
export function findingHints(locale: ContentLocale): Readonly<Record<string, FindingHint>> {
  return FILES[locale].hints;
}

/** The sources the hints cite, by key. */
export function findingHintSources(locale: ContentLocale): Readonly<Record<string, HintSource>> {
  return FILES[locale].sources;
}
