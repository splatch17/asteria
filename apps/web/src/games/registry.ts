/**
 * Mini-games registry (#90): the library's "Jeux" section lists these entries and mounts the
 * chosen game full screen. Each game is its own lazily loaded chunk (`load`), so the games cost
 * nothing at start-up. To add a game: append an entry here, with its strings in the locale
 * catalogue (`titleKey`, `descriptionKey`).
 */
import type { Component } from "svelte";

export interface GameEntry {
  /** Stable identifier (progress, URLs), e.g. "connect-stars". */
  id: string;
  /** i18n key of the title shown in the list. */
  titleKey: string;
  /** i18n key of the one-line description. */
  descriptionKey: string;
  /** Name of an icon drawn by components/Icon.svelte (see lib/icons.ts). */
  icon: string;
  /** Audience level (Découverte, Amateur, Expert). */
  level: "decouverte" | "amateur" | "expert";
  /** The game's component, mounted full screen; it calls `onExit` to come back to the library. */
  load: () => Promise<{ default: Component<{ onExit: () => void }> }>;
}

export const GAMES: readonly GameEntry[] = [];
