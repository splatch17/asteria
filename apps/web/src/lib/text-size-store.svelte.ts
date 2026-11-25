/**
 * The app's text size, shared by every screen: `textSize.value` follows the preference,
 * `textSize.set()` changes it everywhere at once (the type scale of the page and the names of
 * every sky map) and saves it. `?text=` (captures) takes precedence and is then not saved.
 */
import { setLabelScale } from "@asteria/sky-renderer";
import {
  isTextSize,
  loadTextSize,
  mapLabelScale,
  saveTextSize,
  TEXT_SCALE,
  WIDE_SCREEN,
  WIDE_SCREEN_SCALE,
  type TextSize,
} from "./text-size";

/** The large-screen query; null where matchMedia is missing (tests, old engines). */
const wide = typeof matchMedia === "function" ? matchMedia(WIDE_SCREEN) : null;

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function apply(size: TextSize): void {
  document.documentElement.style.setProperty("--ast-text-scale", String(TEXT_SCALE[size]));
  setLabelScale(mapLabelScale(size) * (wide?.matches ? WIDE_SCREEN_SCALE : 1));
}

class TextSizeStore {
  #size = $state<TextSize>(loadTextSize(storage()));
  #fromUrl = false;

  constructor() {
    const fromUrl = new URLSearchParams(location.search).get("text");
    if (isTextSize(fromUrl)) {
      this.#size = fromUrl;
      this.#fromUrl = true;
    }
    apply(this.#size);
    // The window resized across the large-screen limit: the map names follow the page.
    wide?.addEventListener("change", () => apply(this.#size));
  }

  get value(): TextSize {
    return this.#size;
  }

  set(size: TextSize): void {
    this.#size = size;
    apply(size);
    if (!this.#fromUrl) saveTextSize(storage(), size);
  }
}

export const textSize = new TextSizeStore();
