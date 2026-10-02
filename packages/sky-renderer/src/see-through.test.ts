import { describe, expect, it } from "vitest";
import {
  BELOW_HORIZON_ALPHA,
  belowHorizonAlpha,
  belowHorizonLimits,
  horizonPasses,
  labelAlpha,
} from "./see-through";
import { limitingMagnitude, planetLimitingMagnitude } from "./limits";
import { LabelLayout, type Rect } from "./labels";
import * as shaders from "./shaders";
import { DEFAULT_SKY_LAYERS } from "./sky-map";

describe("see-through ground: attenuation", () => {
  it("is on by default (product owner's request)", () => {
    expect(DEFAULT_SKY_LAYERS.seeThroughGround).toBe(true);
  });

  it("dims what is below the horizon to about a third, and hides it with the opaque ground", () => {
    expect(BELOW_HORIZON_ALPHA).toBeGreaterThanOrEqual(0.3);
    expect(BELOW_HORIZON_ALPHA).toBeLessThanOrEqual(0.4);
    expect(belowHorizonAlpha(true)).toBe(BELOW_HORIZON_ALPHA);
    expect(belowHorizonAlpha(false)).toBe(0);
  });

  it("dims labels below the horizon only", () => {
    expect(labelAlpha(0.8, false)).toBe(0.8);
    expect(labelAlpha(0.8, true)).toBeCloseTo(0.8 * BELOW_HORIZON_ALPHA, 12);
  });

  it("keeps the night limits below the horizon (no daylight there)", () => {
    for (const fov of [10, 60, 100, 200]) {
      const below = belowHorizonLimits(fov);
      expect(below.stars).toBe(limitingMagnitude(fov));
      expect(below.planets).toBe(planetLimitingMagnitude(limitingMagnitude(fov), -90));
      // Brighter than the full-day planet cap: every planet stays visible below the horizon.
      expect(below.planets).toBeGreaterThan(planetLimitingMagnitude(limitingMagnitude(fov), 30));
    }
  });

  it("fades every object shader below the horizon", () => {
    const objectShaders = [
      shaders.starVert,
      shaders.lineFrag,
      shaders.bodyVert,
      shaders.planetVert,
      shaders.pathVert,
      shaders.guideFrag,
      shaders.groundFrag,
    ];
    for (const src of objectShaders) expect(src).toMatch(/uBelowAlpha|horizonFade/);
  });
});

describe("see-through ground: label priority", () => {
  /** Places labels the way SkyMap.drawLabels does: one pass per side of the horizon. */
  function place(labels: { name: string; below: boolean; rect: Rect }[], seeThrough: boolean) {
    const layout = new LabelLayout();
    const placed: string[] = [];
    for (const below of horizonPasses(seeThrough))
      for (const l of labels) if (l.below === below && layout.place([l.rect])) placed.push(l.name);
    return placed;
  }
  const spot = { x: 0, y: 0, w: 40, h: 12 };

  it("places every label above the horizon before any label below it", () => {
    expect(horizonPasses(true)).toEqual([false, true]);
    // The label below comes first in catalogue order (e.g. a brighter star) but must yield.
    const labels = [
      { name: "Canopus", below: true, rect: spot },
      { name: "Rigel", below: false, rect: { ...spot, x: 10 } },
      { name: "Achernar", below: true, rect: { ...spot, y: 100 } },
    ];
    expect(place(labels, true)).toEqual(["Rigel", "Achernar"]);
  });

  it("writes nothing below the horizon with the opaque ground", () => {
    expect(horizonPasses(false)).toEqual([false]);
    const labels = [
      { name: "Canopus", below: true, rect: spot },
      { name: "Rigel", below: false, rect: { ...spot, y: 100 } },
    ];
    expect(place(labels, false)).toEqual(["Rigel"]);
  });
});
