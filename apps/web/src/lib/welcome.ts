/**
 * First-launch welcome (#207): a sheet over tonight's sky (place, then level), then three gesture
 * hints on the map (drag, pinch, tap a star). Shown once, on the very first launch only.
 *
 * The rule, decided before the app writes anything to the device:
 * - a welcome record is stored (`asteria.welcome`, versioned): never again, whatever it says
 *   (shown and interrupted, done, skipped, put off, or a returning user);
 * - no record, but other `asteria.` keys: someone who used the app before the welcome existed
 *   (every launch writes at least `asteria.night`); they are not welcomed, and a « returning »
 *   record says so for the next launches;
 * - nothing stored: a fresh install; the record is written as « shown » at once, so closing the
 *   app in the middle does not bring the welcome back;
 * - storage unavailable: not shown (it could not be remembered, and would come back each time).
 *
 * `?welcome=1` shows it anyway, `?welcome=0` never (captures). An automated browser (Playwright,
 * `navigator.webdriver`) does not see it unless `?welcome=1` or `?welcome=auto` (the real rule),
 * so the other screens' captures stay as they are.
 */

export const WELCOME_KEY = "asteria.welcome";
/** Prefix of every key the app stores (lib/storage, lib/level, games…). */
export const APP_KEY_PREFIX = "asteria.";

export type WelcomeOutcome =
  /** On screen (or interrupted): a first launch already used. */
  | "shown"
  /** Sheet and gestures gone through. */
  | "done"
  /** « Passer » on the sheet. */
  | "skipped"
  /** « Plus tard » on a gesture hint. */
  | "later"
  /** Used the app before the welcome existed. */
  | "returning";

export interface WelcomeRecord {
  version: 1;
  outcome: WelcomeOutcome;
  /** When it was written (ISO 8601). */
  at: string;
}

const OUTCOMES: readonly WelcomeOutcome[] = ["shown", "done", "skipped", "later", "returning"];

export const isWelcomeRecord = (v: unknown): v is WelcomeRecord =>
  typeof v === "object" &&
  v !== null &&
  (v as WelcomeRecord).version === 1 &&
  OUTCOMES.includes((v as WelcomeRecord).outcome) &&
  typeof (v as WelcomeRecord).at === "string";

type Store = Pick<Storage, "getItem" | "setItem" | "key" | "length">;

function write(store: Store, outcome: WelcomeOutcome, now: Date): void {
  const record: WelcomeRecord = { version: 1, outcome, at: now.toISOString() };
  store.setItem(WELCOME_KEY, JSON.stringify(record));
}

/** Whether the device keeps something the app stored, other than the welcome record. */
export function usedBefore(store: Store): boolean {
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null && key !== WELCOME_KEY && key.startsWith(APP_KEY_PREFIX)) return true;
  }
  return false;
}

export interface LaunchContext {
  /** `?welcome=` of the address. */
  param: string | null;
  /** An automated browser (`navigator.webdriver`). */
  automated: boolean;
  now: Date;
}

/**
 * Whether this launch shows the welcome. Call it once, before anything is stored: it reads the
 * device and writes the record (« shown » or « returning »).
 */
export function welcomeOnLaunch(store: Store | null, o: LaunchContext): boolean {
  if (o.param === "1") return true;
  if (o.param === "0") return false;
  if (o.automated && o.param !== "auto") return false;
  if (!store) return false;
  try {
    const raw = store.getItem(WELCOME_KEY);
    if (raw !== null) {
      // Any record, even one this version cannot read (a later version), means « seen ».
      return false;
    }
    if (usedBefore(store)) {
      write(store, "returning", o.now);
      return false;
    }
    write(store, "shown", o.now);
    // Not remembered (storage full, blocked writes): better not shown than shown each time.
    return store.getItem(WELCOME_KEY) !== null;
  } catch {
    return false;
  }
}

/** Records how the welcome ended (it never comes back either way). */
export function endWelcome(store: Store | null, outcome: WelcomeOutcome, now = new Date()): void {
  try {
    if (store) write(store, outcome, now);
  } catch {
    // not persisted: the « shown » record already keeps it from coming back
  }
}

// --- Steps.

export type GestureHint = "drag" | "pinch" | "tap";
export const GESTURE_HINTS: readonly GestureHint[] = ["drag", "pinch", "tap"];
/** The sheet's steps, then the hints on the map, one after the other. */
export type WelcomeStep = "place" | "level" | GestureHint | "end";
export const SHEET_STEPS = ["place", "level"] as const;

export type WelcomeEvent =
  /** « Plus tard (Paris) », a position found, « Voir le ciel ». */
  | { type: "next" }
  /** « Passer » on the sheet (or Escape). */
  | { type: "skip" }
  /** « Plus tard » on a gesture hint. */
  | { type: "later" }
  /** A gesture actually made on the map. */
  | { type: "gesture"; gesture: GestureHint };

export interface WelcomeState {
  step: WelcomeStep;
  /** Set when the welcome is over. */
  outcome: Exclude<WelcomeOutcome, "shown" | "returning"> | null;
}

export const WELCOME_START: WelcomeState = { step: "place", outcome: null };

const ORDER: readonly WelcomeStep[] = ["place", "level", ...GESTURE_HINTS, "end"];

export const isSheetStep = (s: WelcomeStep): s is (typeof SHEET_STEPS)[number] =>
  s === "place" || s === "level";
export const isGestureStep = (s: WelcomeStep): s is GestureHint =>
  (GESTURE_HINTS as readonly string[]).includes(s);

function advance(step: WelcomeStep): WelcomeState {
  const next = ORDER[ORDER.indexOf(step) + 1] ?? "end";
  return { step: next, outcome: next === "end" ? "done" : null };
}

/**
 * The welcome's next state. A gesture counts only for its own hint (pinching during « Glisse »
 * does not skip it); « Passer » belongs to the sheet, « Plus tard » to the hints.
 */
export function welcomeReduce(state: WelcomeState, e: WelcomeEvent): WelcomeState {
  if (state.step === "end") return state;
  switch (e.type) {
    case "next":
      return isSheetStep(state.step) ? advance(state.step) : state;
    case "skip":
      return isSheetStep(state.step) ? { step: "end", outcome: "skipped" } : state;
    case "later":
      return isGestureStep(state.step) ? { step: "end", outcome: "later" } : state;
    case "gesture":
      return state.step === e.gesture ? advance(state.step) : state;
  }
}

// --- Gestures made on the map.

export interface ViewSample {
  /** Degrees. */
  azimuth: number;
  altitude: number;
  /** Field of view, degrees. */
  fov: number;
}

/** The sky moved by at least this much (centre of the view, degrees on the sphere). */
export const DRAG_MIN_DEG = 10;
/** The field changed by at least this factor (in or out). */
export const PINCH_MIN_RATIO = 1.25;

const RAD = Math.PI / 180;

/** Angle between the centres of two views, degrees. */
export function viewSeparation(a: ViewSample, b: ViewSample): number {
  const cos =
    Math.sin(a.altitude * RAD) * Math.sin(b.altitude * RAD) +
    Math.cos(a.altitude * RAD) *
      Math.cos(b.altitude * RAD) *
      Math.cos((b.azimuth - a.azimuth) * RAD);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / RAD;
}

/** The view went from `from` to `to`: is it the hint's gesture? (Tapping a star is a selection.) */
export function gestureMade(hint: GestureHint, from: ViewSample, to: ViewSample): boolean {
  if (hint === "drag") return viewSeparation(from, to) >= DRAG_MIN_DEG;
  if (hint === "pinch")
    return Math.abs(Math.log(to.fov / from.fov)) >= Math.log(PINCH_MIN_RATIO) - 1e-9;
  return false;
}
