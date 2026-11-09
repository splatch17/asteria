import { describe, expect, it } from "vitest";
import fr from "@asteria/ui/locales/fr.json";
import {
  BASE,
  SETTINGS_PARTS,
  SHEET_TABS,
  back,
  buttonRole,
  buttonShown,
  chips,
  compassShown,
  initialSettingsPart,
  isSheetTab,
  itemForKey,
  mapOf,
  tap,
  tapsTo,
  type NavState,
} from "./modes";

const sheet = (tab: NavState["tab"], extra: Partial<NavState> = {}): NavState => ({
  ...BASE,
  layer: "sheet",
  tab,
  ...extra,
});

describe("menu v2: tabs as destinations, settings apart, permanent compass", () => {
  it("offers Ciel, Orbites, Catalogue and Jeux, in that order, each with a label", () => {
    expect(SHEET_TABS).toEqual(["sky", "orbits", "catalogue", "games"]);
    const messages = fr as Record<string, string>;
    for (const tab of SHEET_TABS) expect(messages[`tabs.${tab}`], tab).toBeTruthy();
    for (const part of SETTINGS_PARTS) expect(messages[`settings.part.${part}`], part).toBeTruthy();
    expect(isSheetTab("games")).toBe(true);
    expect(isSheetTab("learn")).toBe(false);
  });

  it("reaches the Catalogue in 2 taps, a recent card in 3, the deck in 3", () => {
    expect(tapsTo(BASE, (s) => s.layer === "sheet" && s.tab === "catalogue")).toBe(2);
    const viewed: NavState = { ...BASE, recent: true };
    // Button, Catalogue, the card (or « Ouvrir les 88 cartes »).
    expect(tapsTo(viewed, (s) => s.screen === "deck")).toBe(3);
    expect(tapsTo(BASE, (s) => s.screen === "deck")).toBe(3);
    expect(tap(sheet("catalogue"), { kind: "recentCard" })).toBeNull(); // nothing viewed yet
  });

  it("reaches Jeux in 2 taps, a game in 3 once one was played (« Reprendre »), 4 the first time", () => {
    expect(tapsTo(BASE, (s) => s.layer === "sheet" && s.tab === "games")).toBe(2);
    expect(tapsTo({ ...BASE, resumable: true }, (s) => s.screen === "game")).toBe(3);
    // The first time: button, Jeux, the game's tile, « Jouer ».
    expect(tapsTo(BASE, (s) => s.screen === "game")).toBe(4);
  });

  it("switches the map to Orbites in 2 taps, the sheet staying open on its tab", () => {
    expect(tapsTo(BASE, (s) => s.map === "orbits")).toBe(2);
    const orbits = tap(sheet("sky"), { kind: "tab", tab: "orbits" })!;
    expect(orbits).toMatchObject({ map: "orbits", layer: "sheet", tab: "orbits" });
  });

  it("leaves the map as it is on the Catalogue and Jeux tabs", () => {
    const from = sheet("orbits", { map: "orbits" });
    for (const tab of ["catalogue", "games"] as const)
      expect(tap(from, { kind: "tab", tab })!.map).toBe("orbits");
  });

  it("reaches the settings in 2 taps (button, ⚙), from any tab, and ‹ returns to the tab", () => {
    expect(tapsTo(BASE, (s) => s.settings)).toBe(2);
    for (const tab of SHEET_TABS) {
      const settings = tap(sheet(tab), { kind: "settings" })!;
      expect(settings).toMatchObject({ settings: true, tab });
      expect(tap(settings, { kind: "settingsBack" })).toEqual(sheet(tab));
    }
  });

  it("unfolds the time line in 2 taps (button, « Heure »), 1 from the date chip", () => {
    expect(tapsTo(BASE, (s) => s.layer === "time")).toBe(2);
    expect(tapsTo({ ...BASE, live: false }, (s) => s.layer === "time")).toBe(1);
    expect(tap(sheet("orbits", { map: "orbits" }), { kind: "timeRow" })!.layer).toBe("time");
    expect(tap(sheet("catalogue"), { kind: "timeRow" })).toBeNull();
  });

  it("goes back to now in 1 tap (↺ of the date chip)", () => {
    expect(tapsTo({ ...BASE, live: false }, (s) => s.live)).toBe(1);
  });

  it("turns the map north up in 1 tap (the compass), not while Viser drives it", () => {
    expect(tapsTo(BASE, (s) => s.north)).toBe(1);
    expect(tap({ ...BASE, pointing: true }, { kind: "compass" })).toBeNull();
    // Under the sheet the veil takes the tap; in the Earth view there is no compass.
    expect(tap(sheet("sky"), { kind: "compass" })).toBeNull();
    expect(compassShown({ ...BASE, map: "orbits" })).toBe(false);
    expect(compassShown(BASE)).toBe(true);
    expect(compassShown({ ...BASE, layer: "time", live: false })).toBe(true);
  });

  it("turns pointing off in 1 tap (the « Viser » chip), on in 2 (button, Viser)", () => {
    expect(tapsTo({ ...BASE, pointing: true }, (s) => !s.pointing)).toBe(1);
    expect(tapsTo(BASE, (s) => s.pointing)).toBe(2);
  });

  it("opens the sheet on the tab of the map's mode", () => {
    expect(tap(BASE, { kind: "button" })!.tab).toBe("sky");
    expect(tap({ ...BASE, map: "orbits", tab: "games" }, { kind: "button" })!.tab).toBe("orbits");
  });

  it("goes back to the sky from Orbites in 2 taps (button › Ciel)", () => {
    const orbits: NavState = { ...BASE, map: "orbits" };
    expect(tapsTo(orbits, (s) => s.map === "sky" && s.layer === "none")).toBe(3);
    expect(tapsTo(orbits, (s) => s.map === "sky")).toBe(2);
  });

  it("turns the button into « × Fermer » in the sheet and into a fold in the time line", () => {
    expect(buttonRole("none")).toBe("open");
    expect(buttonRole("sheet")).toBe("close");
    expect(buttonRole("time")).toBe("fold");
    const open = tap(BASE, { kind: "button" })!;
    expect(open.layer).toBe("sheet");
    expect(tap(open, { kind: "button" })!.layer).toBe("none");
    expect(tap({ ...open, settings: true }, { kind: "button" })).toMatchObject({
      layer: "none",
      settings: false,
    });
    const time = tap(open, { kind: "timeRow" })!;
    expect(tap(time, { kind: "button" })!.layer).toBe("none");
  });

  it("shows chips only for what is not as usual, never over the sheet or a screen", () => {
    expect(chips(BASE)).toEqual([]);
    expect(chips({ ...BASE, live: false, pointing: true })).toEqual(["date", "pointing"]);
    expect(chips({ ...BASE, live: false, layer: "sheet" })).toEqual([]);
    expect(chips({ ...BASE, map: "orbits", live: false, pointing: true })).toEqual(["date"]);
    expect(chips({ ...BASE, screen: "game", live: false })).toEqual([]);
  });

  it("hides the button over a screen opened from a tab (it has its own way out)", () => {
    expect(buttonShown({ ...BASE, screen: "deck" })).toBe(false);
    expect(buttonShown(BASE)).toBe(true);
  });

  it("goes back from a screen to its tab, from the settings to the tab, then closes, then leaves", () => {
    const game: NavState = { ...BASE, tab: "games", screen: "game" };
    expect(back(game)).toEqual(sheet("games"));
    const deck: NavState = { ...BASE, tab: "catalogue", screen: "deck" };
    expect(back(deck)).toEqual(sheet("catalogue"));
    expect(back(sheet("catalogue", { settings: true }))).toEqual(sheet("catalogue"));
    expect(back(sheet("catalogue"))).toEqual({ ...BASE, tab: "catalogue" });
    expect(back({ ...BASE, layer: "time" })).toEqual(BASE);
    expect(back({ ...BASE, map: "orbits" })).toEqual(BASE);
    expect(back(BASE)).toBeNull();
  });

  it("turns pointing off when the map goes to Orbites", () => {
    const from = sheet("sky", { pointing: true });
    expect(tap(from, { kind: "tab", tab: "orbits" })!.pointing).toBe(false);
    expect(tap(from, { kind: "tab", tab: "games" })!.pointing).toBe(true);
  });

  it("reads the map's mode from the app's state", () => {
    expect(mapOf("sky")).toBe("sky");
    expect(mapOf("space")).toBe("orbits");
  });

  it("opens the settings on the part remembered, or the one of the old tabs", () => {
    expect(initialSettingsPart("place", "display")).toBe("place");
    expect(initialSettingsPart(null, "settings")).toBe("app");
    expect(initialSettingsPart(null, "place")).toBe("place");
    expect(initialSettingsPart(null, "view")).toBe("display");
    expect(initialSettingsPart("nope", null)).toBe("display");
  });

  it("moves along tabs and segments with the arrows, wrapping around, and Home/End", () => {
    expect(itemForKey(SHEET_TABS, "sky", "ArrowRight")).toBe("orbits");
    expect(itemForKey(SHEET_TABS, "games", "ArrowRight")).toBe("sky");
    expect(itemForKey(SHEET_TABS, "sky", "ArrowLeft")).toBe("games");
    expect(itemForKey(SHEET_TABS, "catalogue", "Home")).toBe("sky");
    expect(itemForKey(SETTINGS_PARTS, "display", "End")).toBe("app");
    for (const key of ["Tab", "Enter", " ", "ArrowDown", "a"])
      expect(itemForKey(SHEET_TABS, "orbits", key)).toBeNull();
  });
});
