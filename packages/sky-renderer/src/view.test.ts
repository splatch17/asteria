import { describe, expect, it } from "vitest";
import { applyMat3 } from "@asteria/astro-core";
import { projectStereo, stereoScale, unprojectStereo, viewMatrix } from "./view";

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
