import { describe, expect, it } from "vitest";
import { GestureInput, type GestureHandlers } from "./gesture-input";
import { GESTURE } from "./gestures";

type Listener = (e: never) => void;

/** A canvas stand-in: records listeners, at (0, 0). */
function fakeCanvas() {
  const listeners = new Map<string, Listener>();
  const canvas = {
    style: {} as Record<string, string>,
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: () => {},
  };
  const fire = (type: string, e: Record<string, unknown>) =>
    listeners.get(type)!({ preventDefault: () => {}, ...e } as never);
  return { canvas: canvas as unknown as HTMLElement, fire };
}

function setup(withRoll = true) {
  const calls = {
    orbit: [0, 0],
    pan: [0, 0],
    zoom: 1,
    roll: 0,
    taps: 0,
    doubleTaps: 0,
    orbitCalls: 0,
  };
  let enabled = true;
  const handlers: GestureHandlers = {
    enabled: () => enabled,
    grab: () => {},
    orbit: (dx, dy) => {
      calls.orbit[0]! += dx;
      calls.orbit[1]! += dy;
      calls.orbitCalls++;
    },
    pan: (dx, dy) => {
      calls.pan[0]! += dx;
      calls.pan[1]! += dy;
    },
    zoom: (f) => (calls.zoom *= f),
    ...(withRoll && { roll: (r: number) => (calls.roll += r) }),
    tap: () => calls.taps++,
    doubleTap: () => calls.doubleTaps++,
    changed: () => {},
  };
  const { canvas, fire } = fakeCanvas();
  const input = new GestureInput(canvas, handlers, new AbortController().signal);
  let t = 0;
  const ev = (type: string, id: number, x: number, y: number, extra = {}) =>
    fire(type, {
      type,
      pointerId: id,
      clientX: x,
      clientY: y,
      timeStamp: t,
      pointerType: "touch",
      button: 0,
      shiftKey: false,
      ...extra,
    });
  return {
    input,
    calls,
    ev,
    tick: (ms: number) => (t += ms),
    disable: () => (enabled = false),
    canvas,
  };
}

describe("GestureInput", () => {
  it("orbits with one finger, past the tap slop, then glides (inertia)", () => {
    const { input, calls, ev, tick } = setup();
    ev("pointerdown", 1, 100, 100);
    for (let k = 1; k <= 20; k++) {
      tick(16);
      ev("pointermove", 1, 100 + 5 * k, 100);
    }
    // The first moves under the tap slop are not applied.
    expect(calls.orbit[0]).toBeGreaterThan(100 - GESTURE.tapSlop - 5);
    expect(calls.orbit[0]).toBeLessThanOrEqual(100);
    tick(10);
    ev("pointerup", 1, 200, 100);
    expect(calls.taps).toBe(0);
    const dragged = calls.orbit[0]!;
    let frames = 0;
    while (input.step(16)) frames++;
    expect(frames).toBeGreaterThan(10);
    expect(calls.orbit[0]).toBeGreaterThan(dragged + 20); // still turning in the same direction
    expect(input.step(16)).toBe(false);
  });

  it("taps and double taps", () => {
    const { calls, ev, tick } = setup();
    ev("pointerdown", 1, 50, 50);
    ev("pointerup", 1, 51, 50);
    tick(150);
    ev("pointerdown", 2, 55, 52);
    ev("pointerup", 2, 55, 52);
    expect(calls.taps).toBe(2);
    expect(calls.doubleTaps).toBe(1);
    expect(calls.orbitCalls).toBe(0);
  });

  it("pinches without orbiting, and lifting one finger does not swing the view", () => {
    const { input, calls, ev, tick } = setup();
    ev("pointerdown", 1, 100, 300);
    tick(5);
    ev("pointerdown", 2, 200, 300);
    for (let k = 1; k <= 20; k++) {
      tick(16);
      ev("pointermove", 1, 100 - 3 * k, 300);
      ev("pointermove", 2, 200 + 3 * k, 300);
    }
    expect(calls.zoom).toBeLessThan(0.7); // fingers parting: closer
    expect(calls.pan).toEqual([0, 0]);
    expect(calls.orbitCalls).toBe(0);
    // One finger lifts; the other drifts a little as it lifts too.
    ev("pointerup", 1, 40, 300);
    tick(16);
    ev("pointermove", 2, 265, 302);
    tick(16);
    ev("pointermove", 2, 268, 305);
    ev("pointerup", 2, 268, 305);
    expect(calls.orbitCalls).toBe(0);
    expect(calls.taps).toBe(0);
    expect(input.step(16)).toBe(false); // no fling
  });

  it("the finger left after a pinch orbits once it clearly moves on", () => {
    const { calls, ev, tick } = setup();
    ev("pointerdown", 1, 100, 300);
    ev("pointerdown", 2, 200, 300);
    ev("pointerup", 1, 100, 300);
    for (let k = 1; k <= 10; k++) {
      tick(16);
      ev("pointermove", 2, 200 + 4 * k, 300);
    }
    expect(calls.orbit[0]).toBeGreaterThan(0);
    expect(calls.orbit[0]).toBeLessThanOrEqual(40 - GESTURE.resumeSlop + 4);
  });

  it("pans and twists with two fingers", () => {
    const { calls, ev, tick } = setup();
    ev("pointerdown", 1, 100, 300);
    ev("pointerdown", 2, 200, 300);
    for (let k = 1; k <= 30; k++) {
      tick(16);
      ev("pointermove", 1, 100 + 2 * k, 300 + k);
      ev("pointermove", 2, 200 + 2 * k, 300 + k);
    }
    expect(calls.pan[0]).toBeGreaterThan(40);
    expect(calls.zoom).toBe(1);
    expect(calls.roll).toBe(0);
    // Then a twist about the centroid (clockwise).
    const [cx, cy] = [210, 330];
    for (let deg = 1; deg <= 40; deg++) {
      const a = (deg * Math.PI) / 180;
      tick(16);
      ev("pointermove", 1, cx - 50 * Math.cos(a), cy - 50 * Math.sin(a));
      ev("pointermove", 2, cx + 50 * Math.cos(a), cy + 50 * Math.sin(a));
    }
    expect(calls.roll).toBeGreaterThan((20 * Math.PI) / 180);
  });

  it("pans with the mouse's right button or Shift", () => {
    const { calls, ev, tick } = setup();
    ev("pointerdown", 1, 100, 100, { pointerType: "mouse", button: 2 });
    for (let k = 1; k <= 5; k++) {
      tick(16);
      ev("pointermove", 1, 100 + 3 * k, 100, { pointerType: "mouse" });
    }
    ev("pointerup", 1, 115, 100, { pointerType: "mouse" });
    expect(calls.pan[0]).toBe(15); // no slop for a mouse
    expect(calls.orbitCalls).toBe(0);
    ev("pointerdown", 1, 100, 100, { pointerType: "mouse", shiftKey: true });
    ev("pointermove", 1, 100, 110, { pointerType: "mouse" });
    expect(calls.pan[1]).toBe(10);
  });

  it("ignores everything while disabled (transition, flight)", () => {
    const { calls, ev, disable } = setup();
    disable();
    ev("pointerdown", 1, 100, 100);
    ev("pointermove", 1, 200, 100);
    ev("pointerup", 1, 200, 100);
    expect(calls.orbitCalls + calls.taps).toBe(0);
  });

  it("never twists without a roll handler", () => {
    const { calls, ev, tick } = setup(false);
    ev("pointerdown", 1, 100, 300);
    ev("pointerdown", 2, 200, 300);
    for (let deg = 1; deg <= 60; deg++) {
      const a = (deg * Math.PI) / 180;
      tick(16);
      ev("pointermove", 1, 150 - 50 * Math.cos(a), 300 - 50 * Math.sin(a));
      ev("pointermove", 2, 150 + 50 * Math.cos(a), 300 + 50 * Math.sin(a));
    }
    expect(calls.roll).toBe(0);
    expect(calls.orbitCalls).toBe(0);
  });
});
