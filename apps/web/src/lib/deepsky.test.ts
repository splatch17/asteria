import { describe, expect, it } from "vitest";
import type { DeepSkyObject } from "@asteria/catalog";
import {
  apparentSize,
  deepSkyLabel,
  deepSkyMapObjects,
  deepSkySearchSources,
  displayMagnitude,
  observability,
  surfaceBrightness,
} from "./deepsky";

// Rows of OpenNGC v20260501 as decoded by @asteria/catalog (#100).
const M31: DeepSkyObject = {
  id: "M31",
  type: "galaxy",
  ra: 10.68479,
  dec: 41.26906,
  mag: 3.44,
  vMag: 3.44,
  bMag: 4.29,
  majorAxis: 177.83,
  minorAxis: 69.66,
  positionAngle: 35,
  con: "And",
  messier: 31,
  designations: ["M 31", "NGC 224"],
  names: ["Andromeda Galaxy"],
};
const M13: DeepSkyObject = {
  id: "M13",
  type: "globular-cluster",
  ra: 250.42346,
  dec: 36.46131,
  mag: 5.8,
  vMag: 5.8,
  majorAxis: 16.5,
  con: "Her",
  messier: 13,
  designations: ["M 13", "NGC 6205"],
  names: ["Hercules Globular Cluster"],
};
const M57: DeepSkyObject = {
  id: "M57",
  type: "planetary-nebula",
  ra: 283.39587,
  dec: 33.02858,
  mag: 8.8,
  vMag: 8.8,
  bMag: 9.7,
  majorAxis: 1.27,
  con: "Lyr",
  messier: 57,
  designations: ["M 57", "NGC 6720"],
  names: ["Ring Nebula"],
};
const M101: DeepSkyObject = {
  id: "M101",
  type: "galaxy",
  ra: 210.80225,
  dec: 54.34894,
  mag: 7.9,
  vMag: 7.9,
  bMag: 8.36,
  majorAxis: 23.99,
  minorAxis: 23.07,
  positionAngle: 28,
  con: "UMa",
  messier: 101,
  designations: ["M 101", "NGC 5457", "M 102"],
  names: [],
};
const HYADES: DeepSkyObject = {
  id: "C41",
  type: "open-cluster",
  ra: 66.725,
  dec: 15.867,
  majorAxis: 329,
  con: "Tau",
  designations: ["C 41"],
  names: ["Hyades"],
};
const HORSEHEAD: DeepSkyObject = {
  id: "B33",
  type: "dark-nebula",
  ra: 85.245,
  dec: -2.458,
  majorAxis: 6,
  minorAxis: 4,
  positionAngle: 90,
  con: "Ori",
  designations: ["B 33"],
  names: ["Horsehead Nebula"],
};
const NAMES = { M31: "Galaxie d'Andromède", M13: "Grand amas d'Hercule", C41: "Hyades" };

describe("observability", () => {
  it("classes objects by magnitude", () => {
    expect(observability(M31)).toBe("naked-eye");
    expect(observability(M13)).toBe("binoculars");
    expect(observability(M57)).toBe("small-telescope");
    expect(observability({ type: "galaxy", mag: 11, majorAxis: 2, minorAxis: 1 })).toBe(
      "telescope",
    );
  });

  it("moves a diffuse object of low surface brightness up a class", () => {
    // M43 (V 9.0 over 20′ × 15′, 23.8 mag/arcsec²): a telescope, not a small one.
    const m43 = { type: "emission-nebula" as const, mag: 9, majorAxis: 20, minorAxis: 15 };
    expect(surfaceBrightness(m43)).toBeGreaterThan(23.5);
    expect(observability(m43)).toBe("telescope");
    // M101 (23.4 mag/arcsec²) stays a binocular object under a dark sky.
    expect(observability(M101)).toBe("binoculars");
    expect(observability({ ...M101, majorAxis: 40, minorAxis: 40 })).toBe("small-telescope");
    // A cluster is judged by its total light.
    expect(observability({ type: "open-cluster", mag: 6.9, majorAxis: 60 })).toBe("binoculars");
  });

  it("knows the big clusters without magnitude, and says nothing otherwise", () => {
    expect(observability(HYADES)).toBe("naked-eye");
    expect(observability(HORSEHEAD)).toBeNull();
    expect(observability({ type: "open-cluster", majorAxis: 7.8 })).toBeNull();
  });
});

describe("surfaceBrightness", () => {
  it("spreads the magnitude over the ellipse of the axes", () => {
    // M31: 3.44 + 2.5 log10(π/4 · 177.83 · 69.66 · 3600) ≈ 22.3 mag/arcsec²
    expect(surfaceBrightness(M31)).toBeCloseTo(22.27, 1);
    expect(surfaceBrightness(HORSEHEAD)).toBeNull();
    expect(surfaceBrightness({ mag: 5 })).toBeNull();
  });
});

describe("sheet values", () => {
  it("shows the catalogue magnitude with its band", () => {
    expect(displayMagnitude(M31)).toEqual({ band: "V", value: 3.44 });
    expect(displayMagnitude({ mag: 7 })).toEqual({ band: "B", value: 7 }); // no V: B
    expect(displayMagnitude(HYADES)).toBeNull();
  });

  it("gives the size in arcminutes, or in degrees beyond 2°", () => {
    expect(apparentSize(M57)).toEqual({ unit: "arcmin", a: 1.3, b: 1.3, round: true });
    expect(apparentSize(M13)).toEqual({ unit: "arcmin", a: 17, b: 17, round: true });
    expect(apparentSize(M31)).toEqual({ unit: "deg", a: 3, b: 1.2, round: false });
    expect(apparentSize(HYADES)).toEqual({ unit: "deg", a: 5.5, b: 5.5, round: true });
    expect(apparentSize({})).toBeNull();
  });

  it("names an object by its common name, else its first designation", () => {
    expect(deepSkyLabel(M31, NAMES)).toBe("Galaxie d'Andromède");
    expect(deepSkyLabel(M101, NAMES)).toBe("M 101");
  });
});

describe("map and search sources", () => {
  it("hands the map the glyph data, the designation and the localised name", () => {
    const [m31, m101] = deepSkyMapObjects([M31, M101], NAMES);
    expect(m31).toMatchObject({
      id: "M31",
      type: "galaxy",
      label: "M 31",
      name: "Galaxie d'Andromède",
      majorAxis: 177.83,
      positionAngle: 35,
      messier: 31,
    });
    expect(m101!.name).toBeUndefined();
  });

  it("indexes French and English names and every designation", () => {
    const [m31] = deepSkySearchSources([M31], NAMES, (t) => `type:${t}`);
    expect(m31).toEqual({
      id: "M31",
      label: "Galaxie d'Andromède",
      kind: "type:galaxy",
      designations: ["M 31", "NGC 224"],
      names: ["Galaxie d'Andromède", "Andromeda Galaxy"],
      mag: 3.44,
      messier: 31,
    });
  });
});
