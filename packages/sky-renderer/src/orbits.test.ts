import { describe, expect, it } from "vitest";
import { ORBITAL_PERIOD_DAYS, ORBITING_BODIES, heliocentricPosition } from "@asteria/astro-core";
import {
  GM_SUN_AU3_D2,
  ORBIT_POINTS,
  ORBIT_SIDE,
  SUN_MASS_RATIO,
  ellipse,
  osculate,
  pointAt,
  positionAfter,
  sampleOffset,
  sampleOrbit,
} from "./orbits";

const DAY = 86_400_000;
const date = new Date("2026-10-10T00:00:00Z");

/** Osculating ellipse of a body at `date` from the JPL-tested heliocentric positions. */
function orbitOf(body: (typeof ORBITING_BODIES)[number]) {
  const h = 0.05;
  const r = heliocentricPosition(body, date);
  const b = heliocentricPosition(body, new Date(date.getTime() - h * DAY));
  const f = heliocentricPosition(body, new Date(date.getTime() + h * DAY));
  const v = { x: (f.x - b.x) / (2 * h), y: (f.y - b.y) / (2 * h), z: (f.z - b.z) / (2 * h) };
  const el = ellipse();
  expect(osculate(r, v, GM_SUN_AU3_D2 * (1 + 1 / SUN_MASS_RATIO[body]!), el)).toBe(true);
  return { el, r };
}

describe("osculating orbits (#131)", () => {
  it("recovers a circular orbit", () => {
    const el = ellipse();
    expect(osculate({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 1, el)).toBe(true);
    expect(el.a).toBeCloseTo(1, 12);
    expect(el.e).toBeLessThan(1e-12);
    expect(el.n).toBeCloseTo(1, 12);
    const p = positionAfter(el, Math.PI / 2, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(1, 9);
  });

  it("refuses an unbound orbit", () => {
    expect(osculate({ x: 1, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, 1, ellipse())).toBe(false);
  });

  it("passes exactly through each planet, with the true semi-major axes", () => {
    // Semi-major axes, au (JPL, mean elements J2000): the osculating ones differ by the
    // perturbations (≤ 1 % for Uranus and Neptune).
    const a: Record<string, number> = {
      Mercury: 0.387,
      Venus: 0.723,
      Earth: 1.0,
      Mars: 1.524,
      Jupiter: 5.203,
      Saturn: 9.537,
      Uranus: 19.19,
      Neptune: 30.07,
    };
    for (const body of ORBITING_BODIES) {
      const { el, r } = orbitOf(body);
      const p = pointAt(el, el.e0, { x: 0, y: 0, z: 0 });
      const err = Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z);
      expect(err, body).toBeLessThan(1e-9 * r.distanceAu);
      expect(Math.abs(el.a / a[body]! - 1), body).toBeLessThan(0.012);
    }
  });

  it("follows the JPL-tested path a quarter of a period away within 0.5 % of the distance", () => {
    for (const body of ORBITING_BODIES) {
      const { el } = orbitOf(body);
      const dt = ORBITAL_PERIOD_DAYS[body] / 4;
      const p = positionAfter(el, dt, { x: 0, y: 0, z: 0 });
      const t = heliocentricPosition(body, new Date(date.getTime() + dt * DAY));
      const err = Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
      expect(err / t.distanceAu, body).toBeLessThan(0.005);
    }
  });

  it("samples densely next to the body, evenly elsewhere, half an orbit each side", () => {
    expect(sampleOffset(ORBIT_SIDE)).toBe(0);
    expect(sampleOffset(ORBIT_SIDE + 1)).toBeCloseTo(3e-7, 15);
    expect(sampleOffset(ORBIT_SIDE - 1)).toBeCloseTo(-3e-7, 15);
    expect(sampleOffset(ORBIT_POINTS - 1)).toBeCloseTo(Math.PI, 12);
    expect(sampleOffset(0)).toBeCloseTo(-Math.PI, 12);
    let largest = 0;
    for (let i = 1; i < ORBIT_POINTS; i++) {
      const step = sampleOffset(i) - sampleOffset(i - 1);
      expect(step).toBeGreaterThan(0);
      largest = Math.max(largest, step);
    }
    expect(largest).toBeLessThan((2.5 * Math.PI) / 180); // ≤ 2.5° between samples
  });

  it("writes the line relative to the body: the middle point is at its centre", () => {
    const { el } = orbitOf("Neptune");
    const out = new Float32Array(3 * ORBIT_POINTS);
    sampleOrbit(el, 23_454.8, out);
    const m = 3 * ORBIT_SIDE;
    expect([out[m], out[m + 1], out[m + 2]]).toEqual([0, 0, 0]);
    // The nearest samples are inside the planet (1 350 km from its centre, Neptune's radius is
    // 3.9 Earth radii), and float32-exact there.
    const near = Math.hypot(out[m + 3]!, out[m + 4]!, out[m + 5]!);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(0.25); // Earth radii
    // The far side: twice the distance from the Sun, about.
    const far = Math.hypot(out[0]!, out[1]!, out[2]!);
    expect(far / 23_454.8).toBeGreaterThan(55);
    expect(far / 23_454.8).toBeLessThan(62);
  });
});
