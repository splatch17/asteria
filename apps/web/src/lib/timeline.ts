/**
 * Time scrubber model. Offsets are in milliseconds, except for the precession range
 * where they are whole years (stepping by calendar years keeps the same date and time of
 * day, so only the slow precession of the sky remains visible).
 *
 * On the one-year range, whole days are calendar days at the same civil (wall-clock) time,
 * and the day-per-second speeds play by whole days: the sky is shown every evening at the
 * same hour, so only the seasonal drift of the constellations remains (#74). Playing by
 * 24 h steps of continuous time would strobe: 1 s = 1 d moved 24 min (~6°) per frame.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type TimeRange = "48h" | "1y" | "26ky";

export interface RangeSpec {
  /** Half-width of the slider, in offset units. */
  half: number;
  step: number;
  /**
   * Playback speeds, in offset units per second of real time. With `quantum`, playback moves
   * by whole multiples of it (the remainder is carried to the next frame).
   */
  speeds: { value: number; key: string; quantum?: number }[];
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
      { value: DAY, key: "time.speed.1d", quantum: DAY },
      { value: 10 * DAY, key: "time.speed.10d", quantum: DAY },
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
  if (range === "1y") {
    // Whole days as calendar days (same wall-clock time across daylight saving changes),
    // then the rest of the offset as elapsed time.
    const days = Math.trunc(offset / DAY);
    const d = new Date(anchor);
    d.setDate(d.getDate() + days);
    return new Date(d.getTime() + (offset - days * DAY));
  }
  return new Date(anchor.getTime() + offset);
}

/** Where playback starts over once it reached the end: the start of the range, in whole days. */
export function restartOffset(range: TimeRange): number {
  const { half, unit } = RANGES[range];
  return unit === "ms" ? -Math.floor(half / DAY) * DAY : -half;
}

/**
 * One playback frame: adds `speed × dt` to the offset, by whole quanta when the speed has one
 * (the rest is carried). `done` when the next step would leave the range.
 */
export function advance(
  offset: number,
  carry: number,
  dt: number,
  range: TimeRange,
  speedIndex: number,
): { offset: number; carry: number; done: boolean } {
  const { half, speeds } = RANGES[range];
  const speed = speeds[speedIndex] ?? speeds[0]!;
  let delta = carry + speed.value * dt;
  let rest = 0;
  if (speed.quantum) {
    const steps = Math.floor(delta / speed.quantum);
    rest = delta - steps * speed.quantum;
    delta = steps * speed.quantum;
  }
  const next = offset + delta;
  if (next > half) return { offset: speed.quantum ? offset : half, carry: 0, done: true };
  return { offset: next, carry: rest, done: next >= half };
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
