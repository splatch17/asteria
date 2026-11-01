import { describe, expect, it } from "vitest";
import { BASE, back, buttonRole, buttonShown, chips, modeOf, tap, tapsTo, type NavState } from "./modes";

describe("modes and the single button (#176, A′1)", () => {
  it("reaches Apprendre in 2 taps from the sky: the button, then the mode", () => {
    expect(tapsTo(BASE, (s) => s.mode === "learn" && s.learn === "hub")).toBe(2);
  });

  it("reaches a game in 3 taps once one was played (« Reprendre »), 4 the first time", () => {
    const played: NavState = { ...BASE, resumable: true };
    expect(tapsTo(played, (s) => s.learn === "game")).toBe(3);
    // The first time: button, Apprendre, the game's card, « Jouer ».
    expect(tapsTo(BASE, (s) => s.learn === "game")).toBe(4);
  });

  it("unfolds the time line in 2 taps (button, « Heure »), 1 from the date chip", () => {
    expect(tapsTo(BASE, (s) => s.layer === "time")).toBe(2);
    expect(tapsTo({ ...BASE, live: false }, (s) => s.layer === "time")).toBe(1);
  });

  it("goes back to now in 1 tap (↺ of the date chip)", () => {
    expect(tapsTo({ ...BASE, live: false }, (s) => s.live)).toBe(1);
  });

  it("turns pointing off in 1 tap (the « Viser » chip), on in 2", () => {
    expect(tapsTo({ ...BASE, pointing: true }, (s) => !s.pointing)).toBe(1);
    expect(tapsTo(BASE, (s) => s.pointing)).toBe(2);
  });

  it("goes back to the sky from Orbites or Apprendre in 2 taps (button › Observer)", () => {
    const orbits: NavState = { ...BASE, mode: "orbits" };
    const learn: NavState = { ...BASE, mode: "learn", learn: "hub" };
    for (const from of [orbits, learn])
      expect(tapsTo(from, (s) => s.mode === "observe" && s.layer === "none")).toBe(2);
  });

  it("turns the button into « × Fermer » in the sheet and into a fold in the time line", () => {
    expect(buttonRole("none")).toBe("open");
    expect(buttonRole("sheet")).toBe("close");
    expect(buttonRole("time")).toBe("fold");
    const sheet = tap(BASE, { kind: "button" })!;
    expect(sheet.layer).toBe("sheet");
    expect(tap(sheet, { kind: "button" })!.layer).toBe("none");
    const time = tap(sheet, { kind: "timeRow" })!;
    expect(tap(time, { kind: "button" })!.layer).toBe("none");
  });

  it("shows chips only for what is not as usual, and never over the sheet or a game", () => {
    expect(chips(BASE)).toEqual([]);
    expect(chips({ ...BASE, live: false, pointing: true })).toEqual(["date", "pointing"]);
    expect(chips({ ...BASE, live: false, layer: "sheet" })).toEqual([]);
    expect(chips({ ...BASE, mode: "orbits", live: false, pointing: true })).toEqual(["date"]);
    expect(chips({ ...BASE, mode: "learn", learn: "hub", live: false })).toEqual([]);
  });

  it("keeps the button over the Apprendre home but not over a game", () => {
    expect(buttonShown({ ...BASE, mode: "learn", learn: "hub" })).toBe(true);
    expect(buttonShown({ ...BASE, mode: "learn", learn: "game" })).toBe(false);
  });

  it("closes the top layer on back, then returns to the sky, then leaves", () => {
    const game: NavState = { ...BASE, mode: "learn", learn: "game" };
    expect(back(game)).toEqual({ ...game, learn: "hub" });
    expect(back({ ...game, learn: "hub" })).toEqual({ ...BASE });
    expect(back({ ...BASE, layer: "time" })).toEqual(BASE);
    expect(back({ ...BASE, mode: "orbits" })).toEqual(BASE);
    expect(back(BASE)).toBeNull();
  });

  it("turns pointing off when leaving Observer", () => {
    const sheet: NavState = { ...BASE, pointing: true, layer: "sheet" };
    expect(tap(sheet, { kind: "mode", mode: "orbits" })!.pointing).toBe(false);
  });

  it("reads the mode from the app's state", () => {
    expect(modeOf("sky", false)).toBe("observe");
    expect(modeOf("space", false)).toBe("orbits");
    expect(modeOf("space", true)).toBe("learn");
  });
});
