/**
 * Single-menu interface (#130): what stays on screen at rest, and what a tap on the sky does.
 * Kept free of the DOM so that it can be tested.
 */
import { preflight, type SensorEnvironment } from "./sensors";

/**
 * Sensor pointing gets a direct button on the time line only where it can work in the field:
 * a touch screen, a secure context and an orientation source. Elsewhere it stays in the menu
 * (where a tap still explains why it cannot start).
 */
export function pointingShortcut(env: SensorEnvironment & { coarse: boolean }): boolean {
  return env.coarse && preflight(env) === null;
}

/** State of the interface when a tap on the sky ends. */
export interface SkyTapContext {
  /** Something was hit (star, planet, constellation…): the tap selects it. */
  hit: boolean;
  /** An object is selected: an empty tap only closes its sheet. */
  selected: boolean;
  /** A menu, panel or the expanded time controls were open when the finger went down. */
  overlay: boolean;
  /** The interface is hidden (immersive mode). */
  immersive: boolean;
}

/**
 * Immersive mode after a tap on the map or the Earth view. Only an empty tap, with nothing
 * selected or open, hides the interface: a tap on an object keeps selecting it, an empty tap
 * first closes what is open. Any tap brings a hidden interface back (an object tap still
 * selects), so that it can never get lost where stars are dense and empty taps rare.
 */
export function immersiveAfterTap(c: SkyTapContext): boolean {
  if (c.immersive) return false;
  return !c.hit && !c.selected && !c.overlay;
}

/**
 * Compass of the sky map (#138): heading of the view's centre, whole degrees in [0, 360), from
 * the map's azimuth (degrees from north through east, any turn count).
 */
export function compassHeading(azimuth: number): number {
  if (!Number.isFinite(azimuth)) return 0;
  const h = Math.round(((azimuth % 360) + 360) % 360);
  return h === 360 ? 0 : h;
}

/** Eight-point direction of a heading: 0 north, 1 north-east… 7 north-west (i18n `compass.dir.N`). */
export function compassPoint(heading: number): number {
  return Math.round((((heading % 360) + 360) % 360) / 45) % 8;
}

/**
 * Rotation of the needle, degrees clockwise on screen: north is up when the view faces north,
 * and the needle turns against the view's heading and roll (a rolled view turns the sky).
 */
export function needleRotation(azimuth: number, roll = 0): number {
  return -azimuth - roll;
}
