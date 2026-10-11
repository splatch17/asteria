import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  CONTEXT_LAT,
  PinchExit,
  SHIFT_END,
  VISIT_EXIT_THRESHOLD,
  contextFraming,
  inView,
  returnFraction,
  returnTarget,
  sceneFade,
  shiftProgress,
} from "./visit-return";
import { AU } from "./points-of-view";
import { bodyRadius } from "./body-frame";

describe("light-time offset of the way back", () => {
  it("is absorbed over the first SHIFT_END of the time, monotonically", () => {
    expect(shiftProgress(0)).toBe(0);
    expect(shiftProgress(SHIFT_END)).toBe(1);
    expect(shiftProgress(1)).toBe(1);
    expect(shiftProgress(-1)).toBe(0);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      const s = shiftProgress(t);
      expect(s).toBeGreaterThanOrEqual(last - 1e-12);
      last = s;
    }
  });
});

describe("returnTarget", () => {
  const start = new THREE.Vector3(1000, 0, 0); // the visit's point (light-time corrected)
  const shift = new THREE.Vector3(0, 12, 0); // ≈ Neptune's offset, Earth radii
  const dest = new THREE.Vector3(0, 0, 0);
  const out = new THREE.Vector3();

  it("starts on the visit's point and ends on the destination", () => {
    expect(returnTarget(dest, start, shift, 0, 0, out).toArray()).toEqual([1000, 0, 0]);
    expect(returnTarget(dest, start, shift, 1, 1, out).toArray()).toEqual([0, 0, 0]);
  });

  it("follows the globe exactly while the point has not left it (f = 0)", () => {
    for (const s of [0, 0.3, 0.7, 1]) {
      const globe = start.clone().addScaledVector(shift, s);
      expect(returnTarget(dest, start, shift, s, 0, out).distanceTo(globe)).toBeLessThan(1e-12);
    }
  });

  it("is continuous: no jump between consecutive frames of a way back from Neptune", () => {
    // Neptune ≈ 29.9 au from the Earth, 40 radii away at the start, back to ≈ 2 au.
    const r = bodyRadius("Neptune");
    const visit = new THREE.Vector3(29.9 * AU, 0, 0);
    const sun = new THREE.Vector3(0, 0, 0);
    const d0 = 40 * r;
    const d1 = 2 * 29.9 * AU;
    const prev = new THREE.Vector3();
    returnTarget(sun, visit, shift, 0, 0, prev);
    const frames = 96; // 1.6 s at 60 fps
    for (let i = 1; i <= frames; i++) {
      const t = i / frames;
      const f = returnFraction(t, d0, d1);
      returnTarget(sun, visit, shift, shiftProgress(t), f, out);
      const d = d0 * (d1 / d0) ** t;
      // The step of the point looked at, against the camera distance: a fraction of the view.
      expect(out.distanceTo(prev) / d).toBeLessThan(0.15);
      prev.copy(out);
    }
    expect(out.distanceTo(sun)).toBeLessThan(1e-6);
  });

  it("never takes the body farther off the line of sight than in the final framing", () => {
    for (const [body, d1] of [
      ["Jupiter", 30 * AU], // the whole system, framed before the visit
      ["Jupiter", 12 * AU],
      ["Neptune", 70 * AU],
    ] as const) {
      const r = bodyRadius(body);
      const at = new THREE.Vector3(body === "Jupiter" ? 5 * AU : 30 * AU, 0, 0);
      const sun = new THREE.Vector3();
      const d0 = 40 * r;
      const final = at.length() / d1;
      let last = 0;
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const f = returnFraction(t, d0, d1);
        const target = returnTarget(sun, at, new THREE.Vector3(), 0, f, out);
        const off = target.distanceTo(at) / (d0 * (d1 / d0) ** t);
        expect(off).toBeLessThanOrEqual(final * (1 + 1e-9));
        expect(off).toBeGreaterThanOrEqual(last * (1 - 1e-9));
        last = off;
      }
      expect(last).toBeCloseTo(final, 9);
    }
  });

  it("returnFraction goes from 0 to 1, linear when the distance does not grow", () => {
    expect(returnFraction(0, 10, 1e6)).toBe(0);
    expect(returnFraction(1, 10, 1e6)).toBeCloseTo(1, 12);
    expect(returnFraction(0.3, 10, 5)).toBe(0.3);
    expect(returnFraction(2, 10, 1e6)).toBeCloseTo(1, 12);
  });
});

describe("sceneFade", () => {
  it("is 0 out of the scene, 1 in it, and rises monotonically", () => {
    expect(sceneFade(0)).toBe(0);
    expect(sceneFade(1)).toBe(1);
    expect(sceneFade(0.5)).toBeGreaterThan(0.3);
    expect(sceneFade(0.5)).toBeLessThan(0.8);
    let last = 0;
    for (let w = 0; w <= 1; w += 0.02) {
      expect(sceneFade(w)).toBeGreaterThanOrEqual(last - 1e-12);
      last = sceneFade(w);
    }
  });
});

describe("contextFraming", () => {
  it("puts the camera beyond the body, looking back at its primary", () => {
    const rel = new THREE.Vector3(0, 5 * AU, 0); // body at ecliptic longitude 90° from the Sun
    const f = contextFraming(rel, { lon: 0, lat: 0, halfW: 0, halfH: 0 });
    expect(f.lon).toBeCloseTo(90, 9);
    expect(f.lat).toBe(CONTEXT_LAT);
    const up = 5 * AU * Math.sin((CONTEXT_LAT * Math.PI) / 180);
    // The primary appears ≈ rel·sin(lat) above the body: within the half-height.
    expect(f.halfH).toBeGreaterThan(up);
    expect(f.halfW).toBeLessThan(f.halfH);
  });
});

describe("inView", () => {
  const cam = new THREE.Vector3(0, 0, 10);
  const q = new THREE.Quaternion(); // looking down −z
  it("sees points in front within the half-extents less the margin", () => {
    expect(inView(cam, q, new THREE.Vector3(0, 0, 0), 500, 180, 390, 24)).toBe(true);
    expect(inView(cam, q, new THREE.Vector3(3, 0, 0), 500, 180, 390, 24)).toBe(true); // 150 px
    expect(inView(cam, q, new THREE.Vector3(4, 0, 0), 500, 180, 390, 24)).toBe(false); // 200 px
    expect(inView(cam, q, new THREE.Vector3(0, 0, 20), 500, 180, 390, 24)).toBe(false); // behind
  });
});

describe("PinchExit", () => {
  it("leaves once the pinch has pushed VISIT_EXIT_THRESHOLD past the farthest distance", () => {
    const exit = new PinchExit();
    const max = 40;
    // Each pinch step asks 5 % more than the clamped distance.
    let t = 0;
    let steps = 0;
    while (!exit.push(max * 1.05, max, (t += 16))) steps++;
    expect(1.05 ** (steps + 1)).toBeGreaterThanOrEqual(VISIT_EXIT_THRESHOLD);
    expect(1.05 ** steps).toBeLessThan(VISIT_EXIT_THRESHOLD);
  });

  it("does nothing within the distance, and starts again after a pause or a zoom in", () => {
    const exit = new PinchExit();
    expect(exit.push(30, 40, 0)).toBe(false);
    expect(exit.push(40 * 1.2, 40, 10)).toBe(false);
    expect(exit.push(39, 40, 20)).toBe(false); // zoom back in: reset
    expect(exit.push(40 * 1.2, 40, 30)).toBe(false);
    expect(exit.push(40 * 1.2, 40, 900)).toBe(false); // pause: reset
    expect(exit.push(40 * 1.1, 40, 910)).toBe(true); // 1.2 × 1.1 ≥ 1.25
  });
});
