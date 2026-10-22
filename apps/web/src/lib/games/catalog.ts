/**
 * The games of the Jeux screen (#163). Each one asks about items of one kind and shares the
 * progress of those items; a game not built yet is listed as « bientôt ». Texts:
 * i18n keys `games.<id>.title` and `games.<id>.hint`.
 */
import type { ItemKind } from "./progress";

export interface GameEntry {
  id: string;
  /** Items the game asks about (and whose memory it updates). */
  items: ItemKind;
  available: boolean;
  /** Rounds in a series (the record is out of this). */
  length: number;
  /** Ticket of a game to come. */
  ticket?: number;
  /** Scored in points (#184), not in right answers: the record reads « N points ». */
  points?: boolean;
}

export const GAMES: readonly GameEntry[] = [
  { id: "whichConstellation", items: "con", available: true, length: 10 },
  // « Où est-elle ? » (#184) replaces « Relie les étoiles » (#164): its stored stats are ignored.
  { id: "whereIsIt", items: "con", available: true, length: 10, points: true },
  { id: "nameStar", items: "star", available: true, length: 10 },
];
