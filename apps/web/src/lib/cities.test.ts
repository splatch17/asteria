import { describe, expect, it } from "vitest";
import { buildCityIndex, countryName, parseCoordinates, searchCities } from "./cities";

const index = buildCityIndex({
  version: 1,
  cities: [
    ["Tokyo", "", "JP", 35.69, 139.75, ""],
    ["New York", "", "US", 40.72, -74, ""],
    ["Londres", "London", "GB", 51.5, -0.12, ""],
    ["Paris", "", "FR", 48.86, 2.35, ""],
    ["Saint-Pétersbourg", "St. Petersburg", "RU", 59.94, 30.32, ""],
    ["Saint-Étienne", "", "FR", 45.43, 4.38, ""],
    ["San José", "San Jose", "US", 37.33, -121.89, "California"],
    ["San José", "", "CR", 9.93, -84.08, ""],
    ["Paris", "", "US", 33.66, -95.55, "Texas"],
    ["bad row"],
    ["Nowhere", "", "XX", 95, 0, ""],
  ],
});

describe("buildCityIndex", () => {
  it("keeps well-formed rows only", () => {
    expect(index.cities).toHaveLength(9);
    expect(buildCityIndex(null).cities).toEqual([]);
    expect(buildCityIndex({ cities: "no" }).cities).toEqual([]);
  });
});

describe("searchCities", () => {
  const names = (q: string, limit?: number) =>
    searchCities(index, q, limit).map((c) => `${c.name}/${c.country}`);

  it("matches from the start of the name, the largest first", () => {
    expect(names("par")).toEqual(["Paris/FR", "Paris/US"]);
    expect(names("san")).toEqual(["San José/US", "San José/CR"]);
  });

  it("ignores accents, case, hyphens and apostrophes", () => {
    expect(names("saint etienne")).toEqual(["Saint-Étienne/FR"]);
    expect(names("SAINT-PÉ")).toEqual(["Saint-Pétersbourg/RU"]);
    expect(names("san jose")).toEqual(["San José/US", "San José/CR"]);
  });

  it("finds a city by its local name", () => {
    expect(names("london")).toEqual(["Londres/GB"]);
    expect(names("lond")).toEqual(["Londres/GB"]);
  });

  it("matches a later word after the names that start with the query", () => {
    expect(names("york")).toEqual(["New York/US"]);
    expect(names("p")).toEqual(["Paris/FR", "Paris/US", "Saint-Pétersbourg/RU"]);
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(names("  ")).toEqual([]);
    expect(names("s", 2)).toHaveLength(2);
  });
});

describe("parseCoordinates", () => {
  it("reads decimal degrees with a point or a comma", () => {
    expect(parseCoordinates("48,85 2,35")).toEqual({ latitude: 48.85, longitude: 2.35 });
    expect(parseCoordinates("48.85, 2.35")).toEqual({ latitude: 48.85, longitude: 2.35 });
    expect(parseCoordinates(" 48.85 ; 2.35 ")).toEqual({ latitude: 48.85, longitude: 2.35 });
  });

  it("reads signs and hemisphere letters", () => {
    expect(parseCoordinates("-33.87 151.21")).toEqual({ latitude: -33.87, longitude: 151.21 });
    expect(parseCoordinates("33,87 S 151,21 E")).toEqual({ latitude: -33.87, longitude: 151.21 });
    expect(parseCoordinates("4.9N 52.3O")).toEqual({ latitude: 4.9, longitude: -52.3 });
    expect(parseCoordinates("4.9° N 52.3° W")).toEqual({ latitude: 4.9, longitude: -52.3 });
    expect(parseCoordinates("−12 −77")).toEqual({ latitude: -12, longitude: -77 });
  });

  it("rejects what is not a pair of coordinates in range", () => {
    for (const text of ["", "paris", "48.85", "91 0", "45 181", "48,85,2,35", "12 34 56"])
      expect(parseCoordinates(text)).toBeNull();
  });
});

describe("countryName", () => {
  it("names a country in French, and gives nothing without a code", () => {
    expect(countryName("FR")).toBe("France");
    expect(countryName("GF")).toBe("Guyane française");
    expect(countryName("")).toBe("");
  });
});
