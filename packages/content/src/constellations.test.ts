import { describe, expect, it } from "vitest";
import {
  CONSTELLATION_LATIN,
  CONTENT_LOCALES,
  constellationNames,
  constellationNamesOf,
} from "./index";

describe("constellation names", () => {
  it("covers the 88 IAU constellations", () => {
    expect(Object.keys(CONSTELLATION_LATIN)).toHaveLength(88);
  });

  it.each(CONTENT_LOCALES)("has a %s name for every constellation", (locale) => {
    const names = constellationNames(locale);
    for (const abbr of Object.keys(CONSTELLATION_LATIN)) expect(names[abbr], abbr).toBeTruthy();
  });

  it.each(CONTENT_LOCALES)("has a %s complement ending with each name (#201)", (locale) => {
    const names = constellationNames(locale);
    const of = constellationNamesOf(locale);
    for (const abbr of Object.keys(CONSTELLATION_LATIN)) {
      expect(of[abbr], abbr).toBeTruthy();
      expect(of[abbr]!.endsWith(names[abbr]!), abbr).toBe(true);
    }
    expect(of.Ori).toBe("d'Orion");
    expect(of.Aql).toBe("de l'Aigle");
    expect(of.Gem).toBe("des Gémeaux");
    expect(of.Lyr).toBe("de la Lyre");
    expect(of.Peg).toBe("de Pégase");
  });
});
