// App icons (#27): favicon SVG/ICO, PWA PNGs (192, 512, maskable) and Apple touch icon.
//
// Drawn from scratch (no external asset): a four-pointed star — Asteria, "the starry one" —
// in parchment ink on night blue, with its glow rendered as a 1-bit Bayer 8×8 dither like the
// rest of the art direction (docs/ART_DIRECTION.md). Deterministic: run `pnpm icons` again
// to get the same bytes. No dependency: PNG and ICO are encoded here with node:zlib.
//
// Outputs: apps/web/public/{favicon.svg,favicon.ico,apple-touch-icon.png,icons/*.png}
// and a preview copy in docs/design/icons/.
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "apps/web/public");
const DESIGN = join(ROOT, "docs/design/icons");

const NIGHT = [0x10, 0x1b, 0x52];
const PARCHMENT = [0xf0, 0xe6, 0xd2];
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

// Bayer 8×8 threshold matrix (values 0..63).
const BAYER = (() => {
  let m = [[0]];
  while (m.length < 8) {
    const n = m.length;
    const next = Array.from({ length: 2 * n }, () => new Array(2 * n));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 4 * m[y][x];
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    m = next;
  }
  return m;
})();

/** Concave four-pointed star: (|dx|/rx)^p + (|dy|/ry)^p ≤ 1. */
const sparkle = (x, y, cx, cy, rx, ry, p = 0.55) =>
  (Math.abs(x - cx) / rx) ** p + (Math.abs(y - cy) / ry) ** p <= 1;

/**
 * The motif in unit coordinates (x, y in [−1, 1], y down), scaled by `scale` around the centre.
 * Returns { solid, glow }: solid ink, and a glow intensity in [0, 1] to dither.
 */
function motif(x, y, scale) {
  const u = x / scale;
  const v = y / scale;
  const stars = [
    [0, 0, 0.42, 0.78],
    [-0.52, -0.52, 0.1, 0.16],
    [0.54, 0.5, 0.07, 0.11],
  ];
  const solid = stars.some(([cx, cy, rx, ry]) => sparkle(u, v, cx, cy, rx, ry, 0.5));
  // A night keyline around each star keeps the shape readable inside its own glow.
  const keyline = stars.some(([cx, cy, rx, ry]) =>
    sparkle(u, v, cx, cy, rx * 1.35 + 0.03, ry * 1.12 + 0.03, 0.5),
  );
  const r = Math.hypot(u, v);
  const glow = keyline
    ? 0
    : 0.7 * Math.exp(-((r / 0.42) ** 2)) + 0.18 * Math.exp(-((r / 1.1) ** 2)) + 0.03;
  return { solid, glow };
}

/** 1-bit raster on a `cells`² grid: true = parchment ink. */
function raster(cells, scale) {
  const ink = [];
  const SS = 4; // supersampling of the solid shapes
  for (let j = 0; j < cells; j++) {
    const row = [];
    for (let i = 0; i < cells; i++) {
      let cover = 0;
      for (let sj = 0; sj < SS; sj++)
        for (let si = 0; si < SS; si++) {
          const x = ((i + (si + 0.5) / SS) / cells) * 2 - 1;
          const y = ((j + (sj + 0.5) / SS) / cells) * 2 - 1;
          if (motif(x, y, scale).solid) cover++;
        }
      const cx = ((i + 0.5) / cells) * 2 - 1;
      const cy = ((j + 0.5) / cells) * 2 - 1;
      const { glow } = motif(cx, cy, scale);
      const dithered = glow > (BAYER[j % 8][i % 8] + 0.5) / 64;
      row.push(cover / (SS * SS) >= 0.5 || dithered);
    }
    ink.push(row);
  }
  return ink;
}

function png(size, cells, scale) {
  const ink = raster(cells, scale);
  const cell = size / cells;
  const stride = size * 3 + 1;
  const pixels = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    pixels[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const c = ink[Math.floor(y / cell)][Math.floor(x / cell)] ? PARCHMENT : NIGHT;
      pixels.set(c, y * stride + 1 + x * 3);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO holding one PNG image (supported by every current browser). */
function ico(pngData, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bit count
  header.writeUInt32LE(pngData.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, pngData]);
}

/** SVG favicon: the same 1-bit raster, as horizontal runs of cells. */
function svg(cells, scale) {
  const ink = raster(cells, scale);
  let d = "";
  ink.forEach((row, y) => {
    for (let x = 0; x < cells;) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < cells && row[end]) end++;
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cells} ${cells}" shape-rendering="crispEdges">` +
    `<rect width="${cells}" height="${cells}" fill="${hex(NIGHT)}"/>` +
    `<path fill="${hex(PARCHMENT)}" d="${d}"/></svg>\n`
  );
}

mkdirSync(join(PUBLIC, "icons"), { recursive: true });
mkdirSync(DESIGN, { recursive: true });

const out = {
  "favicon.svg": svg(32, 1),
  "favicon.ico": ico(png(32, 32, 1), 32),
  "apple-touch-icon.png": png(180, 60, 0.86),
  "icons/icon-192.png": png(192, 64, 1),
  "icons/icon-512.png": png(512, 128, 1),
  // Maskable: the launcher may crop to a circle of 80 % of the width: motif kept inside.
  "icons/icon-maskable-512.png": png(512, 128, 0.78),
};
for (const [file, data] of Object.entries(out)) {
  writeFileSync(join(PUBLIC, file), data);
  console.log("wrote", file, data.length, "bytes");
}
for (const file of ["icons/icon-512.png", "icons/icon-maskable-512.png", "favicon.svg"])
  copyFileSync(join(PUBLIC, file), join(DESIGN, file.replace("icons/", "")));
