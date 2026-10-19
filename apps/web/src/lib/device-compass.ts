import { devicePointing } from "./orientation";
import { absoluteAlpha, classifyOrientationEvent, wrap360, type OrientationLike } from "./sensors";

/**
 * Real compass (#144): the heading the phone faces, from its absolute orientation (magnetometer).
 * Held flat, the top of the screen gives it; held up, the back camera: the horizontal parts of
 * both are summed, so the heading moves smoothly between the two. Degrees from magnetic north
 * through east; null when the phone is level on its edge (no direction).
 */
export function phoneHeading(
  alpha: number,
  beta: number,
  gamma: number,
  screenAngle = 0,
): number | null {
  const { forward, up } = devicePointing(alpha, beta, gamma, screenAngle);
  const e = forward[0] + up[0];
  const n = forward[1] + up[1];
  if (Math.hypot(e, n) < 1e-3) return null;
  return wrap360((Math.atan2(e, n) * 180) / Math.PI);
}

/** Exponential smoothing of a heading on the circle (no jump through 360 → 0). */
export function smoothHeading(prev: number | null, next: number, k: number): number {
  if (prev === null) return next;
  const d = ((next - prev + 540) % 360) - 180;
  return wrap360(prev + d * k);
}

/**
 * Listens to the absolute orientation events (Chromium `deviceorientationabsolute`, or a
 * `deviceorientation` that is absolute / carries iOS `webkitCompassHeading`) and reports the
 * phone's true heading: magnetic heading + declination (east positive). Returns a stop function.
 * No permission prompt on Android; on iOS, see `allowCompass`. Nothing is reported where no
 * compass exists.
 */
export function watchCompass(
  declination: () => number,
  onheading: (trueHeading: number) => void,
): () => void {
  let smoothed: number | null = null;
  const handler = (ev: Event) => {
    const e = ev as unknown as OrientationLike;
    if (classifyOrientationEvent(e) !== "absolute") return;
    const h = phoneHeading(absoluteAlpha(e), e.beta!, e.gamma!, screen.orientation?.angle ?? 0);
    if (h === null) return;
    smoothed = smoothHeading(smoothed, h, 0.2);
    onheading(wrap360(smoothed + declination()));
  };
  const absolute = "ondeviceorientationabsolute" in window;
  const type = absolute ? "deviceorientationabsolute" : "deviceorientation";
  window.addEventListener(type, handler);
  return () => window.removeEventListener(type, handler);
}

/**
 * iOS sends no orientation event until the user allows it (#160), and only asks during a gesture:
 * called on a tap of the compass. Once allowed, the listeners of `watchCompass` start receiving.
 */
export function allowCompass(): void {
  const event = globalThis.DeviceOrientationEvent as unknown as
    { requestPermission?: () => Promise<string> } | undefined;
  event?.requestPermission?.().catch(() => {});
}
