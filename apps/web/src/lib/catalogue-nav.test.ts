import { describe, expect, it } from "vitest";
import { CONSTELLATION_LATIN, constellationNames } from "@asteria/content";
import type { CatalogueEntry } from "./catalogue";
import {
  arrowDirection,
  cardAt,
  deckWindow,
  neighbours,
  pageSequence,
  stillOrder,
} from "./catalogue-nav";

const fr = constellationNames("fr");
const ENTRIES: CatalogueEntry[] = Object.keys(CONSTELLATION_LATIN).map((abbr) => ({
  abbr,
  name: fr[abbr] ?? abbr,
  latin: CONSTELLATION_LATIN[abbr]!,
}));
const abbrs = (list: readonly CatalogueEntry[]) => list.map((e) => e.abbr);

describe("page sequence", () => {
  it("follows the catalogue list as filtered and searched", () => {
    const all = pageSequence(ENTRIES, "Ori", {
      filter: "all",
      query: "",
      level: "amateur",
      outside: false,
    });
    expect(all).toHaveLength(88);
    expect(all[0]!.name).toBe("Aigle"); // alphabetical, French collation
    const essential = pageSequence(ENTRIES, "Ori", {
      filter: "essential",
      query: "",
      level: "amateur",
      outside: false,
    });
    expect(essential).toHaveLength(29);
    // A search: best match first, as the list shows it.
    const searched = pageSequence(ENTRIES, "UMa", {
      filter: "all",
      query: "ourse",
      level: "amateur",
      outside: false,
    });
    expect(abbrs(searched)).toEqual(["UMa", "UMi"]);
    const tonight = pageSequence(ENTRIES, "Cyg", {
      filter: "tonight",
      query: "",
      level: "amateur",
      outside: false,
      tonight: new Set(["Lyr", "Cyg", "Aql"]),
    });
    expect(abbrs(tonight)).toEqual(["Aql", "Cyg", "Lyr"]);
  });

  it("from the map, takes the list the catalogue opens on, whatever was left in it", () => {
    const discovery = pageSequence(ENTRIES, "Ori", {
      filter: "all",
      query: "lyr",
      level: "discovery",
      outside: true,
    });
    expect(discovery).toHaveLength(29); // « Essentielles » in Découverte
    const amateur = pageSequence(ENTRIES, "Ori", {
      filter: "essential",
      query: "lyr",
      level: "amateur",
      outside: true,
    });
    expect(amateur).toHaveLength(88);
  });

  it("goes through all 88 when the page is not in that list", () => {
    // Le Caméléon is not in the Découverte list.
    const list = pageSequence(ENTRIES, "Cha", {
      filter: "essential",
      query: "",
      level: "discovery",
      outside: true,
    });
    expect(list).toHaveLength(88);
    expect(abbrs(list)).toContain("Cha");
  });
});

describe("neighbours", () => {
  const seq = [{ abbr: "And" }, { abbr: "Aql" }, { abbr: "Ori" }];
  it("gives the pages before and after, and the place in the list", () => {
    expect(neighbours(seq, "Aql")).toEqual({
      previous: { abbr: "And" },
      next: { abbr: "Ori" },
      index: 2,
      count: 3,
    });
  });
  it("stops at both ends (no wrapping)", () => {
    expect(neighbours(seq, "And").previous).toBeNull();
    expect(neighbours(seq, "Ori").next).toBeNull();
    expect(neighbours([{ abbr: "Lyr" }], "Lyr")).toMatchObject({ previous: null, next: null });
  });
  it("has none for a page outside the list", () => {
    expect(neighbours(seq, "Cyg")).toEqual({ previous: null, next: null, index: 0, count: 3 });
  });
});

describe("deck", () => {
  const PITCH = 328; // a 320 px card and an 8 px gap
  it("centres the nearest card", () => {
    expect(cardAt(0, PITCH, 88)).toBe(0);
    expect(cardAt(PITCH * 57, PITCH, 88)).toBe(57);
    expect(cardAt(PITCH * 57 + 150, PITCH, 88)).toBe(57); // less than half way
    expect(cardAt(PITCH * 57 + 170, PITCH, 88)).toBe(58);
  });
  it("stays in the deck (overscroll, rounding, no layout yet)", () => {
    expect(cardAt(-40, PITCH, 88)).toBe(0);
    expect(cardAt(PITCH * 120, PITCH, 88)).toBe(87);
    expect(cardAt(500, 0, 88)).toBe(0);
    expect(cardAt(500, PITCH, 0)).toBe(0);
  });
  it("keeps two cards on each side in the page", () => {
    expect(deckWindow(10, 88)).toEqual({ from: 8, to: 12 });
    expect(deckWindow(0, 88)).toEqual({ from: 0, to: 2 });
    expect(deckWindow(87, 88)).toEqual({ from: 85, to: 87 });
    expect(deckWindow(0, 1)).toEqual({ from: 0, to: 0 });
  });
  it("prepares the nearest still pictures first, the next before the previous", () => {
    expect(stillOrder(10, 88)).toEqual([11, 9, 12, 8]);
    expect(stillOrder(0, 88)).toEqual([1, 2]);
    expect(stillOrder(87, 88)).toEqual([86, 85]);
    expect(stillOrder(0, 1)).toEqual([]);
  });
});

describe("arrow keys", () => {
  const key = (k: string, extra: Partial<Parameters<typeof arrowDirection>[0]> = {}) =>
    arrowDirection({
      key: k,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target: null,
      ...extra,
    });
  it("turns with ← and →", () => {
    expect(key("ArrowRight")).toBe("next");
    expect(key("ArrowLeft")).toBe("previous");
    expect(key("ArrowUp")).toBeNull();
    expect(key("Enter")).toBeNull();
  });
  it("leaves modifiers and text fields alone", () => {
    expect(key("ArrowLeft", { altKey: true })).toBeNull();
    expect(key("ArrowRight", { metaKey: true })).toBeNull();
    expect(
      key("ArrowRight", { target: { tagName: "INPUT" } as unknown as EventTarget }),
    ).toBeNull();
    expect(
      key("ArrowRight", { target: { isContentEditable: true } as unknown as EventTarget }),
    ).toBeNull();
    expect(key("ArrowRight", { target: { tagName: "BUTTON" } as unknown as EventTarget })).toBe(
      "next",
    );
  });
});
