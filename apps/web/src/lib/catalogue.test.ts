import { describe, expect, it } from "vitest";
import { decodeStarCatalog, type StarStrings } from "@asteria/catalog";
import { CONSTELLATION_LATIN, constellationNames, localizeStarStrings } from "@asteria/content";
import type { CatalogStar } from "@asteria/sky-renderer";
import {
  bestMonth,
  centreRaDec,
  defaultFilter,
  figureObservability,
  filterCatalogue,
  mainStars,
  observability,
  pickStar,
  tappableStars,
  type CatalogueEntry,
} from "./catalogue";
import { constellationShapes } from "./games/geometry";

const fr = constellationNames("fr");
const ENTRIES: CatalogueEntry[] = Object.keys(CONSTELLATION_LATIN).map((abbr) => ({
  abbr,
  name: fr[abbr] ?? abbr,
  latin: CONSTELLATION_LATIN[abbr]!,
}));

describe("catalogue list", () => {
  it("starts on the short list in Découverte, on all 88 above", () => {
    expect(defaultFilter("discovery")).toBe("essential");
    expect(defaultFilter("amateur")).toBe("all");
    expect(filterCatalogue(ENTRIES, "all", "")).toHaveLength(88);
    expect(filterCatalogue(ENTRIES, "essential", "")).toHaveLength(29);
  });

  it("sorts by French name, accents included", () => {
    const names = filterCatalogue(ENTRIES, "all", "").map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
    // « Écu » among the E, not after the Z.
    expect(names.indexOf("Écu de Sobieski")).toBeLessThan(names.indexOf("Éridan"));
    expect(names.indexOf("Écu de Sobieski")).toBeGreaterThan(names.indexOf("Dragon"));
  });

  it("finds by French name, Latin name or abbreviation, without accents, one typo", () => {
    expect(filterCatalogue(ENTRIES, "all", "orion")[0]?.abbr).toBe("Ori");
    expect(filterCatalogue(ENTRIES, "all", "ursa")[0]?.abbr).toMatch(/^U(Ma|Mi)$/);
    expect(filterCatalogue(ENTRIES, "all", "cmA")[0]?.abbr).toBe("CMa");
    expect(filterCatalogue(ENTRIES, "all", "cassiopee")[0]?.abbr).toBe("Cas");
    expect(filterCatalogue(ENTRIES, "all", "cassiopé")[0]?.abbr).toBe("Cas");
    expect(filterCatalogue(ENTRIES, "all", "scorpoin")[0]?.abbr).toBe("Sco");
    expect(filterCatalogue(ENTRIES, "all", "zzzz")).toEqual([]);
    // Prefix before substring: « lion » is the Lion before the Petit Lion.
    const lion = filterCatalogue(ENTRIES, "all", "lion").map((e) => e.abbr);
    expect(lion.slice(0, 2)).toEqual(["Leo", "LMi"]);
  });

  it("keeps the search inside the filter", () => {
    const tonight = new Set(["Ori", "Tau"]);
    expect(filterCatalogue(ENTRIES, "tonight", "", tonight).map((e) => e.abbr)).toEqual([
      "Ori",
      "Tau",
    ]);
    expect(filterCatalogue(ENTRIES, "tonight", "lyre", tonight)).toEqual([]);
    expect(filterCatalogue(ENTRIES, "essential", "sculpteur")).toEqual([]);
  });
});

const star = (hip: number, con: string, v: number, extra: Partial<CatalogStar> = {}) =>
  ({ hip, ra: 0, dec: 0, v, con, ...extra }) as CatalogStar;

describe("page stars", () => {
  const stars = [
    star(1, "Ori", 0.5, { name: "Bételgeuse", bayer: "α Ori" }),
    star(2, "Ori", 0.1, { name: "Rigel", bayer: "β Ori" }),
    star(3, "Ori", 4.5),
    star(4, "Ori", 5.9, { bayer: "ψ¹ Ori" }),
    star(5, "Tau", 1.6, { name: "Elnath", bayer: "β Tau" }),
    star(6, "Tau", 0.9, { name: "Aldébaran" }),
  ];
  const lines = { Ori: [[1, 2]], Aur: [[5, 7]] };

  it("lists named or lettered stars, brightest first, figure stars of a neighbour included", () => {
    expect(mainStars(stars, lines, "Ori").map((s) => s.hip)).toEqual([2, 1, 4]);
    expect(mainStars(stars, lines, "Ori", 2, 2).map((s) => s.hip)).toEqual([2, 1]);
    expect(mainStars(stars, lines, "Aur", 8, 1).map((s) => s.hip)).toEqual([5]);
  });

  it("gives a constellation without named stars its brightest ones", () => {
    expect(mainStars(stars, lines, "Ori", 8, 4).map((s) => s.hip)).toEqual([2, 1, 3, 4]);
    expect(
      mainStars([star(9, "Scl", 4.3), star(8, "Scl", 4.4)], {}, "Scl").map((s) => s.hip),
    ).toEqual([9, 8]);
  });

  it("lets every figure star and the constellation's visible stars be touched", () => {
    expect(tappableStars(stars, lines, "Ori").map((s) => s.hip)).toEqual([1, 2, 3]);
    expect(tappableStars(stars, lines, "Aur").map((s) => s.hip)).toEqual([5]);
  });

  it("picks the star under the finger, a bright one over a faint one nearby", () => {
    const pts = [
      { id: "bright", x: 100, y: 100, v: 0.5 },
      { id: "faint", x: 106, y: 100, v: 5 },
    ];
    expect(pickStar({ x: 104, y: 100 }, pts)?.id).toBe("bright");
    expect(pickStar({ x: 107, y: 100 }, pts)?.id).toBe("bright");
    expect(pickStar({ x: 140, y: 100 }, pts)).toBeNull();
    expect(pickStar({ x: 120, y: 100 }, pts, 10)).toBeNull();
    expect(pickStar({ x: 0, y: 0 }, [])).toBeNull();
  });
});

describe("observing facts", () => {
  it("best evening month from the right ascension (sky guides: Orion in January)", () => {
    expect(bestMonth(84)).toBe(0); // Orion, RA 5h36: January
    expect(bestMonth(253)).toBe(6); // Scorpion, RA 16h53: July
    expect(bestMonth(160)).toBe(3); // Lion, RA 10h40: April
    expect(bestMonth(330)).toBe(9); // Pégase, RA 22h: October
    expect(bestMonth(-30)).toBe(bestMonth(330));
  });

  it("how high a figure gets from a latitude", () => {
    const paris = 48.86;
    expect(observability(56, paris).kind).toBe("circumpolar"); // Grande Ourse
    expect(observability(3, paris)).toEqual({ kind: "seasonal", maxAltitude: 90 - 45.86 });
    expect(observability(-60, paris).kind).toBe("never"); // Croix du Sud
    expect(observability(-35, paris).kind).toBe("low"); // Sagittaire's tail is low
    expect(observability(-60, -33.9).kind).toBe("circumpolar"); // Croix du Sud from Sydney
    expect(observability(56, -33.9).kind).toBe("low");
  });

  it("how high a whole figure gets: its highest star, circumpolar only if all stay up", () => {
    const paris = 48.86;
    // Scorpion: Antarès (−26.4°) and the claws (β −19.8°) over a low tail (Shaula −37°).
    const sco = figureObservability([-26.4, -19.8, -37.1], paris);
    expect(sco.kind).toBe("seasonal");
    expect(sco.maxAltitude).toBeCloseTo(90 - 48.86 - 19.8, 6);
    expect(figureObservability([62, 56, 50], paris).kind).toBe("circumpolar");
    expect(figureObservability([62, 30], paris).kind).toBe("seasonal");
    expect(figureObservability([-60, -63], paris).kind).toBe("never");
    expect(figureObservability([-35, -40], paris).kind).toBe("low");
  });

  it("centre of a figure as right ascension and declination", () => {
    const c = centreRaDec({ centre: [0, -1, 0] });
    expect(c.ra).toBeCloseTo(270);
    expect(c.dec).toBeCloseTo(0);
  });
});

// Against the synced catalogue (public/data, gitignored: skipped when absent).
type Fs = { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };
const fs = (
  globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
).process?.getBuiltinModule?.("node:fs") as Fs | undefined;
const data = (f: string) =>
  decodeURIComponent(new URL(`../../public/data/${f}`, import.meta.url).pathname);
const available =
  !!fs &&
  ["stars.bin", "star-strings.json", "constellation-lines.json"].every((f) =>
    fs.existsSync(data(f)),
  );

describe.skipIf(!available)("pages from the catalogue (public/data)", () => {
  const load = () => {
    const bin = fs!.readFileSync(data("stars.bin"));
    const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
    const text = (f: string) => new TextDecoder().decode(fs!.readFileSync(data(f)));
    const strings = JSON.parse(text("star-strings.json")) as StarStrings;
    const stars = decodeStarCatalog(buffer, localizeStarStrings("fr", strings));
    const lines = JSON.parse(text("constellation-lines.json")) as Record<string, number[][]>;
    return { stars, lines };
  };

  it("Orion: Rigel then Bételgeuse in French, the Belt, and January", () => {
    const { stars, lines } = load();
    const main = mainStars(stars, lines, "Ori");
    expect(main.slice(0, 2).map((s) => s.name)).toEqual(["Rigel", "Bételgeuse"]);
    expect(main.map((s) => s.name)).toEqual(expect.arrayContaining(["Alnilam", "Bellatrix"]));
    const shape = constellationShapes(stars, lines).Ori!;
    const { ra, dec } = centreRaDec(shape);
    expect(ra).toBeGreaterThan(75);
    expect(ra).toBeLessThan(90);
    expect(bestMonth(ra)).toBe(0);
    expect(observability(dec, 48.86).kind).toBe("seasonal");
  });

  it("every constellation drawn has stars to list and to touch", () => {
    const { stars, lines } = load();
    for (const abbr of Object.keys(lines)) {
      expect(mainStars(stars, lines, abbr).length, abbr).toBeGreaterThan(0);
      expect(tappableStars(stars, lines, abbr).length, abbr).toBeGreaterThan(1);
    }
  });
});
