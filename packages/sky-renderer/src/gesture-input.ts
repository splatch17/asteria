/**
 * Pointer input of the 3D views (#107): turns pointer and wheel events into camera intents
 * (orbit, pan, zoom, roll, tap, double tap) and runs the inertia of the orbit. Shared by the
 * constellation 3D view and the Earth view so that both feel the same; the views only map the
 * intents (in CSS px) onto their own camera. The recognition itself is in gestures.ts.
 *
 * Allocation-free per event: preallocated pointer slots, deltas and velocity.
 */
import {
  DoubleTap,
  GESTURE,
  PointerPair,
  TwoFingerGesture,
  Velocity,
  twoFingerDelta,
  type Point2,
} from "./gestures";

export interface GestureHandlers {
  /** The camera may be moved now (false during a transition or a flight). */
  enabled(): boolean;
  /** A gesture starts: stop tweens (the inertia is stopped by the input itself). */
  grab(): void;
  /** Orbit by a screen drag (CSS px, y down): the scene follows the finger. */
  orbit(dx: number, dy: number): void;
  /** Pan by a screen drag (CSS px, y down): the scene follows the fingers. */
  pan(dx: number, dy: number): void;
  /** Multiply the camera distance by `factor` (< 1: closer), anchored at (x, y) CSS px. */
  zoom(factor: number, x: number, y: number): void;
  /** Roll by a clockwise screen rotation of the fingers, radians. Absent: no twist. */
  roll?: (rad: number) => void;
  /** Single tap at (x, y), CSS px. */
  tap(x: number, y: number): void;
  /** Second tap of a double tap at (x, y), CSS px (after its own tap()). */
  doubleTap(x: number, y: number): void;
  /** Something changed that needs a frame (inertia started, gesture ended). */
  changed(): void;
}

/** Wheel: distance factor per pixel of deltaY. */
const WHEEL_ZOOM = 0.0012;
/** Inertia stops below this speed, CSS px per ms. */
const MIN_SPEED = 0.01;

export class GestureInput {
  private readonly pointers = new PointerPair();
  private readonly two: TwoFingerGesture;
  private readonly delta = twoFingerDelta();
  private readonly velocity = new Velocity();
  private readonly step2: Point2 = { x: 0, y: 0 };
  private readonly doubleTap = new DoubleTap();
  private left = 0;
  private top = 0;
  /** Total travel of the gesture's pointers, CSS px (tap detection). */
  private moved = 0;
  /** The gesture had two fingers at some point: never a tap, no fling. */
  private multi = false;
  /** Travel of the finger left after a two-finger gesture, before it may orbit. */
  private resume = 0;
  /** Mouse drag with the right button or Shift: pans. */
  private mousePan = false;
  private fling: "none" | "orbit" | "pan" = "none";

  constructor(
    private readonly canvas: HTMLElement,
    private readonly handlers: GestureHandlers,
    signal: AbortSignal,
  ) {
    this.two = new TwoFingerGesture(handlers.roll !== undefined);
    canvas.style.touchAction = "none";
    const opts = { signal };
    canvas.addEventListener("pointerdown", this.down, opts);
    canvas.addEventListener("pointermove", this.move, opts);
    canvas.addEventListener("pointerup", this.up, opts);
    canvas.addEventListener("pointercancel", this.up, opts);
    canvas.addEventListener("wheel", this.wheel, { passive: false, signal });
    // The right button pans: no context menu over the view.
    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), opts);
  }

  /** A finger or button is down. */
  get active(): boolean {
    return this.pointers.size > 0;
  }

  /** Stops the inertia and forgets the pointers (e.g. a flight takes the camera). */
  cancel(): void {
    this.pointers.clear();
    this.velocity.reset();
    this.fling = "none";
  }

  /** Stops the inertia only. */
  stopInertia(): void {
    this.velocity.reset();
    this.fling = "none";
  }

  /**
   * Advances the inertia by `dtMs` (call once per frame): calls orbit() or pan() with the free
   * motion. Returns true while it is still moving.
   */
  step(dtMs: number): boolean {
    if (this.pointers.size || this.fling === "none") return false;
    if (!this.velocity.active(MIN_SPEED)) {
      this.stopInertia();
      return false;
    }
    const d = this.velocity.step(Math.min(dtMs, 50), this.step2);
    if (this.fling === "orbit") this.handlers.orbit(d.x, d.y);
    else this.handlers.pan(d.x, d.y);
    return true;
  }

  private readonly down = (e: PointerEvent): void => {
    if (!this.handlers.enabled()) return;
    if (this.pointers.size === 0) {
      const rect = this.canvas.getBoundingClientRect();
      this.left = rect.left;
      this.top = rect.top;
    }
    if (!this.pointers.add(e.pointerId, e.clientX - this.left, e.clientY - this.top)) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.velocity.reset();
    this.fling = "none";
    if (this.pointers.size === 1) {
      this.moved = 0;
      this.multi = false;
      this.mousePan = e.pointerType === "mouse" && (e.button === 2 || e.shiftKey);
      this.handlers.grab();
    } else {
      this.multi = true;
      this.two.start(this.pointers.a, this.pointers.b);
    }
  };

  private readonly move = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const x = e.clientX - this.left;
    const y = e.clientY - this.top;
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    this.moved += Math.abs(dx) + Math.abs(dy);
    if (!this.handlers.enabled()) return;
    const h = this.handlers;
    if (this.pointers.size === 1) {
      if (this.multi) {
        // The finger left by a pinch: still until it clearly moves on its own.
        this.resume += Math.abs(dx) + Math.abs(dy);
        if (this.resume < GESTURE.resumeSlop) return;
      } else if (this.moved < GESTURE.tapSlop && e.pointerType !== "mouse") return;
      this.velocity.sample(dx, dy, e.timeStamp);
      if (this.mousePan) {
        this.fling = "pan";
        h.pan(dx, dy);
      } else {
        this.fling = "orbit";
        h.orbit(dx, dy);
      }
      return;
    }
    const d = this.two.move(this.pointers.a, this.pointers.b, this.delta);
    if (d.dx !== 0 || d.dy !== 0) h.pan(d.dx, d.dy);
    if (d.scale !== 1) h.zoom(1 / d.scale, d.cx, d.cy);
    if (d.rotation !== 0) h.roll?.(d.rotation);
  };

  private readonly up = (e: PointerEvent): void => {
    if (!this.pointers.remove(e.pointerId)) return;
    if (this.pointers.size === 1) {
      // One finger of two lifted: no jump, no fling; the other one orbits once it moves on.
      this.resume = 0;
      this.velocity.reset();
      this.fling = "none";
      return;
    }
    const x = e.clientX - this.left;
    const y = e.clientY - this.top;
    const tap =
      !this.multi &&
      this.moved < GESTURE.tapSlop &&
      e.type === "pointerup" &&
      this.handlers.enabled();
    if (tap) {
      this.handlers.tap(x, y);
      if (this.doubleTap.tap(x, y, e.timeStamp)) this.handlers.doubleTap(x, y);
    } else this.doubleTap.reset();
    this.velocity.release(e.timeStamp);
    this.handlers.changed();
  };

  private readonly wheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this.handlers.enabled()) return;
    this.stopInertia();
    // Lines or pages (Firefox) count as about 40 px.
    const dy = e.deltaMode === 0 ? e.deltaY : e.deltaY * 40;
    this.handlers.zoom(Math.exp(dy * WHEEL_ZOOM), e.offsetX, e.offsetY);
  };
}
