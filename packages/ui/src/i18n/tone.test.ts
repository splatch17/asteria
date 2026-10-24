import { describe, expect, it } from "vitest";
import fr from "./locales/fr.json";
import { vouvoiement } from "./tone";

/**
 * Keys allowed to say « vous » (e.g. an old text quoted word for word), each with its reason.
 * Empty: every interface text says « tu » (docs/TONE.md).
 */
const ALLOWED: Readonly<Record<string, string>> = {};

describe("tone (#198)", () => {
  it("finds the forms of « vous »", () => {
    expect(vouvoiement("Touchez le ciel")).toEqual(["Touchez"]);
    expect(vouvoiement("Autorisez-les, puis rechargez.")).toEqual(["Autorisez-les", "rechargez"]);
    expect(vouvoiement("À vous de jouer : aurez-vous des yeux de lynx ?")).toEqual([
      "vous",
      "aurez-vous",
    ]);
    expect(vouvoiement("Vos réglages, votre ciel")).toEqual(["Vos", "votre"]);
  });

  it("lets « tu » and words in -ez that are not verbs through", () => {
    expect(vouvoiement("Touche le ciel pour la retrouver")).toEqual([]);
    expect(vouvoiement("Visibles de chez moi, assez haut, sous le nez")).toEqual([]);
  });

  it("skips quoted passages only when asked", () => {
    const text = "Le poète écrit : « Levez les yeux ». Lève les yeux.";
    expect(vouvoiement(text)).toEqual(["Levez"]);
    expect(vouvoiement(text, { skipQuotes: true })).toEqual([]);
  });

  it("no French interface text says « vous »", () => {
    const offending = Object.entries(fr as Record<string, string>)
      .filter(([key]) => !(key in ALLOWED))
      .map(([key, text]) => [key, vouvoiement(text)] as const)
      .filter(([, words]) => words.length > 0);
    expect(offending).toEqual([]);
  });
});
