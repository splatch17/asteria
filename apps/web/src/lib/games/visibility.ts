/**
 * Constellations up tonight at the player's place (#163), so that the games prefer what can be
 * checked in the real sky. A figure counts as visible when its centre stands at least
 * MIN_ALTITUDE high at some hour of the coming 24 hours when the Sun is below DARK_SUN (nautical
 * night: the bright stars of the figures are out). Sun altitude from astronomy-engine
 * (`bodyPosition`, validated against JPL Horizons in astro-core), star frame from
 * `j2000ToHorizontalMatrix` (precession of date, Meeus 21).
 */
import {
  applyMat3,
  bodyPosition,
  j2000ToHorizontalMatrix,
  type Observer,
} from "@asteria/astro-core";
import type { Vec3 } from "@asteria/astro-core";
import type { ConstellationShape } from "./geometry";

export const MIN_ALTITUDE = 20;
export const DARK_SUN = -12;
const HOUR_MS = 3_600_000;

/**
 * Abbreviations of the figures visible in the dark hours after `date` (hourly samples). Empty
 * when the night never gets dark enough (polar summer): the games then prefer nothing.
 */
export function visibleTonight(
  shapes: Readonly<Record<string, ConstellationShape>>,
  date: Date,
  observer: Observer,
): Set<string> {
  return upTonight(
    Object.fromEntries(Object.values(shapes).map((s) => [s.abbr, s.centre])),
    date,
    observer,
  );
}

/**
 * The same for any directions (J2000 unit vectors) by key, e.g. stars by HIP number (#165): the
 * keys of those at least MIN_ALTITUDE high during a dark hour of the coming 24 hours.
 */
export function upTonight(
  directions: Readonly<Record<string, Vec3>>,
  date: Date,
  observer: Observer,
): Set<string> {
  const visible = new Set<string>();
  const sinMin = Math.sin((MIN_ALTITUDE * Math.PI) / 180);
  const entries = Object.entries(directions);
  for (let h = 0; h < 24; h++) {
    const t = new Date(date.getTime() + h * HOUR_MS);
    if (bodyPosition("Sun", t, observer).altitude > DARK_SUN) continue;
    const m = j2000ToHorizontalMatrix(t, observer);
    for (const [key, dir] of entries)
      if (!visible.has(key) && applyMat3(m, dir)[2] >= sinMin) visible.add(key);
  }
  return visible;
}
