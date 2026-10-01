/** Night-vision red (#ff2a1a) scaled by a brightness factor in [MIN_DIM, 1]. */
export const MIN_DIM = 0.15;

export function nightInk(brightness: number): string {
  const k = Math.min(1, Math.max(MIN_DIM, brightness));
  const [r, g, b] = [255, 42, 26].map((c) => Math.round(c * k));
  return `#${[r, g, b].map((c) => c!.toString(16).padStart(2, "0")).join("")}`;
}
