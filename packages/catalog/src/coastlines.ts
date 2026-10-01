/**
 * Coastlines binary format "ASTE" v1 (writer: packages/sky-data/build_earth.py).
 * Layout (little-endian): "ASTE" | u16 version | u16 reserved | u32 count |
 * u32 offsets[count + 1] (point indices) | i16 lon/lat pairs in centidegrees.
 */

export interface Coastlines {
  /** Point index where each polyline starts; length = count + 1. */
  offsets: Uint32Array;
  /** Interleaved lon/lat in degrees. */
  coords: Float32Array;
}

export class CoastlinesError extends Error {}

export function decodeCoastlines(buffer: ArrayBuffer): Coastlines {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)));
  if (magic !== "ASTE") throw new CoastlinesError(`bad magic "${magic}"`);
  const version = view.getUint16(4, true);
  if (version !== 1) throw new CoastlinesError(`unsupported version ${version}`);
  const count = view.getUint32(8, true);
  const offsetsStart = 12;
  const offsets = new Uint32Array(count + 1);
  for (let i = 0; i <= count; i++) offsets[i] = view.getUint32(offsetsStart + i * 4, true);
  const points = offsets[count]!;
  const coordsStart = offsetsStart + (count + 1) * 4;
  if (buffer.byteLength !== coordsStart + points * 4) {
    throw new CoastlinesError(`size mismatch: ${buffer.byteLength} bytes for ${points} points`);
  }
  const coords = new Float32Array(points * 2);
  for (let i = 0; i < points * 2; i++) coords[i] = view.getInt16(coordsStart + i * 2, true) / 100;
  return { offsets, coords };
}
