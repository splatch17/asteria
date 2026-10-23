/**
 * The latitude explorer's screen logic (#188), free of the DOM so that it can be tested: the
 * lists by zone, the latitude's animation (tweens to a preset, the « play » sweep from pole to
 * pole, its steps when motion is reduced), the latitude as written in the interface.
 * The science (zones, classes of the constellations) is in astro-core `latitude-visibility.ts`.
 */
import type { ConstellationVisibility, SkyZone } from "@asteria/astro-core";

export const ZONES: readonly SkyZone[] = ["always", "sometimes", "never"];

/** Tropic and polar circle (mean obliquity of 2000, 23.44°): ticks of the slider. */
export const TROPIC = 23.44;
export const POLAR_CIRCLE = 90 - TROPIC;

/** Quick latitudes; `home` is the player's place (or Paris). */
export const PRESETS = ["home", "northPole", "equator", "southPole"] as const;
export type Preset = (typeof PRESETS)[number];
export function presetLatitude(preset: Preset, home: number): number {
  return { home, northPole: 90, equator: 0, southPole: -90 }[preset];
}

/** One full sweep, north pole → south pole → north pole (ms): 12 s from pole to pole. */
export const SWEEP_PERIOD_MS = 24_000;
/** The sky turns once in this time (ms), so that the circumpolar stars visibly circle. */
export const SKY_TURN_MS = 36_000;
/** Duration of a tween to a chosen latitude (ms). */
export const TWEEN_MS = 700;
/** Reduced motion: the « play » steps through these latitudes, one every STEP_MS. */
export const STEPS = [90, POLAR_CIRCLE, 45, TROPIC, 0, -TROPIC, -45, -POLAR_CIRCLE, -90] as const;
export const STEP_MS = 1_600;

/** Ease in and out (cubic), t in [0, 1]. */
export const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Latitude of a tween from `from` to `to` after `elapsed` ms. */
export function tweenLatitude(from: number, to: number, elapsed: number, duration = TWEEN_MS) {
  return from + (to - from) * easeInOut(Math.min(1, Math.max(0, elapsed / duration)));
}

/**
 * Next latitude of the reduced-motion « play »: the next step of STEPS beyond `lat` in the
 * direction of travel (`south` true: decreasing), bouncing at the poles. Returns the latitude
 * and the direction after the step.
 */
export function nextStep(lat: number, south: boolean): { lat: number; south: boolean } {
  const eps = 1e-6;
  if (south) {
    const next = STEPS.find((s) => s < lat - eps);
    if (next !== undefined) return { lat: next, south: next > -90 };
    return { lat: [...STEPS].reverse().find((s) => s > lat + eps) ?? 90, south: false };
  }
  const next = [...STEPS].reverse().find((s) => s > lat + eps);
  if (next !== undefined) return { lat: next, south: next >= 90 };
  return { lat: STEPS.find((s) => s < lat - eps) ?? -90, south: true };
}

/** A star of a figure: J2000 unit vector and V magnitude. */
export interface FigurePoint {
  dir: readonly [number, number, number];
  v: number;
}

/**
 * Classes of the constellations for the lists, on their figures, with the rule of the games'
 * « Visibles de chez moi » (#187, games/visibility.ts) so that both count the same: a figure is
 * seen from a latitude when at least `share` of it (in stars or in light) culminates at least
 * `minAltitude` high — `visible`, computed by the games' `visibleFromLatitude`. It is « always »
 * seen when that same share never goes below `minAltitude` (its lower transit, |φ + δ| − 90°, at
 * least that high): up every night of the year. Marks, for those seen part of the year: some of
 * the figure never gets that high (`partlyHidden`), some of it never gets lower (`partlyAlways`).
 * Declinations of date: J2000 directions times `precession`.
 */
export function classifyFigures(
  figures: Readonly<Record<string, readonly FigurePoint[]>>,
  visible: ReadonlySet<string>,
  lat: number,
  precession: readonly number[],
  minAltitude: number,
  share: number,
): Record<string, ConstellationVisibility> {
  const out: Record<string, ConstellationVisibility> = {};
  const [p6, p7, p8] = [precession[6]!, precession[7]!, precession[8]!];
  for (const [abbr, stars] of Object.entries(figures)) {
    if (!stars.length) continue;
    let count = 0;
    let light = 0;
    let total = 0;
    let hidden = false;
    let always = false;
    for (const s of stars) {
      const z = p6 * s.dir[0] + p7 * s.dir[1] + p8 * s.dir[2];
      const dec = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI;
      const flux = 10 ** (-0.4 * s.v);
      total += flux;
      if (90 - Math.abs(lat - dec) < minAltitude) hidden = true;
      if (Math.abs(lat + dec) - 90 >= minAltitude) {
        always = true;
        count++;
        light += flux;
      }
    }
    const zone =
      count >= share * stars.length || light >= share * total
        ? "always"
        : visible.has(abbr)
          ? "sometimes"
          : "never";
    out[abbr] = {
      zone,
      partlyHidden: zone === "sometimes" && hidden,
      partlyAlways: zone === "sometimes" && always,
    };
  }
  return out;
}

/** A constellation in a list: abbreviation, name, and its part marks. */
export interface ListedConstellation {
  abbr: string;
  name: string;
  partlyAlways: boolean;
  partlyHidden: boolean;
}

/** The constellations by zone, each list sorted by name (French collation). */
export function listsByZone(
  classes: Readonly<Record<string, ConstellationVisibility>>,
  names: Readonly<Record<string, string>>,
  locale = "fr",
): Record<SkyZone, ListedConstellation[]> {
  const out: Record<SkyZone, ListedConstellation[]> = { always: [], sometimes: [], never: [] };
  for (const [abbr, v] of Object.entries(classes))
    out[v.zone].push({
      abbr,
      name: names[abbr] ?? abbr,
      partlyAlways: v.partlyAlways,
      partlyHidden: v.partlyHidden,
    });
  const collator = new Intl.Collator(locale);
  for (const list of Object.values(out)) list.sort((a, b) => collator.compare(a.name, b.name));
  return out;
}

/** A key that changes only when some constellation changes class: lists rebuilt on change only. */
export function classesKey(classes: Readonly<Record<string, ConstellationVisibility>>): string {
  return Object.keys(classes)
    .sort()
    .map((a) => {
      const v = classes[a]!;
      return `${a}${v.zone[0]}${v.partlyAlways ? "+" : ""}${v.partlyHidden ? "-" : ""}`;
    })
    .join(",");
}

/**
 * Number formats by locale and options, made once: building an Intl.NumberFormat costs far more
 * than using it, and the readouts change on every frame of a sweep.
 */
const formats = new Map<string, Intl.NumberFormat>();
export function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formats.get(key);
  if (!f) formats.set(key, (f = new Intl.NumberFormat(locale, options)));
  return f;
}

/**
 * A latitude as written in the interface: the absolute value to a tenth and the hemisphere
 * (« 48,9 » and « N »); the equator is « 0 » without hemisphere.
 */
export function latitudeParts(
  lat: number,
  locale = "fr",
): { value: string; hemisphere: "N" | "S" | "" } {
  const rounded = Math.round(lat * 10) / 10;
  const value = numberFormat(locale, { maximumFractionDigits: 1 }).format(Math.abs(rounded));
  return { value, hemisphere: rounded > 0 ? "N" : rounded < 0 ? "S" : "" };
}

/** A declination with its sign and a tenth (« +41,1° », « −41,1° »). */
export function formatDeclination(dec: number, locale = "fr"): string {
  const rounded = Math.round(dec * 10) / 10;
  const value = numberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(rounded));
  return `${rounded < 0 ? "−" : "+"}${value}°`;
}
