/**
 * « Voir ce soir » (#198): by day the map's banner jumps to the coming dark night (astro-core
 * nextDarkNight: the Sun at −18°, or the darkest moment of a light summer night).
 */
const STEP_MS = 5 * 60_000;

export interface NightJump {
  /** Where the time goes: the night's start rounded up to 5 minutes (so that it is dark). */
  at: Date;
  /** « ce soir » when it falls in the evening of the day shown, else « cette nuit ». */
  when: "tonight" | "night";
}

/** The jump to a night starting at `start`, seen from the date shown `from` (local time). */
export function nightJump(start: Date, from: Date): NightJump {
  const at = new Date(Math.ceil(start.getTime() / STEP_MS) * STEP_MS);
  const sameDay = at.toDateString() === from.toDateString();
  return { at, when: sameDay && at.getHours() >= 12 ? "tonight" : "night" };
}
