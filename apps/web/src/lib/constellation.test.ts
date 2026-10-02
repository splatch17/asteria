import { describe, expect, it } from "vitest";
import type { CatalogStar } from "@asteria/sky-renderer";
import {
  brightestStar,
  figureDirections,
  frameAbove,
  placeFigure,
  visibility,
} from "./constellation";

const PARIS = { latitude: 48.8566, longitude: 2.3522 };

// Orion's belt and shoulders (J2000, SIMBAD), enough to place the figure.
const star = (hip: number, ra: number, dec: number, v: number, con = "Ori"): CatalogStar => ({
  hip,
  ra,
  dec,
  v,
  con,
});
const STARS = [
  star(27989, 88.7929, 7.4071, 0.42), // Betelgeuse
  star(24436, 78.6345, -8.2016, 0.13), // Rigel
  star(26727, 85.1897, -1.9426, 1.77), // Alnitak
  star(25336, 81.2828, 6.3497, 1.64), // Bellatrix
  star(32349, 101.2872, -16.7161, -1.46, "CMa"), // Sirius
];
const LINES = {
  Ori: [
    [27989, 26727, 24436],
    [25336, 26727],
  ],
};

describe("brightestStar", () => {
  it("returns the lowest magnitude of the constellation only", () => {
    expect(brightestStar(STARS, "Ori")?.hip).toBe(24436);
    expect(brightestStar(STARS, "And")).toBeNull();
  });
});

describe("visibility", () => {
  it("classifies figures by their stars' altitudes", () => {
    expect(visibility([10, 20])).toBe("up");
    expect(visibility([-5, 20])).toBe("partial");
    expect(visibility([-5, -1])).toBe("down");
  });
});

describe("placeFigure", () => {
  const dirs = figureDirections(STARS, LINES, "Ori");

  it("uses the figure stars only", () => {
    expect(dirs).toHaveLength(4);
  });

  it("puts Orion high in the south on a winter evening, below the horizon in summer", () => {
    // 15 Jan 2027, 21:00 UTC from Paris: Orion transits around 21:30 local time.
    const winter = placeFigure(dirs, new Date("2027-01-15T21:00:00Z"), PARIS)!;
    expect(winter.visibility).toBe("up");
    expect(winter.altitude).toBeGreaterThan(30);
    expect(winter.azimuth).toBeGreaterThan(150);
    expect(winter.azimuth).toBeLessThan(210);
    const summer = placeFigure(dirs, new Date("2027-07-15T21:00:00Z"), PARIS)!;
    expect(summer.visibility).toBe("down");
  });

  it("returns null without figure stars", () => {
    expect(placeFigure([], new Date(), PARIS)).toBeNull();
  });
});

describe("frameAbove", () => {
  const view = { azimuth: 180, altitude: 30, fov: 100, roll: 0 };
  const aspect = 360 / 780;
  const hor = (alt: number, az: number): [number, number, number] => {
    const [a, h] = [(az * Math.PI) / 180, (alt * Math.PI) / 180];
    return [Math.cos(h) * Math.cos(a), Math.cos(h) * Math.sin(a), Math.sin(h)];
  };
  const figure = (alt: number, az: number) => ({
    altitude: alt,
    azimuth: az,
    stars: [hor(alt - 5, az), hor(alt + 5, az), hor(alt, az - 5), hor(alt, az + 5)],
  });

  it("leaves a figure already in the upper part alone", () => {
    expect(frameAbove(figure(55, 180), view, aspect)).toBeNull();
  });

  it("moves a figure hidden by the sheet up to the requested height", () => {
    const next = frameAbove(figure(25, 200), view, aspect, 0.25)!;
    expect(next.azimuth).toBe(200);
    expect(next.altitude).toBeLessThan(25);
    // Seen from the new view, the figure sits in the upper part: no further move needed.
    expect(frameAbove(figure(25, 200), { ...view, ...next }, aspect)).toBeNull();
  });

  it("ignores stars below the horizon", () => {
    const f = figure(55, 180);
    f.stars.push(hor(-10, 180));
    expect(frameAbove(f, view, aspect)).toBeNull();
  });
});
