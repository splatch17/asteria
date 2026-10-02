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
 * Relative parallax error above which a Hipparcos distance is only an order of magnitude
 * (Deneb: σπ/π = 0.14, 1 400 ly from its parallax for ~2 600 ly by other methods).
 */
export const APPROX_PARALLAX_ERROR = 0.1;
/** Beyond this, the parallax says almost nothing about the distance: none is shown. */
export const UNKNOWN_PARALLAX_ERROR = 0.5;

/**
 * Distance shown in the star panel: exact (rounded to the light-year) when the parallax is
 * precise, "≈" with two significant figures when it is not, null when it is meaningless.
 */
export function starDistance(
  plx: number | undefined,
  ePlx: number | undefined,
): { ly: number; approx: boolean } | null {
  const ly = parallaxToLightYears(plx);
  if (ly === null) return null;
  const ratio = ePlx !== undefined ? ePlx / plx! : 0;
  if (ratio > UNKNOWN_PARALLAX_ERROR) return null;
  if (ratio > APPROX_PARALLAX_ERROR) return { ly: significant(ly, 2), approx: true };
  return { ly: Math.round(ly), approx: false };
}

function significant(x: number, digits: number): number {
  const p = 10 ** (Math.floor(Math.log10(x)) - digits + 1);
  return Math.round(x / p) * p;
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
