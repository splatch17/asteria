/**
 * Sensor pointing (#59): which orientation source to use, and why it failed.
 *
 * Sources, best first:
 *  - absolute: north-referenced heading — `deviceorientationabsolute` (Chromium), a
 *    `deviceorientation` event flagged `absolute`, iOS `webkitCompassHeading`, or the Generic
 *    Sensor API `AbsoluteOrientationSensor` (fusion accelerometer + gyroscope + magnetometer).
 *  - relative: `deviceorientation` without a compass. Altitude and roll come from gravity and
 *    are right; the heading has an arbitrary origin and is set by hand (drag).
 *  - tilt: only beta / gamma (no gyroscope): same as relative, the heading does not follow.
 *
 * Known failure causes (see docs/adr/0003-visee-capteurs-web.md):
 *  - insecure: not a secure context (http://, or an IP over http): no event at all.
 *  - denied: the site's "motion sensors" permission is blocked (Permissions API, iOS prompt
 *    refused, or the Generic Sensor reports NotAllowedError).
 *  - blocked: events arrive with null angles. Brave Android does exactly this by default
 *    (one empty event, then nothing) until Site settings → Motion sensors is allowed.
 *  - silent: no event at all (no sensor, or a browser that drops them).
 *  - unsupported: neither DeviceOrientationEvent nor the Generic Sensor API exists.
 */

export type PointingMode = "absolute" | "relative";
export type PointingFailure = "insecure" | "unsupported" | "denied" | "blocked" | "silent";
export type ReadingKind = "absolute" | "relative" | "tilt" | "empty";
export type SensorPermission = "accelerometer" | "gyroscope" | "magnetometer";

export interface SensorEnvironment {
  secure: boolean;
  /** `DeviceOrientationEvent` exists. */
  orientationEvents: boolean;
  /** `AbsoluteOrientationSensor` exists (Generic Sensor API). */
  absoluteSensor: boolean;
}

/** Failure known before listening to anything, or null. */
export function preflight(env: SensorEnvironment): PointingFailure | null {
  if (!env.secure) return "insecure";
  if (!env.orientationEvents && !env.absoluteSensor) return "unsupported";
  return null;
}

export type PermissionVerdict = "ok" | "denied" | "noCompass";

/** Permissions API states → can we expect orientation data, and a compass? */
export function permissionVerdict(
  states: Partial<Record<SensorPermission, PermissionState>>,
): PermissionVerdict {
  if (states.accelerometer === "denied" || states.gyroscope === "denied") return "denied";
  if (states.magnetometer === "denied") return "noCompass";
  return "ok";
}

/** Permissions API: a blocked "motion sensors" site setting shows up as "denied". */
export async function querySensorPermissions(): Promise<PermissionVerdict> {
  if (!("permissions" in navigator)) return "ok";
  const states: Partial<Record<SensorPermission, PermissionState>> = {};
  const names: SensorPermission[] = ["accelerometer", "gyroscope", "magnetometer"];
  await Promise.all(
    names.map(async (name) => {
      try {
        // Sensor names are valid in Chromium but missing from lib.dom's PermissionName.
        const status = await navigator.permissions.query({
          name,
        } as unknown as PermissionDescriptor);
        states[name] = status.state;
      } catch {
        // name unknown to this browser: no information
      }
    }),
  );
  return permissionVerdict(states);
}

export interface OrientationLike {
  type: string;
  absolute: boolean;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  /** iOS Safari: compass heading in degrees clockwise from north (−1 when unknown). */
  webkitCompassHeading?: number;
}

export function classifyOrientationEvent(e: OrientationLike): ReadingKind {
  if (e.beta === null || e.gamma === null) return "empty";
  if (e.alpha === null) return "tilt";
  if (e.type === "deviceorientationabsolute" || e.absolute) return "absolute";
  if (typeof e.webkitCompassHeading === "number" && e.webkitCompassHeading >= 0) return "absolute";
  return "relative";
}

/**
 * Alpha to use for an absolute reading. iOS gives a relative alpha plus
 * `webkitCompassHeading` (clockwise), whereas W3C alpha grows counter-clockwise.
 */
export function absoluteAlpha(e: OrientationLike): number {
  if (
    e.type !== "deviceorientationabsolute" &&
    !e.absolute &&
    typeof e.webkitCompassHeading === "number" &&
    e.webkitCompassHeading >= 0
  )
    return (360 - e.webkitCompassHeading) % 360;
  return e.alpha ?? 0;
}

export type GenericSensorState = "none" | "starting" | "active" | "error";

export interface ProbeState {
  startedAt: number;
  counts: Record<ReadingKind, number>;
  /** Time of the first relative or tilt reading. */
  firstUsableAt: number | null;
  sensor: GenericSensorState;
  /** DOMException name reported by the Generic Sensor (NotAllowedError, NotReadableError…). */
  sensorError: string | null;
  permission: PermissionVerdict;
}

export function newProbe(startedAt: number, sensor: GenericSensorState = "none"): ProbeState {
  return {
    startedAt,
    counts: { absolute: 0, relative: 0, tilt: 0, empty: 0 },
    firstUsableAt: null,
    sensor,
    sensorError: null,
    permission: "ok",
  };
}

export function recordReading(s: ProbeState, kind: ReadingKind, now: number): void {
  s.counts[kind]++;
  if ((kind === "relative" || kind === "tilt") && s.firstUsableAt === null) s.firstUsableAt = now;
}

export const PROBE_TIMING = {
  /** After a relative reading, how long to wait for an absolute one before settling. */
  relativeGrace: 1200,
  /** Only empty events (Brave): give up sooner, once the Generic Sensor has had its say. */
  emptyGiveUp: 2500,
  /** Nothing usable at all. Real sensors answer within ~0.5 s; slow magnetometers ~2 s. */
  timeout: 5000,
};

export type ProbeDecision =
  | { kind: "wait" }
  | { kind: "start"; mode: PointingMode }
  | { kind: "fail"; reason: PointingFailure };

/** What to do now, given what the probe has seen so far. */
export function decide(s: ProbeState, now: number, t = PROBE_TIMING): ProbeDecision {
  if (s.counts.absolute > 0) return { kind: "start", mode: "absolute" };
  const elapsed = now - s.startedAt;
  const usable = s.counts.relative + s.counts.tilt > 0;
  if (usable) {
    // A blocked magnetometer will never give a heading: no point waiting.
    if (s.permission === "noCompass" || now - s.firstUsableAt! >= t.relativeGrace)
      return { kind: "start", mode: "relative" };
    return { kind: "wait" };
  }
  if (s.permission === "denied") return { kind: "fail", reason: "denied" };
  if (s.sensor === "starting") {
    if (elapsed >= t.timeout) return { kind: "fail", reason: failureReason(s) };
    return { kind: "wait" };
  }
  if (s.counts.empty > 0 && elapsed >= t.emptyGiveUp)
    return { kind: "fail", reason: failureReason(s) };
  if (elapsed >= t.timeout) return { kind: "fail", reason: failureReason(s) };
  return { kind: "wait" };
}

/** Most likely cause once nothing usable came in. */
export function failureReason(s: ProbeState): PointingFailure {
  if (s.permission === "denied") return "denied";
  if (s.sensorError === "NotAllowedError" || s.sensorError === "SecurityError") return "denied";
  // The Generic Sensor found no hardware (desktop): empty events then mean "no sensor".
  if (s.sensorError === "NotReadableError") return "silent";
  if (s.counts.empty > 0) return "blocked";
  return "silent";
}

/** i18n key of the message for a failure (Brave gets its own instructions). */
export function failureMessageKey(reason: PointingFailure, brave: boolean): string {
  if (brave && (reason === "denied" || reason === "blocked" || reason === "silent"))
    return "pointing.error.brave";
  return `pointing.error.${reason}`;
}

/** Wraps an azimuth into [0, 360). */
export const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;
