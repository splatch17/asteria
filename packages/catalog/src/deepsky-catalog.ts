/**
 * Deep-sky catalogue "asteria-deepsky" v1 (#100): Messier objects and bright NGC/IC objects from
 * OpenNGC (CC BY-SA 4.0). Writer and selection rule: packages/sky-data/build_deepsky.py; format:
 * packages/sky-data/README.md. Published as `data/deepsky.json` and loaded on demand. No DOM
 * dependency.
 */

/** Catalogue object types (OpenNGC types grouped, see build_deepsky.py `TYPES`). */
export const DEEP_SKY_TYPES = [
  "galaxy",
  "galaxy-group",
  "globular-cluster",
  "open-cluster",
  "cluster-nebula",
  "association",
  "planetary-nebula",
  "emission-nebula",
  "reflection-nebula",
  "nebula",
  "dark-nebula",
  "supernova-remnant",
  "double-star",
  "asterism",
] as const;
export type DeepSkyType = (typeof DEEP_SKY_TYPES)[number];

export interface DeepSkyObject {
  /**
   * Stable identifier, also the key of the localised names (`packages/content/<lang>/
   * deepsky-names.json`): "M31" for Messier objects, else the OpenNGC name without padding
   * ("NGC869", "IC2602", "Mel111", "ESO56-115").
   */
  id: string;
  type: DeepSkyType;
  /** Right ascension, ICRS J2000, degrees [0, 360). */
  ra: number;
  /** Declination, ICRS J2000, degrees. */
  dec: number;
  /** Magnitude shown and used for ranking: V, else B; absent for most large nebulae. */
  mag?: number;
  /** Total V magnitude (OpenNGC). */
  vMag?: number;
  /** Total B magnitude (OpenNGC). */
  bMag?: number;
  /** Major axis, arcminutes. */
  majorAxis?: number;
  /** Minor axis, arcminutes. */
  minorAxis?: number;
  /** Position angle of the major axis, degrees from north through east. */
  positionAngle?: number;
  /** IAU constellation abbreviation (Roman 1987), e.g. "And". */
  con: string;
  /** Messier number, if any (M102 is listed by OpenNGC as a duplicate of M101). */
  messier?: number;
  /** Every designation, Messier first: ["M 31", "NGC 224"], ["M 101", "NGC 5457", "M 102"]. */
  designations: string[];
  /** English common names from OpenNGC ("Andromeda Galaxy"); localised names are content. */
  names: string[];
}

/** Search entry target of a deep-sky object: the member to add to `SearchTarget` (#99). */
export interface DeepSkyTarget {
  kind: "deepsky";
  id: string;
}

export function deepSkyTarget(o: Pick<DeepSkyObject, "id">): DeepSkyTarget {
  return { kind: "deepsky", id: o.id };
}

export const DEEP_SKY_FORMAT = "asteria-deepsky";
export const DEEP_SKY_VERSION = 1;
const FIELDS = [
  "id",
  "type",
  "ra",
  "dec",
  "v",
  "b",
  "maj",
  "min",
  "pa",
  "con",
  "designations",
  "names",
] as const;

export class DeepSkyCatalogError extends Error {}

type Row = [
  string,
  string,
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  string,
  string[],
  string[],
];

const TYPES: ReadonlySet<string> = new Set(DEEP_SKY_TYPES);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStrings = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((s) => typeof s === "string");

function checkRow(row: unknown, i: number): asserts row is Row {
  const bad = (what: string) => new DeepSkyCatalogError(`object ${i}: ${what}`);
  if (!Array.isArray(row) || row.length !== FIELDS.length) throw bad("wrong number of fields");
  const [id, type, ra, dec, v, b, maj, min, pa, con, designations, names] = row as unknown[];
  if (typeof id !== "string" || !id) throw bad("missing id");
  if (typeof type !== "string" || !TYPES.has(type)) throw bad(`unknown type ${String(type)}`);
  if (!isNum(ra) || ra < 0 || ra >= 360 || !isNum(dec) || Math.abs(dec) > 90)
    throw bad("position out of range");
  for (const x of [v, b, maj, min, pa]) if (x !== null && !isNum(x)) throw bad("bad number");
  if (typeof con !== "string" || con.length !== 3) throw bad("bad constellation");
  if (!isStrings(designations) || designations.length === 0) throw bad("no designation");
  if (!isStrings(names)) throw bad("bad names");
}

const opt = <K extends string>(key: K, x: number | null): { [P in K]?: number } =>
  (x === null ? {} : { [key]: x }) as { [P in K]?: number };

/** Decodes the parsed `deepsky.json` document; throws `DeepSkyCatalogError` if malformed. */
export function decodeDeepSkyCatalog(doc: unknown): DeepSkyObject[] {
  const d = doc as { format?: unknown; version?: unknown; fields?: unknown; objects?: unknown };
  if (d?.format !== DEEP_SKY_FORMAT) throw new DeepSkyCatalogError(`bad format`);
  if (d.version !== DEEP_SKY_VERSION)
    throw new DeepSkyCatalogError(`unsupported version ${String(d.version)}`);
  if (JSON.stringify(d.fields) !== JSON.stringify(FIELDS))
    throw new DeepSkyCatalogError("unexpected field list");
  if (!Array.isArray(d.objects)) throw new DeepSkyCatalogError("missing objects");
  const seen = new Set<string>();
  return d.objects.map((row: unknown, i) => {
    checkRow(row, i);
    const [id, type, ra, dec, v, b, maj, min, pa, con, designations, names] = row;
    if (seen.has(id)) throw new DeepSkyCatalogError(`duplicate id ${id}`);
    seen.add(id);
    const m = /^M (\d+)$/.exec(designations[0]!);
    return {
      id,
      type: type as DeepSkyType,
      ra,
      dec,
      ...opt("mag", v ?? b),
      ...opt("vMag", v),
      ...opt("bMag", b),
      ...opt("majorAxis", maj),
      ...opt("minorAxis", min),
      ...opt("positionAngle", pa),
      con,
      ...(m ? { messier: Number(m[1]) } : {}),
      designations,
      names,
    };
  });
}

/** Minimal `fetch` shape, so that the loader runs in the browser, in Node and in tests. */
export type FetchJson = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Fetches and decodes the catalogue (`<base>data/deepsky.json`), e.g. when search first opens. */
export async function loadDeepSkyCatalog(
  url: string,
  fetchJson: FetchJson = fetch,
): Promise<DeepSkyObject[]> {
  const res = await fetchJson(url);
  if (!res.ok) throw new DeepSkyCatalogError(`${url}: HTTP ${res.status}`);
  return decodeDeepSkyCatalog(await res.json());
}
