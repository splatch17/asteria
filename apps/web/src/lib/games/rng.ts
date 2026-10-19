/**
 * Seeded random numbers for the games (#163): question draws and choice order go through an
 * injected `Rng`, so that tests (and captures) are reproducible.
 */

/** Uniform number in [0, 1). */
export type Rng = () => number;

/** Mulberry32: tiny 32-bit generator, plenty for drawing quiz questions (not cryptographic). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Index drawn with probability proportional to its weight; −1 when every weight is 0. */
export function pickWeighted(weights: readonly number[], rng: Rng): number {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) return -1;
  let r = rng() * total;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!;
    if (!(w > 0)) continue;
    last = i;
    if (r < w) return i;
    r -= w;
  }
  return last; // rounding at the very end of the range
}

/** Shuffled copy (Fisher–Yates). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
