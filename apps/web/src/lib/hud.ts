/**
 * Single-menu interface (#130): what stays on screen at rest, and what a tap on the sky does.
 * Kept free of the DOM so that it can be tested.
 */
import { preflight, type SensorEnvironment } from "./sensors";

/**
 * Sensor pointing gets a direct button next to the search only where it can work in the field:
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
