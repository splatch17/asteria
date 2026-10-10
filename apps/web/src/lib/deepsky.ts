/**
 * Deep-sky objects in the app (#101): what the map draws, what the sheet says, what the search
 * indexes. The catalogue (`deepsky.json`, OpenNGC, #100) is decoded by @asteria/catalog; the
 * French common names are content (`packages/content/fr/deepsky-names.json`).
 */
import type { DeepSkyObject, DeepSkyType } from "@asteria/catalog";
import type { DeepSkyMapObject } from "@asteria/sky-renderer";
import type { SearchDeepSky } from "./search";

/** How an object can be seen, from the easiest: the sheet's observability hint. */
export type Observability = "naked-eye" | "binoculars" | "small-telescope" | "telescope";
const CLASSES: readonly Observability[] = [
  "naked-eye",
  "binoculars",
  "small-telescope",
  "telescope",
];

/**
 * Observability rule, deliberately simple (a dark country sky, no Moon, an observer who knows
 * where to look). From the catalogue magnitude m (V, else B):
 *   m ≤ 5.0 → naked eye (an extended object needs about a magnitude more than a star at the
 *             naked-eye limit, ≈ 6);
 *   m ≤ 8.0 → binoculars (50 mm);
 *   m ≤ 10.5 → small telescope (60 to 100 mm);
 *   fainter → telescope.
 * Diffuse objects (galaxies, nebulae, supernova remnants) whose mean surface brightness
 * (surfaceBrightness) is fainter than DIFFUSE_SB move one class up: their light is spread out
 * (M101, M43). Clusters are judged by their total light (their stars are points).
 * Without a magnitude: a cluster of a degree or more (Hyades, Coma) is a naked-eye object;
 * for anything else nothing is said (null), rather than a guess.
 */
export const OBSERVABILITY = {
  NAKED_EYE: 5,
  BINOCULARS: 8,
  SMALL_TELESCOPE: 10.5,
  /** Mean surface brightness (mag/arcsec²) beyond which a diffuse object moves up a class. */
  DIFFUSE_SB: 23.5,
  /** Size (arcmin) from which a cluster without magnitude counts as naked-eye. */
  LARGE_CLUSTER_ARCMIN: 60,
} as const;

const DIFFUSE: ReadonlySet<DeepSkyType> = new Set([
  "galaxy",
  "galaxy-group",
  "emission-nebula",
  "reflection-nebula",
  "nebula",
  "supernova-remnant",
]);
const CLUSTERS: ReadonlySet<DeepSkyType> = new Set(["open-cluster", "association", "asterism"]);

/**
 * Mean surface brightness (mag/arcsec²) of an object of magnitude m spread over the ellipse of
 * its axes (arcmin): m + 2.5·log10(π/4 · a · b · 3600). Null without a size.
 */
export function surfaceBrightness(
  o: Pick<DeepSkyObject, "mag" | "majorAxis" | "minorAxis">,
): number | null {
  if (o.mag === undefined || !o.majorAxis) return null;
  const area = (Math.PI / 4) * o.majorAxis * (o.minorAxis ?? o.majorAxis) * 3600;
  return o.mag + 2.5 * Math.log10(area);
}

/** Observability class of an object (see OBSERVABILITY), null when the catalogue cannot tell. */
export function observability(
  o: Pick<DeepSkyObject, "type" | "mag" | "majorAxis" | "minorAxis">,
): Observability | null {
  const R = OBSERVABILITY;
  if (o.mag === undefined)
    return CLUSTERS.has(o.type) && (o.majorAxis ?? 0) >= R.LARGE_CLUSTER_ARCMIN
      ? "naked-eye"
      : null;
  let k = o.mag <= R.NAKED_EYE ? 0 : o.mag <= R.BINOCULARS ? 1 : o.mag <= R.SMALL_TELESCOPE ? 2 : 3;
  const sb = surfaceBrightness(o);
  if (DIFFUSE.has(o.type) && sb !== null && sb > R.DIFFUSE_SB) k = Math.min(3, k + 1);
  return CLASSES[k]!;
}

/** Magnitude shown on the sheet: the catalogue's (V, else B) and its band. */
export function displayMagnitude(
  o: Pick<DeepSkyObject, "mag" | "vMag">,
): { band: "V" | "B"; value: number } | null {
  if (o.mag === undefined) return null;
  return { band: o.vMag !== undefined ? "V" : "B", value: o.mag };
}

/**
 * Apparent size for an ICU message: in arcminutes up to 2°, else in degrees; one decimal under
 * 10 units, whole numbers above. `round`: a single dimension (circle, or no minor axis).
 */
export function apparentSize(
  o: Pick<DeepSkyObject, "majorAxis" | "minorAxis">,
): { unit: "arcmin" | "deg"; a: number; b: number; round: boolean } | null {
  if (!o.majorAxis) return null;
  const deg = o.majorAxis > 120;
  const k = deg ? 1 / 60 : 1;
  const fmt = (x: number) => (x * k < 10 ? Math.round(x * k * 10) / 10 : Math.round(x * k));
  const a = fmt(o.majorAxis);
  const b = o.minorAxis === undefined ? a : fmt(o.minorAxis);
  return { unit: deg ? "deg" : "arcmin", a, b, round: b === a };
}

/** Common name in the app's language, else the first designation ("M 13", "NGC 869"). */
export function deepSkyLabel(o: DeepSkyObject, names: Readonly<Record<string, string>>): string {
  return names[o.id] ?? o.designations[0]!;
}

/** Objects as the map draws them (designation, localised name, glyph data). */
export function deepSkyMapObjects(
  objects: readonly DeepSkyObject[],
  names: Readonly<Record<string, string>>,
): DeepSkyMapObject[] {
  return objects.map((o) => ({
    id: o.id,
    type: o.type,
    ra: o.ra,
    dec: o.dec,
    mag: o.mag,
    majorAxis: o.majorAxis,
    minorAxis: o.minorAxis,
    positionAngle: o.positionAngle,
    messier: o.messier,
    label: o.designations[0]!,
    name: names[o.id],
  }));
}

/** Objects as the search indexes them (#99): localised and English names, designations. */
export function deepSkySearchSources(
  objects: readonly DeepSkyObject[],
  names: Readonly<Record<string, string>>,
  typeLabel: (type: DeepSkyType) => string,
): SearchDeepSky[] {
  return objects.map((o) => ({
    id: o.id,
    label: deepSkyLabel(o, names),
    kind: typeLabel(o.type),
    designations: o.designations,
    names: [names[o.id], ...o.names].filter((n): n is string => !!n),
    mag: o.mag,
    messier: o.messier,
  }));
}
