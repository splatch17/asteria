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
  type TextSize,
} from "./text-size";

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function apply(size: TextSize): void {
  document.documentElement.style.setProperty("--ast-text-scale", String(TEXT_SCALE[size]));
  setLabelScale(mapLabelScale(size));
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
