import { describe, expect, it } from "vitest";
import {
  PROBE_TIMING,
  absoluteAlpha,
  classifyOrientationEvent,
  decide,
  failureMessageKey,
  failureReason,
  newProbe,
  permissionVerdict,
  preflight,
  recordReading,
  type OrientationLike,
} from "./sensors";

const ev = (over: Partial<OrientationLike>): OrientationLike => ({
  type: "deviceorientation",
  absolute: false,
  alpha: 10,
  beta: 80,
  gamma: 0,
  ...over,
});

describe("preflight", () => {
  it("refuses an insecure context first", () => {
    expect(preflight({ secure: false, orientationEvents: true, absoluteSensor: true })).toBe(
      "insecure",
    );
  });
  it("needs at least one API", () => {
    expect(preflight({ secure: true, orientationEvents: false, absoluteSensor: false })).toBe(
      "unsupported",
    );
    expect(preflight({ secure: true, orientationEvents: false, absoluteSensor: true })).toBeNull();
  });
});

describe("permissionVerdict", () => {
  it("motion sensors blocked → denied", () => {
    expect(permissionVerdict({ accelerometer: "denied", gyroscope: "denied" })).toBe("denied");
    expect(permissionVerdict({ gyroscope: "denied" })).toBe("denied");
  });
  it("only the magnetometer blocked → no compass", () => {
    expect(permissionVerdict({ accelerometer: "granted", magnetometer: "denied" })).toBe(
      "noCompass",
    );
  });
  it("unknown or prompt → ok", () => {
    expect(permissionVerdict({})).toBe("ok");
    expect(permissionVerdict({ accelerometer: "prompt" })).toBe("ok");
  });
});

describe("classifyOrientationEvent", () => {
  it("Brave's blocked event (all null) is empty", () => {
    expect(classifyOrientationEvent(ev({ alpha: null, beta: null, gamma: null }))).toBe("empty");
  });
  it("Chromium absolute event", () => {
    expect(
      classifyOrientationEvent(ev({ type: "deviceorientationabsolute", absolute: true })),
    ).toBe("absolute");
  });
  it("Chromium relative event", () => {
    expect(classifyOrientationEvent(ev({}))).toBe("relative");
  });
  it("absolute flag on a plain event (Firefox)", () => {
    expect(classifyOrientationEvent(ev({ absolute: true }))).toBe("absolute");
  });
  it("iOS compass heading makes it absolute, unless unknown (−1)", () => {
    expect(classifyOrientationEvent(ev({ webkitCompassHeading: 90 }))).toBe("absolute");
    expect(classifyOrientationEvent(ev({ webkitCompassHeading: -1 }))).toBe("relative");
  });
  it("no alpha but gravity angles → tilt only", () => {
    expect(classifyOrientationEvent(ev({ alpha: null }))).toBe("tilt");
  });
});

describe("absoluteAlpha", () => {
  it("keeps W3C alpha for absolute events", () => {
    expect(absoluteAlpha(ev({ type: "deviceorientationabsolute", alpha: 42 }))).toBe(42);
  });
  it("turns the clockwise iOS heading into a counter-clockwise alpha", () => {
    expect(absoluteAlpha(ev({ alpha: 5, webkitCompassHeading: 90 }))).toBe(270);
    expect(absoluteAlpha(ev({ alpha: 5, webkitCompassHeading: 0 }))).toBe(0);
  });
});

describe("decide (choice of source)", () => {
  const T = PROBE_TIMING;

  it("an absolute reading starts the absolute mode at once", () => {
    const s = newProbe(0);
    recordReading(s, "relative", 10);
    recordReading(s, "absolute", 20);
    expect(decide(s, 20)).toEqual({ kind: "start", mode: "absolute" });
  });

  it("relative readings wait a little for a compass, then settle", () => {
    const s = newProbe(0);
    recordReading(s, "relative", 100);
    expect(decide(s, 100 + T.relativeGrace - 1)).toEqual({ kind: "wait" });
    expect(decide(s, 100 + T.relativeGrace)).toEqual({ kind: "start", mode: "relative" });
  });

  it("no wait for a compass when the magnetometer is blocked", () => {
    const s = newProbe(0);
    s.permission = "noCompass";
    recordReading(s, "relative", 100);
    expect(decide(s, 101)).toEqual({ kind: "start", mode: "relative" });
  });

  it("tilt-only readings still give a relative mode", () => {
    const s = newProbe(0);
    recordReading(s, "tilt", 50);
    expect(decide(s, 50 + T.relativeGrace)).toEqual({ kind: "start", mode: "relative" });
  });

  it("Brave default: one empty event, then the Generic Sensor is refused → denied", () => {
    const s = newProbe(0, "starting");
    recordReading(s, "empty", 5);
    expect(decide(s, T.emptyGiveUp)).toEqual({ kind: "wait" });
    s.sensor = "error";
    s.sensorError = "NotAllowedError";
    expect(decide(s, T.emptyGiveUp)).toEqual({ kind: "fail", reason: "denied" });
  });

  it("empty events without a Generic Sensor → blocked after the short delay", () => {
    const s = newProbe(0);
    recordReading(s, "empty", 5);
    expect(decide(s, T.emptyGiveUp - 1)).toEqual({ kind: "wait" });
    expect(decide(s, T.emptyGiveUp)).toEqual({ kind: "fail", reason: "blocked" });
  });

  it("the Generic Sensor can rescue blocked events", () => {
    const s = newProbe(0, "starting");
    recordReading(s, "empty", 5);
    s.sensor = "active";
    recordReading(s, "absolute", 300);
    expect(decide(s, 300)).toEqual({ kind: "start", mode: "absolute" });
  });

  it("a Generic Sensor that never answers still times out", () => {
    const s = newProbe(0, "starting");
    expect(decide(s, T.timeout - 1)).toEqual({ kind: "wait" });
    expect(decide(s, T.timeout)).toEqual({ kind: "fail", reason: "silent" });
  });

  it("nothing at all → silent after the timeout", () => {
    const s = newProbe(0);
    expect(decide(s, T.timeout - 1)).toEqual({ kind: "wait" });
    expect(decide(s, T.timeout)).toEqual({ kind: "fail", reason: "silent" });
  });

  it("permission denied fails at once", () => {
    const s = newProbe(0);
    s.permission = "denied";
    expect(decide(s, 0)).toEqual({ kind: "fail", reason: "denied" });
  });
});

describe("failure messages", () => {
  it("classifies the cause", () => {
    const s = newProbe(0);
    expect(failureReason(s)).toBe("silent");
    s.counts.empty = 1;
    expect(failureReason(s)).toBe("blocked");
    s.sensorError = "NotReadableError"; // no sensor hardware (desktop)
    expect(failureReason(s)).toBe("silent");
    s.sensorError = "NotAllowedError";
    expect(failureReason(s)).toBe("denied");
  });
  it("Brave gets its own instructions, except for https and missing APIs", () => {
    expect(failureMessageKey("blocked", true)).toBe("pointing.error.brave");
    expect(failureMessageKey("denied", true)).toBe("pointing.error.brave");
    expect(failureMessageKey("insecure", true)).toBe("pointing.error.insecure");
    expect(failureMessageKey("blocked", false)).toBe("pointing.error.blocked");
  });
});
