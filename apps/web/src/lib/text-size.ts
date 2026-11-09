/**
 * « Taille du texte » (audit P5): one preference for the whole app, set in Réglages › Appli. It
 * scales the small steps of the type scale (`--ast-text-scale` in tokens.css: labels, interface
 * text, reading text) and the names drawn on the sky maps; the display titles keep their size.
 * Stored as a versioned record, as the level (lib/level.ts).
 */
export type TextSize = "normal" | "large" | "larger";

export const TEXT_SIZES: readonly TextSize[] = ["normal", "large", "larger"];
export const DEFAULT_TEXT_SIZE: TextSize = "normal";
export const TEXT_SIZE_KEY = "asteria.prefs.textSize";

/** Multiplier of the type scale. « Normal » already keeps every text at 11 px or more. */
export const TEXT_SCALE: Readonly<Record<TextSize, number>> = {
  normal: 1,
  large: 1.15,
  larger: 1.3,
};

/**
 * Names on the sky maps (canvas): drawn 10 % larger than their historical sizes (9 to 13 px), so
 * a star's name is 11 px at « Normal », then with the preference.
 */
export const MAP_LABEL_BASE = 1.1;
export const mapLabelScale = (size: TextSize): number => MAP_LABEL_BASE * TEXT_SCALE[size];

export const isTextSize = (v: unknown): v is TextSize =>
  v === "normal" || v === "large" || v === "larger";

export interface TextSizePref {
  version: 1;
  size: TextSize;
}

export const isTextSizePref = (v: unknown): v is TextSizePref =>
  typeof v === "object" &&
  v !== null &&
  (v as TextSizePref).version === 1 &&
  isTextSize((v as TextSizePref).size);

type Store = Pick<Storage, "getItem" | "setItem">;

/** The stored size; the default when there is none, it is unreadable or storage is unavailable. */
export function loadTextSize(store: Store | null): TextSize {
  if (!store) return DEFAULT_TEXT_SIZE;
  try {
    const raw = store.getItem(TEXT_SIZE_KEY);
    const saved: unknown = raw === null ? null : JSON.parse(raw);
    return isTextSizePref(saved) ? saved.size : DEFAULT_TEXT_SIZE;
  } catch {
    return DEFAULT_TEXT_SIZE;
  }
}

export function saveTextSize(store: Store | null, size: TextSize): void {
  const pref: TextSizePref = { version: 1, size };
  try {
    store?.setItem(TEXT_SIZE_KEY, JSON.stringify(pref));
  } catch {
    // not persisted: acceptable
  }
}
