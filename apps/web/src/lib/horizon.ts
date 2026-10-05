/** Altitude above the horizon of a catalogue position, for the sheets (#65). */
import { applyMat3, j2000ToHorizontalMatrix, unitVector, type Observer } from "@asteria/astro-core";

/** Geometric altitude (degrees, no refraction) of a J2000 position (degrees) for an observer. */
export function altitudeOf(ra: number, dec: number, date: Date, observer: Observer): number {
  const h = applyMat3(j2000ToHorizontalMatrix(date, observer), unitVector(ra, dec));
  return (Math.asin(Math.max(-1, Math.min(1, h[2]))) * 180) / Math.PI;
}

/** Horizontal coordinates (degrees; azimuth from North through East) of a J2000 position. */
export function horizontalOf(
  ra: number,
  dec: number,
  date: Date,
  observer: Observer,
): { altitude: number; azimuth: number } {
  const [n, e, u] = applyMat3(j2000ToHorizontalMatrix(date, observer), unitVector(ra, dec));
  const deg = 180 / Math.PI;
  return {
    altitude: Math.asin(Math.max(-1, Math.min(1, u))) * deg,
    azimuth: (((Math.atan2(e, n) * deg) % 360) + 360) % 360,
  };
}
