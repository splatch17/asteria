import { describe, expect, it } from "vitest";
import { limitingMagnitude } from "./limits";
import * as map from "./shaders";
import {
  FOV_MAX_NARROW,
  FOV_MAX_VERTICAL,
  backCutoff,
  cornerAngle,
  maxFov,
  projectStereo,
  stereoScale,
} from "./view";

const S23 = 1080 / 2340;
const DEG = Math.PI / 180;

/** Very wide sky map fields (#89). */
describe("maxFov", () => {
  it("allows ~282° vertically on a portrait S23 (1080×2340)", () => {
    expect(maxFov(S23)).toBeCloseTo(282, 0);
  });

  it("spans FOV_MAX_NARROW across the narrow side, whatever the orientation", () => {
    for (const aspect of [S23, 0.6, 0.75]) {
      const fov = maxFov(aspect);
      // Half-width of the screen as an angle from the centre.
      const halfWidth = (2 * Math.atan(aspect / stereoScale(fov) / 2)) / DEG;
      expect(2 * halfWidth).toBeCloseTo(FOV_MAX_NARROW, 6);
    }
    expect(maxFov(1)).toBe(FOV_MAX_NARROW);
    expect(maxFov(1440 / 900)).toBe(FOV_MAX_NARROW);
  });

  it("never exceeds FOV_MAX_VERTICAL on very tall screens", () => {
    expect(maxFov(0.2)).toBe(FOV_MAX_VERTICAL);
  });

  it("fits the whole sky above the horizon, looking at the zenith, with a margin", () => {
    for (const aspect of [S23, 1440 / 900]) {
      const scale = stereoScale(maxFov(aspect));
      // Horizon points, 90° from the zenith (view centre): right and top of the screen.
      const [nx] = projectStereo([1, 0, 0], scale, aspect);
      const [, ny] = projectStereo([0, 1, 0], scale, aspect);
      expect(Math.abs(nx)).toBeLessThan(0.8);
      expect(Math.abs(ny)).toBeLessThan(0.8);
    }
  });
});

describe("backCutoff", () => {
  it("keeps the historical −0.6 for ordinary fields", () => {
    for (const fov of [2, 60, 100]) {
      expect(backCutoff(fov, S23)).toBe(-0.6);
      expect(backCutoff(fov, 1.6)).toBe(-0.6);
    }
  });

  it("reaches beyond the screen corners at the widest field", () => {
    for (const aspect of [S23, 1.6]) {
      const fov = maxFov(aspect);
      const corner = cornerAngle(fov, aspect);
      expect(Math.cos(corner * DEG)).toBeGreaterThan(backCutoff(fov, aspect));
    }
  });

  it("stays away from the antipode, where the projection diverges", () => {
    expect(backCutoff(FOV_MAX_VERTICAL, 2.5)).toBeGreaterThanOrEqual(Math.cos(172 * DEG) - 1e-12);
  });

  it("drives every map vertex shader instead of a fixed −0.6", () => {
    const shaders = [
      map.starVert,
      map.lineVert,
      map.bodyVert,
      map.planetVert,
      map.pathVert,
      map.guideVert,
    ];
    for (const src of shaders) {
      expect(src).toContain("uBackZ");
      expect(src).not.toContain("-0.6");
    }
  });
});

describe("limitingMagnitude at very wide fields", () => {
  it("is unchanged up to 200° and decreases beyond", () => {
    expect(limitingMagnitude(200)).toBeCloseTo(4.6, 12);
    expect(limitingMagnitude(300)).toBeCloseTo(4.0, 12);
    expect(limitingMagnitude(282)).toBeLessThan(limitingMagnitude(250));
  });
});
