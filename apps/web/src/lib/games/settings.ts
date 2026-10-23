/**
 * Settings of a game (#187), chosen on the sheet before playing and remembered per game: the
 * mode (training series or challenge) and which part of the sky it asks about.
 *
 * Sky scopes, each within the level's pool (pool.ts, name-star.ts `starPool`):
 * - « Visibles de chez moi » (`home`): up at some time of the year from the player's latitude
 *   (visibility.ts `visibleFromLatitude`, `upFromLatitude`);
 * - « Ce soir » (`tonight`): up in the coming dark hours (`visibleTonight`, `upTonight`);
 * - « Toutes » (`all`): the whole pool.
 * The scope only chooses what is asked: wrong answers offered still come from the whole pool.
 * When the player's position is unknown (the app uses its default place), the default is `all`
 * and the sheet says so; the two other scopes are then computed for the default place.
 */
import { GAME_MODES, type GameMode } from "./progress";

export type SkyScope = "home" | "tonight" | "all";
export const SKY_SCOPES: readonly SkyScope[] = ["home", "tonight", "all"];

export interface GameSettings {
  mode: GameMode;
  scope: SkyScope;
}

/** localStorage key of a game's settings (lib/storage readSetting / writeSetting). */
export const settingsKey = (game: string): string => `asteria.games.settings.${game}`;

/** A scope offering fewer items than this is not offered: too short to be a game. */
export const MIN_SCOPE_ITEMS = 4;

export function isGameSettings(v: unknown): v is GameSettings {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return GAME_MODES.includes(r.mode as GameMode) && SKY_SCOPES.includes(r.scope as SkyScope);
}

/** Settings of a game never set: training, the player's sky when their place is known. */
export const defaultSettings = (located: boolean): GameSettings => ({
  mode: "training",
  scope: located ? "home" : "all",
});

export interface ScopeSets {
  home: ReadonlySet<string>;
  tonight: ReadonlySet<string>;
}

/** The items of `pool` a scope asks about, in the pool's order. */
export function scopeItems(pool: readonly string[], scope: SkyScope, sets: ScopeSets): string[] {
  if (scope === "all") return [...pool];
  const set = sets[scope];
  return pool.filter((k) => set.has(k));
}

/** How many items each scope offers. */
export function scopeCounts(pool: readonly string[], sets: ScopeSets): Record<SkyScope, number> {
  return {
    home: scopeItems(pool, "home", sets).length,
    tonight: scopeItems(pool, "tonight", sets).length,
    all: pool.length,
  };
}

/** The scope actually played: the chosen one, or `all` when it offers too few items. */
export const playableScope = (scope: SkyScope, counts: Record<SkyScope, number>): SkyScope =>
  counts[scope] >= MIN_SCOPE_ITEMS ? scope : "all";
