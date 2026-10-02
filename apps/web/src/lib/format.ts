/** Sexagesimal formatting used in data panels (scientific notation, not translated). */
export function formatRa(deg: number): string {
  // Round once, to the displayed tenth of a second, then split: 59.97 s carries into the minute.
  const tenths = Math.round((((deg / 15) % 24) + 24) * 36_000) % (24 * 36_000);
  const h = Math.floor(tenths / 36_000);
  const m = Math.floor((tenths % 36_000) / 600);
  const s = (tenths % 600) / 10;
  return `${pad(h)}h ${pad(m)}m ${s.toFixed(1).padStart(4, "0")}s`;
}

export function formatDec(deg: number): string {
  const seconds = Math.round(Math.abs(deg) * 3600);
  const d = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${deg < 0 && seconds > 0 ? "−" : "+"}${pad(d)}° ${pad(m)}′ ${pad(s)}″`;
}

/** Parallax in milliarcseconds → distance in light-years (1 pc = 3.26156 ly). */
export function parallaxToLightYears(plx: number | undefined): number | null {
  return plx && plx > 0 ? (1000 / plx) * 3.26156 : null;
}

/**
 * Relative distance error above which the distance is shown as approximate ("≈", two
 * significant figures): Rigel (± 9 %), Deneb (± 8 %), Betelgeuse (± 12 %). Below, three
 * significant figures are meaningful (Sirius 8.60 ± 0.04 ly).
 */
export const APPROX_DISTANCE_ERROR = 0.05;
/** Beyond this, the distance is barely an order of magnitude: none is shown. */
export const UNKNOWN_DISTANCE_ERROR = 0.5;

/** The distance fields of a catalogue record (`@asteria/catalog`, #75). */
export interface StarDistanceFields {
  distanceLy?: number | undefined;
  distanceErrorLy?: number | undefined;
  /** Fallback for catalogues without a reference distance (format v1): the parallax, mas. */
  plx?: number | undefined;
  ePlx?: number | undefined;
}

/**
 * Distance shown in the star panel, from the catalogue's reference distance (Gaia DR3, Hipparcos
 * or a published value, #75): three significant figures when it is precise, "≈" with two when it
 * is not, null when it is meaningless. `errorLy` is the rounded 1σ uncertainty.
 */
export function starDistance(
  star: StarDistanceFields,
): { ly: number; errorLy: number | null; approx: boolean } | null {
  let ly = star.distanceLy ?? null;
  let error = star.distanceErrorLy;
  if (ly === null) {
    ly = parallaxToLightYears(star.plx);
    if (ly !== null && star.ePlx !== undefined) error = (ly * star.ePlx) / star.plx!;
  }
  if (ly === null || !(ly > 0)) return null;
  const ratio = error !== undefined ? error / ly : 0;
  const errorLy = error !== undefined ? significant(error, 2) : null;
  if (ratio > UNKNOWN_DISTANCE_ERROR) return null;
  if (ratio > APPROX_DISTANCE_ERROR) return { ly: significant(ly, 2), errorLy, approx: true };
  return { ly: significant(ly, 3), errorLy, approx: false };
}

function significant(x: number, digits: number): number {
  return Number(x.toPrecision(digits)); // 8.6 stays 8.6 (no 8.600000000000001)
}

/**
 * Splits a designation into runs of Greek letters (with their superscript index) and other
 * text, so the Greek letters can stay lower case in upper-case labels: "α Ori" must not read
 * "Α ORI" (a capital alpha looks like a Latin A, a capital theta like an O).
 */
export function greekRuns(text: string): { text: string; greek: boolean }[] {
  const runs: { text: string; greek: boolean }[] = [];
  for (const part of text.split(/([Ͱ-Ͽ][¹²³⁰-⁹]*)/u)) {
    if (!part) continue;
    const greek = /^[Ͱ-Ͽ]/u.test(part);
    const last = runs.at(-1);
    if (last && last.greek === greek) last.text += part;
    else runs.push({ text: part, greek });
  }
  return runs;
}

/**
 * Header label of an astronomical year (year 0 = 1 BC, −1974 = 1975 BC): the i18n key and the
 * number to show. Positive years are unchanged.
 */
export function yearLabel(year: number): { key: "time.year" | "time.yearBce"; year: number } {
  return year > 0 ? { key: "time.year", year } : { key: "time.yearBce", year: 1 - year };
}

const pad = (n: number) => String(n).padStart(2, "0");
