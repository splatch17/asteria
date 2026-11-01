/**
 * Modes of the app and the single button (#176, mock-up A′1 « Tout derrière le bouton »).
 *
 * The sky screen keeps one button, bottom left (three rules). It opens one short sheet: the three
 * modes on top (Observer · Orbites · Apprendre), then the settings of the mode in force. In the
 * sheet the button becomes « × Fermer », at the same place; the time line unfolds from that place
 * too (its first cell is the button, a × that folds it). Next to the button, chips for what is not
 * as usual: a date that is not now (↺ back to now) and the pointing (Viser) that is on.
 *
 * This module is the navigation model, free of the DOM: what each tap does, what the button and
 * the chips show, and how many taps reach a screen (tested against the mock-up's promises:
 * Apprendre in 2, a game in 3, the time line in 2, back to now in 1).
 */

export const APP_MODES = ["observe", "orbits", "learn"] as const;
export type AppMode = (typeof APP_MODES)[number];

/** What sits over the bottom-left corner: nothing, the sheet, or the time line. */
export type Layer = "none" | "sheet" | "time";

/** Where the Apprendre screen is: its home, a game's settings sheet, a game being played. */
export type LearnView = "hub" | "setup" | "game";

export interface NavState {
  mode: AppMode;
  layer: Layer;
  /** Apprendre only: the view shown (null in the other modes). */
  learn: LearnView | null;
  /** The time shown is now. */
  live: boolean;
  /** Sensor pointing (Viser) is on. */
  pointing: boolean;
  /** A game was played before: the « Reprendre » card leads the Apprendre screen. */
  resumable: boolean;
}

/** The base screen: the sky map, nothing open, time live. */
export const BASE: NavState = {
  mode: "observe",
  layer: "none",
  learn: null,
  live: true,
  pointing: false,
  resumable: false,
};

export type Tap =
  /** The bottom-left button: ≡ opens the sheet, × closes it or folds the time line. */
  | { kind: "button" }
  /** A mode tile of the sheet. */
  | { kind: "mode"; mode: AppMode }
  /** The « Heure » row of the sheet: unfolds the time line from the button. */
  | { kind: "timeRow" }
  /** The date chip next to the button (time not live): unfolds the time line. */
  | { kind: "dateChip" }
  /** ↺ of the date chip: back to now. */
  | { kind: "now" }
  /** The « Viser » chip: turns pointing off. */
  | { kind: "pointingChip" }
  /** The Viser tile of the sheet (Observer). */
  | { kind: "pointingTile" }
  /** Apprendre: « Reprendre » (last game, last settings), a game's card, « Jouer ». */
  | { kind: "resume" }
  | { kind: "gameCard" }
  | { kind: "play" }
  /** Android or browser back. */
  | { kind: "back" };

/** What the bottom-left button shows and does. */
export type ButtonRole = "open" | "close" | "fold";
export function buttonRole(layer: Layer): ButtonRole {
  return layer === "sheet" ? "close" : layer === "time" ? "fold" : "open";
}

/** Is the bottom-left button on screen? Not over a game (it has its own way out). */
export function buttonShown(s: NavState): boolean {
  return s.mode !== "learn" || s.learn === "hub" || s.layer === "sheet";
}

export type Chip = "date" | "pointing";
/** Chips beside the button, when the sheet and the time line are folded (Observer, Orbites). */
export function chips(s: NavState): Chip[] {
  if (s.layer !== "none" || s.mode === "learn") return [];
  const out: Chip[] = [];
  if (!s.live) out.push("date");
  if (s.pointing && s.mode === "observe") out.push("pointing");
  return out;
}

/**
 * The state after a tap, or null when that tap is not on screen (nothing to touch there).
 */
export function tap(s: NavState, t: Tap): NavState | null {
  switch (t.kind) {
    case "button":
      if (!buttonShown(s)) return null;
      return { ...s, layer: s.layer === "none" ? "sheet" : "none" };
    case "mode":
      if (s.layer !== "sheet") return null;
      if (t.mode === s.mode) return { ...s, layer: "none" };
      return {
        ...s,
        mode: t.mode,
        layer: "none",
        learn: t.mode === "learn" ? "hub" : null,
        // Pointing drives the sky map only: leaving Observer turns it off.
        pointing: t.mode === "observe" ? s.pointing : false,
      };
    case "timeRow":
      if (s.layer !== "sheet" || s.mode === "learn") return null;
      return { ...s, layer: "time" };
    case "dateChip":
      return chips(s).includes("date") ? { ...s, layer: "time" } : null;
    case "now":
      return chips(s).includes("date") ? { ...s, live: true } : null;
    case "pointingChip":
      return chips(s).includes("pointing") ? { ...s, pointing: false } : null;
    case "pointingTile":
      if (s.layer !== "sheet" || s.mode !== "observe") return null;
      return { ...s, layer: "none", pointing: !s.pointing };
    case "resume":
      if (s.mode !== "learn" || s.learn !== "hub" || s.layer !== "none" || !s.resumable)
        return null;
      return { ...s, learn: "game" };
    case "gameCard":
      if (s.mode !== "learn" || s.learn !== "hub" || s.layer !== "none") return null;
      return { ...s, learn: "setup" };
    case "play":
      if (s.mode !== "learn" || s.learn !== "setup") return null;
      return { ...s, learn: "game", resumable: true };
    case "back":
      return back(s);
  }
}

/**
 * Android or browser back: closes what is on top (the sheet, the time line, a game, its settings),
 * then Apprendre and Orbites go back to the sky; on the base screen it leaves the app (null).
 */
export function back(s: NavState): NavState | null {
  if (s.layer !== "none") return { ...s, layer: "none" };
  if (s.mode === "learn" && s.learn !== "hub") return { ...s, learn: "hub" };
  if (s.mode !== "observe") return { ...s, mode: "observe", learn: null };
  return null;
}

/** Every tap a person can make, to search the shortest ways. */
const ALL_TAPS: Tap[] = [
  { kind: "button" },
  ...APP_MODES.map((mode): Tap => ({ kind: "mode", mode })),
  { kind: "timeRow" },
  { kind: "dateChip" },
  { kind: "now" },
  { kind: "pointingChip" },
  { kind: "pointingTile" },
  { kind: "resume" },
  { kind: "gameCard" },
  { kind: "play" },
];

/**
 * Fewest taps (Android back not counted as a tap) from `from` to a state where `goal` holds;
 * Infinity when unreachable. Breadth-first over the model above.
 */
export function tapsTo(from: NavState, goal: (s: NavState) => boolean): number {
  const key = (s: NavState) => JSON.stringify(s);
  const seen = new Set([key(from)]);
  let frontier = [from];
  for (let depth = 0; frontier.length; depth++) {
    if (frontier.some(goal)) return depth;
    const next: NavState[] = [];
    for (const s of frontier)
      for (const t of ALL_TAPS) {
        const n = tap(s, t);
        if (n && !seen.has(key(n))) {
          seen.add(key(n));
          next.push(n);
        }
      }
    frontier = next;
  }
  return Infinity;
}

/** The mode shown by the app's state: Apprendre over anything, else the sky or the Earth view. */
export function modeOf(view: "sky" | "space", learning: boolean): AppMode {
  return learning ? "learn" : view === "sky" ? "observe" : "orbits";
}
