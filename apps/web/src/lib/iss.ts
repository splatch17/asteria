/**
 * The ISS on the map (#12): where its orbital elements come from, how fresh they must be, and
 * the small pieces of logic the panel and the map share (pure, tested).
 *
 * Elements: CelesTrak's GP data for NORAD 25544, as an OMM record in JSON (the format CelesTrak
 * recommends over the TLE), downloaded by the user's own browser straight from CelesTrak and kept
 * on the device only. Asteria does not ship, serve or redistribute them (no licence is published
 * for them: docs/DATA_SOURCES.md). Freshness strategy:
 * 1. the copy kept on the device (localStorage) is used at once, whatever the network;
 * 2. online, it is refreshed from CelesTrak when more than REFRESH_HOURS old, with at most one
 *    request per device every RETRY_HOURS, failures included (CelesTrak's usage policy asks
 *    clients not to download the same data again before it is updated);
 * 3. without any copy (first use offline, CORS or network failure) the ISS is not shown and its
 *    sheet says the orbit is unavailable;
 * 4. the age that counts is between the elements' epoch and the displayed date: up to FRESH_DAYS
 *    the ISS is shown as computed, up to MAX_AGE_DAYS with a warning (times off by up to a few
 *    minutes), beyond that it is not shown at all (SGP4 errors grow quickly; reboosts).
 */
import type { OmmRecord } from "@asteria/astro-core/satellites";

export const ISS_NORAD_ID = 25544;
/** Id of the ISS in the map's satellites and selections. */
export const ISS_ID = String(ISS_NORAD_ID);
export const CELESTRAK_ISS_URL =
  "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON";
export const ISS_CACHE_KEY = "asteria.iss.elements";

export const REFRESH_HOURS = 6;
export const RETRY_HOURS = 2;
export const FRESH_DAYS = 3;
export const MAX_AGE_DAYS = 7;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Elements kept on the device, as downloaded from CelesTrak. */
export interface StoredElements {
  omm: OmmRecord;
  /** When they were downloaded (Unix ms). */
  fetchedAt: number;
  source: "celestrak";
}

export type Freshness = "fresh" | "aging" | "stale";

/** How usable elements of epoch `epochMs` are at the displayed date (either side of the epoch). */
export function freshness(epochMs: number, dateMs: number): Freshness {
  const days = Math.abs(dateMs - epochMs) / MS_PER_DAY;
  return days <= FRESH_DAYS ? "fresh" : days <= MAX_AGE_DAYS ? "aging" : "stale";
}

const NUMERIC_KEYS = [
  "MEAN_MOTION",
  "ECCENTRICITY",
  "INCLINATION",
  "RA_OF_ASC_NODE",
  "ARG_OF_PERICENTER",
  "MEAN_ANOMALY",
  "BSTAR",
] as const;

/** A record with the fields SGP4 needs, finite (CelesTrak sends numbers; strings are accepted). */
export function isOmmRecord(v: unknown): v is OmmRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.EPOCH !== "string" || Number.isNaN(Date.parse(`${r.EPOCH.replace(/Z$/, "")}Z`)))
    return false;
  if (Number(r.NORAD_CAT_ID) <= 0) return false;
  return NUMERIC_KEYS.every((k) => r[k] !== "" && r[k] !== null && Number.isFinite(Number(r[k])));
}

/** The ISS's record in a CelesTrak GP answer (an array of OMM records), or null. */
export function pickIss(json: unknown): OmmRecord | null {
  const list = Array.isArray(json) ? json : [json];
  for (const r of list)
    if (isOmmRecord(r) && Number(r.NORAD_CAT_ID) === ISS_NORAD_ID) return r as OmmRecord;
  return null;
}

export function isStoredElements(v: unknown): v is StoredElements {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    isOmmRecord(s.omm) &&
    typeof s.fetchedAt === "number" &&
    Number.isFinite(s.fetchedAt) &&
    s.source === "celestrak"
  );
}

/** Epoch of a record (Unix ms): CelesTrak writes it in UTC without the "Z". */
export function ommEpoch(omm: OmmRecord): number {
  return Date.parse(`${omm.EPOCH.replace(/Z$/, "")}Z`);
}

/** The more recent of two copies (by epoch of the elements). */
export function newer(a: StoredElements | null, b: StoredElements | null): StoredElements | null {
  if (!a) return b;
  if (!b) return a;
  return ommEpoch(b.omm) > ommEpoch(a.omm) ? b : a;
}

/**
 * Whether to ask CelesTrak now: online, the copy older than REFRESH_HOURS (or none), and no
 * attempt in the last RETRY_HOURS.
 */
export function refreshDue(
  copy: StoredElements | null,
  lastAttempt: number | null,
  now: number,
  online: boolean,
): boolean {
  if (!online) return false;
  if (lastAttempt !== null && now - lastAttempt < RETRY_HOURS * MS_PER_HOUR) return false;
  return !copy || now - copy.fetchedAt > REFRESH_HOURS * MS_PER_HOUR;
}

/** Index 0…7 of the compass point (N, NE, E… NW) nearest to an azimuth (degrees from North). */
export function compassPoint(azimuth: number): number {
  return Math.round((((azimuth % 360) + 360) % 360) / 45) % 8;
}

/** A pass, as the panel and the map need it (dates as Unix ms). */
export interface PassTimes {
  rise: number;
  set: number;
  visible: { start: number; end: number } | null;
}

/**
 * The pass to show at `now`: the one under way, else the next visible one, else the next one.
 * Index into `passes` (in time order), −1 when none is left.
 */
export function passToShow(passes: readonly PassTimes[], now: number): number {
  const current = passes.findIndex((p) => p.rise <= now && now <= p.set);
  if (current >= 0) return current;
  const visible = passes.findIndex((p) => p.rise > now && p.visible);
  if (visible >= 0) return visible;
  return passes.findIndex((p) => p.rise > now);
}

/**
 * Instants (ms) along a pass to draw its track: every `stepS` seconds from rise to set, both
 * ends included, plus the visible part's ends (so the dense dots start and stop where they
 * should). Sorted, without duplicates.
 */
export function trackInstants(pass: PassTimes, stepS = 10): number[] {
  const out = new Set<number>();
  for (let t = pass.rise; t < pass.set; t += stepS * 1000) out.add(t);
  out.add(pass.set);
  if (pass.visible) {
    out.add(pass.visible.start);
    out.add(pass.visible.end);
  }
  return [...out].sort((a, b) => a - b);
}

/** Whole minutes (ms) strictly inside [from, to]: the time ticks along a track. */
export function minuteTicks(from: number, to: number, everyMinutes = 1): number[] {
  const step = everyMinutes * 60_000;
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) if (t > from) ticks.push(t);
  return ticks;
}

export type DayPart = "night" | "morning" | "afternoon" | "evening";

/**
 * When a pass happens, in the words of the Découverte sentence (local time of the device):
 * « ce soir », « demain matin », « cette nuit », « jeudi soir »… Hours 0–5 are the night; a night
 * pass after midnight, seen from the evening before, is still « cette nuit ».
 */
export function passWhen(
  passMs: number,
  nowMs: number,
): { day: "today" | "tomorrow" | "later"; part: DayPart } {
  const pass = new Date(passMs);
  const h = pass.getHours();
  const part: DayPart = h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(pass) - midnight(new Date(nowMs))) / MS_PER_DAY);
  if (days <= 0) return { day: "today", part };
  if (days === 1) return { day: part === "night" ? "today" : "tomorrow", part };
  return { day: "later", part };
}

/**
 * The window of passes to compute around `now` and when to compute it again: [now − 15 min,
 * now + PASS_DAYS], valid while `now` stays within its first PASS_DAYS − 1 days.
 */
export const PASS_DAYS = 3;
export function passWindow(now: number): { start: number; end: number; validUntil: number } {
  const start = now - 15 * 60_000;
  return {
    start,
    end: now + PASS_DAYS * MS_PER_DAY,
    validUntil: now + (PASS_DAYS - 1) * MS_PER_DAY,
  };
}
