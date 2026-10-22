import { describe, expect, it } from "vitest";
import { applyMat3 } from "@asteria/astro-core";
import {
  cornerAngle,
  fovForCornerAngle,
  limitView,
  panView,
  projectStereo,
  stereoScale,
  unprojectStereo,
  viewAnimationProgress,
  viewMatrix,
  type ViewState,
} from "./view";

describe("viewMatrix", () => {
  it("maps the looked-at direction to forward", () => {
    const v = viewMatrix({ azimuth: 135, altitude: 30, fov: 60 });
    const a = (135 * Math.PI) / 180;
    const h = (30 * Math.PI) / 180;
    const dir: [number, number, number] = [
      Math.cos(h) * Math.cos(a),
      Math.cos(h) * Math.sin(a),
      Math.sin(h),
    ];
    const [x, y, z] = applyMat3(v, dir);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(1, 12);
  });

  it("puts East on the right when facing North, West on the right when facing South", () => {
    expect(applyMat3(viewMatrix({ azimuth: 0, altitude: 0, fov: 60 }), [0, 1, 0])[0]).toBeCloseTo(
      1,
    );
    expect(
      applyMat3(viewMatrix({ azimuth: 180, altitude: 0, fov: 60 }), [0, -1, 0])[0],
    ).toBeCloseTo(1);
  });
});

describe("viewMatrix roll", () => {
  it("leaning the screen top right by 90° puts the zenith on the left", () => {
    const v = viewMatrix({ azimuth: 0, altitude: 0, fov: 60, roll: 90 });
    const [x, y] = applyMat3(v, [0, 0, 1]);
    expect(x).toBeCloseTo(-1, 12);
    expect(y).toBeCloseTo(0, 12);
    // and East (formerly on the right) is now up
    expect(applyMat3(v, [0, 1, 0])[1]).toBeCloseTo(1, 12);
  });
});

describe("stereographic projection", () => {
  it("maps half the field of view to the screen edge", () => {
    const fov = 90;
    const t = ((fov / 2) * Math.PI) / 180;
    const [, ny] = projectStereo([0, Math.sin(t), Math.cos(t)], stereoScale(fov), 1);
    expect(ny).toBeCloseTo(1, 12);
  });

  it("round-trips through unprojectStereo", () => {
    const scale = stereoScale(70);
    const dir: [number, number, number] = [0.3, -0.2, Math.sqrt(1 - 0.13)];
    const [nx, ny] = projectStereo(dir, scale, 1.6);
    const back = unprojectStereo(nx, ny, scale, 1.6);
    back.forEach((c, i) => expect(c).toBeCloseTo(dir[i]!, 12));
  });
});

describe("viewAnimationProgress", () => {
  it("eases out from 0 to 1 over the duration", () => {
    expect(viewAnimationProgress(1000, 1000, 600)).toBe(0);
    expect(viewAnimationProgress(1300, 1000, 600)).toBeCloseTo(0.875);
    expect(viewAnimationProgress(1600, 1000, 600)).toBe(1);
    expect(viewAnimationProgress(9999, 1000, 600)).toBe(1);
  });

  it("ends at once without a duration (reduced motion), never NaN", () => {
    expect(viewAnimationProgress(1000, 1000, 0)).toBe(1);
    expect(viewAnimationProgress(1000, 1000, -5)).toBe(1);
  });
});

describe("panView (#152)", () => {
  const base: ViewState = { azimuth: 180, altitude: 20, fov: 60, roll: 0 };
  const dir = (s: ViewState) => {
    const a = (s.azimuth * Math.PI) / 180;
    const h = (s.altitude * Math.PI) / 180;
    return [Math.cos(h) * Math.cos(a), Math.cos(h) * Math.sin(a), Math.sin(h)];
  };
  const angle = (p: ViewState, q: ViewState) => {
    const [a, b] = [dir(p), dir(q)];
    return (Math.acos(Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!)) * 180) / Math.PI;
  };
  it("near the horizon, turns and tilts with the horizon level", () => {
    const v = panView(base, 10, 0);
    expect(v.azimuth).toBeCloseTo(180 + 10 / Math.cos(20 * (Math.PI / 180)), 6);
    expect(v.altitude).toBe(20);
    expect(v.roll).toBe(0);
    const w = panView(base, 0, 15);
    expect(w.altitude).toBe(35);
    expect(w.roll).toBe(0);
  });
  it("near the zenith, moves the centre by the drag in any direction, never spinning", () => {
    const top: ViewState = { azimuth: 180, altitude: 85, fov: 60, roll: 0 };
    for (const [yaw, pitch] of [
      [3, 0],
      [-3, 0],
      [0, 3],
      [2, -2],
    ] as const)
      expect(angle(top, panView(top, yaw, pitch))).toBeCloseTo(Math.hypot(yaw, pitch), 3);
  });
  it("crosses the zenith smoothly and comes back the same way, without a half-turn", () => {
    let v: ViewState = { ...base, altitude: 70 };
    const path: ViewState[] = [];
    for (let i = 0; i < 10; i++) path.push((v = panView(v, 0, 5))); // 70° + 50°: past the zenith
    for (let i = 1; i < path.length; i++) expect(angle(path[i - 1]!, path[i]!)).toBeCloseTo(5, 6);
    for (let i = 0; i < 10; i++) v = panView(v, 0, -5);
    expect(v.altitude).toBeCloseTo(70, 6);
    expect(v.azimuth).toBeCloseTo(180, 6);
    expect(Math.abs(v.roll ?? 0)).toBeLessThan(1e-6);
  });
});

describe("limitView (#183)", () => {
  const limits = { minFov: 20, maxFov: 120, zenithReach: 84 };

  it("keeps the field within its range", () => {
    const wide: ViewState = { azimuth: 180, altitude: 90, fov: 200 };
    limitView(wide, 0.9, limits);
    expect(wide.fov).toBe(120);
    const narrow: ViewState = { azimuth: 180, altitude: 90, fov: 5 };
    limitView(narrow, 0.9, limits);
    expect(narrow.fov).toBe(20);
  });

  it("keeps the corners within the zenith cap", () => {
    for (const fov of [20, 60, 100, 120]) {
      const view: ViewState = { azimuth: 30, altitude: 0, fov };
      limitView(view, 0.9, limits);
      expect(90 - view.altitude + cornerAngle(view.fov, 0.9)).toBeLessThanOrEqual(84 + 1e-9);
      expect(view.azimuth).toBe(30);
    }
  });

  it("leaves a view inside the cap alone", () => {
    const view: ViewState = { azimuth: 10, altitude: 80, fov: 40, roll: 12 };
    limitView(view, 0.9, limits);
    expect(view).toEqual({ azimuth: 10, altitude: 80, fov: 40, roll: 12 });
  });

  it("pins a field wider than the cap at the zenith", () => {
    const view: ViewState = { azimuth: 10, altitude: 70, fov: 150 };
    limitView(view, 0.9, { minFov: 20, maxFov: 150, zenithReach: 84 });
    expect(view.altitude).toBe(90);
  });

  it("has no altitude bound without a cap", () => {
    const view: ViewState = { azimuth: 10, altitude: -20, fov: 60 };
    limitView(view, 0.9, { minFov: 20, maxFov: 120 });
    expect(view.altitude).toBe(-20);
  });
});

describe("fovForCornerAngle", () => {
  it("inverts cornerAngle", () => {
    for (const aspect of [0.46, 0.9, 1, 1.6])
      for (const angle of [10, 45, 84, 120]) {
        const fov = fovForCornerAngle(angle, aspect);
        expect(cornerAngle(fov, aspect)).toBeCloseTo(angle, 9);
      }
  });
});
