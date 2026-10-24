import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEVEL,
  LEGACY_LEVEL_KEY,
  LEVEL_KEY,
  isLevelPref,
  loadLevel,
  saveLevel,
} from "./level";

/** In-memory Storage. */
function memory(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("level preference (#201)", () => {
  it("defaults to Amateur, not chosen, without anything stored or without storage", () => {
    expect(loadLevel(memory())).toEqual({ version: 1, level: DEFAULT_LEVEL, chosen: false });
    expect(loadLevel(null).level).toBe("amateur");
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadLevel(broken).level).toBe("amateur");
  });

  it("migrates the level stored before #201, once, and drops the old key", () => {
    const store = memory({ [LEGACY_LEVEL_KEY]: JSON.stringify("expert") });
    expect(loadLevel(store)).toEqual({ version: 1, level: "expert", chosen: true });
    expect(store.map.has(LEGACY_LEVEL_KEY)).toBe(false);
    expect(JSON.parse(store.map.get(LEVEL_KEY)!)).toEqual({
      version: 1,
      level: "expert",
      chosen: true,
    });
    // Read again: from the new key.
    expect(loadLevel(store).level).toBe("expert");
  });

  it("keeps a migrated « amateur » as not chosen (the 3D view wrote it unasked)", () => {
    const store = memory({ [LEGACY_LEVEL_KEY]: JSON.stringify("amateur") });
    expect(loadLevel(store)).toEqual({ version: 1, level: "amateur", chosen: false });
    const discovery = memory({ [LEGACY_LEVEL_KEY]: JSON.stringify("discovery") });
    expect(loadLevel(discovery)).toEqual({ version: 1, level: "discovery", chosen: true });
  });

  it("ignores an unreadable legacy value and prefers the new key", () => {
    expect(loadLevel(memory({ [LEGACY_LEVEL_KEY]: "novice" })).level).toBe("amateur");
    expect(loadLevel(memory({ [LEGACY_LEVEL_KEY]: JSON.stringify("novice") })).level).toBe(
      "amateur",
    );
    const both = memory({
      [LEVEL_KEY]: JSON.stringify({ version: 1, level: "discovery", chosen: true }),
      [LEGACY_LEVEL_KEY]: JSON.stringify("expert"),
    });
    expect(loadLevel(both).level).toBe("discovery");
  });

  it("saves a chosen level", () => {
    const store = memory();
    expect(saveLevel(store, "discovery")).toEqual({
      version: 1,
      level: "discovery",
      chosen: true,
    });
    expect(loadLevel(store).level).toBe("discovery");
    expect(isLevelPref({ version: 2, level: "expert", chosen: true })).toBe(false);
  });
});
