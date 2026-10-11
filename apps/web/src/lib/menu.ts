/**
 * Menu in separate panels (#138): one short panel at a time, picked from a row of tabs at the top
 * of the menu. Kept free of the DOM so that it can be tested.
 */
import type { IconName } from "./icons";

export const MENU_PANELS = ["view", "display", "place", "settings"] as const;
export type MenuPanel = (typeof MENU_PANELS)[number];

/** Pictogram of each tab (its label is the i18n key `menu.tab.<id>`). */
export const MENU_PANEL_ICONS: Record<MenuPanel, IconName> = {
  view: "eye",
  display: "layers",
  place: "placeTime",
  settings: "settings",
};

/** Last panel shown, remembered on the device. */
export const MENU_PANEL_KEY = "asteria.menu.panel";
export const isMenuPanel = (v: unknown): v is MenuPanel =>
  typeof v === "string" && (MENU_PANELS as readonly string[]).includes(v);

/**
 * Tab reached from `current` by a key of the (horizontal) tab list, WAI-ARIA tabs pattern: the
 * left and right arrows move to the previous or next tab and wrap around, Home and End go to the
 * first and last ones. Any other key returns null (not handled).
 */
export function tabForKey(current: MenuPanel, key: string): MenuPanel | null {
  const i = MENU_PANELS.indexOf(current);
  const n = MENU_PANELS.length;
  switch (key) {
    case "ArrowRight":
      return MENU_PANELS[(i + 1) % n]!;
    case "ArrowLeft":
      return MENU_PANELS[(i - 1 + n) % n]!;
    case "Home":
      return MENU_PANELS[0];
    case "End":
      return MENU_PANELS[n - 1]!;
    default:
      return null;
  }
}
