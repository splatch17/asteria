import { describe, expect, it } from "vitest";
import {
  STAR_STYLE,
  STAR_STYLE_GLSL,
  bvToTemperature,
  lineGap,
  magnitudeToSize,
  starAppearance,
} from "./star-style";

describe("bvToTemperature", () => {
  it("gives ~5800 K for the Sun (B−V = 0.65)", () => {
    expect(Math.abs(bvToTemperature(0.65) - 5800)).toBeLessThan(150);
  });

  it("is hotter for bluer stars (Rigel B−V −0.03) than redder ones (Betelgeuse 1.85)", () => {
    expect(bvToTemperature(-0.03)).toBeGreaterThan(bvToTemperature(1.85));
  });
});

describe("magnitudeToSize", () => {
  it("is monotonic: brighter stars are larger", () => {
    expect(magnitudeToSize(-1.46)).toBeGreaterThan(magnitudeToSize(2));
  });

  it("clamps to the configured bounds", () => {
    expect(magnitudeToSize(10)).toBe(1);
    expect(magnitudeToSize(-30)).toBe(12);
  });
});

describe("starAppearance (#104)", () => {
  const limit = 5; // limiting magnitude of the default phone field

  it("keeps the brightness hierarchy: Sirius > Betelgeuse > Bellatrix > 4th magnitude", () => {
    // V (SIMBAD): Sirius −1.46, Betelgeuse 0.42 (variable), Bellatrix 1.64
    const [sirius, betelgeuse, bellatrix, fourth] = [-1.46, 0.42, 1.64, 4].map(
      (v) => starAppearance(v, limit).core,
    );
    // each step is visibly different: at least 25 % more diameter
    expect(sirius! / betelgeuse!).toBeGreaterThan(1.25);
    expect(betelgeuse! / bellatrix!).toBeGreaterThan(1.25);
    expect(bellatrix! / fourth!).toBeGreaterThan(1.25);
  });

  it("is monotonic in magnitude for size, opacity and halo", () => {
    let prev = starAppearance(-2, limit);
    for (let v = -1.9; v <= limit + 1; v += 0.1) {
      const a = starAppearance(v, limit);
      expect(a.core).toBeLessThanOrEqual(prev.core);
      expect(a.alpha).toBeLessThanOrEqual(prev.alpha);
      expect(a.halo).toBeLessThanOrEqual(prev.halo);
      prev = a;
    }
  });

  it("draws figure stars as readable points: ≥ 2 CSS px core, ≥ 0.9 opacity", () => {
    for (const v of [2, 3, 4, 4.6]) {
      const a = starAppearance(v, limit, true);
      expect(a.core).toBeGreaterThanOrEqual(2);
      expect(a.alpha).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("reinforces figure stars only slightly", () => {
    const plain = starAppearance(3, limit);
    const member = starAppearance(3, limit, true);
    expect(member.core / plain.core).toBeCloseTo(STAR_STYLE.MEMBER_SCALE, 10);
    expect(member.halo).toBeGreaterThan(plain.halo);
  });

  it("keeps faint stars (V > limit) small and dim, and hides them past limit + 1.14", () => {
    const faint = starAppearance(limit + 0.8, limit);
    expect(faint.core).toBeLessThanOrEqual(1.6);
    expect(faint.alpha).toBeLessThan(0.65);
    expect(faint.halo).toBeLessThan(0.12);
    expect(starAppearance(limit + 1.2, limit).core).toBe(0);
  });

  it("does not swell the brightest stars into blobs", () => {
    expect(starAppearance(-1.46, limit).core).toBeLessThanOrEqual(STAR_STYLE.CORE_MAX);
    expect(starAppearance(-4.5, limit).core).toBeLessThanOrEqual(STAR_STYLE.CORE_MAX);
    expect(starAppearance(-1.46, limit).sprite).toBeLessThan(40);
  });

  it("stops the lines clear of the core", () => {
    for (const v of [-1.46, 2, 5]) {
      expect(lineGap(v, limit)).toBeCloseTo(
        starAppearance(v, limit, true).core / 2 + STAR_STYLE.LINE_GAP,
        10,
      );
    }
  });

  it("feeds the same constants to the GLSL twin", () => {
    for (const value of [
      STAR_STYLE.CORE_AT_LIMIT,
      STAR_STYLE.CORE_EXPONENT,
      STAR_STYLE.HIDE_BELOW_REL,
      STAR_STYLE.LINE_GAP,
    ])
      expect(STAR_STYLE_GLSL).toContain(value.toFixed(4));
  });
});
