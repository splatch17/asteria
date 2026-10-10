import { describe, expect, it } from "vitest";
import {
  DoubleTap,
  GESTURE,
  PointerPair,
  TwoFingerGesture,
  Velocity,
  angle,
  centroid,
  clampLength,
  decay,
  panLimit,
  panScale,
  raySphere,
  rotateScreen,
  spread,
  toNdc,
  twoFingerDelta,
  wrapAngle,
  wrapDegrees,
  zoomAnchorShift,
} from "./gestures";

const DEG = Math.PI / 180;

describe("two-finger geometry", () => {
  const a = { x: 100, y: 200 };
  const b = { x: 160, y: 280 };

  it("centroid, spread and angle", () => {
    expect(centroid(a, b, { x: 0, y: 0 })).toEqual({ x: 130, y: 240 });
    expect(spread(a, b)).toBeCloseTo(100, 12);
    // y down: b is below-right of a, the segment points clockwise from +x.
    expect(angle(a, b)).toBeCloseTo(Math.atan2(80, 60), 12);
    expect(angle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2, 12);
  });

  it("wraps angles to (−π, π] and degrees to (−180, 180]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(350 * DEG)).toBeCloseTo(-10 * DEG, 12);
    expect(wrapDegrees(-190)).toBeCloseTo(170, 9);
    expect(wrapDegrees(725)).toBeCloseTo(5, 9);
  });
});

describe("TwoFingerGesture", () => {
  const out = twoFingerDelta();
  /** Fingers at ±r round (cx, cy), at angle `deg` (clockwise, y down). */
  const pair = (cx: number, cy: number, r: number, deg: number) => {
    const c = Math.cos(deg * DEG);
    const s = Math.sin(deg * DEG);
    return [
      { x: cx - r * c, y: cy - r * s },
      { x: cx + r * c, y: cy + r * s },
    ] as const;
  };

  it("does nothing below the thresholds (fingers resting, jitter)", () => {
    const g = new TwoFingerGesture();
    g.start(...pair(200, 300, 80, 0));
    const d = g.move(...pair(204, 297, 82, 5), out);
    expect(d).toMatchObject({ dx: 0, dy: 0, scale: 1, rotation: 0 });
    expect(g.engaged).toBe(false);
  });

  it("a pure pinch zooms without panning nor twisting", () => {
    const g = new TwoFingerGesture();
    g.start(...pair(200, 300, 80, 20));
    let scale = 1;
    for (let r = 82; r <= 160; r += 2) {
      const d = g.move(...pair(200, 300, r, 20), out);
      expect(d.dx).toBe(0);
      expect(d.dy).toBe(0);
      expect(d.rotation).toBe(0);
      scale *= d.scale;
      expect(d.cx).toBe(200);
      expect(d.cy).toBe(300);
    }
    expect(g.pinch).toBe(true);
    expect(g.pan || g.twist).toBe(false);
    // Only the change after the threshold is applied: no jump when it engages.
    const engagedAt = 80 * Math.exp(GESTURE.pinchSlop);
    expect(scale).toBeGreaterThan(160 / (engagedAt + 2) - 1e-9);
    expect(scale).toBeLessThan(160 / 80);
  });

  it("a two-finger drag pans by the centroid's motion once past the slop", () => {
    const g = new TwoFingerGesture();
    g.start(...pair(200, 300, 60, 0));
    let x = 0;
    let y = 0;
    for (let k = 1; k <= 30; k++) {
      const d = g.move(...pair(200 + 2 * k, 300 + k, 60, 0), out);
      x += d.dx;
      y += d.dy;
      expect(d.scale).toBe(1);
      expect(d.rotation).toBe(0);
    }
    expect(g.pan).toBe(true);
    // Travel 60 × 30 px, minus what was spent under the threshold (≤ panSlop + one step).
    expect(60 - x).toBeLessThanOrEqual(GESTURE.panSlop + 2);
    expect(x).toBeGreaterThan(0);
    expect(y / x).toBeCloseTo(0.5, 1);
  });

  it("a twist rotates clockwise-positive, after its threshold", () => {
    const g = new TwoFingerGesture();
    g.start(...pair(200, 300, 80, 0));
    let rot = 0;
    for (let deg = 1; deg <= 45; deg++) rot += g.move(...pair(200, 300, 80, deg), out).rotation;
    expect(g.twist).toBe(true);
    expect(g.pinch || g.pan).toBe(false);
    expect(rot / DEG).toBeGreaterThan(45 - GESTURE.twistSlop / DEG - 1.01);
    expect(rot / DEG).toBeLessThanOrEqual(45 - GESTURE.twistSlop / DEG + 1.01);
  });

  it("never twists when disabled (Earth view: north up)", () => {
    const g = new TwoFingerGesture(false);
    g.start(...pair(200, 300, 80, 0));
    for (let deg = 1; deg <= 90; deg += 3) g.move(...pair(200, 300, 80, deg), out);
    expect(g.twist).toBe(false);
    expect(g.move(...pair(200, 300, 80, 95), out).rotation).toBe(0);
  });

  it("does not jump across the ±180° seam of the angle", () => {
    const g = new TwoFingerGesture();
    g.start(...pair(200, 300, 80, 170));
    let rot = 0;
    for (let deg = 171; deg <= 200; deg++) rot += g.move(...pair(200, 300, 80, deg), out).rotation;
    expect(Math.abs(rot)).toBeLessThan(30 * DEG);
    expect(rot).toBeGreaterThan(0);
  });
});

describe("PointerPair", () => {
  it("tracks two pointers, ignores a third, keeps the remaining one as `a`", () => {
    const p = new PointerPair();
    expect(p.add(1, 10, 10)).toBe(true);
    expect(p.add(2, 50, 50)).toBe(true);
    expect(p.add(3, 90, 90)).toBe(false);
    expect(p.size).toBe(2);
    expect(p.get(3)).toBeNull();
    expect(p.remove(3)).toBe(false);
    expect(p.remove(1)).toBe(true);
    expect(p.size).toBe(1);
    expect(p.a).toMatchObject({ id: 2, x: 50, y: 50 });
    expect(p.get(2)).toBe(p.a);
    expect(p.remove(2)).toBe(true);
    expect(p.size).toBe(0);
    expect(p.get(2)).toBeNull();
  });
});

describe("Velocity and inertia", () => {
  it("decays exponentially, frame-rate independent", () => {
    expect(decay(0)).toBe(1);
    expect(decay(GESTURE.inertiaTauMs)).toBeCloseTo(Math.exp(-1), 12);
    // Two 8 ms frames = one 16 ms frame.
    expect(decay(8) * decay(8)).toBeCloseTo(decay(16), 12);
  });

  it("measures a steady drag and flings with it", () => {
    const v = new Velocity();
    for (let t = 0; t <= 200; t += 16) v.sample(8, -4, t); // 0.5 px/ms, −0.25 px/ms
    expect(v.x).toBeCloseTo(0.5, 2);
    expect(v.y).toBeCloseTo(-0.25, 2);
    v.release(210);
    expect(v.active(0.01)).toBe(true);
    // The total glide is the geometric sum of the frames' steps (≈ v·τ).
    const v0 = v.x;
    const out = { x: 0, y: 0 };
    let x = 0;
    for (let k = 0; k < 400; k++) x += v.step(16, out).x;
    expect(x).toBeCloseTo((v0 * 16) / (1 - decay(16)), 6);
    expect(v.active(0.001)).toBe(false);
  });

  it("does not fling when the finger was held still before lifting", () => {
    const v = new Velocity();
    for (let t = 0; t <= 100; t += 16) v.sample(10, 0, t);
    v.release(96 + GESTURE.flingIdleMs + 1);
    expect(v.active(0)).toBe(false);
  });
});

describe("DoubleTap", () => {
  it("needs two close taps in time and space", () => {
    const d = new DoubleTap();
    expect(d.tap(100, 100, 0)).toBe(false);
    expect(d.tap(110, 105, 200)).toBe(true);
    // A third tap starts over.
    expect(d.tap(110, 105, 300)).toBe(false);
    expect(d.tap(110, 105, 300 + GESTURE.doubleTapMs + 1)).toBe(false);
    expect(d.tap(110 + GESTURE.doubleTapPx + 1, 105, 700)).toBe(false);
  });
});

describe("camera transforms", () => {
  it("pans the target plane exactly under the fingers", () => {
    // fov 40°, distance 10: the plane is 2·10·tan 20° high over 800 px.
    const focal = 1 / Math.tan(20 * DEG);
    expect(panScale(10, focal, 800) * 800).toBeCloseTo(20 * Math.tan(20 * DEG), 12);
  });

  it("keeps the zoom's anchor fixed on screen", () => {
    const focal = 1 / Math.tan(20 * DEG);
    const aspect = 0.5;
    const [nx, ny] = [0.4, -0.3];
    const d = 10;
    // The point of the target plane under the anchor (camera right, up).
    const px = (nx * aspect * d) / focal;
    const py = (ny * d) / focal;
    for (const factor of [0.5, 0.9, 1.7]) {
      const s = zoomAnchorShift(nx, ny, aspect, d, focal, factor, { x: 0, y: 0 });
      // After the zoom: the same point, seen from the moved target at distance d·factor.
      const d2 = d * factor;
      expect(((px - s.x) * focal) / (aspect * d2)).toBeCloseTo(nx, 12);
      expect(((py - s.y) * focal) / d2).toBeCloseTo(ny, 12);
    }
    // At the centre the target stays.
    expect(zoomAnchorShift(0, 0, aspect, d, focal, 0.5, { x: 1, y: 1 })).toEqual({ x: 0, y: 0 });
  });

  it("converts to normalised device coordinates", () => {
    expect(toNdc(0, 0, 400, 800, { x: 0, y: 0 })).toEqual({ x: -1, y: 1 });
    expect(toNdc(200, 400, 400, 800, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(toNdc(400, 800, 400, 800, { x: 0, y: 0 })).toEqual({ x: 1, y: -1 });
  });

  it("clamps a vector's length in place", () => {
    const v = [3, 4, 0];
    expect(clampLength(v, 10)).toEqual([3, 4, 0]);
    clampLength(v, 2.5);
    expect(v[0]).toBeCloseTo(1.5, 12);
    expect(v[1]).toBeCloseTo(2, 12);
  });

  it("rotates screen vectors clockwise (y down)", () => {
    const r = rotateScreen(1, 0, Math.PI / 2, { x: 0, y: 0 });
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12); // right → down: clockwise on screen
  });

  it("bounds the Earth view's pan so the Earth stays on screen", () => {
    for (const [dist, aspect] of [
      [1.6, 0.46],
      [4, 0.46],
      [4, 1.8],
      [40, 0.46],
    ] as const) {
      const max = panLimit(dist, 40, aspect);
      // Worst case: the pan perpendicular to the line of sight. The Earth's centre is then at
      // max/dist·focal from the image centre (NDC), inside the shorter half-extent.
      const ndc = max / dist / Math.tan(20 * DEG);
      expect(ndc).toBeLessThan(Math.min(1, aspect));
      // And the camera never enters the globe (the pan moves it at most `max` off its sphere).
      expect(dist - max).toBeGreaterThan(1);
    }
  });

  it("intersects a ray with the unit sphere", () => {
    expect(raySphere(0, 0, 4, 0, 0, -1)).toBeCloseTo(3, 12);
    expect(raySphere(0, 0, 4, 0, 0, 1)).toBe(-1); // looking away
    expect(raySphere(0, 2, 4, 0, 0, -1)).toBe(-1); // passes beside
  });
});
