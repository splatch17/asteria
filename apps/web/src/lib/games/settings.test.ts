import { describe, expect, it } from "vitest";
import {
  MIN_SCOPE_ITEMS,
  defaultSettings,
  isGameSettings,
  playableScope,
  scopeCounts,
  scopeItems,
  settingsKey,
} from "./settings";

describe("game settings (#187)", () => {
  it("are checked when read back", () => {
    expect(isGameSettings({ mode: "streak", scope: "home" })).toBe(true);
    expect(isGameSettings({ mode: "timed", scope: "all" })).toBe(true);
    expect(isGameSettings({ mode: "sprint", scope: "all" })).toBe(false);
    expect(isGameSettings({ mode: "training", scope: "south" })).toBe(false);
    expect(isGameSettings(null)).toBe(false);
    expect(isGameSettings("training")).toBe(false);
    expect(settingsKey("nameStar")).toBe("asteria.games.settings.nameStar");
  });

  it("default to the player's sky, or to all when the place is unknown", () => {
    expect(defaultSettings(true)).toEqual({ mode: "training", scope: "home" });
    expect(defaultSettings(false)).toEqual({ mode: "training", scope: "all" });
  });

  it("choose the items of a scope within the pool, in its order", () => {
    const pool = ["And", "Cas", "Cru", "Ori", "UMi"];
    const sets = { home: new Set(["UMi", "Ori", "Cas", "And", "Lyr"]), tonight: new Set(["Cas"]) };
    expect(scopeItems(pool, "all", sets)).toEqual(pool);
    expect(scopeItems(pool, "home", sets)).toEqual(["And", "Cas", "Ori", "UMi"]);
    expect(scopeItems(pool, "tonight", sets)).toEqual(["Cas"]);
    const counts = scopeCounts(pool, sets);
    expect(counts).toEqual({ home: 4, tonight: 1, all: 5 });
    // Too few tonight: the whole pool is played instead.
    expect(MIN_SCOPE_ITEMS).toBeGreaterThan(1);
    expect(playableScope("tonight", counts)).toBe("all");
    expect(playableScope("home", counts)).toBe("home");
  });
});
