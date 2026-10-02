/**
 * "See through the Earth" (#65): with the `seeThroughGround` layer on, everything below the
 * horizon stays drawn, dimmed, over a tinted ground; the horizon line stays crisp.
 *
 * Daylight choice: below the horizon the sky is always the night sky. Looking "through the
 * Earth" there is no sunlit atmosphere along the line of sight, so the stars there are not
 * drowned: the map shows that the stars are still there in daytime and that only our bright
 * atmosphere hides those above us.
 */
import { limitingMagnitude, planetLimitingMagnitude } from "./limits";

/** Opacity of what lies below the horizon (stars, lines, bodies, grids, labels). */
export const BELOW_HORIZON_ALPHA = 0.38;

/**
 * Value of the shaders' uBelowAlpha uniform: 0 culls everything below the horizon (opaque
 * ground, drawn last), > 0 dims it (translucent ground, drawn first).
 */
export function belowHorizonAlpha(seeThrough: boolean): number {
  return seeThrough ? BELOW_HORIZON_ALPHA : 0;
}

/** Opacity of a label: its own, dimmed below the horizon. */
export function labelAlpha(base: number, below: boolean): number {
  return below ? base * BELOW_HORIZON_ALPHA : base;
}

/**
 * Label passes, in placement order: labels above the horizon are all placed before any label
 * below it, so a dimmed label never takes the place of a visible one.
 */
export function horizonPasses(seeThrough: boolean): readonly boolean[] {
  return seeThrough ? ABOVE_THEN_BELOW : ABOVE_ONLY;
}
const ABOVE_ONLY: readonly boolean[] = Object.freeze([false]);
const ABOVE_THEN_BELOW: readonly boolean[] = Object.freeze([false, true]);

/**
 * Limiting magnitudes below the horizon: the night values whatever the Sun's altitude (stars,
 * then planets with the night margin).
 */
export function belowHorizonLimits(fov: number): { stars: number; planets: number } {
  const stars = limitingMagnitude(fov);
  return { stars, planets: planetLimitingMagnitude(stars, -90) };
}
