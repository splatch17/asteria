import { describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  matchTier,
  normalize,
  search,
  withinOneEdit,
  type SearchSources,
  type SearchStar,
} from "./search";

// Designations from the Yale BSC5 / IAU WGSN as the catalogue carries them; V from Hipparcos.
const STARS: SearchStar[] = [
  { hip: 32349, v: -1.44, con: "CMa", name: "Sirius", bayer: "α CMa", flamsteed: 9 },
  { hip: 27989, v: 0.45, con: "Ori", name: "Bételgeuse", bayer: "α Ori", flamsteed: 58 },
  { hip: 91262, v: 0.03, con: "Lyr", name: "Véga", bayer: "α Lyr", flamsteed: 3 },
  { hip: 71683, v: -0.01, con: "Cen", name: "Rigil Kentaurus", bayer: "α¹ Cen" },
  { hip: 71681, v: 1.35, con: "Cen", name: "Toliman", bayer: "α² Cen" },
  { hip: 24436, v: 0.18, con: "Ori", name: "Rigel", bayer: "β Ori", flamsteed: 19 },
  { hip: 104214, v: 5.2, con: "Cyg", flamsteed: 61 },
  { hip: 39429, v: 2.21, con: "Pup", name: "Naos", bayer: "ζ Pup" },
  { hip: 37826, v: 1.16, con: "Gem", name: "Pollux", bayer: "β Gem", flamsteed: 78 },
  { hip: 1, v: 9.1, con: "Psc" }, // no designation: only found by its HIP number
];

const SOURCES: SearchSources = {
  stars: STARS,
  iauNames: { 27989: "Betelgeuse", 91262: "Vega", 32349: "Sirius" },
  constellations: [
    { abbr: "Ori", name: "Orion", latin: "Orion" },
    { abbr: "UMa", name: "Grande Ourse", latin: "Ursa Major" },
    { abbr: "UMi", name: "Petite Ourse", latin: "Ursa Minor" },
    { abbr: "Lyr", name: "Lyre", latin: "Lyra" },
    { abbr: "CMa", name: "Grand Chien", latin: "Canis Major" },
    { abbr: "Boo", name: "Bouvier", latin: "Boötes" },
    { abbr: "Leo", name: "Lion", latin: "Leo" },
  ],
  bodies: [
    { body: "Sun", name: "Soleil" },
    { body: "Moon", name: "Lune" },
  ],
  planets: [
    { planet: "Mars", name: "Mars" },
    { planet: "Venus", name: "Vénus" },
  ],
  hipLabel: (hip) => `HIP ${hip}`,
};

const index = buildSearchIndex(SOURCES);
const labels = (q: string) => search(index, q).map((r) => r.entry.label);

describe("normalize", () => {
  it("ignores case and accents", () => {
    expect(normalize("Bételgeuse")).toBe("betelgeuse");
    expect(normalize("  BOÖTES ")).toBe("bootes");
    expect(normalize("Cœur")).toBe("coeur");
  });

  it("spells out Greek letters and splits their index", () => {
    expect(normalize("α Ori")).toBe("alpha ori");
    expect(normalize("α¹ Cen")).toBe("alpha 1 cen");
    expect(normalize("Α ORI")).toBe("alpha ori"); // capital alpha
    expect(normalize("bêta Gem")).toBe("beta gem");
    expect(normalize("ksi Pup")).toBe("xi pup");
    expect(normalize("αβγδεζηθικλμνξοπρστυφχψω")).toBe(
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho " +
        "sigma tau upsilon phi chi psi omega",
    );
  });

  it("separates letters from digits and drops punctuation", () => {
    expect(normalize("HIP27989")).toBe("hip 27989");
    expect(normalize("61-Cyg")).toBe("61 cyg");
  });
});

describe("withinOneEdit", () => {
  it("accepts one substitution, insertion, deletion or adjacent swap", () => {
    expect(withinOneEdit("sirus", "sirius")).toBe(true);
    expect(withinOneEdit("sirxus", "sirius")).toBe(true);
    expect(withinOneEdit("siirus", "sirius")).toBe(true);
    expect(withinOneEdit("betelgeuse", "betelguese")).toBe(true);
  });
  it("rejects two edits", () => {
    expect(withinOneEdit("srus", "sirius")).toBe(false);
    expect(withinOneEdit("vgea", "vega")).toBe(true);
    expect(withinOneEdit("gvea", "vega")).toBe(false);
  });
});

describe("matchTier", () => {
  it("orders exact, prefix, word prefix, substring and typo", () => {
    expect(matchTier("orion", "orion")).toBe(0);
    expect(matchTier("ori", "orion")).toBe(1);
    expect(matchTier("ourse", "grande ourse")).toBe(2);
    expect(matchTier("ours", "petite ourse")).toBe(2);
    expect(matchTier("rand", "grande ourse")).toBe(3);
    expect(matchTier("orino", "orion")).toBe(4);
    expect(matchTier("orx", "orion")).toBe(-1); // too short for a typo
  });
});

describe("search", () => {
  it("lists each detail once (the UI keys them)", () => {
    for (const r of search(index, "l"))
      expect(new Set(r.entry.details).size, r.entry.label).toBe(r.entry.details.length);
  });

  it("finds a star whatever the case and accents", () => {
    expect(labels("betelgeuse")[0]).toBe("Bételgeuse");
    expect(labels("VEGA")[0]).toBe("Véga");
  });

  it("finds Bayer and Flamsteed designations in several spellings", () => {
    for (const q of ["α Ori", "alpha ori", "Alpha Ori", "58 Ori"])
      expect(labels(q)[0], q).toBe("Bételgeuse");
    expect(labels("alpha cen")).toEqual(["Rigil Kentaurus", "Toliman"]);
    expect(labels("alpha2 cen")[0]).toBe("Toliman");
    expect(labels("ζ Pup")[0]).toBe("Naos");
    expect(labels("zeta pup")[0]).toBe("Naos");
    expect(labels("61 Cyg")).toEqual(["61 Cyg"]);
  });

  it("finds stars by their HIP number, designated or not", () => {
    expect(labels("HIP 27989")).toEqual(["Bételgeuse"]);
    expect(labels("hip1")).toEqual(["HIP 1"]);
    expect(labels("HIP 999999")).toEqual([]);
  });

  it("finds constellations by French name, Latin name and abbreviation", () => {
    expect(labels("grande ourse")[0]).toBe("Grande Ourse");
    expect(labels("ursa minor")[0]).toBe("Petite Ourse");
    expect(labels("UMa")[0]).toBe("Grande Ourse");
    expect(labels("bootes")[0]).toBe("Bouvier");
  });

  it("finds the Sun, the Moon and the planets", () => {
    expect(labels("soleil")).toEqual(["Soleil"]);
    expect(labels("venus")).toEqual(["Vénus"]);
    expect(search(index, "lune")[0]!.entry.target).toEqual({ kind: "body", body: "Moon" });
  });

  it("ranks exact before prefix before word prefix, then by importance", () => {
    // "ori": the abbreviation of Orion exactly, then names starting with it, then designations.
    expect(labels("ori").slice(0, 3)).toEqual(["Orion", "Rigel", "Bételgeuse"]);
    // Same tier (prefix): the brighter star first.
    expect(labels("ri").slice(0, 2)).toEqual(["Rigil Kentaurus", "Rigel"]);
    expect(labels("ourse")).toEqual(["Grande Ourse", "Petite Ourse"]);
  });

  it("tolerates one typo from four characters", () => {
    expect(labels("sirus")[0]).toBe("Sirius");
    expect(labels("betelguese")[0]).toBe("Bételgeuse");
    expect(labels("polux")[0]).toBe("Pollux");
    expect(labels("vgea")).toContain("Véga");
  });

  it("shows other names and designations as details", () => {
    const betelgeuse = search(index, "betelgeuse")[0]!.entry;
    expect(betelgeuse.details).toEqual(["Betelgeuse", "α Ori", "58 Ori", "HIP 27989"]);
    const sirius = search(index, "sirius")[0]!.entry;
    expect(sirius.details).toEqual(["α CMa", "9 CMa", "HIP 32349"]);
  });

  it("returns nothing for an empty query and at most 20 results", () => {
    expect(search(index, "  ")).toEqual([]);
    const many = buildSearchIndex({
      ...SOURCES,
      stars: Array.from({ length: 50 }, (_, i) => ({
        hip: i + 10,
        v: i,
        con: "Ori",
        name: `Aa${i}`,
      })),
    });
    expect(search(many, "aa")).toHaveLength(20);
  });

  it("answers well under 5 ms per keystroke for 9 000 stars", () => {
    const greek = ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ"];
    const stars: SearchStar[] = Array.from({ length: 9000 }, (_, i) => ({
      hip: i + 100,
      v: (i % 700) / 100,
      con: SOURCES.constellations[i % 6]!.abbr,
      ...(i % 20 === 0 && { name: `Star${i.toString(36)}name` }),
      ...(i % 3 === 0 && { bayer: `${greek[i % 8]} ${SOURCES.constellations[i % 6]!.abbr}` }),
      ...(i % 2 === 0 && { flamsteed: (i % 120) + 1 }),
    }));
    const big = buildSearchIndex({ ...SOURCES, stars });
    const typed = "betelgeuse alpha orionis";
    const start = performance.now();
    let n = 0;
    for (let round = 0; round < 5; round++)
      for (let i = 1; i <= typed.length; i++, n++) search(big, typed.slice(0, i));
    expect((performance.now() - start) / n).toBeLessThan(5); // ≈ 0.6 ms on a desktop CPU
  });
});
