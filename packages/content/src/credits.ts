/**
 * Credits and sources (#66): every dataset, asset, font and runtime library shipped in the app,
 * with its licence and attribution. Single source of truth: `<lang>/credits.json`, shown by the
 * Credits panel and checked at build time against the bundled npm packages (apps/web).
 */
import type { ContentLocale } from "./index";
import fr from "../fr/credits.json";

export const CREDIT_SECTIONS = ["data", "assets", "fonts", "libraries"] as const;
export type CreditSection = (typeof CREDIT_SECTIONS)[number];

export interface CreditEntry {
  /** Stable identifier (same in every language). */
  id: string;
  name: string;
  /** What it is used for in the app. */
  role: string;
  author: string;
  /** Credit line / copyright notice required or requested by the licence. */
  notice: string;
  /** Licence name (SPDX-like where one exists). */
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  /** npm packages covered by this entry (fonts and libraries bundled in the app). */
  packages?: string[];
}

export type Credits = Readonly<Record<CreditSection, readonly CreditEntry[]>>;

const CREDITS: Record<ContentLocale, Credits> = { fr };

export function credits(locale: ContentLocale): Credits {
  return CREDITS[locale];
}

/** npm package name → credit entry, for the bundled-package check. */
export function creditedPackages(locale: ContentLocale): ReadonlyMap<string, CreditEntry> {
  const map = new Map<string, CreditEntry>();
  for (const section of CREDIT_SECTIONS)
    for (const entry of CREDITS[locale][section])
      for (const pkg of entry.packages ?? []) map.set(pkg, entry);
  return map;
}
