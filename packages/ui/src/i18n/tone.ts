/**
 * Tone of the French texts (#198, docs/TONE.md): Asteria says « tu ». This finds what says
 * « vous »: the pronoun and its possessives, and the verbs in « -ez » (imperative or present of
 * « vous » : « Touchez », « Autorisez-les », « aurez-vous »).
 */

/** Words in « -ez » that are not a verb of « vous ». Add to it rather than turning a test off. */
const NOT_A_VERB = new Set(["chez", "assez", "nez", "rez", "suez"]);
const PRONOUNS = new Set(["vous", "votre", "vos", "vôtre", "vôtres"]);

export interface ToneOptions {
  /**
   * Leaves out passages between French quotes « … » (an old text quoted word for word may say
   * « vous »). For editorial content only: an interface text in quotes is still the app talking.
   */
  skipQuotes?: boolean;
}

/** The words of `text` that address the reader as « vous » (empty when the text says « tu »). */
export function vouvoiement(text: string, options: ToneOptions = {}): string[] {
  const source = options.skipQuotes ? text.replace(/«[^»]*»/gu, " ") : text;
  const found: string[] = [];
  for (const [word] of source.matchAll(/\p{L}+(?:[-’']\p{L}+)*/gu)) {
    for (const part of word.toLowerCase().split(/[-’']/u)) {
      if (PRONOUNS.has(part) || (part.endsWith("ez") && !NOT_A_VERB.has(part))) {
        found.push(word);
        break;
      }
    }
  }
  return found;
}
