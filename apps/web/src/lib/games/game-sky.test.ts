import { describe, expect, it } from "vitest";
import { cornerAngle, limitView, type ViewState } from "@asteria/sky-renderer";
import { ZENITH_REACH, ZOOM_IN, framedView, viewMoved, zoomLimits } from "./game-sky";
import { framingFov } from "./geometry";
import { FRAMING_FILL } from "./which-constellation";

describe("zoom of the games' sky (#183)", () => {
  const PHONE = 360 / 400; // the quiz's stage on a 360×780 phone

  it("zooms out from the framing, never in beyond ZOOM_IN of it", () => {
    for (const radius of [3, 10, 20]) {
      const fov = framingFov(radius, PHONE, FRAMING_FILL);
      const l = zoomLimits(fov, PHONE);
      expect(l.minFov).toBeCloseTo(fov * ZOOM_IN, 9);
      expect(l.maxFov).toBeGreaterThan(fov * 1.5);
    }
  });

  it("keeps the made-up horizon off the screen at the widest zoom", () => {
    for (const aspect of [0.46, PHONE, 1, 1.6]) {
      const l = zoomLimits(30, aspect);
      expect(cornerAngle(l.maxFov, aspect)).toBeCloseTo(ZENITH_REACH, 6);
      expect(ZENITH_REACH).toBeLessThan(90 - 5); // the horizon's glow is ≈ 5° high
    }
  });

  it("never makes the framing itself out of bounds (a figure wider than the cap)", () => {
    const fov = framingFov(70, PHONE, FRAMING_FILL);
    const l = zoomLimits(fov, PHONE);
    expect(l.maxFov).toBe(fov);
    const view = framedView(fov, 25);
    limitView(view, PHONE, l);
    expect(view).toEqual(framedView(fov, 25));
  });

  it("bounds a pan towards the horizon to the cap", () => {
    const fov = framingFov(10, PHONE, FRAMING_FILL);
    const l = zoomLimits(fov, PHONE);
    const view: ViewState = { azimuth: 40, altitude: 10, fov: 500 };
    limitView(view, PHONE, l);
    expect(view.fov).toBe(l.maxFov);
    expect(90 - view.altitude + cornerAngle(view.fov, PHONE)).toBeLessThanOrEqual(
      ZENITH_REACH + 1e-9,
    );
  });
});

describe("viewMoved", () => {
  const framed = framedView(40, 30);
  it("is false at the framing, within rounding", () => {
    expect(viewMoved({ ...framed }, framed)).toBe(false);
    expect(viewMoved({ ...framed, fov: 40.01, roll: 30.01 }, framed)).toBe(false);
    // The same screen at the zenith: azimuth and roll turned alike.
    expect(viewMoved({ ...framed, azimuth: 200, roll: 50 }, framed)).toBe(false);
    expect(viewMoved({ ...framed, roll: 30 - 360 }, framed)).toBe(false);
  });
  it("is true after a zoom, a pan or a twist", () => {
    expect(viewMoved({ ...framed, fov: 60 }, framed)).toBe(true);
    expect(viewMoved({ ...framed, altitude: 80 }, framed)).toBe(true);
    expect(viewMoved({ ...framed, roll: 40 }, framed)).toBe(true);
  });
});
