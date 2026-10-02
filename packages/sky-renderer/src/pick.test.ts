import { describe, expect, it } from "vitest";
import { unitVector, type Vec3 } from "@asteria/astro-core";
import {
  AimThrottle,
  STAR_SHOWN_MARGIN,
  angleBetween,
  boundingCap,
  coneAngle,
  inCap,
  pickStar,
  starPickLimit,
  type StarSearch,
} from "./pick";
import { limitingMagnitude } from "./limits";
import { starVert } from "./shaders";
import { projectStereo, stereoScale } from "./view";

describe("star pick limit (same rule as the shader)", () => {
  it("mirrors starVert's cut-off", () => {
    expect(starVert).toContain("rel < 0.35");
    expect(STAR_SHOWN_MARGIN).toBeCloseTo(1.14, 2);
  });

  it("keeps the field-of-view limit at night", () => {
    for (const fov of [10, 60, 100, 200]) {
      const l = limitingMagnitude(fov);
      expect(starPickLimit(l, l)).toBe(l);
    }
  });

  it("only leaves the stars daylight does not drown", () => {
    const l = limitingMagnitude(100);
    const noon = starPickLimit(l, l - 7); // SkyMap: uLimitMag = limit − 7 · daylight
    expect(noon).toBeCloseTo(l - 7 + STAR_SHOWN_MARGIN, 12);
    expect(-1.46).toBeLessThanOrEqual(noon); // Sirius stays (drawn by the shader too)
    expect(2.38).toBeGreaterThan(noon); // Enif (ε Peg) is gone
    expect(6).toBeGreaterThan(noon); // HIP 106551-like faint stars too
  });
});

/** A small catalogue around the north pole of the frame, tapped at the pole. */
function search(over: Partial<StarSearch> = {}, calls: number[] = []): StarSearch {
  const stars: { v: number; dir: Vec3 }[] = [
    { v: -1.46, dir: unitVector(0, 60) }, // bright, 30° away
    { v: 2.38, dir: unitVector(0, 89.5) }, // 0.5° from the tap
    { v: 5.9, dir: unitVector(90, 89.8) }, // faint, very close
    { v: 6.4, dir: unitVector(180, 89.9) },
  ];
  return {
    mags: stars.map((s) => s.v),
    dirs: stars.map((s) => s.dir),
    toward: [0, 0, 1],
    cosMax: Math.cos((2 * Math.PI) / 180),
    up: [0, 0, 1],
    limitAbove: 6.5,
    limitBelow: null,
    bonusFrom: 6.5,
    // 10 px per degree from the pole.
    distance: (i) => {
      calls.push(i);
      return ((Math.acos(stars[i]!.dir[2]) * 180) / Math.PI) * 10;
    },
    ...over,
  };
}

describe("pickStar", () => {
  it("picks the best scored star in the cone at night", () => {
    // 0.5° (5 px, bonus 6.18) beats 0.2° (2 px, bonus 0.9).
    expect(pickStar(search())).toBe(1);
  });

  it("never picks a star daylight hides", () => {
    const noon = starPickLimit(5, 5 - 7);
    expect(pickStar(search({ limitAbove: noon }))).toBe(-1);
  });

  it("only projects stars inside the cone, and stops at the limit (sorted catalogue)", () => {
    const calls: number[] = [];
    pickStar(search({ limitAbove: 6 }, calls));
    expect(calls).toEqual([1, 2]); // star 0 is outside the cone, star 3 beyond the limit
  });

  it("skips what is below the horizon with the opaque ground, uses the night limit otherwise", () => {
    const below = { up: [0, 0, -1] as Vec3 }; // every star is below the horizon
    expect(pickStar(search({ ...below, limitBelow: null }))).toBe(-1);
    // Full day above the horizon, night below it (#69): the dimmed stars stay pickable.
    expect(pickStar(search({ ...below, limitAbove: -2, limitBelow: 6.5 }))).toBe(1);
  });

  it("ignores stars off screen", () => {
    expect(pickStar(search({ distance: () => NaN }))).toBe(-1);
  });
});

describe("pick cone", () => {
  it("bounds the angle of any point within the radius, anywhere on screen", () => {
    const h = 780;
    const w = 360;
    for (const fov of [5, 60, 100, 200]) {
      const scale = stereoScale(fov);
      const R = 38;
      const limit = coneAngle(R, scale, h);
      // Pairs of directions R px apart along the vertical, from the centre to the edge.
      for (let t = 0; t < 0.9; t += 0.05) {
        const theta = t * (fov / 2) * (Math.PI / 180);
        const a: Vec3 = [0, Math.sin(theta), Math.cos(theta)];
        const ya = projectStereo(a, scale, w / h)[1];
        // Find the direction R px further by bisection on the angle.
        let [lo, hi] = [theta, Math.PI * 0.99];
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2;
          const y = projectStereo([0, Math.sin(mid), Math.cos(mid)], scale, w / h)[1];
          if (((y - ya) * h) / 2 < R) lo = mid;
          else hi = mid;
        }
        expect(lo - theta).toBeLessThanOrEqual(limit + 1e-9);
      }
    }
  });

  it("caps hold their points, and a margin grows them", () => {
    const pts = [unitVector(80, 10), unitVector(85, 15), unitVector(90, 8)];
    const cap = boundingCap(pts);
    for (const p of pts) expect(inCap(cap, p, 1e-9)).toBe(true);
    const far = unitVector(100, 12);
    expect(inCap(cap, far, 0)).toBe(false);
    expect(inCap(cap, far, (10 * Math.PI) / 180)).toBe(true);
  });
});

describe("AimThrottle (reticle target)", () => {
  const view = { azimuth: 180, altitude: 30, fov: 100 };

  it("recomputes on the first frame, then only after > 0.2° or 150 ms", () => {
    const t = new AimThrottle();
    expect(t.due(view, 0)).toBe(true);
    t.mark(view, 0);
    expect(t.due({ ...view, azimuth: 180.1 }, 16)).toBe(false); // hand tremor
    expect(t.due({ ...view, altitude: 30.25 }, 16)).toBe(true);
    expect(t.due(view, 149)).toBe(false);
    expect(t.due(view, 150)).toBe(true);
    expect(t.due({ ...view, fov: 95 }, 16)).toBe(true);
    t.reset();
    expect(t.due(view, 1)).toBe(true);
  });

  it("measures turns on the sphere (azimuth matters less near the zenith)", () => {
    expect(
      angleBetween({ ...view, altitude: 0 }, { ...view, altitude: 0, azimuth: 181 }),
    ).toBeCloseTo(1, 6);
    expect(
      angleBetween({ ...view, altitude: 89 }, { ...view, altitude: 89, azimuth: 190 }),
    ).toBeLessThan(0.2);
    expect(angleBetween({ ...view, azimuth: 359.9 }, { ...view, azimuth: 0.1 })).toBeLessThan(0.2);
  });
});
