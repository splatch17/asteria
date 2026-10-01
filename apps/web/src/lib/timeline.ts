/**
 * Time scrubber model. Offsets are in milliseconds, except for the precession range
 * where they are whole years (stepping by calendar years keeps the same date and time of
 * day, so only the slow precession of the sky remains visible).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type TimeRange = "48h" | "1y" | "26ky";

export interface RangeSpec {
  /** Half-width of the slider, in offset units. */
  half: number;
  step: number;
  /** Playback speeds, in offset units per second of real time. */
  speeds: { value: number; key: string }[];
  unit: "ms" | "years";
}

export const RANGES: Record<TimeRange, RangeSpec> = {
  "48h": {
    half: 24 * HOUR,
    step: MINUTE,
    unit: "ms",
    speeds: [
      { value: MINUTE, key: "time.speed.1min" },
      { value: 10 * MINUTE, key: "time.speed.10min" },
      { value: HOUR, key: "time.speed.1h" },
    ],
  },
  "1y": {
    half: 182.5 * DAY,
    step: HOUR,
    unit: "ms",
    speeds: [
      { value: HOUR, key: "time.speed.1h" },
      { value: DAY, key: "time.speed.1d" },
      { value: 10 * DAY, key: "time.speed.10d" },
    ],
  },
  "26ky": {
    half: 13_000,
    step: 10,
    unit: "years",
    speeds: [
      { value: 10, key: "time.speed.10y" },
      { value: 100, key: "time.speed.100y" },
      { value: 1000, key: "time.speed.1000y" },
    ],
  },
};

export const RANGE_ORDER: TimeRange[] = ["48h", "1y", "26ky"];

export function dateAt(anchor: Date, offset: number, range: TimeRange): Date {
  if (RANGES[range].unit === "years") {
    const d = new Date(anchor);
    d.setUTCFullYear(anchor.getUTCFullYear() + Math.round(offset));
    return d;
  }
  return new Date(anchor.getTime() + offset);
}

export function clampOffset(offset: number, range: TimeRange): number {
  const { half } = RANGES[range];
  return Math.max(-half, Math.min(half, offset));
}

/** Signed offset split into display units: years, or days/hours/minutes. */
export function offsetParts(
  offset: number,
  range: TimeRange,
): { sign: "+" | "−"; years?: number; days?: number; hours?: number; minutes?: number } {
  const sign = offset < 0 ? "−" : "+";
  const a = Math.abs(offset);
  if (RANGES[range].unit === "years") return { sign, years: Math.round(a) };
  return {
    sign,
    days: Math.floor(a / DAY),
    hours: Math.floor((a % DAY) / HOUR),
    minutes: Math.floor((a % HOUR) / MINUTE),
  };
}
