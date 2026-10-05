import { describe, expect, it } from "vitest";
import type { CatalogStar } from "@asteria/sky-renderer";
import {
  anecdoteOfTheDay,
  brightestMagnitudes,
  constellationItems,
  constellationVisibilities,
  localDay,
  matchRank,
  normalize,
  readingMinutes,
  searchItems,
  solarItems,
  starItems,
  teaser,
  viewToward,
} from "./library";

const star = (hip: number, con: string, v: number, extra: Partial<CatalogStar> = {}) =>
  ({ hip, con, v, ra: 0, dec: 0, ...extra }) as CatalogStar;

describe("normalize", () => {
  it("drops case, accents and punctuation", () => {
    expect(normalize("Bételgeuse")).toBe("betelgeuse");
    expect(normalize("  Chevelure-de-Bérénice ")).toBe("chevelure de berenice");
    expect(normalize("Grand Chien (CMa)")).toBe("grand chien cma");
  });
  it("keeps Greek letters, so Bayer designations stay searchable", () => {
    expect(normalize("α Ori")).toBe("α ori");
  });
});

describe("constellation and star lists", () => {
  const names = { Ori: "Orion", CMa: "Grand Chien", UMa: "Grande Ourse" };
  const latin = { Ori: "Orion", CMa: "Canis Major", UMa: "Ursa Major" };
  const stars = [
    star(27989, "Ori", 0.45, { name: "Bételgeuse", bayer: "α Ori" }),
    star(24436, "Ori", 0.18, { name: "Rigel", bayer: "β Ori" }),
    star(32349, "CMa", -1.44, { name: "Sirius", bayer: "α CMa" }),
    star(54061, "UMa", 1.81, { name: "Dubhe", bayer: "α UMa" }),
    star(1, "UMa", 5.5), // unnamed: not listed
  ];
  const mags = brightestMagnitudes(stars);
  const cons = constellationItems(["Ori", "CMa", "UMa"], names, latin, mags);
  const named = starItems(stars, names);

  it("finds the brightest magnitude of each constellation", () => {
    expect(mags.get("Ori")).toBe(0.18);
    expect(mags.get("CMa")).toBe(-1.44);
  });

  it("lists only named stars, with designation and constellation", () => {
    expect(named.map((s) => s.name)).toEqual(["Bételgeuse", "Rigel", "Sirius", "Dubhe"]);
    expect(named[0]!.detail).toBe("α Ori · Orion");
    expect(named[0]!.target).toEqual({ kind: "star", hip: 27989 });
  });

  it("sorts by name with the locale's collation", () => {
    expect(searchItems(cons, "", "name").map((c) => c.id)).toEqual(["CMa", "UMa", "Ori"]);
  });

  it("sorts by brightness, brightest first", () => {
    expect(searchItems(cons, "", "bright").map((c) => c.id)).toEqual(["CMa", "Ori", "UMa"]);
    expect(searchItems(named, "", "bright")[0]!.name).toBe("Sirius");
  });

  it("searches without accents, on the Latin name, the abbreviation and the designation", () => {
    expect(searchItems(named, "betel", "name").map((s) => s.name)).toEqual(["Bételgeuse"]);
    expect(searchItems(cons, "ursa", "name").map((s) => s.id)).toEqual(["UMa"]);
    expect(searchItems(cons, "cma", "name").map((s) => s.id)).toEqual(["CMa"]);
    expect(searchItems(named, "hip 32349", "name").map((s) => s.name)).toEqual(["Sirius"]);
    // Every word must match, in any order.
    expect(searchItems(named, "orion β", "name").map((s) => s.name)).toEqual(["Rigel"]);
    expect(searchItems(named, "zzz", "name")).toEqual([]);
  });

  it("ranks names starting with the query before other matches", () => {
    // "gr": Grand Chien and Grande Ourse start with it; nothing else matches.
    const items = [
      ...cons,
      ...constellationItems(["Gru"], { Gru: "Grue" }, { Gru: "Grus" }, new Map()),
    ];
    const items2 = constellationItems(
      ["Aqr", "Gem"],
      { Aqr: "Verseau", Gem: "Gémeaux" },
      { Aqr: "Aquarius", Gem: "Gemini" },
      new Map(),
    );
    expect(searchItems(items, "grand", "name").map((c) => c.id)).toEqual(["CMa", "UMa"]);
    // A match on the Latin name only comes after a match on the name.
    expect(matchRank(items2[1]!, "gem")).toBe(0);
    expect(matchRank(items2[0]!, "aqua")).toBe(2);
  });
});

describe("visibility", () => {
  // Observer at the North Pole: altitude = declination.
  const ctx = {
    date: new Date("2026-01-01T00:00:00Z"),
    observer: { latitude: 90, longitude: 0 },
    years: 0,
  };
  const stars = [
    star(1, "UMi", 2, { name: "Polaris", ra: 37.95, dec: 89.26 }),
    star(2, "Oct", 5, { name: "Polaris Australis", ra: 317.2, dec: -88.96 }),
    star(3, "Ori", 2, { ra: 80, dec: 10 }),
    star(4, "Ori", 2, { ra: 85, dec: -10 }),
  ];
  it("tells which stars are up", () => {
    const items = starItems(stars, {}, ctx);
    expect(items.map((s) => s.visibility)).toEqual(["up", "down"]);
  });
  it("tells which figures are up, down or across the horizon", () => {
    const vis = constellationVisibilities(
      stars,
      { UMi: [[1, 1]], Oct: [[2, 2]], Ori: [[3, 4]] },
      ctx,
    );
    expect(vis.get("UMi")).toBe("up");
    expect(vis.get("Oct")).toBe("down");
    expect(vis.get("Ori")).toBe("partial");
  });
});

describe("solar system list", () => {
  it("maps the Sun and Moon to bodies and the rest to planets", () => {
    const items = solarItems([
      { id: "Sun", name: "Soleil", detail: "Étoile", magnitude: null, altitude: 12 },
      { id: "Mars", name: "Mars", detail: "Planète", magnitude: 1.2, altitude: -5 },
      { id: "Moon", name: "Lune", detail: "Satellite", magnitude: null, altitude: null },
    ]);
    expect(items.map((i) => i.target)).toEqual([
      { kind: "body", body: "Sun" },
      { kind: "planet", planet: "Mars" },
      { kind: "body", body: "Moon" },
    ]);
    expect(items.map((i) => i.visibility)).toEqual(["up", "down", null]);
  });
});

describe("viewToward", () => {
  it("puts the target above the centre and narrows wide fields", () => {
    const v = viewToward(30, 120, 200);
    expect(v.fov).toBe(90);
    expect(v.azimuth).toBe(120);
    expect(v.altitude).toBeLessThan(30);
    expect(v.altitude).toBeGreaterThan(30 - 45);
  });
  it("keeps the target centred when asked for the middle of the screen", () => {
    expect(viewToward(30, 0, 60, { yTarget: 0.5 }).altitude).toBeCloseTo(30, 10);
  });
  it("clamps the altitude to the map's range", () => {
    expect(viewToward(-89, 0, 90).altitude).toBe(-89.9);
  });
});

describe("story helpers", () => {
  it("estimates the reading time", () => {
    expect(readingMinutes(["un deux trois"])).toBe(1);
    expect(readingMinutes([Array(450).fill("mot").join(" ")])).toBe(2);
  });

  it("makes a teaser from the first sentence", () => {
    expect(teaser("Le Verseau est un jeune homme. Il verse de l'eau.")).toBe(
      "Le Verseau est un jeune homme.",
    );
    expect(teaser("Le *Phénomènes* d'Aratos. Suite.")).toBe("Le Phénomènes d'Aratos.");
  });

  it("cuts a long first sentence at a word, with an ellipsis", () => {
    const long = `${"mot ".repeat(60)}fin.`;
    const t = teaser(long, 50);
    expect(t.length).toBeLessThanOrEqual(51);
    expect(t.endsWith("mot…")).toBe(true);
  });

  it("keeps the asterisk of Sagittarius A*", () => {
    expect(teaser("Le trou noir Sagittarius A* est au centre.")).toBe(
      "Le trou noir Sagittarius A* est au centre.",
    );
  });

  it("picks the same anecdote all day long, and another one the next day", () => {
    const ids = ["Aqr", "Ari", "Cap", "Cas", "Ori", "Sco", "UMa"];
    const morning = new Date(2026, 9, 5, 8, 0);
    const evening = new Date(2026, 9, 5, 23, 30);
    expect(anecdoteOfTheDay(ids, morning)).toEqual(anecdoteOfTheDay(ids, evening));
    const days = new Set(
      Array.from({ length: 14 }, (_, i) => anecdoteOfTheDay(ids, new Date(2026, 9, 5 + i))!.id),
    );
    expect(days.size).toBeGreaterThan(3);
    expect(anecdoteOfTheDay([], morning)).toBeNull();
    expect(localDay(evening) - localDay(morning)).toBe(0);
  });
});
