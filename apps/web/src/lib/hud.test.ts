import { describe, expect, it } from "vitest";
import { immersiveAfterTap, pointingShortcut } from "./hud";

const env = (over: Partial<Parameters<typeof pointingShortcut>[0]> = {}) => ({
  coarse: true,
  secure: true,
  orientationEvents: true,
  absoluteSensor: false,
  ...over,
});

describe("pointing shortcut", () => {
  it("shown on a phone with orientation events over HTTPS", () => {
    expect(pointingShortcut(env())).toBe(true);
    expect(pointingShortcut(env({ orientationEvents: false, absoluteSensor: true }))).toBe(true);
  });
  it("menu only on a desktop (fine pointer), over HTTP or without sensors", () => {
    expect(pointingShortcut(env({ coarse: false }))).toBe(false);
    expect(pointingShortcut(env({ secure: false }))).toBe(false);
    expect(pointingShortcut(env({ orientationEvents: false }))).toBe(false);
  });
});

describe("tap on the sky", () => {
  const rest = { hit: false, selected: false, overlay: false, immersive: false };
  it("an empty tap with nothing selected or open hides the interface", () => {
    expect(immersiveAfterTap(rest)).toBe(true);
  });
  it("a tap on an object selects it and never hides the interface", () => {
    expect(immersiveAfterTap({ ...rest, hit: true })).toBe(false);
  });
  it("an empty tap first closes a sheet, a menu or the time controls", () => {
    expect(immersiveAfterTap({ ...rest, selected: true })).toBe(false);
    expect(immersiveAfterTap({ ...rest, overlay: true })).toBe(false);
  });
  it("any tap brings a hidden interface back, an object tap included", () => {
    expect(immersiveAfterTap({ ...rest, immersive: true })).toBe(false);
    expect(immersiveAfterTap({ ...rest, immersive: true, hit: true })).toBe(false);
  });
});
