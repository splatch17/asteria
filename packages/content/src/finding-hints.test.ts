import { describe, expect, it } from "vitest";
import { CONSTELLATION_LATIN } from "./index";
import { findingHint, findingHintSources, findingHints } from "./finding-hints";
// The tone rule of the interface (#198, docs/TONE.md), shared without a package dependency.
import { vouvoiement } from "../../ui/src/i18n/tone";

// The games' Découverte list (apps/web/src/lib/games/pool.ts): zodiac, stars V ≤ 1.5, guides.
const DISCOVERY = [
  ...["Ari", "Tau", "Gem", "Cnc", "Leo", "Vir", "Lib", "Sco", "Sgr", "Cap", "Aqr", "Psc"],
  ...["CMa", "Car", "Boo", "Cen", "Lyr", "Aur", "Ori", "CMi", "Eri", "Aql", "Cru", "PsA", "Cyg"],
  ...["UMa", "UMi", "Cas", "Peg"],
];

describe("finding hints (#198)", () => {
  const hints = findingHints("fr");
  const sources = findingHintSources("fr");

  it("cover the 29 constellations of the Découverte level", () => {
    expect(new Set(DISCOVERY).size).toBe(29);
    for (const abbr of DISCOVERY) expect(findingHint("fr", abbr), abbr).not.toBeNull();
  });

  it("are keyed by IAU abbreviation and cite known sources", () => {
    for (const [abbr, hint] of Object.entries(hints)) {
      expect(CONSTELLATION_LATIN[abbr], abbr).toBeTruthy();
      expect(hint.sources.length, abbr).toBeGreaterThan(0);
      for (const key of hint.sources) expect(sources[key], `${abbr}: ${key}`).toBeTruthy();
    }
    for (const source of Object.values(sources)) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.license).toBeTruthy();
    }
  });

  it("fit on one line after « <name> : », and say « tu »", () => {
    for (const [abbr, { text }] of Object.entries(hints)) {
      expect(text, abbr).not.toMatch(/\n/);
      expect(text.length, abbr).toBeLessThanOrEqual(95);
      expect(vouvoiement(text), abbr).toEqual([]);
    }
  });

  it("has none for a constellation without a sourced one", () => {
    expect(findingHint("fr", "Mon")).toBeNull();
  });
});
