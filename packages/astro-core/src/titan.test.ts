import * as Astronomy from "astronomy-engine";
import { describe, expect, it } from "vitest";
import { SATURN_RADIUS_KM, titanEclipticB1950, titanFromSaturnJ2000, titanPosition } from "./titan";

const D = Math.PI / 180;

/**
 * Meeus 46's projection of a Saturn-centred B1950 ecliptic vector on the sky as seen from the
 * Earth (X towards the west along Saturn's equator, Y north, Z towards the Earth's far side; Saturn
 * radii), to compare with the book's Example 46.a. λ0, β0, Δ: Saturn's geocentric B1950 ecliptic
 * position and distance (AU), with light time, from astronomy-engine.
 */
function meeusXYZ(jde: number) {
  const date = Astronomy.MakeTime(jde - 2_451_545).date;
  const sat = Astronomy.GeoVector(Astronomy.Body.Saturn, date, false);
  const tB = Astronomy.MakeTime(2_433_282.4235 - 2_451_545);
  const toB1950 = Astronomy.InverseRotation(
    Astronomy.CombineRotation(Astronomy.Rotation_ECT_EQD(tB), Astronomy.Rotation_EQD_EQJ(tB)),
  );
  const s = Astronomy.RotateVector(toB1950, sat);
  const delta = s.Length();
  const l0 = Math.atan2(s.y, s.x);
  const b0 = Math.asin(s.z / delta);
  const tau = delta / 173.1446326846693;
  const v = titanEclipticB1950(jde - tau);
  const [s1, c1] = [Math.sin(28.0817 * D), Math.cos(28.0817 * D)];
  const n = 168.8112 * D;
  const pole = { x: Math.sin(n) * s1, y: -Math.cos(n) * s1, z: c1 };
  const project = (p: { x: number; y: number; z: number }) => {
    const A = p.x * Math.sin(l0) - p.y * Math.cos(l0);
    const b = p.x * Math.cos(l0) + p.y * Math.sin(l0);
    return {
      A,
      B: b * Math.cos(b0) + p.z * Math.sin(b0),
      C: p.z * Math.cos(b0) - b * Math.sin(b0),
    };
  };
  const P = project(pole);
  const T = project(v);
  const Dr = Math.atan2(P.A, P.C);
  let X = T.A * Math.cos(Dr) - T.C * Math.sin(Dr);
  const Y = T.A * Math.sin(Dr) + T.C * Math.cos(Dr);
  const Z = T.B;
  const r = Math.hypot(v.x, v.y, v.z);
  X += (Math.abs(Z) / 53_800) * Math.sqrt(1 - (X / r) ** 2);
  const W = delta / (delta + Z / 2475);
  return { x: X * W, y: Y * W, z: Z };
}

describe("Titan (Meeus 46)", () => {
  it("matches Example 46.a (1999 Sept. 18.00074 TD): X +14.568, Y +4.738, Z −12.755 radii", () => {
    const p = meeusXYZ(2_451_439.50074);
    // The book rounds to 0.001; Saturn's position here comes from astronomy-engine, not VSOP87
    // as in the book: 0.01 radius (≈ 0.03″) of tolerance.
    expect(Math.abs(p.x - 14.568)).toBeLessThan(0.01);
    expect(Math.abs(p.y - 4.738)).toBeLessThan(0.01);
    expect(Math.abs(p.z - -12.755)).toBeLessThan(0.01);
  });

  it("stays on its orbit: 1.19–1.26 million km from Saturn, period 15.945 days", () => {
    for (let k = 0; k < 40; k++) {
      const t = titanFromSaturnJ2000(2_461_000 + k * 0.4);
      const r = Math.hypot(t.x, t.y, t.z);
      expect(r).toBeGreaterThan(1.18e6);
      expect(r).toBeLessThan(1.26e6);
    }
    // Same orbital longitude one sidereal period later (≈ 15.945 d), within 2°.
    const a = titanEclipticB1950(2_461_000);
    const b = titanEclipticB1950(2_461_000 + 15.945421);
    const angle = Math.acos(
      (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)),
    );
    expect(angle / D).toBeLessThan(2);
    expect(SATURN_RADIUS_KM).toBeGreaterThan(60_000);
    expect(SATURN_RADIUS_KM).toBeLessThan(60_500);
  });

  it("is seen within 3.5′ of Saturn", () => {
    for (let k = 0; k < 20; k++) {
      const date = new Date(Date.UTC(2026, 9, 1 + k));
      const t = titanPosition(date);
      const s = Astronomy.Equator(
        Astronomy.Body.Saturn,
        date,
        new Astronomy.Observer(0, 0, 0),
        false,
        false,
      );
      const sep = Astronomy.AngleBetween(
        Astronomy.VectorFromSphere(
          new Astronomy.Spherical(t.dec, t.ra, 1),
          Astronomy.MakeTime(date),
        ),
        Astronomy.VectorFromSphere(
          new Astronomy.Spherical(s.dec, s.ra * 15, 1),
          Astronomy.MakeTime(date),
        ),
      );
      expect(sep * 60).toBeLessThan(3.5);
    }
  });
});
