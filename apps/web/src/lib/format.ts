/** Sexagesimal formatting used in data panels (scientific notation, not translated). */
export function formatRa(deg: number): string {
  const h = deg / 15;
  const m = (h % 1) * 60;
  const s = (m % 1) * 60;
  return `${pad(Math.floor(h))}h ${pad(Math.floor(m))}m ${s.toFixed(1).padStart(4, "0")}s`;
}

export function formatDec(deg: number): string {
  const a = Math.abs(deg);
  const m = (a % 1) * 60;
  const s = (m % 1) * 60;
  return `${deg < 0 ? "−" : "+"}${pad(Math.floor(a))}° ${pad(Math.floor(m))}′ ${pad(Math.round(s) % 60)}″`;
}

/** Parallax in milliarcseconds → distance in light-years (1 pc = 3.26156 ly). */
export function parallaxToLightYears(plx: number | undefined): number | null {
  return plx && plx > 0 ? (1000 / plx) * 3.26156 : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
