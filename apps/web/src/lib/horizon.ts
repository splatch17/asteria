/** Altitude above the horizon of a catalogue position, for the sheets (#65). */
import { applyMat3, j2000ToHorizontalMatrix, unitVector, type Observer } from "@asteria/astro-core";

const MINUTE_MS = 60_000;

/**
 * Next rise above the horizon (geometric, 0°) of a J2000 position within a day after `date`, to
 * the half-minute (#198: « Sous l'horizon · se lève à 22 h 59 »); null when it does not rise in
 * that day (never rises from there, or already up and circumpolar).
 */
export function nextRise(ra: number, dec: number, date: Date, observer: Observer): Date | null {
  const t0 = date.getTime();
  const alt = (t: number) => altitudeOf(ra, dec, new Date(t), observer);
  const step = 10 * MINUTE_MS; // a star stays more than 10 min below or above, but at the poles
  let before = alt(t0);
  for (let t = t0 + step; t <= t0 + 24 * 60 * MINUTE_MS; t += step) {
    const now = alt(t);
    if (before < 0 && now >= 0) {
      let a = t - step;
      let b = t;
      while (b - a > MINUTE_MS / 2) {
        const mid = (a + b) / 2;
        if (alt(mid) >= 0) b = mid;
        else a = mid;
      }
      return new Date(b);
    }
    before = now;
  }
  return null;
}

/** Geometric altitude (degrees, no refraction) of a J2000 position (degrees) for an observer. */
export function altitudeOf(ra: number, dec: number, date: Date, observer: Observer): number {
  const h = applyMat3(j2000ToHorizontalMatrix(date, observer), unitVector(ra, dec));
  return (Math.asin(Math.max(-1, Math.min(1, h[2]))) * 180) / Math.PI;
}
