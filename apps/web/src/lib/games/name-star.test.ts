import { describe, expect, it } from "vitest";
import { unitVector } from "@asteria/astro-core";
import { decodeStarCatalog, type StarStrings } from "@asteria/catalog";
import { localizeStarStrings } from "@asteria/content";
import { limitingMagnitude, stereoScale } from "@asteria/sky-renderer";
import { angleBetween, constellationShapes, type ConstellationShape } from "./geometry";
import { emptyProgress, recordAnswer } from "./progress";
import { mulberry32 } from "./rng";
import {
  AMATEUR_MAX_V,
  CHOICES,
  DISCOVERY_COUNT,
  MIN_SEPARATION_PX,
  brightnessRanks,
  buildStarSeries,
  gradeOf,
  matchStarName,
  namedStars,
  namesAlike,
  rankFact,
  starDistractors,
  starFraming,
  starPool,
  type StarItem,
} from "./name-star";

const T0 = Date.UTC(2026, 9, 20, 20);
const star = (hip: number, name: string, con: string, v: number, ra: number, dec: number) => ({
  hip,
  name,
  con,
  v,
  ra,
  dec,
});
// A few real stars (J2000, Hipparcos V), and two that a picture cannot part.
const STARS = [
  star(32349, "Sirius", "CMa", -1.44, 101.287, -16.716),
  star(27989, "Bételgeuse", "Ori", 0.45, 88.793, 7.407),
  star(24436, "Rigel", "Ori", 0.18, 78.634, -8.202),
  star(26311, "Alnilam", "Ori", 1.69, 84.053, -1.202),
  star(26727, "Alnitak", "Ori", 1.74, 85.19, -1.943),
  star(25336, "Bellatrix", "Ori", 1.64, 81.283, 6.35),
  star(37279, "Procyon", "CMi", 0.4, 114.825, 5.225),
  star(21421, "Aldébaran", "Tau", 0.87, 68.98, 16.509),
  star(36850, "Castor", "Gem", 1.58, 113.65, 31.888),
  star(37826, "Pollux", "Gem", 1.16, 116.329, 28.026),
  star(71683, "Rigil Kentaurus", "Cen", -0.01, 219.902, -60.834),
  star(71681, "Toliman", "Cen", 1.35, 219.896, -60.838),
  { hip: 1, ra: 0, dec: 0, v: 2, con: "Psc" }, // no name: never asked
];
const items = namedStars(STARS);
const byName = (n: string) => items.find((s) => s.name === n)!;

describe("named stars", () => {
  it("keep the named ones, brightest first, without a fainter twin", () => {
    expect(items.map((s) => s.name)).toEqual([
      "Sirius",
      "Rigil Kentaurus",
      "Rigel",
      "Procyon",
      "Bételgeuse",
      "Aldébaran",
      "Pollux",
      "Castor",
      "Bellatrix",
      "Alnilam",
      "Alnitak",
    ]);
    expect(items.some((s) => s.name === "Toliman")).toBe(false);
  });
});

describe("pools", () => {
  const many: StarItem[] = Array.from({ length: 60 }, (_, i) => ({
    hip: i + 1,
    name: `Star ${i}`,
    con: "Ori",
    v: -1 + i * 0.1,
    dir: unitVector(i * 6, 0),
  }));
  const shapes: Record<string, ConstellationShape> = {
    Ori: { abbr: "Ori", centre: unitVector(84, 0), radius: 15 },
  };

  it("Découverte: the brightest ones", () => {
    const pool = starPool("discovery", many, shapes);
    expect(pool).toHaveLength(DISCOVERY_COUNT);
    expect(pool[0]!.hip).toBe(1);
  });

  it("Amateur: down to magnitude 3", () => {
    const pool = starPool("amateur", many, shapes);
    expect(pool.every((s) => s.v <= AMATEUR_MAX_V)).toBe(true);
    expect(pool).toHaveLength(41);
  });

  it("Expert: those drawn at the field framing their constellation", () => {
    const pool = starPool("expert", many, shapes);
    for (const s of pool) {
      const { fov } = starFraming(s, shapes.Ori, [], 0.75);
      expect(s.v).toBeLessThanOrEqual(limitingMagnitude(fov));
    }
    expect(pool.length).toBeGreaterThan(41);
    expect(pool.length).toBeLessThan(60);
  });
});

describe("framing", () => {
  const ori: ConstellationShape = { abbr: "Ori", centre: unitVector(84, 0), radius: 17 };

  it("shows the constellation, wide enough for a star outside its figure", () => {
    const f = starFraming(byName("Rigel"), ori, [], 0.75);
    expect(f.centre).toBe(ori.centre);
    const far = { ...byName("Rigel"), dir: unitVector(84, 30) };
    expect(starFraming(far, ori, [], 0.75).fov).toBeGreaterThan(f.fov);
  });

  it("zooms on the star when another named star would stand too close", () => {
    const f = starFraming(byName("Alnilam"), ori, items, 0.75, 260);
    expect(f.centre).toEqual(byName("Alnilam").dir);
    const sep = angleBetween(byName("Alnilam").dir, byName("Alnitak").dir);
    const px = ((sep * Math.PI) / 180) * stereoScale(f.fov) * 260;
    expect(px).toBeGreaterThanOrEqual(MIN_SEPARATION_PX - 0.01);
    // Rigel's nearest named neighbours are far enough: the figure stays centred.
    expect(starFraming(byName("Rigel"), ori, items, 0.75, 260).centre).toBe(ori.centre);
  });
});

describe("wrong names", () => {
  it("Découverte: other constellations, no look-alike, near and of similar brightness", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const d = starDistractors(byName("Rigel"), items, "discovery", mulberry32(seed));
      expect(d).toHaveLength(CHOICES - 1);
      expect(new Set(d.map((s) => s.hip)).size).toBe(3);
      for (const s of d) {
        expect(s.con).not.toBe("Ori");
        expect(s.hip).not.toBe(byName("Rigel").hip);
      }
    }
    const d = starDistractors(byName("Alnilam"), items, "discovery", mulberry32(3));
    expect(d.map((s) => s.name)).not.toContain("Alnitak");
  });

  it("Amateur: the constellation's own stars come first", () => {
    let same = 0;
    for (let seed = 1; seed <= 20; seed++)
      same += starDistractors(byName("Rigel"), items, "amateur", mulberry32(seed)).filter(
        (s) => s.con === "Ori",
      ).length;
    expect(same / 60).toBeGreaterThan(0.5);
  });

  it("are eased when the pool is too small", () => {
    const tiny = [byName("Rigel"), byName("Bételgeuse"), byName("Bellatrix"), byName("Alnilam")];
    const d = starDistractors(byName("Rigel"), tiny, "discovery", mulberry32(1));
    expect(d).toHaveLength(3); // all in Orion, yet the question stays playable
  });

  it("spot look-alike names", () => {
    expect(namesAlike("Alnilam", "Alnitak", true)).toBe(true); // same first four letters
    expect(namesAlike("Alnilam", "Alnitak", false)).toBe(false);
    expect(namesAlike("Mira", "Mirach", false)).toBe(false);
    expect(namesAlike("Mirak", "Mirach", false)).toBe(false);
    expect(namesAlike("Merak", "Mirak", false)).toBe(true); // one substitution
  });
});

describe("typed names", () => {
  it("ignore case, accents, spaces and hyphens", () => {
    expect(matchStarName("betelgeuse", "Bételgeuse")).toBe("exact");
    expect(matchStarName("  ALTAIR ", "Altaïr")).toBe("exact");
    expect(matchStarName("rigilkentaurus", "Rigil Kentaurus")).toBe("exact");
    expect(matchStarName("rigil-kentaurus", "Rigil Kentaurus")).toBe("exact");
  });

  it("forgive one typo from four letters", () => {
    expect(matchStarName("Betelgeuze", "Bételgeuse")).toBe("typo");
    expect(matchStarName("Betelgeus", "Bételgeuse")).toBe("typo");
    expect(matchStarName("Bteelgeuse", "Bételgeuse")).toBe("typo"); // swap
    expect(matchStarName("Rigil Kentauros", "Rigil Kentaurus")).toBe("typo");
    expect(matchStarName("Vgea", "Véga")).toBe("typo");
    expect(matchStarName("Vga", "Véga")).toBeNull(); // too short for a typo
  });

  it("refuse other names, prefixes and empty answers", () => {
    expect(matchStarName("Betel", "Bételgeuse")).toBeNull();
    expect(matchStarName("Rigel", "Régulus")).toBeNull();
    expect(matchStarName("Betelgeuxa", "Bételgeuse")).toBeNull(); // two edits
    expect(matchStarName("", "Véga")).toBeNull();
    expect(matchStarName(" - ", "Véga")).toBeNull();
  });

  it("grade a right name good, anything else again", () => {
    expect(gradeOf(true)).toBe("good");
    expect(gradeOf(false)).toBe("again");
  });
});

describe("series", () => {
  const opts = { pool: items, progress: emptyProgress(), now: T0 };

  it("asks distinct stars with 4 distinct names, the answer among them", () => {
    const series = buildStarSeries({ ...opts, level: "amateur", rng: mulberry32(5) });
    expect(series).toHaveLength(10);
    expect(new Set(series.map((q) => q.hip)).size).toBe(10);
    for (const q of series) {
      expect(q.choices).toHaveLength(CHOICES);
      expect(new Set(q.choices).size).toBe(CHOICES);
      expect(q.choices).toContain(q.hip);
    }
  });

  it("types the answer in Expert", () => {
    const series = buildStarSeries({ ...opts, level: "expert", rng: mulberry32(5) });
    expect(series.every((q) => q.choices === null)).toBe(true);
  });

  it("brings in new stars brightest first", () => {
    let p = emptyProgress();
    // Ten stars seen already: a returning player.
    const pool: StarItem[] = Array.from({ length: 40 }, (_, i) => ({
      hip: 100 + i,
      name: `S${i}`,
      con: "Ori",
      v: i * 0.1,
      dir: unitVector(i * 9, 0),
    }));
    for (const s of pool.slice(0, 10)) p = recordAnswer(p, `star:${s.hip}`, true, T0);
    for (let seed = 1; seed <= 10; seed++) {
      const series = buildStarSeries({
        level: "discovery",
        pool,
        progress: p,
        now: T0 + 2 * 86_400_000,
        rng: mulberry32(seed),
      });
      for (const q of series.filter((q) => !p.items[`star:${q.hip}`]))
        expect(q.hip).toBeLessThan(100 + 10 + 8); // within the 8 brightest never asked
    }
  });

  it("is reproducible from a seed", () => {
    const a = buildStarSeries({ ...opts, level: "discovery", rng: mulberry32(9) });
    expect(buildStarSeries({ ...opts, level: "discovery", rng: mulberry32(9) })).toEqual(a);
  });
});

describe("facts", () => {
  const ranks = brightnessRanks(STARS);
  it("rank in the sky, else in the constellation", () => {
    expect(rankFact(32349, ranks)).toEqual({ kind: "sky", rank: 1 });
    expect(rankFact(24436, ranks)).toEqual({ kind: "sky", rank: 3 });
    const faint = brightnessRanks([
      ...Array.from({ length: 30 }, (_, i) => ({ hip: 1000 + i, v: i * 0.01, con: "Car" })),
      { hip: 7, v: 4, con: "Lyr" },
      { hip: 8, v: 4.5, con: "Lyr" },
    ]);
    expect(rankFact(8, faint)).toEqual({ kind: "constellation", rank: 2 });
    expect(rankFact(1029, faint)).toBeNull(); // 30th of the sky, 30th of its constellation
  });
});

// The real catalogue (public/data, gitignored: skipped when absent).
type Fs = { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };
const fs = (
  globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
).process?.getBuiltinModule?.("node:fs") as Fs | undefined;
const data = (f: string) =>
  decodeURIComponent(new URL(`../../../public/data/${f}`, import.meta.url).pathname);
const available =
  !!fs &&
  ["stars.bin", "star-strings.json", "constellation-lines.json"].every((f) =>
    fs.existsSync(data(f)),
  );

describe.skipIf(!available)("real catalogue (public/data)", () => {
  it("gives sensible pools", () => {
    const text = (f: string) => new TextDecoder().decode(fs!.readFileSync(data(f)));
    const bin = fs!.readFileSync(data("stars.bin"));
    const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
    const strings = localizeStarStrings("fr", JSON.parse(text("star-strings.json")) as StarStrings);
    const stars = decodeStarCatalog(buffer, strings);
    const lines = JSON.parse(text("constellation-lines.json")) as Record<string, number[][]>;
    const shapes = constellationShapes(stars, lines);
    const named = namedStars(stars);
    const names = (pool: StarItem[]) => pool.map((s) => s.name);
    const discovery = starPool("discovery", named, shapes);
    expect(names(discovery).slice(0, 5)).toEqual([
      "Sirius",
      "Canopus",
      "Arcturus",
      "Rigil Kentaurus",
      "Véga",
    ]);
    expect(names(discovery)).not.toContain("Toliman");
    expect(discovery.at(-1)!.v).toBeLessThan(1.7);
    const amateur = starPool("amateur", named, shapes);
    expect(amateur.length).toBeGreaterThan(100);
    const expert = starPool("expert", named, shapes);
    expect(expert.length).toBeGreaterThan(amateur.length);
    for (const n of ["Alcor", "Acrab B", "Albireo B", "Maïa", "Mérope"])
      expect(names(expert)).not.toContain(n);
    expect(names(expert)).toContain("Mizar");
    expect(names(expert)).toContain("Alcyone");
  });
});
