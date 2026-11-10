/**
 * The place picker's list of cities and its search (review of 2026-11-09, point 5): Natural
 * Earth 1:10m populated places, public domain (packages/sky-data/build_cities.py, about 7 300
 * places, the largest first). Loaded on demand, when the picker opens.
 *
 * The same field takes a city's name or coordinates typed by hand (« 48,85 2,35 », « 33.9 S
 * 151.2 E »): for whoever watches the sky far from any listed town.
 */
import { normalize } from "./search";

export interface City {
  /** French name. */
  name: string;
  /** Local name when it differs (« London »), else "". */
  alt: string;
  /** ISO 3166-1 alpha-2, or "". */
  country: string;
  latitude: number;
  longitude: number;
  /** First-level region, only for places sharing name and country, else "". */
  region: string;
}

export interface CityIndex {
  cities: readonly City[];
  /** Normalised name and local name of each city, same order. */
  keys: readonly (readonly [string, string])[];
}

const isRow = (v: unknown): v is [string, string, string, number, number, string] =>
  Array.isArray(v) &&
  v.length >= 6 &&
  typeof v[0] === "string" &&
  typeof v[1] === "string" &&
  typeof v[2] === "string" &&
  typeof v[3] === "number" &&
  typeof v[4] === "number" &&
  typeof v[5] === "string" &&
  Math.abs(v[3]) <= 90 &&
  Math.abs(v[4]) <= 180;

/** The index of a cities.json payload; rows that are not as expected are left out. */
export function buildCityIndex(json: unknown): CityIndex {
  const rows =
    typeof json === "object" &&
    json !== null &&
    Array.isArray((json as { cities?: unknown }).cities)
      ? (json as { cities: unknown[] }).cities
      : [];
  const cities: City[] = [];
  const keys: [string, string][] = [];
  for (const row of rows) {
    if (!isRow(row)) continue;
    const [name, alt, country, latitude, longitude, region] = row;
    cities.push({ name, alt, country, latitude, longitude, region });
    keys.push([normalize(name), alt ? normalize(alt) : ""]);
  }
  return { cities, keys };
}

/**
 * Cities matching a query, at most `limit`: names starting with it first, then names with a
 * word starting with it; in each group the largest city first (the list's order). Accents,
 * case, hyphens and apostrophes do not count (« saint etienne », « new york »).
 */
export function searchCities(index: CityIndex, query: string, limit = 8): City[] {
  const q = normalize(query);
  if (!q) return [];
  const starts: City[] = [];
  const words: City[] = [];
  for (let i = 0; i < index.keys.length && starts.length < limit; i++) {
    const [name, alt] = index.keys[i]!;
    if (name.startsWith(q) || (alt && alt.startsWith(q))) starts.push(index.cities[i]!);
    else if (words.length < limit && (name.includes(` ${q}`) || (alt && alt.includes(` ${q}`))))
      words.push(index.cities[i]!);
  }
  return [...starts, ...words].slice(0, limit);
}

/** The country's name in a language (« France »), or "" without a code or Intl.DisplayNames. */
export function countryName(code: string, locale = "fr"): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? "";
  } catch {
    return "";
  }
}

/**
 * Coordinates typed by hand: a latitude then a longitude in decimal degrees, with a point or a
 * comma as decimal mark, separated by a space, a semicolon or a comma followed by a space;
 * a sign, or a letter after each number (N/S, then E/O/W). null when the text is not that, or
 * out of range.
 *   « 48,85 2,35 » · « 48.85, 2.35 » · « -33.87 151.21 » · « 33,87 S 151,21 E » · « 4.9N 52.3O »
 */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const m =
    /^\s*([+\-−]?\d{1,2}(?:[.,]\d+)?)\s*°?\s*([NS])?\s*(?:[;\s]|,\s)\s*([+\-−]?\d{1,3}(?:[.,]\d+)?)\s*°?\s*([EOW])?\s*$/i.exec(
      text,
    );
  if (!m) return null;
  const num = (s: string) => Number(s.replace(",", ".").replace("−", "-"));
  let latitude = num(m[1]!);
  let longitude = num(m[3]!);
  if (m[2]) latitude = Math.abs(latitude) * (m[2].toUpperCase() === "S" ? -1 : 1);
  if (m[4]) longitude = Math.abs(longitude) * (m[4].toUpperCase() === "E" ? 1 : -1);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

let loading: Promise<CityIndex> | null = null;

/** The list, fetched once (again after a failure). */
export function loadCityIndex(): Promise<CityIndex> {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/cities.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`cities.json: HTTP ${r.status}`))))
    .then((json: unknown) => {
      const index = buildCityIndex(json);
      if (!index.cities.length) throw new Error("cities.json: empty");
      return index;
    })
    .catch((e: unknown) => {
      loading = null;
      throw e;
    });
  return loading;
}
