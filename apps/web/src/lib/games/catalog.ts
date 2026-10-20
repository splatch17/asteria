/**
 * The games of the Jeux screen (#163). Each one asks about items of one kind and shares the
 * progress of those items; a game not built yet is listed as « bientôt » (#165). Texts:
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
}

export const GAMES: readonly GameEntry[] = [
  { id: "whichConstellation", items: "con", available: true, length: 10 },
  { id: "connectStars", items: "con", available: true, length: 5 },
  { id: "nameStar", items: "star", available: false, length: 10, ticket: 165 },
];
