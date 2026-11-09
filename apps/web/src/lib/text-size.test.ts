import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_SIZE,
  loadTextSize,
  mapLabelScale,
  saveTextSize,
  TEXT_SCALE,
  TEXT_SIZE_KEY,
  TEXT_SIZES,
} from "./text-size";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("text size preference", () => {
  it("defaults to normal without storage, without a record or with a broken one", () => {
    expect(loadTextSize(null)).toBe(DEFAULT_TEXT_SIZE);
    expect(loadTextSize(memoryStore())).toBe("normal");
    expect(loadTextSize(memoryStore({ [TEXT_SIZE_KEY]: "{" }))).toBe("normal");
    expect(loadTextSize(memoryStore({ [TEXT_SIZE_KEY]: '{"version":1,"size":"huge"}' }))).toBe(
      "normal",
    );
    expect(loadTextSize(memoryStore({ [TEXT_SIZE_KEY]: '{"version":2,"size":"large"}' }))).toBe(
      "normal",
    );
  });

  it("reads back what was saved", () => {
    const store = memoryStore();
    for (const size of TEXT_SIZES) {
      saveTextSize(store, size);
      expect(loadTextSize(store)).toBe(size);
    }
  });

  it("survives a storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadTextSize(broken)).toBe("normal");
    expect(() => saveTextSize(broken, "large")).not.toThrow();
  });

  it("never shrinks: each step is larger than the one before, normal is 1", () => {
    expect(TEXT_SCALE.normal).toBe(1);
    expect(TEXT_SCALE.large).toBeGreaterThan(TEXT_SCALE.normal);
    expect(TEXT_SCALE.larger).toBeGreaterThan(TEXT_SCALE.large);
  });

  it("draws a 10 px map name at 11 px or more", () => {
    for (const size of TEXT_SIZES) expect(10 * mapLabelScale(size)).toBeGreaterThanOrEqual(11);
  });
});
