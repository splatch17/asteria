import { describe, expect, it } from "vitest";
import { devicePointing, pointingToView } from "./orientation";

const view = (a: number, b: number, g: number, screen = 0) => {
  const { forward, up } = devicePointing(a, b, g, screen);
  return pointingToView(forward, up);
};

describe("phone orientation → sky view", () => {
  it("upright phone with alpha 0 looks North at the horizon, unrolled", () => {
    const v = view(0, 90, 0);
    expect(v.azimuth).toBeCloseTo(0, 6);
    expect(v.altitude).toBeCloseTo(0, 6);
    expect(v.roll).toBeCloseTo(0, 6);
  });

  it("alpha grows counter-clockwise: alpha 90 faces West", () => {
    expect(view(90, 90, 0).azimuth).toBeCloseTo(270, 6);
  });

  it("phone lying face up looks at the ground", () => {
    expect(view(0, 0, 0).altitude).toBeCloseTo(-90, 6);
  });

  it("tilting the phone back raises the view", () => {
    expect(view(0, 135, 0).altitude).toBeCloseTo(45, 6);
  });

  it("landscape (screen rotated 90°) is not seen as a roll", () => {
    // Upright phone turned counter-clockwise to landscape: gamma −90 and screen angle 90.
    const v = view(0, 0, -90, 90);
    expect(Math.abs(v.altitude)).toBeLessThan(1e-6);
    expect(Math.abs(v.roll)).toBeLessThan(1e-6);
  });
});
