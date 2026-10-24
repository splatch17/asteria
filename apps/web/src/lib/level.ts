/**
 * The player's level (Découverte / Amateur / Expert), one preference for the whole app (#201):
 * set in Menu › Réglages, and from the shortcuts of Apprendre, « Selon la latitude » and the 3D
 * view, which all read and write it (`level.svelte.ts`).
 *
 * Stored as a versioned record. Before #201 it was a bare string under `asteria.level`, written
 * by those three screens, and also, unasked, by every opening of the 3D view: a stored
 * « amateur » (the default) may never have been chosen. The migration keeps the value and, as
 * the first-launch welcome may ask the level of whoever never chose one, records it as chosen
 * only when it is not the default.
 */
import type { FigureLevel } from "@asteria/sky-renderer";

export const LEVELS: readonly FigureLevel[] = ["discovery", "amateur", "expert"];
export const DEFAULT_LEVEL: FigureLevel = "amateur";
export const LEVEL_KEY = "asteria.prefs.level";
/** Before #201: a bare JSON string. */
export const LEGACY_LEVEL_KEY = "asteria.level";

export const isLevel = (v: unknown): v is FigureLevel =>
  v === "discovery" || v === "amateur" || v === "expert";

export interface LevelPref {
  version: 1;
  level: FigureLevel;
  /** Chosen by the player (else the default, or a value written without asking). */
  chosen: boolean;
}

export const isLevelPref = (v: unknown): v is LevelPref =>
  typeof v === "object" &&
  v !== null &&
  (v as LevelPref).version === 1 &&
  isLevel((v as LevelPref).level) &&
  typeof (v as LevelPref).chosen === "boolean";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function parse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The stored preference, migrated from the legacy key on first read (written back at once, the
 * legacy key removed); the default when there is none or storage is unavailable.
 */
export function loadLevel(store: Store | null): LevelPref {
  const fallback: LevelPref = { version: 1, level: DEFAULT_LEVEL, chosen: false };
  if (!store) return fallback;
  try {
    const saved = parse(store.getItem(LEVEL_KEY));
    if (isLevelPref(saved)) return saved;
    const legacy = parse(store.getItem(LEGACY_LEVEL_KEY));
    if (!isLevel(legacy)) return fallback;
    const pref: LevelPref = { version: 1, level: legacy, chosen: legacy !== DEFAULT_LEVEL };
    store.setItem(LEVEL_KEY, JSON.stringify(pref));
    store.removeItem(LEGACY_LEVEL_KEY);
    return pref;
  } catch {
    return fallback;
  }
}

/** Saves a level chosen by the player. */
export function saveLevel(store: Store | null, level: FigureLevel): LevelPref {
  const pref: LevelPref = { version: 1, level, chosen: true };
  try {
    store?.setItem(LEVEL_KEY, JSON.stringify(pref));
  } catch {
    // not persisted: acceptable
  }
  return pref;
}
