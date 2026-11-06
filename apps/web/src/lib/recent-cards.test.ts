import { describe, expect, it } from "vitest";
import { isRecentList, pushRecent, recentCards } from "./recent-cards";

describe("« Tes dernières cartes » (menu v2)", () => {
  it("puts the card looked at first, once, and keeps three", () => {
    expect(pushRecent([], "Ori")).toEqual(["Ori"]);
    expect(pushRecent(["Ori", "Peg"], "Peg")).toEqual(["Peg", "Ori"]);
    expect(pushRecent(["Ori", "Peg", "Cyg"], "Lyr")).toEqual(["Lyr", "Ori", "Peg"]);
  });

  it("starts from the cards consulted before the list existed, latest first", () => {
    const seen = { "con:Ori": 10, "star:32349": 50, "con:Peg": 30, "con:Cyg": 20, "con:Xyz": 40 };
    const known = (a: string) => a !== "Xyz";
    expect(recentCards([], seen, known)).toEqual(["Peg", "Cyg", "Ori"]);
    expect(recentCards(["Ori"], seen, known)).toEqual(["Ori", "Peg", "Cyg"]);
    expect(recentCards(["Lyr", "And", "Aql", "Cas"], {}, () => true)).toEqual([
      "Lyr",
      "And",
      "Aql",
    ]);
    expect(recentCards([], {}, known)).toEqual([]);
  });

  it("restores only a list of names", () => {
    expect(isRecentList(["Ori"])).toBe(true);
    expect(isRecentList("Ori")).toBe(false);
    expect(isRecentList([1])).toBe(false);
  });
});
