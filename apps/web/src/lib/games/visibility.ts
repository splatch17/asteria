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
  precessionMatrix,
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
 * « Visibles de chez moi » (#187): what rises high enough, at some time of the year, from the
 * player's latitude. Independent of the date but for precession (declinations of date) and of
 * the longitude; the Sun is not considered (over a year every right ascension crosses the
 * meridian at night, except in the light summer nights beyond about 60° of latitude).
 *
 * Rule: a direction of declination δ culminates at 90° − |φ − δ| (refraction ignored, it would
 * add 0.15° at 5°). A star counts when it culminates at least HOME_MIN_ALTITUDE high: lower,
 * the air near the horizon dims it by 2 to 3 magnitudes (airmass ≈ 10) and trees or buildings
 * hide it. A constellation counts when at least HOME_MIN_SHARE of its figure gets that high,
 * counted either in stars or in light (sum of their fluxes): « most of what is drawn » or « most
 * of what shines ». The two halves keep the figures one expects: Scorpius from Paris (Antares and
 * the head are up, the tail hardly) and Eridanus (its long northern course is up, Achernar is
 * not); never the Southern Cross from Paris, always all 88 from the equator.
 */
export const HOME_MIN_ALTITUDE = 5;
export const HOME_MIN_SHARE = 0.5;

/** Altitude (degrees) of the upper culmination of declination `dec` at latitude `lat`. */
export const culmination = (dec: number, lat: number): number => 90 - Math.abs(lat - dec);

/** A star of a figure: J2000 direction and magnitude. */
export interface FigureStar {
  dir: Vec3;
  v: number;
}

/** Declination of date (degrees) of a J2000 direction, `m` the precession matrix. */
function decOfDate(m: ReturnType<typeof precessionMatrix>, dir: Vec3): number {
  const z = applyMat3(m, dir)[2];
  return (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI;
}

/** Keys of the figures visible from `latitude` at some time of the year (rule above). */
export function visibleFromLatitude(
  figures: Readonly<Record<string, readonly FigureStar[]>>,
  latitude: number,
  date: Date,
): Set<string> {
  const m = precessionMatrix(date);
  const out = new Set<string>();
  for (const [key, stars] of Object.entries(figures)) {
    if (!stars.length) continue;
    let count = 0;
    let light = 0;
    let total = 0;
    for (const s of stars) {
      const flux = 10 ** (-0.4 * s.v);
      total += flux;
      if (culmination(decOfDate(m, s.dir), latitude) >= HOME_MIN_ALTITUDE) {
        count++;
        light += flux;
      }
    }
    if (count >= HOME_MIN_SHARE * stars.length || light >= HOME_MIN_SHARE * total) out.add(key);
  }
  return out;
}

/** Keys of the directions (e.g. stars by HIP number) culminating ≥ HOME_MIN_ALTITUDE high. */
export function upFromLatitude(
  directions: Readonly<Record<string, Vec3>>,
  latitude: number,
  date: Date,
): Set<string> {
  const m = precessionMatrix(date);
  const out = new Set<string>();
  for (const [key, dir] of Object.entries(directions))
    if (culmination(decOfDate(m, dir), latitude) >= HOME_MIN_ALTITUDE) out.add(key);
  return out;
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
