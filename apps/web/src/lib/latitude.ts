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

// --- The zones on the map (#197) ------------------------------------------------------------

/** A zone of the map as a horizontal band: its screen extent (CSS px). */
export interface ZoneBand {
  zone: SkyZone;
  top: number;
  bottom: number;
}

/**
 * The zones as bands of the map, from top to bottom, clipped to [0, height]: north of
 * +(90° − |φ|) the sky that never sets (north) or never rises (south), the band that rises and
 * sets between the limits, the other cap south of them. A zone without sky at this latitude
 * (the caps at the equator, the middle band at the poles) or out of the view is left out.
 * `screenY` places a declination (degrees) on the screen.
 */
export function zoneBands(
  lat: number,
  screenY: (dec: number) => number,
  height: number,
): ZoneBand[] {
  const limit = 90 - Math.abs(lat);
  const north = lat > 1e-9;
  const equator = Math.abs(lat) <= 1e-9;
  const bands: ZoneBand[] = equator
    ? [{ zone: "sometimes", top: screenY(90), bottom: screenY(-90) }]
    : [
        { zone: north ? "always" : "never", top: screenY(90), bottom: screenY(limit) },
        { zone: "sometimes", top: screenY(limit), bottom: screenY(-limit) },
        { zone: north ? "never" : "always", top: screenY(-limit), bottom: screenY(-90) },
      ];
  return bands
    .map((b) => ({ ...b, top: Math.max(0, b.top), bottom: Math.min(height, b.bottom) }))
    .filter((b) => b.bottom - b.top >= 0.5);
}

/**
 * Tops (CSS px) of the bands' labels, `sizes[i]` tall: each centred on its band if it can,
 * otherwise pushed by its neighbours (in band order, `gap` apart) and kept within
 * [0, height − size]. When they cannot all fit, the first ones overlap at the top.
 */
export function placeBandLabels(
  bands: readonly { top: number; bottom: number }[],
  sizes: readonly number[],
  height: number,
  gap = 4,
): number[] {
  const n = bands.length;
  const size = (i: number) => sizes[i] ?? 0;
  const ys = bands.map((b, i) =>
    Math.max(0, Math.min(height - size(i), (b.top + b.bottom) / 2 - size(i) / 2)),
  );
  // Down, then up: the smallest moves that keep them apart.
  for (let i = 1; i < n; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! + size(i - 1) + gap);
  for (let i = n - 1; i >= 0; i--) {
    const below = i === n - 1 ? height : ys[i + 1]! - gap;
    ys[i] = Math.max(0, Math.min(ys[i]!, below - size(i)));
  }
  return ys;
}

/** A zone's wash read from the tokens (`--ast-zone-<zone>` and `-alpha`), or null if unset. */
export function washFrom(
  get: (name: string) => string,
  zone: "always" | "never",
): { color: string; alpha: number } | null {
  const color = get(`--ast-zone-${zone}`).trim();
  const alpha = Number.parseFloat(get(`--ast-zone-${zone}-alpha`));
  return color && Number.isFinite(alpha) ? { color, alpha } : null;
}
