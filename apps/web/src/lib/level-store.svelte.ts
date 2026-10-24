/**
 * The app's level, shared by every screen (#201): reading `level.value` follows the preference,
 * `level.set()` changes it everywhere at once and saves it. `?level=` (captures) takes precedence
 * and is then not saved, as before.
 */
import type { FigureLevel } from "@asteria/sky-renderer";
import { isLevel, loadLevel, saveLevel, type LevelPref } from "./level";

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

class Level {
  #pref = $state<LevelPref>(loadLevel(storage()));
  #url = $state<FigureLevel | null>(null);

  constructor() {
    const fromUrl = new URLSearchParams(location.search).get("level");
    this.#url = isLevel(fromUrl) ? fromUrl : null;
  }

  get value(): FigureLevel {
    return this.#url ?? this.#pref.level;
  }

  /** Whether the player ever chose a level (for a first-launch welcome). */
  get chosen(): boolean {
    return this.#pref.chosen;
  }

  set(level: FigureLevel): void {
    if (this.#url !== null) this.#url = level;
    else this.#pref = saveLevel(storage(), level);
  }
}

export const level = new Level();
