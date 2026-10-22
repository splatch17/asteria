import { describe, expect, it } from "vitest";
import { CONSTELLATION_LATIN, constellationNames } from "@asteria/content";
import type { CatalogueEntry } from "./catalogue";
import {
  EDGE,
  FLICK_SPEED,
  RESISTANCE,
  arrowDirection,
  classifyGesture,
  directionOf,
  dragOffset,
  inEdgeZone,
  neighbours,
  pageSequence,
  releaseVelocity,
  swipeOutcome,
} from "./catalogue-nav";

const fr = constellationNames("fr");
const ENTRIES: CatalogueEntry[] = Object.keys(CONSTELLATION_LATIN).map((abbr) => ({
  abbr,
  name: fr[abbr] ?? abbr,
  latin: CONSTELLATION_LATIN[abbr]!,
}));
const abbrs = (list: readonly CatalogueEntry[]) => list.map((e) => e.abbr);
const BOTH = { previous: true, next: true };

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

describe("gesture", () => {
  it("stays a tap within the slop", () => {
    expect(classifyGesture(0, 0)).toBe("pending");
    expect(classifyGesture(6, -6)).toBe("pending");
  });
  it("is decided by its initial direction", () => {
    expect(classifyGesture(14, 3)).toBe("horizontal");
    expect(classifyGesture(-14, 9)).toBe("horizontal");
    expect(classifyGesture(4, 14)).toBe("vertical");
    expect(classifyGesture(-10, -10)).toBe("vertical"); // 45°: the scroll wins
  });
  it("leaves the sides of the screen to the system's back gesture", () => {
    expect(inEdgeZone(5, 360)).toBe(true);
    expect(inEdgeZone(EDGE - 1, 360)).toBe(true);
    expect(inEdgeZone(EDGE, 360)).toBe(false);
    expect(inEdgeZone(180, 360)).toBe(false);
    expect(inEdgeZone(360 - EDGE + 1, 360)).toBe(true);
  });
  it("turns to the next page right to left", () => {
    expect(directionOf(-40)).toBe("next");
    expect(directionOf(40)).toBe("previous");
  });
});

describe("drag offset", () => {
  it("follows the finger towards a neighbour", () => {
    expect(dragOffset(-120, BOTH)).toBe(-120);
    expect(dragOffset(80, BOTH)).toBe(80);
  });
  it("resists past an end", () => {
    expect(dragOffset(-100, { previous: true, next: false })).toBeCloseTo(-100 * RESISTANCE);
    expect(dragOffset(100, { previous: false, next: true })).toBeCloseTo(100 * RESISTANCE);
  });
});

describe("swipe outcome", () => {
  const W = 360;
  it("turns past 30 % of the width, springs back before", () => {
    expect(swipeOutcome(-120, 0, W, BOTH)).toBe("next");
    expect(swipeOutcome(120, 0, W, BOTH)).toBe("previous");
    expect(swipeOutcome(-90, 0, W, BOTH)).toBeNull();
    expect(swipeOutcome(0, 0, W, BOTH)).toBeNull();
  });
  it("turns on a quick flick, even short", () => {
    expect(swipeOutcome(-40, -FLICK_SPEED - 0.1, W, BOTH)).toBe("next");
    expect(swipeOutcome(20, FLICK_SPEED + 0.5, W, BOTH)).toBeNull(); // too short: a jitter
  });
  it("springs back when thrown back the other way", () => {
    expect(swipeOutcome(-150, 0.6, W, BOTH)).toBeNull();
  });
  it("never turns past an end", () => {
    expect(swipeOutcome(-300, -2, W, { previous: true, next: false })).toBeNull();
    expect(swipeOutcome(300, 2, W, { previous: false, next: true })).toBeNull();
  });
});

describe("release velocity", () => {
  it("measures the last movement only", () => {
    const samples = [
      { x: 300, t: 0 },
      { x: 290, t: 100 }, // slow start
      { x: 250, t: 140 },
      { x: 200, t: 180 },
    ];
    expect(releaseVelocity(samples)).toBeCloseTo((200 - 290) / 80);
  });
  it("is zero without movement", () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ x: 10, t: 5 }])).toBe(0);
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
