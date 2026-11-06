/**
 * Navigation of the app (menu v2, after #176; sketch A + B in docs/design/menu-v2/).
 *
 * The sky keeps one button, bottom left (three rules, the map's mode under them), and a small
 * compass, top right, always there: a tap turns the map to face north (it replaced « Recentrer »).
 * The button opens one sheet. Its foot is where the button was: « × Fermer » in the button's
 * place, then four tabs that are destinations, a pictogram over a word: Ciel · Orbites ·
 * Catalogue · Jeux. Ciel and Orbites are the two modes of the map (the sky map, the Earth view):
 * their tabs also switch the map behind the sheet at once. Catalogue and Jeux leave the map as it
 * is. Opening the sheet shows the tab of the map's mode. Each tab opens on its own home; a ⚙ in
 * the sheet's header (far from the thumb) opens the settings, apart, with a ‹ back to the tab.
 * From a tab's home, a screen opens over the map (the catalogue deck, its list, « Selon la
 * latitude », a game's settings, a game); closing it comes back to that home.
 * Next to the button, chips for what is not as usual: a date that is not now (↺ back to now) and
 * the pointing (Viser) that is on. The time line unfolds from the button's place.
 *
 * This module is the navigation model, free of the DOM: what each tap does, what the button and
 * the chips show, and how many taps reach a screen (tested against the sketch's promises).
 */

/** The tabs of the sheet's foot, in order. */
export const SHEET_TABS = ["sky", "orbits", "catalogue", "games"] as const;
export type SheetTab = (typeof SHEET_TABS)[number];
export const isSheetTab = (v: unknown): v is SheetTab =>
  typeof v === "string" && (SHEET_TABS as readonly string[]).includes(v);

/** The two modes of the map: the sky map (Ciel) and the Earth view (Orbites). */
export type MapMode = "sky" | "orbits";

/** What sits over the bottom-left corner: nothing, the sheet, or the time line. */
export type Layer = "none" | "sheet" | "time";

/**
 * A screen opened from a tab's home, over the map (the sheet closes under it): the catalogue's
 * deck, its list, « Selon la latitude », a game's settings, a game being played.
 */
export type Screen = "deck" | "list" | "latitude" | "setup" | "game";

export interface NavState {
  map: MapMode;
  layer: Layer;
  /** The tab the sheet shows (or comes back to, from a screen or the settings). */
  tab: SheetTab;
  /** The settings page is open in the sheet (⚙). */
  settings: boolean;
  screen: Screen | null;
  /** The time shown is now. */
  live: boolean;
  /** Sensor pointing (Viser) is on. */
  pointing: boolean;
  /** A game was played before: the « Reprendre » card leads the Jeux tab. */
  resumable: boolean;
  /** Constellations were viewed before: « Tes dernières cartes » leads the Catalogue tab. */
  recent: boolean;
  /** The sky map faces north. */
  north: boolean;
}

/** The base screen: the sky map, nothing open, time live. */
export const BASE: NavState = {
  map: "sky",
  layer: "none",
  tab: "sky",
  settings: false,
  screen: null,
  live: true,
  pointing: false,
  resumable: false,
  recent: false,
  north: false,
};

/** The tab of a mode of the map, shown when the sheet opens. */
export const tabOfMap = (map: MapMode): SheetTab => (map === "orbits" ? "orbits" : "sky");

/** Ciel and Orbites are modes of the map; Catalogue and Jeux leave it as it is. */
export const mapOfTab = (tab: SheetTab): MapMode | null =>
  tab === "sky" ? "sky" : tab === "orbits" ? "orbits" : null;

export type Tap =
  /** The bottom-left button: ≡ opens the sheet, × closes it or folds the time line. */
  | { kind: "button" }
  /** A tab of the sheet's foot. */
  | { kind: "tab"; tab: SheetTab }
  /** ⚙ in the sheet's header, and ‹ back from the settings page. */
  | { kind: "settings" }
  | { kind: "settingsBack" }
  /** The « Heure » row (Ciel, Orbites): unfolds the time line from the button. */
  | { kind: "timeRow" }
  /** The date chip next to the button (time not live): unfolds the time line. */
  | { kind: "dateChip" }
  /** ↺ of the date chip: back to now. */
  | { kind: "now" }
  /** The « Viser » chip: turns pointing off. */
  | { kind: "pointingChip" }
  /** Viser among the tools of the Ciel tab. */
  | { kind: "pointingTool" }
  /** The compass, top right of the sky map: the map turns to face north. */
  | { kind: "compass" }
  /** Catalogue: a recent card, « Ouvrir les 88 cartes », « Visibles ce soir », « Selon la latitude ». */
  | { kind: "recentCard" }
  | { kind: "deck" }
  | { kind: "visible" }
  | { kind: "latitude" }
  /** Jeux: « Reprendre » (last game, last settings, ▶ Jouer), a game's tile, « Jouer ». */
  | { kind: "resume" }
  | { kind: "gameTile" }
  | { kind: "play" }
  /** Android or browser back. */
  | { kind: "back" };

/** What the bottom-left button shows and does. */
export type ButtonRole = "open" | "close" | "fold";
export function buttonRole(layer: Layer): ButtonRole {
  return layer === "sheet" ? "close" : layer === "time" ? "fold" : "open";
}

/** Is the bottom-left button on screen? Not over a screen opened from a tab (it has its own way out). */
export function buttonShown(s: NavState): boolean {
  return s.screen === null;
}

/** Is the compass on screen? Over the sky map, always (the sheet's veil may cover it). */
export function compassShown(s: NavState): boolean {
  return s.map === "sky" && s.screen === null;
}

export type Chip = "date" | "pointing";
/** Chips beside the button, when the sheet and the time line are folded. */
export function chips(s: NavState): Chip[] {
  if (s.layer !== "none" || s.screen !== null) return [];
  const out: Chip[] = [];
  if (!s.live) out.push("date");
  if (s.pointing && s.map === "sky") out.push("pointing");
  return out;
}

/** The sheet's home of a tab is shown (not the settings page). */
const home = (s: NavState, tab: SheetTab) => s.layer === "sheet" && !s.settings && s.tab === tab;

/** A screen opened from the home of the tab shown: the sheet closes under it. */
const open = (s: NavState, screen: Screen): NavState => ({ ...s, layer: "none", screen });

/**
 * The state after a tap, or null when that tap is not on screen (nothing to touch there).
 */
export function tap(s: NavState, t: Tap): NavState | null {
  switch (t.kind) {
    case "button":
      if (!buttonShown(s)) return null;
      if (s.layer !== "none") return { ...s, layer: "none", settings: false };
      return { ...s, layer: "sheet", tab: tabOfMap(s.map), settings: false };
    case "tab": {
      if (s.layer !== "sheet") return null;
      const map = mapOfTab(t.tab) ?? s.map;
      return {
        ...s,
        tab: t.tab,
        settings: false,
        map,
        // Pointing drives the sky map only: the Earth view turns it off.
        pointing: map === "sky" ? s.pointing : false,
        north: map === "sky" ? s.north : false,
      };
    }
    case "settings":
      return s.layer === "sheet" && !s.settings ? { ...s, settings: true } : null;
    case "settingsBack":
      return s.layer === "sheet" && s.settings ? { ...s, settings: false } : null;
    case "timeRow":
      return home(s, "sky") || home(s, "orbits") ? { ...s, layer: "time" } : null;
    case "dateChip":
      return chips(s).includes("date") ? { ...s, layer: "time" } : null;
    case "now":
      return chips(s).includes("date") ? { ...s, live: true } : null;
    case "pointingChip":
      return chips(s).includes("pointing") ? { ...s, pointing: false } : null;
    case "pointingTool":
      return home(s, "sky") ? { ...s, layer: "none", pointing: !s.pointing } : null;
    case "compass":
      // Under the sheet the veil takes the tap; while Viser drives the map, it only reads.
      if (!compassShown(s) || s.layer === "sheet" || s.pointing) return null;
      return { ...s, north: true };
    case "recentCard":
      return home(s, "catalogue") && s.recent ? open(s, "deck") : null;
    case "deck":
      return home(s, "catalogue") ? open(s, "deck") : null;
    case "visible":
      return home(s, "catalogue") ? open(s, "list") : null;
    case "latitude":
      return home(s, "catalogue") ? open(s, "latitude") : null;
    case "resume":
      return home(s, "games") && s.resumable ? open(s, "game") : null;
    case "gameTile":
      return home(s, "games") ? open(s, "setup") : null;
    case "play":
      return s.screen === "setup" ? { ...s, screen: "game", resumable: true } : null;
    case "back":
      return back(s);
  }
}

/**
 * Android or browser back: a screen goes back to the home of its tab; the settings page goes back
 * to the tab; then the sheet or the time line closes; then Orbites goes back to the sky; on the
 * base screen it leaves the app (null).
 */
export function back(s: NavState): NavState | null {
  if (s.screen !== null) return { ...s, screen: null, layer: "sheet", settings: false };
  if (s.settings) return { ...s, settings: false };
  if (s.layer !== "none") return { ...s, layer: "none" };
  if (s.map !== "sky") return { ...s, map: "sky" };
  return null;
}

/** Every tap a person can make, to search the shortest ways. */
const ALL_TAPS: Tap[] = [
  { kind: "button" },
  ...SHEET_TABS.map((tab): Tap => ({ kind: "tab", tab })),
  { kind: "settings" },
  { kind: "settingsBack" },
  { kind: "timeRow" },
  { kind: "dateChip" },
  { kind: "now" },
  { kind: "pointingChip" },
  { kind: "pointingTool" },
  { kind: "compass" },
  { kind: "recentCard" },
  { kind: "deck" },
  { kind: "visible" },
  { kind: "latitude" },
  { kind: "resume" },
  { kind: "gameTile" },
  { kind: "play" },
];

/**
 * Fewest taps (Android back not counted as a tap) from `from` to a state where `goal` holds;
 * Infinity when unreachable. Breadth-first over the model above.
 */
export function tapsTo(
  from: NavState,
  goal: (s: NavState) => boolean,
  taps: readonly Tap[] = ALL_TAPS,
): number {
  const key = (s: NavState) => JSON.stringify(s);
  const seen = new Set([key(from)]);
  let frontier = [from];
  for (let depth = 0; frontier.length; depth++) {
    if (frontier.some(goal)) return depth;
    const next: NavState[] = [];
    for (const s of frontier)
      for (const t of taps) {
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

/** The map's mode from the app's state (the Earth view is Orbites). */
export function mapOf(view: "sky" | "space"): MapMode {
  return view === "space" ? "orbits" : "sky";
}

/** The three parts of the settings page (⚙), in order; the last one shown is remembered. */
export const SETTINGS_PARTS = ["display", "place", "app"] as const;
export type SettingsPart = (typeof SETTINGS_PARTS)[number];
export const SETTINGS_PART_KEY = "asteria.menu.settings";
/** Before menu v2, the last tab of the sheet (#138, #176): its settings tabs map to the parts. */
export const LEGACY_PANEL_KEY = "asteria.menu.panel";
export const isSettingsPart = (v: unknown): v is SettingsPart =>
  typeof v === "string" && (SETTINGS_PARTS as readonly string[]).includes(v);

/** The part the settings page opens on: the one remembered, else the old tab's, else Affichage. */
export function initialSettingsPart(saved: unknown, legacy: unknown): SettingsPart {
  if (isSettingsPart(saved)) return saved;
  if (legacy === "place") return "place";
  if (legacy === "settings") return "app";
  return "display";
}

/**
 * Item reached from `current` by a key of a horizontal list (WAI-ARIA tabs pattern, the sheet's
 * tabs and the settings' segments): the arrows move to the previous or next one and wrap around,
 * Home and End go to the first and last ones. Any other key returns null (not handled).
 */
export function itemForKey<T>(items: readonly T[], current: T, key: string): T | null {
  const i = Math.max(0, items.indexOf(current));
  const n = items.length;
  switch (key) {
    case "ArrowRight":
      return items[(i + 1) % n]!;
    case "ArrowLeft":
      return items[(i - 1 + n) % n]!;
    case "Home":
      return items[0]!;
    case "End":
      return items[n - 1]!;
    default:
      return null;
  }
}
