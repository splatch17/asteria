import { describe, expect, it } from "vitest";
import {
  DEEP_SKY_DAYLIGHT_EXTINCTION,
  DEEP_SKY_STYLE,
  GLYPH,
  deepSkyDayLimit,
  deepSkyFieldFor,
  deepSkyLimit,
  deepSkyRank,
  glyphAxes,
  glyphLabelled,
  glyphParams,
  glyphShape,
  glyphVisibility,
  majorAxisDirection,
} from "./deepsky-style";
import { stereoScale } from "./view";

// Values from OpenNGC v20260501 (packages/sky-data/out/deepsky.json, #100).
const M31 = {
  type: "galaxy",
  mag: 3.44,
  majorAxis: 177.83,
  minorAxis: 69.66,
  positionAngle: 35,
  messier: 31,
  name: "Galaxie d'Andromède",
};
const M13 = { type: "globular-cluster", mag: 5.8, majorAxis: 16.5, messier: 13 };
const M57 = { type: "planetary-nebula", mag: 8.8, majorAxis: 1.27, messier: 57 };
const NGC4565 = { type: "galaxy", mag: 9.6, majorAxis: 15.9, minorAxis: 1.85, positionAngle: 136 };
const HORSEHEAD = { type: "dark-nebula", majorAxis: 6, minorAxis: 4, positionAngle: 90 };

const ARCMIN = Math.PI / (180 * 60);

describe("glyphShape", () => {
  it("draws each catalogue type with its atlas symbol", () => {
    expect(glyphShape("galaxy")).toBe(GLYPH.GALAXY);
    expect(glyphShape("galaxy-group")).toBe(GLYPH.GALAXY_GROUP);
    expect(glyphShape("open-cluster")).toBe(GLYPH.OPEN_CLUSTER);
    expect(glyphShape("globular-cluster")).toBe(GLYPH.GLOBULAR_CLUSTER);
    expect(glyphShape("planetary-nebula")).toBe(GLYPH.PLANETARY_NEBULA);
    expect(glyphShape("emission-nebula")).toBe(GLYPH.NEBULA);
    expect(glyphShape("nebula")).toBe(GLYPH.NEBULA);
    expect(glyphShape("reflection-nebula")).toBe(GLYPH.REFLECTION_NEBULA);
    expect(glyphShape("cluster-nebula")).toBe(GLYPH.CLUSTER_NEBULA);
    expect(glyphShape("dark-nebula")).toBe(GLYPH.DARK_NEBULA);
    expect(glyphShape("supernova-remnant")).toBe(GLYPH.SUPERNOVA_REMNANT);
    for (const t of ["association", "asterism", "double-star"])
      expect(glyphShape(t)).toBe(GLYPH.STAR_GROUP);
  });

  it("falls back to a nebula for an unknown type", () => {
    expect(glyphShape("quasar")).toBe(GLYPH.NEBULA);
  });

  it("has a minimum size for every shape", () => {
    for (const code of Object.values(GLYPH))
      expect(DEEP_SKY_STYLE.MIN_RADIUS[code]).toBeGreaterThanOrEqual(5);
  });
});

describe("glyphParams", () => {
  it("orients a galaxy along its major axis, with its axis ratio", () => {
    const p = glyphParams(M31);
    expect(p.shape).toBe(GLYPH.GALAXY);
    expect(p.semiMajor).toBeCloseTo((177.83 / 2) * ARCMIN, 10);
    expect(p.ratio).toBeCloseTo(69.66 / 177.83, 10);
    expect(p.positionAngle).toBeCloseTo((35 * Math.PI) / 180, 10);
  });

  it("keeps an edge-on galaxy readable as an ellipse", () => {
    expect(glyphParams(NGC4565).ratio).toBe(DEEP_SKY_STYLE.MIN_RATIO_GALAXY);
  });

  it("draws clusters and planetary nebulae as circles, whatever the catalogue axes", () => {
    for (const o of [M13, M57, { ...M13, minorAxis: 4, positionAngle: 80 }]) {
      const p = glyphParams(o);
      expect(p.ratio).toBe(1);
      expect(p.positionAngle).toBe(0);
    }
  });

  it("points north when the position angle is unknown", () => {
    const p = glyphParams({ type: "nebula", majorAxis: 90, minorAxis: 60 });
    expect(p.positionAngle).toBe(0);
    expect(p.ratio).toBeCloseTo(60 / 90, 10);
  });

  it("enlarges the minimum size of bright objects, up to a cap", () => {
    const faint = glyphParams({ ...M13, mag: 9 });
    const bright = glyphParams({ ...M13, mag: 3 });
    const brightest = glyphParams({ ...M13, mag: -5 });
    expect(faint.minRadius).toBe(DEEP_SKY_STYLE.MIN_RADIUS[GLYPH.GLOBULAR_CLUSTER]);
    expect(bright.minRadius).toBeGreaterThan(faint.minRadius);
    expect(brightest.minRadius).toBeCloseTo(
      faint.minRadius * (1 + DEEP_SKY_STYLE.BRIGHT_GAIN * DEEP_SKY_STYLE.BRIGHT_MAX),
      10,
    );
  });

  it("keeps the minimum size when the size is unknown", () => {
    const p = glyphParams({ type: "dark-nebula" });
    expect(p.semiMajor).toBe(0);
    const [a, b] = glyphAxes(p, 1, stereoScale(60), 390);
    expect(a).toBe(DEEP_SKY_STYLE.MIN_RADIUS[GLYPH.DARK_NEBULA]);
    expect(b).toBe(a);
  });
});

describe("deepSkyRank", () => {
  it("brings Messier objects and named objects forward", () => {
    expect(deepSkyRank({ type: "galaxy", mag: 8 })).toBe(8);
    expect(deepSkyRank({ type: "galaxy", mag: 8, messier: 51 })).toBe(6.5);
    expect(deepSkyRank({ type: "galaxy", mag: 8, messier: 51, name: "Tourbillon" })).toBe(5.5);
  });

  it("ranks objects without magnitude by size", () => {
    expect(deepSkyRank(HORSEHEAD)).toBe(8);
    expect(deepSkyRank({ type: "open-cluster", majorAxis: 329 })).toBe(5.5); // Hyades
  });
});

describe("deepSkyLimit", () => {
  it("shows the well-known objects in the default field and more when zooming in", () => {
    const wide = deepSkyLimit(100);
    expect(glyphVisibility(deepSkyRank(M31), wide)).toBe(1);
    expect(glyphVisibility(deepSkyRank(M13), wide)).toBe(1);
    expect(glyphVisibility(deepSkyRank(NGC4565), wide)).toBe(0);
    expect(glyphVisibility(deepSkyRank(NGC4565), deepSkyLimit(8))).toBe(1);
  });

  it("decreases with the field and stays within bounds", () => {
    expect(deepSkyLimit(90)).toBeCloseTo(6.2, 10);
    expect(deepSkyLimit(20)).toBeGreaterThan(deepSkyLimit(60));
    expect(deepSkyLimit(1)).toBe(11);
    expect(deepSkyLimit(300)).toBe(4.5);
  });

  it("drowns every object by day only with the realistic layer (#106)", () => {
    expect(deepSkyDayLimit(60, 1, false)).toBe(deepSkyLimit(60));
    expect(deepSkyDayLimit(60, 0, true)).toBe(deepSkyLimit(60));
    const day = deepSkyDayLimit(60, 1, true);
    expect(day).toBeCloseTo(deepSkyLimit(60) - DEEP_SKY_DAYLIGHT_EXTINCTION, 10);
    // The Pleiades (M45, V 1.2, Messier and named) are gone in full daylight.
    expect(
      glyphVisibility(deepSkyRank({ type: "open-cluster", mag: 1.2, messier: 45, name: "P" }), day),
    ).toBe(0);
  });

  it("fades objects in near the limit and labels only those well inside it", () => {
    expect(glyphVisibility(6, 6)).toBe(0);
    expect(glyphVisibility(6 - DEEP_SKY_STYLE.GLYPH_FADE / 2, 6)).toBeCloseTo(0.5, 10);
    expect(glyphLabelled(5.5, 6)).toBe(false);
    expect(glyphLabelled(4.5, 6)).toBe(true);
  });
});

describe("deepSkyFieldFor", () => {
  it("is the widest field where the object is named", () => {
    for (const rank of [5, 7.3, 9]) {
      const fov = deepSkyFieldFor(rank);
      expect(glyphLabelled(rank, deepSkyLimit(fov) + 1e-9)).toBe(true);
      expect(glyphLabelled(rank, deepSkyLimit(fov * 1.05))).toBe(false);
    }
    expect(deepSkyFieldFor(20)).toBe(2);
  });
});

describe("glyphAxes", () => {
  const scale = stereoScale(60);
  const half = 390;

  it("follows the apparent size in narrow fields (stereographic scale at the centre)", () => {
    const p = glyphParams(M31);
    const [a, b] = glyphAxes(p, 1, scale, half);
    expect(a).toBeCloseTo(p.semiMajor * scale * half, 6);
    expect(b / a).toBeCloseTo(p.ratio, 6);
  });

  it("grows away from the centre like the projection", () => {
    const p = glyphParams(M31);
    const [centre] = glyphAxes(p, 1, scale, half);
    const [edge] = glyphAxes(p, Math.cos((50 * Math.PI) / 180), scale, half);
    expect(edge / centre).toBeCloseTo(2 / (1 + Math.cos((50 * Math.PI) / 180)), 6);
  });

  it("never draws a glyph under its minimum, nor wider than two half-heights", () => {
    const p = glyphParams(M57); // 1.3′: a few px at most
    expect(glyphAxes(p, 1, stereoScale(100), half)[0]).toBe(p.minRadius);
    const huge = glyphAxes(glyphParams(M31), 1, stereoScale(0.5), half);
    expect(huge[0]).toBe(DEEP_SKY_STYLE.MAX_RADIUS_HALF_HEIGHTS * half);
  });

  it("keeps a minimum thickness", () => {
    const [a, b] = glyphAxes(glyphParams(NGC4565), 1, stereoScale(100), half);
    expect(b).toBeGreaterThanOrEqual(Math.min(a, DEEP_SKY_STYLE.MIN_MINOR));
  });
});

describe("majorAxisDirection", () => {
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const at = (ra: number, dec: number) => {
    const [a, d] = [(ra * Math.PI) / 180, (dec * Math.PI) / 180];
    return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  };

  it("is tangent to the sky, northwards at PA 0 and eastwards at PA 90", () => {
    const [ra, dec] = [10.68, 41.27];
    const centre = at(ra, dec);
    const north = majorAxisDirection(ra, dec, 0);
    const east = majorAxisDirection(ra, dec, Math.PI / 2);
    expect(dot(north, centre)).toBeCloseTo(0, 12);
    expect(Math.hypot(...north)).toBeCloseTo(1, 12);
    // A step along it raises the declination (north) or the right ascension (east).
    const step = (v: number[]) => centre.map((c, i) => c + 1e-4 * v[i]!);
    const decOf = (v: number[]) => (Math.asin(v[2]! / Math.hypot(...v)) * 180) / Math.PI;
    const raOf = (v: number[]) => (Math.atan2(v[1]!, v[0]!) * 180) / Math.PI;
    expect(decOf(step(north))).toBeGreaterThan(dec);
    expect(raOf(step(east))).toBeGreaterThan(ra);
    expect(Math.abs(decOf(step(east)) - dec)).toBeLessThan(1e-6);
  });
});
