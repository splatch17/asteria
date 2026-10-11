import { describe, expect, it } from "vitest";
import fr from "@asteria/ui/locales/fr.json";
import { MENU_PANELS, isMenuPanel, tabForKey } from "./menu";

describe("menu panels (#138)", () => {
  it("offers Vue, Affichage, Lieu et temps and Réglages, in that order", () => {
    expect(MENU_PANELS).toEqual(["view", "display", "place", "settings"]);
  });

  it("restores only a known panel from storage", () => {
    expect(isMenuPanel("display")).toBe(true);
    expect(isMenuPanel("more")).toBe(false);
    expect(isMenuPanel(2)).toBe(false);
    expect(isMenuPanel(null)).toBe(false);
  });

  it("moves between tabs with the arrows, wrapping around, and Home/End", () => {
    expect(tabForKey("view", "ArrowRight")).toBe("display");
    expect(tabForKey("settings", "ArrowRight")).toBe("view");
    expect(tabForKey("view", "ArrowLeft")).toBe("settings");
    expect(tabForKey("place", "ArrowLeft")).toBe("display");
    expect(tabForKey("place", "Home")).toBe("view");
    expect(tabForKey("view", "End")).toBe("settings");
  });

  it("leaves other keys to the browser (Tab, Enter, vertical arrows)", () => {
    for (const key of ["Tab", "Enter", " ", "ArrowDown", "ArrowUp", "a"]) {
      expect(tabForKey("display", key)).toBeNull();
    }
  });

  it("has a French label for every tab", () => {
    const messages = fr as Record<string, string>;
    for (const id of MENU_PANELS) {
      expect(messages[`menu.section.${id === "place" ? "placeTime" : id}`], id).toBeTruthy();
    }
  });
});
