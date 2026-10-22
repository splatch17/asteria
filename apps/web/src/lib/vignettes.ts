/**
 * Vignettes of the Apprendre screen (#185): a tiny sky per card, drawn in the house 1-bit style
 * (ART_DIRECTION.md §3), no image file. Each vignette is a 40×40 pixel grid:
 * - a ground of ink dithered with the shaders' Bayer 8×8 matrix (a Milky Way band, a planisphere's
 *   shading, the ground below a horizon), in three nested densities so that the card can reveal
 *   it the way the figures appear, the dots of the screen growing denser;
 * - stars as whole pixels (a dot, a cross, a four-pointed sparkle);
 * - thin vector lines (constellation figures, rings, reticles) that stop short of the stars as
 *   on the map (#104), the dither cleared under them and around the stars so they read.
 * Shapes are SVG path strings in grid units, inked with currentColor: day and night red alike.
 *
 * A game's vignette is looked up by its id (`GAMES`, lib/games/catalog.ts); a game without one
 * gets a plain starry sky, so adding or swapping a game stays a one-entry change.
 */
import { bayer8 } from "@asteria/sky-renderer";

/** Side of a vignette, in pixels (the SVG viewBox). */
export const VIGNETTE_SIZE = 40;
/** Dither dots per grid pixel, along each axis. */
export const DITHER_RES = 2;
/** The ground is revealed in this many nested densities. */
export const DITHER_STEPS = 3;

type Pt = readonly [number, number];

interface Star {
  x: number;
  y: number;
  /** 0: one pixel, 1: a cross, 2: a longer cross, 3: a sparkle. */
  size: 0 | 1 | 2 | 3;
}
interface Line {
  points: Pt[];
  /** Shortened by this much at each star it reaches (pixels); 0 for marks such as ticks. */
  gap?: number;
  dashed?: boolean;
}
interface Ring {
  x: number;
  y: number;
  r: number;
}
interface Scene {
  /** Ink density of the ground in [0, 1] at a pixel centre. */
  density: (x: number, y: number) => number;
  stars: Star[];
  lines?: Line[];
  rings?: Ring[];
  /** Extra ink pixels (a glyph, a label), drawn over the cleared ground. */
  pixels?: Pt[];
}

export interface Vignette {
  /** Ground pixels of each density step, disjoint: step k adds to steps before it. */
  dither: string[];
  /** Ink pixels: the stars and the glyphs. */
  ink: string;
  /** Thin lines, as SVG paths. */
  strokes: { d: string; dashed: boolean }[];
  /** Discs cleared from the ground around the stars and glyphs. */
  clear: { x: number; y: number; r: number }[];
}

// --- Ground ---------------------------------------------------------------------------------

/** Smooth value noise in [0, 1], deterministic. */
function noise(x: number, y: number, seed: number): number {
  const hash = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2147483629);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * sx;
  const bottom = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * sx;
  return top + (bottom - top) * sy;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A Milky Way band through (cx, cy) at `angle` degrees, mottled, `peak` at its spine. */
function band(cx: number, cy: number, angle: number, width: number, peak: number, seed: number) {
  const a = (angle * Math.PI) / 180;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  return (x: number, y: number) => {
    const d = (x - cx) * nx + (y - cy) * ny;
    const mottle = 0.7 + 0.6 * noise(x / 6, y / 6, seed);
    return peak * Math.exp(-((d / width) ** 2)) * mottle;
  };
}

/**
 * Pixels of the ground at each density step, merged into horizontal runs. The ground is dithered
 * at twice the grid's resolution: a finer screen behind the bold pixel stars, as on the map.
 */
function ditherSteps(density: Scene["density"]): string[] {
  const n = VIGNETTE_SIZE * DITHER_RES;
  const u = 1 / DITHER_RES;
  const steps: string[] = [];
  const level = (i: number, j: number): number => {
    const v = Math.min(1, Math.max(0, density((i + 0.5) * u, (j + 0.5) * u)));
    const t = bayer8(i, j) + 0.5 / 64;
    // First step at which this pixel is inked (the density scaled by k / DITHER_STEPS).
    for (let k = 1; k <= DITHER_STEPS; k++) if ((v * k) / DITHER_STEPS > t) return k;
    return 0;
  };
  for (let k = 1; k <= DITHER_STEPS; k++) {
    let d = "";
    for (let j = 0; j < n; j++) {
      let run = -1;
      for (let i = 0; i <= n; i++) {
        const on = i < n && level(i, j) === k;
        if (on && run < 0) run = i;
        if (!on && run >= 0) {
          d += `M${run * u} ${j * u}h${(i - run) * u}v${u}h${(run - i) * u}z`;
          run = -1;
        }
      }
    }
    steps.push(d);
  }
  return steps;
}

// --- Marks ----------------------------------------------------------------------------------

/** Pixels of a star centred on pixel (x, y). */
function starPixels({ x, y, size }: Star): Pt[] {
  const px: Pt[] = [[x, y]];
  const arm = size === 0 ? 0 : size === 1 ? 1 : size === 2 ? 2 : 3;
  for (let i = 1; i <= arm; i++) px.push([x + i, y], [x - i, y], [x, y + i], [x, y - i]);
  if (size === 3) px.push([x + 1, y + 1], [x - 1, y + 1], [x + 1, y - 1], [x - 1, y - 1]);
  return px;
}

const STAR_CLEAR = [1.4, 2.2, 3.2, 4.2] as const;
const STAR_GAP = [1.4, 2, 2.8, 3.6] as const;

const pixelPath = (px: readonly Pt[]): string => px.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("");

/** A pixel glyph: rows of « # » from (x, y). */
function glyph(x: number, y: number, rows: readonly string[]): Pt[] {
  const px: Pt[] = [];
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === "#") px.push([x + i, y + j]);
  });
  return px;
}

const QUESTION = [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."];

/** A polyline between pixel centres, each end pulled back from the star it reaches. */
function linePath(points: readonly Pt[], gaps: (p: Pt) => number): string {
  let d = "";
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    const ga = gaps(points[i]!);
    const gb = gaps(points[i + 1]!);
    if (len <= ga + gb + 0.5) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const f = (v: number) => +v.toFixed(2);
    d += `M${f(ax + 0.5 + ux * ga)} ${f(ay + 0.5 + uy * ga)}L${f(bx + 0.5 - ux * gb)} ${f(by + 0.5 - uy * gb)}`;
  }
  return d;
}

function render(scene: Scene): Vignette {
  const starAt = new Map(scene.stars.map((s) => [`${s.x},${s.y}`, s]));
  const pixels = [...scene.stars.flatMap(starPixels), ...(scene.pixels ?? [])];
  const strokes = (scene.lines ?? []).map((line) => ({
    d: linePath(line.points, (p) => {
      const s = starAt.get(`${p[0]},${p[1]}`);
      return line.gap === 0 || !s ? 0 : (line.gap ?? STAR_GAP[s.size]);
    }),
    dashed: line.dashed ?? false,
  }));
  for (const r of scene.rings ?? [])
    strokes.push({
      d: `M${r.x + 0.5 - r.r} ${r.y + 0.5}a${r.r} ${r.r} 0 1 0 ${2 * r.r} 0a${r.r} ${r.r} 0 1 0 ${-2 * r.r} 0`,
      dashed: false,
    });
  return {
    dither: ditherSteps(scene.density),
    ink: pixelPath(pixels),
    strokes: strokes.filter((s) => s.d),
    clear: [
      ...scene.stars.map((s) => ({ x: s.x + 0.5, y: s.y + 0.5, r: STAR_CLEAR[s.size] })),
      ...(scene.pixels ?? []).map(([x, y]) => ({ x: x + 0.5, y: y + 0.5, r: 1.2 })),
    ],
  };
}

/** Faint one-pixel stars scattered over the grid, away from the given points. */
function scatter(count: number, seed: number, avoid: readonly Pt[] = [], margin = 3): Star[] {
  const out: Star[] = [];
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const x = 1 + Math.floor(next() * (VIGNETTE_SIZE - 2));
    const y = 1 + Math.floor(next() * (VIGNETTE_SIZE - 2));
    if (avoid.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < margin)) continue;
    out.push({ x, y, size: 0 });
  }
  return out;
}

// --- Scenes ---------------------------------------------------------------------------------

/** The catalogue: a planisphere (shaded rim, Milky Way, Cassiopeia, the Plough, Polaris). */
function planisphere(): Scene {
  const c = 20;
  const R = 17;
  const milky = band(c, c, 38, 4.5, 0.55, 3);
  const cas: Pt[] = [
    [8, 15],
    [10, 11],
    [13, 13],
    [15, 9],
    [18, 11],
  ];
  const plough: Pt[] = [
    [13, 29],
    [16, 26],
    [19, 25],
    [23, 23],
    [28, 22],
    [28, 26],
    [24, 27],
    [23, 23],
  ];
  const ticks: Line[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    const r1 = R + 1.2;
    const r2 = R + (i % 6 === 0 ? 2.8 : 1.9);
    const at = (r: number): Pt => [c - 0.5 + Math.cos(a) * r, c - 0.5 + Math.sin(a) * r];
    ticks.push({ points: [at(r1), at(r2)], gap: 0 });
  }
  const bright: Star[] = [
    ...cas.map(([x, y], i): Star => ({ x, y, size: i === 2 ? 1 : 0 })),
    ...plough.slice(0, 7).map(([x, y], i): Star => ({ x, y, size: i === 4 || i === 3 ? 1 : 0 })),
    { x: 20, y: 17, size: 2 },
  ];
  const faint = scatter(10, 7, [...cas, ...plough, [20, 17]]).filter(
    (s) => Math.hypot(s.x + 0.5 - c, s.y + 0.5 - c) < R - 2,
  );
  return {
    density: (x, y) => {
      const r = Math.hypot(x - c, y - c);
      if (r > R) return 0;
      return Math.min(1, milky(x, y) + 0.42 * smooth(R - 5, R, r));
    },
    stars: [...bright, ...faint],
    lines: [{ points: cas }, { points: plough }, ...ticks],
    rings: [{ x: c - 0.5, y: c - 0.5, r: R + 0.3 }],
  };
}

/** « Quelle constellation ? »: Orion's figure and a question mark. */
function orion(): Scene {
  const bet: Pt = [11, 12];
  const bel: Pt = [24, 13];
  const mei: Pt = [17, 6];
  const [alnitak, alnilam, mintaka]: Pt[] = [
    [15, 21],
    [18, 20],
    [21, 19],
  ];
  const saiph: Pt = [13, 32];
  const rigel: Pt = [26, 31];
  const figure: Pt[] = [bet, mei, bel, mintaka!, alnilam!, alnitak!, bet];
  const stars: Star[] = [
    { x: bet[0], y: bet[1], size: 2 },
    { x: bel[0], y: bel[1], size: 1 },
    { x: mei[0], y: mei[1], size: 0 },
    { x: alnitak![0], y: alnitak![1], size: 0 },
    { x: alnilam![0], y: alnilam![1], size: 0 },
    { x: mintaka![0], y: mintaka![1], size: 0 },
    { x: saiph[0], y: saiph[1], size: 1 },
    { x: rigel[0], y: rigel[1], size: 2 },
  ];
  const q = glyph(2, 2, QUESTION);
  return {
    density: band(10, 32, -48, 5.5, 0.5, 11),
    stars: [...stars, ...scatter(9, 21, [...stars.map((s): Pt => [s.x, s.y]), [4, 5]], 4)],
    lines: [{ points: figure }, { points: [alnitak!, saiph] }, { points: [mintaka!, rigel] }],
    pixels: q,
  };
}

/** « Nomme l'étoile »: one bright star in the map's reticle, a label to fill. */
function namedStar(): Scene {
  const c: Pt = [20, 17];
  const [x0, y0, x1, y1, l] = [11, 8, 29, 26, 4];
  const corner = (x: number, y: number, dx: number, dy: number): Line => ({
    points: [
      [x + dx * l, y],
      [x, y],
      [x, y + dy * l],
    ],
    gap: 0,
  });
  const label: Pt[] = [];
  for (let x = 13; x <= 27; x++) label.push([x, 31]);
  for (let x = 15; x <= 25; x++) if (x !== 19 && x !== 20) label.push([x, 34]);
  return {
    density: band(34, 4, -42, 5.5, 0.5, 17),
    stars: [{ x: c[0], y: c[1], size: 3 }, ...scatter(10, 41, [c, [20, 32]], 5)],
    lines: [
      corner(x0, y0, 1, 1),
      corner(x1, y0, -1, 1),
      corner(x0, y1, 1, -1),
      corner(x1, y1, -1, -1),
    ],
    pixels: label,
  };
}

/** « Où est-elle ? » (#184): a sky over the horizon, a constellation found in the crosshair. */
function search(): Scene {
  const horizon = (x: number) => 31 + 1.6 * Math.sin((x - 4) / 7);
  const sky = band(20, 34, 12, 5, 0.4, 29);
  const w: Pt[] = [
    [17, 15],
    [19, 12],
    [21, 15],
    [23, 12],
    [25, 14],
  ];
  const [cx, cy, r] = [21, 14, 7];
  const tick = (dx: number, dy: number): Line => ({
    points: [
      [cx + dx * (r + 1), cy + dy * (r + 1)],
      [cx + dx * (r + 3), cy + dy * (r + 3)],
    ],
    gap: 0,
  });
  return {
    density: (x, y) => (y > horizon(x) ? 0.62 : sky(x, y)),
    stars: [
      ...w.map(([x, y], i): Star => ({ x, y, size: i === 2 ? 1 : 0 })),
      ...scatter(8, 57, [...w, [cx, cy]], 10).filter((s) => s.y < horizon(s.x) - 2),
    ],
    lines: [
      { points: w, gap: 1.2 },
      tick(1, 0),
      tick(-1, 0),
      tick(0, 1),
      tick(0, -1),
      {
        points: [
          [0, horizon(0) - 0.5],
          ...Array.from({ length: 8 }, (_, i): Pt => [5 * (i + 1), horizon(5 * (i + 1)) - 0.5]),
        ],
        gap: 0,
      },
    ],
    rings: [{ x: cx, y: cy, r }],
  };
}

/** Any other game: a starry sky. */
function starrySky(): Scene {
  const bright: Star[] = [
    { x: 14, y: 13, size: 2 },
    { x: 27, y: 24, size: 1 },
    { x: 22, y: 9, size: 0 },
  ];
  return {
    density: band(20, 20, 25, 6, 0.45, 13),
    stars: [
      ...bright,
      ...scatter(
        14,
        77,
        bright.map((s): Pt => [s.x, s.y]),
        4,
      ),
    ],
  };
}

const SCENES: Record<string, () => Scene> = {
  catalogue: planisphere,
  whichConstellation: orion,
  nameStar: namedStar,
  whereIsIt: search,
};

const cache = new Map<string, Vignette>();

/** The vignette of a card: `catalogue` or a game id (unknown ids get a starry sky). */
export function vignette(id: string): Vignette {
  const key = id in SCENES ? id : "";
  let v = cache.get(key);
  if (!v) {
    v = render((SCENES[key] ?? starrySky)());
    cache.set(key, v);
  }
  return v;
}
