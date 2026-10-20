import { describe, expect, it } from "vitest";
import { unitVector } from "@asteria/astro-core";
import type { ConstellationShape } from "./geometry";
import { upTonight, visibleTonight } from "./visibility";

const shape = (abbr: string, ra: number, dec: number): ConstellationShape => ({
  abbr,
  centre: unitVector(ra, dec),
  radius: 5,
});
// Approximate figure centres (J2000).
const SHAPES = Object.fromEntries(
  [
    shape("Cyg", 305, 42), // summer evenings
    shape("UMa", 170, 55), // circumpolar from Paris
    shape("Cru", 187, -60), // far south
    shape("Ori", 84, 0), // winter (rises late in October, before dawn)
    shape("Sgr", 285, -28), // low and set early in October from Paris
  ].map((s) => [s.abbr, s]),
);

describe("visible tonight", () => {
  it("Paris, 19 October 2026 evening", () => {
    const v = visibleTonight(SHAPES, new Date("2026-10-19T17:00:00Z"), {
      latitude: 48.85,
      longitude: 2.35,
    });
    expect(v.has("Cyg")).toBe(true);
    expect(v.has("UMa")).toBe(true);
    expect(v.has("Ori")).toBe(true); // up after 1 h, before dawn
    expect(v.has("Cru")).toBe(false); // never rises
    expect(v.has("Sgr")).toBe(false); // < 20° high once dark
  });

  it("Sydney sees the Southern Cross", () => {
    const v = visibleTonight(SHAPES, new Date("2026-04-10T08:00:00Z"), {
      latitude: -33.87,
      longitude: 151.21,
    });
    expect(v.has("Cru")).toBe(true);
    expect(v.has("UMa")).toBe(false);
  });

  it("works for any direction, e.g. stars by HIP number", () => {
    const v = upTonight(
      { "91262": unitVector(279.23, 38.78), "30438": unitVector(95.99, -52.7) }, // Véga, Canopus
      new Date("2026-10-19T17:00:00Z"),
      { latitude: 48.85, longitude: 2.35 },
    );
    expect([...v]).toEqual(["91262"]);
  });

  it("prefers nothing when the night never gets dark (Svalbard, June)", () => {
    const v = visibleTonight(SHAPES, new Date("2026-06-21T00:00:00Z"), {
      latitude: 78.2,
      longitude: 15.6,
    });
    expect(v.size).toBe(0);
  });
});
