/**
 * Touch and mouse gestures of the 3D views (#107): the constellation in 3D and the Earth view.
 * Pure maths and small state machines, no DOM, no WebGL: unit-tested in gestures.test.ts.
 *
 * Conventions: screen coordinates in CSS px, y down; angles on screen in radians, positive
 * clockwise (atan2 in y-down coordinates). Nothing here allocates once constructed, so the
 * pointer handlers stay allocation-free (60 fps on a mid-range Android).
 *
 * Gestures (the convention of 3D and map apps):
 * - one finger: orbit round the target point, with inertia;
 * - two fingers: drag = pan the target parallel to the screen, pinch = zoom towards the point
 *   between the fingers, twist = roll round the line of sight (where the view allows it). Each
 *   component starts only past its own threshold, so a pinch does not pan nor twist by accident;
 * - double tap: recentre on what is under the finger, or reset the view;
 * - mouse: drag = orbit, right button or Shift + drag = pan, wheel = zoom towards the cursor.
 */

export interface Point2 {
  x: number;
  y: number;
}

/** Thresholds and time constants of the gestures. */
export const GESTURE = {
  /** A tap moves less than this in total, CSS px. */
  tapSlop: 8,
  /** Two taps closer than this in time (ms) and space (CSS px) make a double tap. */
  doubleTapMs: 300,
  doubleTapPx: 32,
  /** Two fingers: centroid travel before the pan starts, CSS px. */
  panSlop: 10,
  /** Two fingers: relative change of their spread before the pinch starts (|ln s/s0|). */
  pinchSlop: 0.06,
  /** Two fingers: rotation before the twist starts, radians (12°). */
  twistSlop: (12 * Math.PI) / 180,
  /**
   * After a two-finger gesture, the finger left on the screen must move this far (CSS px)
   * before it orbits: lifting one finger of a pinch does not swing the view.
   */
  resumeSlop: 14,
  /** Inertia: velocity time constant, ms (≈ a per-frame friction of 0.93 at 60 fps). */
  inertiaTauMs: 240,
  /** A release later than this after the last move (ms) does not fling (finger held still). */
  flingIdleMs: 70,
  /** Velocity smoothing time constant, ms (exponential moving average of the drag speed). */
  velocitySmoothMs: 40,
} as const;

// --- two-finger geometry

/** Midpoint of two fingers; `out` is filled and returned. */
export function centroid(a: Point2, b: Point2, out: Point2): Point2 {
  out.x = (a.x + b.x) / 2;
  out.y = (a.y + b.y) / 2;
  return out;
}

/** Distance between two fingers, CSS px. */
export function spread(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Angle of the segment a → b on screen, radians, positive clockwise (y down). */
export function angle(a: Point2, b: Point2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Angle wrapped to (−π, π]. */
export function wrapAngle(rad: number): number {
  const r = rad % (2 * Math.PI);
  if (r > Math.PI) return r - 2 * Math.PI;
  if (r <= -Math.PI) return r + 2 * Math.PI;
  return r;
}

/** Angle in degrees wrapped to (−180, 180]. */
export function wrapDegrees(deg: number): number {
  return (wrapAngle((deg * Math.PI) / 180) * 180) / Math.PI;
}

/** Increments of a two-finger gesture since the previous sample. */
export interface TwoFingerDelta {
  /** Centroid motion, CSS px (0 until the pan starts). */
  dx: number;
  dy: number;
  /** Spread ratio new/old (1 until the pinch starts): > 1 when the fingers part. */
  scale: number;
  /** Clockwise rotation, radians (0 until the twist starts, or when twist is off). */
  rotation: number;
  /** Current centroid, CSS px: the anchor of the zoom. */
  cx: number;
  cy: number;
}

/**
 * Recognises the components of a two-finger gesture. Each one (pan, pinch, twist) starts once
 * its own threshold is passed since the fingers came down, then stays on until they lift; only
 * the motion after its start is applied, so nothing jumps when it engages.
 */
export class TwoFingerGesture {
  pan = false;
  pinch = false;
  twist = false;
  private readonly c0: Point2 = { x: 0, y: 0 };
  private readonly c: Point2 = { x: 0, y: 0 };
  private readonly prev: Point2 = { x: 0, y: 0 };
  private s0 = 1;
  private prevSpread = 1;
  private a0 = 0;
  private prevAngle = 0;

  /** `twistEnabled`: false where the view keeps a fixed up (the Earth view: north up). */
  constructor(private readonly twistEnabled = true) {}

  /** The second finger is down (or the pair changed): new reference, nothing engaged. */
  start(a: Point2, b: Point2): void {
    centroid(a, b, this.c0);
    this.prev.x = this.c0.x;
    this.prev.y = this.c0.y;
    this.s0 = this.prevSpread = Math.max(1, spread(a, b));
    this.a0 = this.prevAngle = angle(a, b);
    this.pan = this.pinch = this.twist = false;
  }

  /** One of the fingers moved: fills `out` with the increments to apply, returns it. */
  move(a: Point2, b: Point2, out: TwoFingerDelta): TwoFingerDelta {
    const c = centroid(a, b, this.c);
    const s = Math.max(1, spread(a, b));
    const ang = angle(a, b);
    if (!this.pan && Math.hypot(c.x - this.c0.x, c.y - this.c0.y) > GESTURE.panSlop)
      this.pan = true;
    if (!this.pinch && Math.abs(Math.log(s / this.s0)) > GESTURE.pinchSlop) this.pinch = true;
    // The angle of fingers almost touching is noise.
    if (
      this.twistEnabled &&
      !this.twist &&
      s > 2 * GESTURE.panSlop &&
      Math.abs(wrapAngle(ang - this.a0)) > GESTURE.twistSlop
    )
      this.twist = true;
    out.dx = this.pan ? c.x - this.prev.x : 0;
    out.dy = this.pan ? c.y - this.prev.y : 0;
    out.scale = this.pinch ? s / this.prevSpread : 1;
    out.rotation = this.twist ? wrapAngle(ang - this.prevAngle) : 0;
    out.cx = c.x;
    out.cy = c.y;
    this.prev.x = c.x;
    this.prev.y = c.y;
    this.prevSpread = s;
    this.prevAngle = ang;
    return out;
  }

  /** Some component engaged: the gesture was not a tap. */
  get engaged(): boolean {
    return this.pan || this.pinch || this.twist;
  }
}

/** A new TwoFingerDelta (to be reused across events). */
export const twoFingerDelta = (): TwoFingerDelta => ({
  dx: 0,
  dy: 0,
  scale: 1,
  rotation: 0,
  cx: 0,
  cy: 0,
});

// --- pointers

/** A tracked pointer: id and last position, CSS px relative to the canvas. */
export interface TrackedPointer extends Point2 {
  id: number;
}

/**
 * The (at most two) pointers of a gesture, in preallocated slots: extra fingers are ignored.
 * Order is stable: the first finger down is `a` while it stays.
 */
export class PointerPair {
  readonly a: TrackedPointer = { id: -1, x: 0, y: 0 };
  readonly b: TrackedPointer = { id: -1, x: 0, y: 0 };
  size = 0;

  /** Adds a pointer; false when two are already tracked (ignored). */
  add(id: number, x: number, y: number): boolean {
    if (this.size >= 2 || this.get(id)) return false;
    const p = this.size === 0 ? this.a : this.b;
    p.id = id;
    p.x = x;
    p.y = y;
    this.size++;
    return true;
  }

  get(id: number): TrackedPointer | null {
    if (this.size > 0 && this.a.id === id) return this.a;
    if (this.size > 1 && this.b.id === id) return this.b;
    return null;
  }

  /** Removes a pointer; the remaining one becomes `a`. False when it was not tracked. */
  remove(id: number): boolean {
    if (this.size > 1 && this.b.id === id) {
      this.size = 1;
      return true;
    }
    if (this.size > 0 && this.a.id === id) {
      if (this.size > 1) {
        this.a.id = this.b.id;
        this.a.x = this.b.x;
        this.a.y = this.b.y;
      }
      this.size--;
      return true;
    }
    return false;
  }

  clear(): void {
    this.size = 0;
  }
}

// --- inertia

/** Factor applied to a velocity after `dtMs` of free motion (exponential decay). */
export function decay(dtMs: number, tauMs: number = GESTURE.inertiaTauMs): number {
  return Math.exp(-Math.max(0, dtMs) / tauMs);
}

/**
 * Velocity of a drag (units per ms) from its increments, smoothed, for the fling at release.
 * Two axes, whatever their unit (degrees of an orbit, world units of a pan).
 */
export class Velocity {
  x = 0;
  y = 0;
  private last = -Infinity;

  reset(): void {
    this.x = this.y = 0;
    this.last = -Infinity;
  }

  /** Increment (dx, dy) observed at time `now` (ms). */
  sample(dx: number, dy: number, now: number): void {
    const dt = now - this.last;
    this.last = now;
    // First sample, or after a pause: no meaningful speed yet.
    if (!(dt > 0) || dt > 100) {
      this.x = this.y = 0;
      return;
    }
    const k = 1 - Math.exp(-dt / GESTURE.velocitySmoothMs);
    this.x += (dx / dt - this.x) * k;
    this.y += (dy / dt - this.y) * k;
  }

  /** At release (time `now`): keeps the velocity for a fling, or zeroes it if held still. */
  release(now: number): void {
    if (now - this.last > GESTURE.flingIdleMs) this.x = this.y = 0;
  }

  /** Advances the free motion by `dtMs`: fills `out` with the increment, then decays. */
  step(dtMs: number, out: Point2): Point2 {
    out.x = this.x * dtMs;
    out.y = this.y * dtMs;
    const f = decay(dtMs);
    this.x *= f;
    this.y *= f;
    return out;
  }

  /** Still moving noticeably (per ms, in the unit of the samples). */
  active(epsilon: number): boolean {
    return Math.abs(this.x) > epsilon || Math.abs(this.y) > epsilon;
  }
}

// --- taps

/** Recognises double taps from successive taps (time in ms, position in CSS px). */
export class DoubleTap {
  private time = -Infinity;
  private x = 0;
  private y = 0;

  /** A tap ended at (x, y): true when it completes a double tap (which then starts over). */
  tap(x: number, y: number, now: number): boolean {
    const double =
      now - this.time <= GESTURE.doubleTapMs &&
      Math.hypot(x - this.x, y - this.y) <= GESTURE.doubleTapPx;
    this.time = double ? -Infinity : now;
    this.x = x;
    this.y = y;
    return double;
  }

  reset(): void {
    this.time = -Infinity;
  }
}

// --- camera transforms

/**
 * World units per CSS px in the plane of the target, for a perspective camera at `distance`
 * from it: focal = 1 / tan(vertical fov / 2), `heightPx` = viewport height. Dragging by this
 * many px moves the target plane exactly under the fingers.
 */
export function panScale(distance: number, focal: number, heightPx: number): number {
  return (2 * distance) / (focal * Math.max(1, heightPx));
}

/**
 * Shift of the target (camera right, camera up; world units) that keeps the point under the
 * zoom's anchor fixed on screen when the distance is multiplied by `factor`. The anchor is in
 * normalised device coordinates (x right, y up, ±1 at the edges) relative to the image centre.
 * Zooming in (factor < 1) moves the target towards the anchor.
 */
export function zoomAnchorShift(
  ndcX: number,
  ndcY: number,
  aspect: number,
  distance: number,
  focal: number,
  factor: number,
  out: Point2,
): Point2 {
  const k = (distance / focal) * (1 - factor);
  out.x = ndcX * aspect * k;
  out.y = ndcY * k;
  return out;
}

/** Normalised device coordinates (x right, y up) of a CSS px position in a w × h viewport. */
export function toNdc(x: number, y: number, w: number, h: number, out: Point2): Point2 {
  out.x = (2 * x) / Math.max(1, w) - 1;
  out.y = 1 - (2 * y) / Math.max(1, h);
  return out;
}

/** Scales the vector `v` (in place) down to length `max` if longer; returns it. */
export function clampLength<V extends number[]>(v: V, max: number): V {
  let n = 0;
  for (const c of v) n += c * c;
  n = Math.sqrt(n);
  if (n > max && n > 0) {
    const k = max / n;
    for (let i = 0; i < v.length; i++) v[i] = v[i]! * k;
  }
  return v;
}

/**
 * Rotates a screen vector (CSS px, y down) by `rad` clockwise; `out` is filled and returned.
 * Turns a drag into the frame of a rolled camera (rotate by −roll).
 */
export function rotateScreen(dx: number, dy: number, rad: number, out: Point2): Point2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  out.x = c * dx - s * dy;
  out.y = s * dx + c * dy;
  return out;
}

/**
 * Largest pan of the Earth view's target (Earth radii) that keeps the centre of the body
 * orbited (the Earth, or the Moon or a planet in the body-centred frame, #123) well inside the
 * screen: `margin` of the shorter half-extent, at camera distance `distance` from the target,
 * vertical field of view `fovDeg` and aspect w/h. The body's radius enters through `distance`,
 * whose limits scale with it.
 */
export function panLimit(distance: number, fovDeg: number, aspect: number, margin = 0.6) {
  const half = Math.tan((fovDeg * Math.PI) / 360);
  return margin * distance * half * Math.min(1, aspect);
}

/**
 * Ray from the camera through a screen point, hitting a sphere of radius `r` at the origin:
 * distance along the (unit) ray to the first hit, or −1 when it misses or is behind.
 */
export function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  r = 1,
): number {
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}

/** Smooth ease-out for camera tweens (cubic). */
export const easeOut = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return 1 - (1 - t) ** 3;
};
