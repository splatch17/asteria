import { describe, expect, it } from "vitest";
import { isPrecached, offlinePercent } from "./offline";

describe("isPrecached", () => {
  it("keeps the app, its data and the woff2 fonts", () => {
    for (const p of [
      "index.html",
      "manifest.webmanifest",
      "assets/index-abc.js",
      "assets/jetbrains-mono-latin-400-normal-x.woff2",
      "data/stars.bin",
      "data/space/mars.webp",
      "data/milkyway.webp",
      "data/figures/stellarium-western.json",
      "icons/icon-192.png",
    ])
      expect(isPrecached(p), p).toBe(true);
  });
  it("leaves out the woff fallbacks, prototypes, maps and the worker", () => {
    for (const p of [
      "assets/cormorant-latin-500-italic-x.woff",
      "proto-orion/index.html",
      "assets/index-abc.js.map",
      "sw.js",
    ])
      expect(isPrecached(p), p).toBe(false);
  });
});

describe("offlinePercent", () => {
  it("rounds down and stays under 100 until the end", () => {
    expect(offlinePercent(0, 0)).toBe(0);
    expect(offlinePercent(1, 3)).toBe(33);
    expect(offlinePercent(999, 1000)).toBe(99);
    expect(offlinePercent(1000, 1000)).toBe(99);
  });
});
