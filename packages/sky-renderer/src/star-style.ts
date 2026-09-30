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
