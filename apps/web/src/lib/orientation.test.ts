import { describe, expect, it } from "vitest";
import { devicePointing, pointingToView, quaternionPointing } from "./orientation";

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

// Quaternion [x, y, z, w] helpers: R = Rz(alpha) · Rx(beta) · Ry(gamma) as qz ⊗ qx ⊗ qy.
type Q = [number, number, number, number];
const axisQ = (axis: 0 | 1 | 2, deg: number): Q => {
  const h = (deg * Math.PI) / 360;
  const q: Q = [0, 0, 0, Math.cos(h)];
  q[axis] = Math.sin(h);
  return q;
};
const mul = ([ax, ay, az, aw]: Q, [bx, by, bz, bw]: Q): Q => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
const eulerQ = (a: number, b: number, g: number) => mul(mul(axisQ(2, a), axisQ(0, b)), axisQ(1, g));

describe("Generic Sensor quaternion → sky view", () => {
  it("identity: phone flat, top to the North, looks straight down", () => {
    const { forward, up } = quaternionPointing([0, 0, 0, 1]);
    expect(forward[2]).toBeCloseTo(-1, 9);
    expect(up[1]).toBeCloseTo(1, 9);
  });

  it.each([
    [0, 90, 0, 0],
    [37, 120, -15, 0],
    [200, 60, 30, 0],
    [310, 10, -80, 90],
    [95, 170, 45, 270],
  ])("matches the DeviceOrientation angles (%d, %d, %d, screen %d)", (a, b, g, s) => {
    const fromQ = quaternionPointing(eulerQ(a, b, g), s);
    const fromEuler = devicePointing(a, b, g, s);
    for (let i = 0; i < 3; i++) {
      expect(fromQ.forward[i]).toBeCloseTo(fromEuler.forward[i]!, 9);
      expect(fromQ.up[i]).toBeCloseTo(fromEuler.up[i]!, 9);
    }
  });

  it("altitude and roll do not depend on alpha (relative mode keeps them right)", () => {
    const v0 = view(0, 130, 20);
    const v1 = view(123, 130, 20);
    expect(v1.altitude).toBeCloseTo(v0.altitude, 9);
    expect(v1.roll).toBeCloseTo(v0.roll, 9);
    expect((v1.azimuth - v0.azimuth + 360) % 360).toBeCloseTo(360 - 123, 6);
  });
});
