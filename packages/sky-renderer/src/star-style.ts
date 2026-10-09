/**
 * Visual mapping of physical star properties.
 * Kept free of WebGL so it can be unit-tested and reused by shaders (as uniforms/attributes).
 */

/** Effective temperature (K) from B−V colour index — Ballesteros (2012), EPL 97, 34008. */
export function bvToTemperature(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/**
 * Relative point size for a visual magnitude, from the flux ratio 10^(-0.4·Δm).
 * Apparent size ∝ sqrt(flux) so the area tracks brightness. `limit` is the faintest shown magnitude.
 */
export function magnitudeToSize(mag: number, limit = 6.5, minSize = 1, maxSize = 12): number {
  const relative = Math.sqrt(10 ** (-0.4 * (mag - limit)));
  return Math.min(maxSize, Math.max(minSize, minSize * relative));
}

/**
 * Point-of-light law of the engraved sky (#104), in CSS px. Shared by the sky map and the
 * engraved Earth view: the GLSL twin (STAR_STYLE_GLSL) is built from these same constants.
 *
 * - Core (the crisp disc): diameter = CORE_AT_LIMIT · rel^e, where rel = 10^(−0.4·(m − limit))
 *   is the flux relative to the limiting magnitude of the field. Brighter than the limit,
 *   e = CORE_EXPONENT (0.28 instead of the 0.5 of an "area ∝ flux" law) compresses the range:
 *   figure stars stay readable points on a phone, bright ones do not swell into blobs, and each
 *   magnitude still adds ~30 % of diameter, so the hierarchy stays visible. Fainter than the
 *   limit, e = FAINT_EXPONENT (area ∝ flux). The opacity grows linearly with the flux up to
 *   ALPHA_FULL_REL (one magnitude brighter than the limit): stars near the limit are half
 *   transparent, so the faint field stays discreet instead of filling the sky with mush.
 * - Halo: a light glow around the core, stronger for bright stars.
 * - Stars drawing a constellation figure are slightly reinforced (size, opacity, halo).
 * - Stars fainter than HIDE_BELOW_REL × the limit flux are not drawn (≈ limit + 1.1 mag).
 */
export const STAR_STYLE = {
  CORE_AT_LIMIT: 1.6,
  CORE_EXPONENT: 0.28,
  FAINT_EXPONENT: 0.5,
  CORE_MIN: 1.0,
  CORE_MAX: 11,
  /** Sprite size / core diameter: room for the halo (and the spikes of the brightest stars). */
  SPRITE_RATIO: 3.2,
  ALPHA_BASE: 0.15,
  ALPHA_GAIN: 0.85,
  /** Flux (relative to the limit) from which a star is fully opaque. */
  ALPHA_FULL_REL: 2.5,
  HALO_BASE: 0.12,
  HALO_PER_MAG: 0.05,
  HALO_MAX: 0.4,
  MEMBER_SCALE: 1.2,
  MEMBER_ALPHA: 0.9,
  MEMBER_HALO: 0.08,
  HIDE_BELOW_REL: 0.35,
  /** Constellation lines stop this far (CSS px) from the edge of a star's core. */
  LINE_GAP: 2.5,
  /** Magnitude below which a star gets fine diffraction spikes. */
  SPIKE_MAG: 1.6,
} as const;

export interface StarAppearance {
  /** Diameter of the crisp core, CSS px (0: not drawn). */
  core: number;
  /** Opacity of the core, 0-1. */
  alpha: number;
  /** Peak opacity of the halo, 0-1. */
  halo: number;
  /** Point sprite size, CSS px. */
  sprite: number;
}

/**
 * Appearance of a star of magnitude `mag` when the faintest shown magnitude is `limit`;
 * `member`: the star draws a constellation figure (and the figures are shown).
 */
export function starAppearance(mag: number, limit: number, member = false): StarAppearance {
  const s = STAR_STYLE;
  const rel = 10 ** (-0.4 * (mag - limit));
  if (rel < s.HIDE_BELOW_REL) return { core: 0, alpha: 0, halo: 0, sprite: 0 };
  const k = member ? s.MEMBER_SCALE : 1;
  const e = rel < 1 ? s.FAINT_EXPONENT : s.CORE_EXPONENT;
  const core = Math.min(s.CORE_MAX, Math.max(s.CORE_MIN, s.CORE_AT_LIMIT * rel ** e)) * k;
  let alpha = Math.min(1, s.ALPHA_BASE + (s.ALPHA_GAIN * rel) / s.ALPHA_FULL_REL);
  if (member) alpha = Math.max(alpha, s.MEMBER_ALPHA);
  const halo =
    Math.min(s.HALO_MAX, Math.max(0, s.HALO_BASE + s.HALO_PER_MAG * (limit - mag))) +
    (member ? s.MEMBER_HALO : 0);
  return { core, alpha, halo, sprite: core * s.SPRITE_RATIO };
}

/** Distance (CSS px) from a figure star's centre where its constellation lines stop. */
export function lineGap(mag: number, limit: number): number {
  return starAppearance(mag, limit, true).core / 2 + STAR_STYLE.LINE_GAP;
}

const glsl = (x: number) => x.toFixed(4);
const S = STAR_STYLE;

/**
 * GLSL twin of starAppearance / lineGap: `vec4 starStyle(mag, limit, member)` returns
 * (core, alpha, halo, sprite), `float starLineGap(mag, limit)` the line gap.
 */
export const STAR_STYLE_GLSL = /* glsl */ `
  vec4 starStyle(float mag, float limit, float member) {
    float rel = pow(10.0, -0.4 * (mag - limit));
    if (rel < ${glsl(S.HIDE_BELOW_REL)}) return vec4(0.0);
    float e = rel < 1.0 ? ${glsl(S.FAINT_EXPONENT)} : ${glsl(S.CORE_EXPONENT)};
    float core = clamp(${glsl(S.CORE_AT_LIMIT)} * pow(rel, e), ${glsl(S.CORE_MIN)},
      ${glsl(S.CORE_MAX)}) * mix(1.0, ${glsl(S.MEMBER_SCALE)}, member);
    float alpha = min(1.0, ${glsl(S.ALPHA_BASE)} + ${glsl(S.ALPHA_GAIN / S.ALPHA_FULL_REL)} * rel);
    alpha = mix(alpha, max(alpha, ${glsl(S.MEMBER_ALPHA)}), member);
    float halo = clamp(${glsl(S.HALO_BASE)} + ${glsl(S.HALO_PER_MAG)} * (limit - mag), 0.0,
      ${glsl(S.HALO_MAX)}) + ${glsl(S.MEMBER_HALO)} * member;
    return vec4(core, alpha, halo, core * ${glsl(S.SPRITE_RATIO)});
  }
  float starLineGap(float mag, float limit) {
    return starStyle(mag, limit, 1.0).x * 0.5 + ${glsl(S.LINE_GAP)};
  }
`;

/**
 * Star sprite fragment: crisp core, light halo, optional fine spikes. `p` is gl_PointCoord in
 * [−1, 1]², `sprite` and `core` are CSS px, `aa` is half a device pixel in CSS px.
 */
export const STAR_SPRITE_GLSL = /* glsl */ `
  float starSprite(vec2 p, float sprite, float core, float alpha, float halo, float spike, float aa) {
    float r = length(p);
    float d = r * sprite * 0.5;
    float disc = 1.0 - smoothstep(core * 0.5 - aa, core * 0.5 + aa, d);
    float q = d / max(core * 0.75, 1.0);
    float glow = exp(-q * q) * halo;
    float spikes = pow(abs(cos(atan(p.y, p.x) * 3.0)), 60.0) * smoothstep(1.0, 0.15, r) * spike;
    return max(disc * alpha, max(glow, spikes * alpha));
  }
`;
