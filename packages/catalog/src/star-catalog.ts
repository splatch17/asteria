/**
 * Star catalogue binary format "ASTS" v2, v1 still decoded (writer: packages/sky-data/star_binary.py).
 * Format reference: packages/sky-data/README.md. No DOM dependency.
 */

/** Where a star's reference distance comes from (#75). */
export type DistanceSource =
  /** Inverse of the Hipparcos new-reduction parallax (van Leeuwen 2007). */
  | "hipparcos"
  /** Inverse of the Gaia DR3 parallax, zero-point corrected (Lindegren et al. 2021). */
  | "gaia-dr3"
  /** Published distance by another method (citation in `distanceReference`). */
  | "literature";

/** Where a star's radial velocity comes from (#79). */
export type RadialVelocitySource = "bsc5" | "gaia-dr3";

/** One star, same shape as `out/stars.json` (superset of sky-renderer's `CatalogStar`). */
export interface CatalogStar {
  /** Hipparcos number. */
  hip: number;
  /** Right ascension, ICRS, epoch J1991.25, degrees [0, 360). */
  ra: number;
  /** Declination, ICRS, epoch J1991.25, degrees. */
  dec: number;
  /** Johnson V magnitude. */
  v: number;
  /** B−V colour index. */
  bv?: number;
  /** Parallax, mas. */
  plx?: number;
  /** Parallax standard error, mas. */
  ePlx?: number;
  /** Proper motion in RA (μα·cos δ), mas/yr. */
  pmRa?: number;
  /** Proper motion in Dec, mas/yr. */
  pmDec?: number;
  hd?: number;
  hr?: number;
  flamsteed?: number;
  /** Official IAU (WGSN) proper name. */
  name?: string;
  /** Bayer designation, e.g. "α CMa". */
  bayer?: string;
  /** IAU constellation abbreviation, e.g. "Ori". */
  con: string;
  /**
   * Reference distance in light-years (#75), 3 significant figures: Gaia DR3 or Hipparcos
   * parallax, whichever is more precise, or a published distance for a few bright stars whose
   * parallax is biased (Deneb). Absent when the parallax error exceeds the parallax.
   */
  distanceLy?: number;
  /** 1σ uncertainty of `distanceLy`, light-years (2 significant figures). */
  distanceErrorLy?: number;
  distanceSource?: DistanceSource;
  /** Citation of a `literature` distance, e.g. "Schiller & Przybilla 2008, A&A 479, 849". */
  distanceReference?: string;
  /** Radial velocity, km/s, positive receding (#79): Gaia DR3, otherwise Yale BSC5. */
  radialVelocity?: number;
  radialVelocitySource?: RadialVelocitySource;
}

/** String table published next to the binary (`star-strings.json`), keyed by HIP number. */
export interface StarStrings {
  format: "asteria-star-strings";
  version: 1;
  name: Record<string, string>;
  bayer: Record<string, string>;
  /** Citations of the literature distances (v2 catalogues). */
  distRef?: Record<string, string>;
}

export const STAR_CATALOG_MAGIC = "ASTS";
/** Version written by the pipeline; version 1 files (no distance nor radial velocity) still decode. */
export const STAR_CATALOG_VERSION = 2;
const STAR_STRINGS_VERSION = 1;

const HEADER_BYTES = 16;
const RA_SCALE = 2 ** 32 / 360;
const DEC_SCALE = 2 ** 31 / 90;
const I32_NONE = -(2 ** 31);
const I16_NONE = -(2 ** 15);

type ColumnType = "u8" | "u16" | "i16" | "u32" | "i32";
const SIZE: Record<ColumnType, number> = { u8: 1, u16: 2, i16: 2, u32: 4, i32: 4 };

/** Column order and types — must match COLUMNS in star_binary.py. */
const COLUMNS = [
  ["hip", "u32"],
  ["ra", "u32"],
  ["dec", "i32"],
  ["plx", "i32"],
  ["ePlx", "i32"],
  ["pmRa", "i32"],
  ["pmDec", "i32"],
  ["hd", "u32"],
  ["v", "i16"],
  ["bv", "i16"],
  ["hr", "u16"],
  ["flamsteed", "u8"],
  ["con", "u8"],
  // v2 (#75, #79)
  ["dist", "u32"],
  ["eDist", "u32"],
  ["rv", "i16"],
  ["src", "u8"],
] as const satisfies readonly (readonly [string, ColumnType])[];
const V1_COLUMNS = 13;

type ColumnName = (typeof COLUMNS)[number][0];

const columnsOf = (version: number): readonly (typeof COLUMNS)[number][] =>
  version === 1 ? COLUMNS.slice(0, V1_COLUMNS) : COLUMNS;
const bytesPerStar = (version: number) =>
  columnsOf(version).reduce<number>((n, [, t]) => n + SIZE[t], 0);

/** Bytes per star of the current version (v1: 40). */
export const BYTES_PER_STAR = bytesPerStar(STAR_CATALOG_VERSION);

/** Low 4 bits of the `src` column: distance source; high 4 bits: radial velocity source. */
const DISTANCE_SOURCES = [undefined, "hipparcos", "gaia-dr3", "literature"] as const;
const RV_SOURCES = [undefined, "bsc5", "gaia-dr3"] as const;

export class StarCatalogError extends Error {
  override name = "StarCatalogError";
}

function read(view: DataView, type: ColumnType, offset: number): number {
  switch (type) {
    case "u8":
      return view.getUint8(offset);
    case "u16":
      return view.getUint16(offset, true);
    case "i16":
      return view.getInt16(offset, true);
    case "u32":
      return view.getUint32(offset, true);
    case "i32":
      return view.getInt32(offset, true);
  }
}

function write(view: DataView, type: ColumnType, offset: number, value: number): void {
  switch (type) {
    case "u8":
      return view.setUint8(offset, value);
    case "u16":
      return view.setUint16(offset, value, true);
    case "i16":
      return view.setInt16(offset, value, true);
    case "u32":
      return view.setUint32(offset, value, true);
    case "i32":
      return view.setInt32(offset, value, true);
  }
}

const headerSize = (conCount: number) => Math.ceil((HEADER_BYTES + 3 * conCount) / 4) * 4;

/** Decodes `stars.bin` + `star-strings.json` into catalogue records (file order: by V). */
export function decodeStarCatalog(buffer: ArrayBuffer, strings: StarStrings): CatalogStar[] {
  if (buffer.byteLength < HEADER_BYTES) throw new StarCatalogError("buffer too short");
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== STAR_CATALOG_MAGIC)
    throw new StarCatalogError(`bad magic ${JSON.stringify(magic)}`);
  const version = view.getUint16(4, true);
  if (version !== 1 && version !== 2) throw new StarCatalogError(`unsupported version ${version}`);
  if (strings?.format !== "asteria-star-strings" || strings.version !== STAR_STRINGS_VERSION) {
    throw new StarCatalogError("invalid string table");
  }
  const dataOffset = view.getUint16(6, true);
  const count = view.getUint32(8, true);
  const conCount = view.getUint16(12, true);
  if (
    dataOffset < headerSize(conCount) ||
    buffer.byteLength !== dataOffset + count * bytesPerStar(version)
  ) {
    throw new StarCatalogError("inconsistent header or truncated buffer");
  }

  const conBytes = new Uint8Array(buffer, HEADER_BYTES, 3 * conCount);
  const cons = Array.from({ length: conCount }, (_, i) =>
    String.fromCharCode(...conBytes.subarray(3 * i, 3 * i + 3)),
  );

  const offsets = {} as Record<ColumnName, number>;
  let offset = dataOffset;
  for (const [name, type] of columnsOf(version)) {
    offsets[name] = offset;
    offset += count * SIZE[type];
  }
  const col = (name: ColumnName, type: ColumnType, i: number) =>
    read(view, type, offsets[name] + i * SIZE[type]);

  const stars: CatalogStar[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const hip = col("hip", "u32", i);
    const conIndex = col("con", "u8", i);
    const con = cons[conIndex];
    if (con === undefined) throw new StarCatalogError(`HIP ${hip}: bad constellation index`);
    const star: CatalogStar = {
      hip,
      ra: col("ra", "u32", i) / RA_SCALE,
      dec: col("dec", "i32", i) / DEC_SCALE,
      v: col("v", "i16", i) / 1000,
      con,
    };
    const bv = col("bv", "i16", i);
    if (bv !== I16_NONE) star.bv = bv / 1000;
    for (const key of ["plx", "ePlx", "pmRa", "pmDec"] as const) {
      const value = col(key, "i32", i);
      if (value !== I32_NONE) star[key] = value / 1000;
    }
    const hd = col("hd", "u32", i);
    if (hd) star.hd = hd;
    const hr = col("hr", "u16", i);
    if (hr) star.hr = hr;
    const flamsteed = col("flamsteed", "u8", i);
    if (flamsteed) star.flamsteed = flamsteed;
    const name = strings.name[hip];
    if (name !== undefined) star.name = name;
    const bayer = strings.bayer[hip];
    if (bayer !== undefined) star.bayer = bayer;
    if (version >= 2) {
      const src = col("src", "u8", i);
      const dist = col("dist", "u32", i);
      if (dist) {
        star.distanceLy = dist / 100;
        star.distanceErrorLy = col("eDist", "u32", i) / 100;
        const source = DISTANCE_SOURCES[src & 15];
        if (source) star.distanceSource = source;
        const ref = strings.distRef?.[hip];
        if (ref !== undefined) star.distanceReference = ref;
      }
      const rv = col("rv", "i16", i);
      if (rv !== I16_NONE) {
        star.radialVelocity = rv / 10;
        const source = RV_SOURCES[src >> 4];
        if (source) star.radialVelocitySource = source;
      }
    }
    stars[i] = star;
  }
  return stars;
}

const milli = (value: number | undefined, none: number) =>
  value === undefined ? none : Math.round(value * 1000);

/**
 * Encodes records into the ASTS v2 format (or v1, which drops distances and radial velocities).
 * The pipeline writes the published files in Python; this mirror exists for tests and tooling.
 */
export function encodeStarCatalog(
  stars: readonly CatalogStar[],
  constellations: readonly string[],
  version: 1 | 2 = STAR_CATALOG_VERSION,
): { buffer: ArrayBuffer; strings: StarStrings } {
  const count = stars.length;
  const dataOffset = headerSize(constellations.length);
  const buffer = new ArrayBuffer(dataOffset + count * bytesPerStar(version));
  const view = new DataView(buffer);
  for (let i = 0; i < 4; i++) view.setUint8(i, STAR_CATALOG_MAGIC.charCodeAt(i));
  view.setUint16(4, version, true);
  view.setUint16(6, dataOffset, true);
  view.setUint32(8, count, true);
  view.setUint16(12, constellations.length, true);
  constellations.forEach((abbr, i) => {
    if (!/^[A-Za-z]{3}$/.test(abbr)) throw new StarCatalogError(`bad abbreviation ${abbr}`);
    for (let j = 0; j < 3; j++) view.setUint8(HEADER_BYTES + 3 * i + j, abbr.charCodeAt(j));
  });

  const strings: StarStrings = {
    format: "asteria-star-strings",
    version: STAR_STRINGS_VERSION,
    name: {},
    bayer: {},
    distRef: {},
  };
  const encode: Record<ColumnName, (s: CatalogStar) => number> = {
    hip: (s) => s.hip,
    ra: (s) => ((Math.round(s.ra * RA_SCALE) % 2 ** 32) + 2 ** 32) % 2 ** 32,
    dec: (s) => Math.max(-(2 ** 31) + 1, Math.min(2 ** 31 - 1, Math.round(s.dec * DEC_SCALE))),
    plx: (s) => milli(s.plx, I32_NONE),
    ePlx: (s) => milli(s.ePlx, I32_NONE),
    pmRa: (s) => milli(s.pmRa, I32_NONE),
    pmDec: (s) => milli(s.pmDec, I32_NONE),
    hd: (s) => s.hd ?? 0,
    v: (s) => milli(s.v, I16_NONE),
    bv: (s) => milli(s.bv, I16_NONE),
    hr: (s) => s.hr ?? 0,
    flamsteed: (s) => s.flamsteed ?? 0,
    con: (s) => {
      const index = constellations.indexOf(s.con);
      if (index < 0) throw new StarCatalogError(`unknown constellation ${s.con}`);
      return index;
    },
    dist: (s) => (s.distanceLy === undefined ? 0 : Math.round(s.distanceLy * 100)),
    eDist: (s) => (s.distanceLy === undefined ? 0 : Math.round((s.distanceErrorLy ?? 0) * 100)),
    rv: (s) => (s.radialVelocity === undefined ? I16_NONE : Math.round(s.radialVelocity * 10)),
    src: (s) =>
      Math.max(0, DISTANCE_SOURCES.indexOf(s.distanceSource)) |
      (Math.max(0, RV_SOURCES.indexOf(s.radialVelocitySource)) << 4),
  };
  let offset = dataOffset;
  for (const [name, type] of columnsOf(version)) {
    stars.forEach((s, i) => write(view, type, offset + i * SIZE[type], encode[name](s)));
    offset += count * SIZE[type];
  }
  for (const s of stars) {
    if (s.name !== undefined) strings.name[s.hip] = s.name;
    if (s.bayer !== undefined) strings.bayer[s.hip] = s.bayer;
    if (version >= 2 && s.distanceReference !== undefined)
      strings.distRef![s.hip] = s.distanceReference;
  }
  return { buffer, strings };
}
