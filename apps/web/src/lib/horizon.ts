/** Altitude above the horizon of a catalogue position, for the sheets (#65). */
import { applyMat3, j2000ToHorizontalMatrix, unitVector, type Observer } from "@asteria/astro-core";

/** Geometric altitude (degrees, no refraction) of a J2000 position (degrees) for an observer. */
export function altitudeOf(ra: number, dec: number, date: Date, observer: Observer): number {
  const h = applyMat3(j2000ToHorizontalMatrix(date, observer), unitVector(ra, dec));
  return (Math.asin(Math.max(-1, Math.min(1, h[2]))) * 180) / Math.PI;
}
