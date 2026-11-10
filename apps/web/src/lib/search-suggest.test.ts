import { describe, expect, it } from "vitest";
import { buildSearchIndex } from "./search";
import {
  brightestUp,
  entryOf,
  loadRecentSearches,
  MAX_RECENT_SEARCHES,
  RECENT_SEARCH_KEY,
  rememberSearch,
  targetKey,
} from "./search-suggest";

const store = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

const index = buildSearchIndex({
  stars: [
    { hip: 91262, v: 0.03, con: "Lyr", name: "Véga", bayer: "α Lyr" },
    { hip: 5, v: 8.5, con: "Lyr" },
  ],
  constellations: [{ abbr: "Lyr", name: "Lyre", latin: "Lyra" }],
  bodies: [{ body: "Moon", name: "Lune" }],
  planets: [{ planet: "Saturn", name: "Saturne" }],
  hipLabel: (hip) => `HIP ${hip}`,
});

describe("recent searches", () => {
  it("gives each kind of target its own key", () => {
    expect(targetKey({ kind: "star", hip: 91262 })).toBe("star:91262");
    expect(targetKey({ kind: "constellation", abbr: "Lyr" })).toBe("constellation:Lyr");
    expect(targetKey({ kind: "body", body: "Moon" })).toBe("body:Moon");
    expect(targetKey({ kind: "planet", planet: "Saturn" })).toBe("planet:Saturn");
    expect(targetKey({ kind: "satellite", id: "25544" })).toBe("satellite:25544");
    expect(targetKey({ kind: "deepsky", id: "M31" })).toBe("deepsky:M31");
  });

  it("finds the entry of a key, and nothing for an object the index does not have", () => {
    expect(entryOf(index, "star:91262")?.label).toBe("Véga");
    expect(entryOf(index, "constellation:Lyr")?.label).toBe("Lyre");
    expect(entryOf(index, "planet:Saturn")?.label).toBe("Saturne");
    expect(entryOf(index, "deepsky:M31")).toBeUndefined();
    expect(entryOf(index, "nonsense")).toBeUndefined();
  });

  it("keeps the latest first, once each, five at most", () => {
    const s = store();
    rememberSearch(s, { kind: "planet", planet: "Saturn" });
    rememberSearch(s, { kind: "star", hip: 91262 });
    expect(rememberSearch(s, { kind: "planet", planet: "Saturn" })).toEqual([
      "planet:Saturn",
      "star:91262",
    ]);
    for (let hip = 1; hip <= 7; hip++) rememberSearch(s, { kind: "star", hip });
    const recent = loadRecentSearches(s);
    expect(recent).toHaveLength(MAX_RECENT_SEARCHES);
    expect(recent[0]).toBe("star:7");
  });

  it("survives a broken record and a storage that throws", () => {
    expect(loadRecentSearches(store({ [RECENT_SEARCH_KEY]: "{" }))).toEqual([]);
    expect(loadRecentSearches(store({ [RECENT_SEARCH_KEY]: '{"a":1}' }))).toEqual([]);
    expect(loadRecentSearches(store({ [RECENT_SEARCH_KEY]: '["star:1",2,null]' }))).toEqual([
      "star:1",
    ]);
    expect(loadRecentSearches(null)).toEqual([]);
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(rememberSearch(broken, { kind: "star", hip: 1 })).toEqual(["star:1"]);
  });
});

describe("brightestUp", () => {
  it("keeps what is high enough, the brightest first", () => {
    const star = (hip: number, altitude: number, magnitude: number) => ({
      target: { kind: "star" as const, hip },
      altitude,
      magnitude,
    });
    const picked = brightestUp(
      [star(1, 40, 1.2), star(2, 5, -1.4), star(3, 12, 0.1), star(4, 60, 2)],
      2,
    );
    expect(picked.map((p) => (p.target.kind === "star" ? p.target.hip : 0))).toEqual([3, 1]);
  });
});
