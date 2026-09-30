import { addMessages, init } from "svelte-i18n";
import fr from "./locales/fr.json";

export const SUPPORTED_LOCALES = ["fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Registers catalogues. Adding a language = adding locales/<lang>.json + one line here (ADR-0002). */
export function setupI18n(initialLocale: Locale = "fr"): void {
  addMessages("fr", fr);
  init({ fallbackLocale: "fr", initialLocale });
}

export { _, locale, number, date } from "svelte-i18n";
