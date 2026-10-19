/**
 * The games of the Jeux screen (#163). Each one asks about items of one kind and shares the
 * progress of those items; a game not built yet is listed as « bientôt » (#164, #165). Texts:
 * i18n keys `games.<id>.title` and `games.<id>.hint`.
 */
import type { ItemKind } from "./progress";

export interface GameEntry {
  id: string;
  /** Items the game asks about (and whose memory it updates). */
  items: ItemKind;
  available: boolean;
  /** Ticket of a game to come. */
  ticket?: number;
}

export const GAMES: readonly GameEntry[] = [
  { id: "whichConstellation", items: "con", available: true },
  { id: "connectStars", items: "con", available: false, ticket: 164 },
  { id: "nameStar", items: "star", available: false, ticket: 165 },
];
