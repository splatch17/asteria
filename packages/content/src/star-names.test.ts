import { describe, expect, it } from "vitest";
import table from "../fr/star-names.json";
import { localizeStarStrings, starName, starNameFr } from "./star-names";

describe("French star names", () => {
  it("uses the usual French spelling of the bright stars", () => {
    expect(starNameFr(27989, "Betelgeuse")).toBe("Bételgeuse");
    expect(starNameFr(21421, "Aldebaran")).toBe("Aldébaran");
    expect(starNameFr(91262, "Vega")).toBe("Véga");
    expect(starNameFr(80763, "Antares")).toBe("Antarès");
    expect(starNameFr(97649, "Altair")).toBe("Altaïr");
    expect(starNameFr(49669, "Regulus")).toBe("Régulus");
  });

  it("keeps names that French uses unchanged", () => {
    expect(starNameFr(69673, "Arcturus")).toBe("Arcturus");
    expect(starNameFr(32349, "Sirius")).toBe("Sirius");
    expect(starNameFr(65474, "Spica")).toBe("Spica");
  });

  it("falls back to the IAU name for a star absent from the table", () => {
    expect(starNameFr(999_999, "Somestar")).toBe("Somestar");
    expect(starName("fr", 999_999, "Somestar")).toBe("Somestar");
  });

  it("holds plain names: letters (possibly accented), spaces and apostrophes", () => {
    const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");
    expect(table.format).toBe("asteria-star-names");
    expect(Object.keys(table.names).length).toBeGreaterThan(100);
    for (const name of Object.values(table.names)) expect(strip(name)).toMatch(/^[A-Za-z' -]+$/);
  });

  it("localises a star string table without naming unnamed stars", () => {
    const strings = {
      version: 1,
      name: { "27989": "Betelgeuse", "1": "Foo" },
      bayer: { "2": "α X" },
    };
    const fr = localizeStarStrings("fr", strings);
    expect(fr).toEqual({
      version: 1,
      name: { "27989": "Bételgeuse", "1": "Foo" },
      bayer: { "2": "α X" },
    });
    expect(strings.name["27989"]).toBe("Betelgeuse");
  });
});
