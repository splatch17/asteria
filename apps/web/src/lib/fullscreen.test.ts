import { describe, expect, it } from "vitest";
import { shouldRestoreFullscreen, showFullscreenButton } from "./fullscreen";

const env = (over: Partial<Parameters<typeof showFullscreenButton>[0]>) => ({
  enabled: true,
  active: false,
  installedFullscreen: false,
  ...over,
});

describe("fullscreen button", () => {
  it("shown in a browser that supports the API (Android Chrome, Brave)", () => {
    expect(showFullscreenButton(env({}))).toBe(true);
  });
  it("hidden without the API (iPhone Safari)", () => {
    expect(showFullscreenButton(env({ enabled: false }))).toBe(false);
  });
  it("hidden in the installed fullscreen app", () => {
    expect(showFullscreenButton(env({ installedFullscreen: true }))).toBe(false);
  });
  it("always shown while in fullscreen, to get out", () => {
    expect(showFullscreenButton(env({ active: true, enabled: false }))).toBe(true);
  });
});

describe("remembered fullscreen", () => {
  it("restored on the first tap when it was on", () => {
    expect(shouldRestoreFullscreen(true, env({}))).toBe(true);
  });
  it("not when off, already active or unsupported", () => {
    expect(shouldRestoreFullscreen(false, env({}))).toBe(false);
    expect(shouldRestoreFullscreen(true, env({ active: true }))).toBe(false);
    expect(shouldRestoreFullscreen(true, env({ enabled: false }))).toBe(false);
    expect(shouldRestoreFullscreen(true, env({ installedFullscreen: true }))).toBe(false);
  });
});
