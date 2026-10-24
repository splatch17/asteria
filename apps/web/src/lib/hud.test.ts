import { describe, expect, it } from "vitest";
import fr from "@asteria/ui/locales/fr.json";
import {
  compassHeading,
  compassPoint,
  HIDDEN_TIP_SHOWS,
  hiddenTipDue,
  immersiveAfterTap,
  needleRotation,
  pointingShortcut,
} from "./hud";

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

describe("compass (#138)", () => {
  it("reads the heading in whole degrees in [0, 360)", () => {
    expect(compassHeading(0)).toBe(0);
    expect(compassHeading(180)).toBe(180);
    expect(compassHeading(-90)).toBe(270);
    expect(compassHeading(725.2)).toBe(5);
    expect(compassHeading(359.7)).toBe(0);
    expect(compassHeading(Number.NaN)).toBe(0);
  });
  it("names the eight points of the compass", () => {
    expect([0, 44, 90, 135, 180, 225, 270, 315, 338].map(compassPoint)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 0,
    ]);
  });
  it("turns the needle against the view: north up facing north, down facing south", () => {
    expect(needleRotation(0) + 0).toBe(0);
    expect(needleRotation(180)).toBe(-180);
    expect(needleRotation(90, 10)).toBe(-100);
  });
  it("has a French name for each point", () => {
    const messages = fr as Record<string, string>;
    for (let i = 0; i < 8; i++) expect(messages[`compass.dir.${i}`]).toBeTruthy();
  });
});

describe("hidden interface tip (#198)", () => {
  it("is shown the first three times only", () => {
    expect(HIDDEN_TIP_SHOWS).toBe(3);
    expect([0, 1, 2, 3, 4].map(hiddenTipDue)).toEqual([true, true, true, false, false]);
  });
  it("is not shown for a corrupt count", () => {
    expect(hiddenTipDue(Number.NaN)).toBe(false);
  });
  it("has its texts", () => {
    const messages = fr as Record<string, string>;
    expect(messages["hud.hidden"]).toMatch(/touche le ciel/);
    expect(messages["hud.show"]).toBeTruthy();
  });
});
