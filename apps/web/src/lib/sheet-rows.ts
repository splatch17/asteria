/**
 * What the map's sheets show at each level (#201): the same object reads differently for a child
 * and for a researcher.
 * - Découverte: one or two short sentences (rank of brightness, colour in words, how far its
 *   light travels), whether it can be seen now and where to look, or when it rises; the distance
 *   in words. No coordinates.
 * - Amateur: the same, plus the magnitude, the colour and the distance as data rows.
 * - Expert: the full data block (AD / Déc., V, B−V, distance), plus altitude and azimuth; no
 *   sentence.
 * Every sentence is derived from the catalogue or from astro-core, nothing is written by hand
 * per object. The strings come from the i18n catalogue through `t`, numbers through `fmt`.
 */
import type { FigureLevel } from "@asteria/sky-renderer";
import { compassPoint } from "./hud";
import type { Observability } from "./deepsky";
import type { Sight } from "./sight";

export interface SheetRow {
  label: string;
  value: string;
  /** Spoken and shown on hover, e.g. why a distance is approximate. */
  title?: string | undefined;
}

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface SheetFormat {
  /** A number with `digits` decimals, in the reader's language (decimal comma in French). */
  num: (x: number, digits: number) => string;
  ra: (deg: number) => string;
  dec: (deg: number) => string;
  /** A local clock time, « 22 h 59 ». */
  clock: (ms: number) => string;
}

export interface Sheet {
  /** Short sentences under the name (Découverte, Amateur). */
  lead: string[];
  /**
   * Can it be seen, where, or when it rises (Découverte, Amateur); null in Expert, where the
   * altitude and azimuth rows say it and the usual « Sous l'horizon » line stays.
   */
  sight: string | null;
  rows: SheetRow[];
  /** Show the constellation's Latin name next to its name (not in Découverte). */
  latin: boolean;
}

// --- Colour of a star, from B−V.

export type StarColour = "blue" | "white" | "yellowWhite" | "yellow" | "orange" | "red";

/**
 * B−V boundaries of the spectral classes for dwarfs, Pecaut & Mamajek 2013 (ApJS 208, 9), table
 * « A Modern Mean Dwarf Stellar Color and Effective Temperature Sequence »: A0V 0.00, F0V 0.32,
 * G0V 0.59, K0V 0.82, M0V 1.43. Each class is named by the colour it is usually given (O-B
 * bluish, A white, F pale yellow, G yellow, K orange, M orange-red). The word describes the
 * colour index, so it holds for giants too (Betelgeuse 1.50, Arcturus 1.24).
 */
export const BV_COLOURS: readonly (readonly [below: number, colour: StarColour])[] = [
  [0, "blue"],
  [0.32, "white"],
  [0.59, "yellowWhite"],
  [0.82, "yellow"],
  [1.43, "orange"],
];

export function starColour(bv: number): StarColour {
  for (const [below, colour] of BV_COLOURS) if (bv < below) return colour;
  return "red";
}

const capitalise = (s: string) => s.charAt(0).toLocaleUpperCase("fr") + s.slice(1);

// --- Where to look.

/**
 * The sight line: « Visible maintenant · ↑ 35° vers le sud-est », « Sous l'horizon · se lève à
 * 22 h 59 » (« cette nuit » after midnight seen from the evening, else « demain » on the next
 * local day). `live`: the date shown is now (else « à cette
 * heure-là »). `fixed`: a star or a deep-sky object (one that does not rise in the next day never
 * rises from there).
 */
export function sightLine(
  sight: Sight,
  t: Translate,
  fmt: SheetFormat,
  o: { now: number; live: boolean; fixed: boolean; sun?: boolean },
): string {
  switch (sight.state) {
    case "visible":
    case "daylight": {
      const values = {
        alt: Math.round(sight.altitude),
        dir: t(`compass.dir.${compassPoint(sight.azimuth)}`),
      };
      if (o.sun) return t("sight.sun", values);
      if (sight.state === "daylight") return t("sight.daylight", values);
      return t(o.live ? "sight.visible" : "sight.visibleThen", values);
    }
    case "rises": {
      const at = new Date(sight.at);
      const now = new Date(o.now);
      const time = fmt.clock(sight.at);
      if (at.toDateString() === now.toDateString()) return t("sight.rises", { time });
      // After midnight, seen from the evening: « cette nuit à 2 h 12 », as the ISS sheet says.
      if (now.getHours() >= 12 && at.getHours() < 6) return t("sight.risesTonight", { time });
      return t("sight.risesTomorrow", { time });
    }
    case "down":
      return t(o.fixed ? "sight.never" : "sight.notToday");
  }
}

// --- Stars.

export interface StarFacts {
  /** Position at the date shown (proper motion applied), degrees. */
  ra: number;
  dec: number;
  v: number;
  bv?: number | undefined;
  altitude: number;
  azimuth: number;
  /** Reference distance (lib/format `starDistance`), null if unknown. */
  distance: { ly: number; approx: boolean } | null;
  /** Its source and uncertainty, for the distance row's title. */
  distanceTitle?: string | undefined;
  /** Rank by brightness worth saying (lib/games/name-star `rankFact`). */
  rank: { kind: "sky" | "constellation"; rank: number } | null;
  /** « d'Orion »: the constellation as a complement (@asteria/content `constellationNamesOf`). */
  conOf: string;
}

/** Title of a star without a proper name nor a Bayer letter: « Étoile de Pégase ». */
export const unnamedStarTitle = (t: Translate, conOf: string) =>
  t("sheet.star.unnamed", { of: conOf });

function starLead(f: StarFacts, t: Translate): string[] {
  const lead: string[] = [];
  if (f.rank?.kind === "sky") lead.push(t("sheet.star.rankSky", { rank: f.rank.rank }));
  else if (f.rank) lead.push(t("sheet.star.rankConstellation", { rank: f.rank.rank, of: f.conOf }));
  if (f.bv !== undefined)
    lead.push(t("sheet.star.colour", { colour: t(`sheet.colour.${starColour(f.bv)}`) }));
  return lead;
}

export function starSheet(
  level: FigureLevel,
  f: StarFacts,
  sight: string,
  t: Translate,
  fmt: SheetFormat,
): Sheet {
  const d = f.distance;
  const distance = (words: boolean): SheetRow => ({
    label: t("data.dist"),
    value: !d
      ? t("star.unknownDistance")
      : t(
          words
            ? d.approx
              ? "sheet.lyWordsApprox"
              : "sheet.lyWords"
            : d.approx
              ? "star.distanceApprox"
              : "star.distance",
          { ly: d.ly },
        ),
    title: f.distanceTitle,
  });
  if (level === "discovery")
    return { lead: starLead(f, t), sight, rows: d ? [distance(true)] : [], latin: false };
  if (level === "amateur") {
    const rows: SheetRow[] = [{ label: t("data.magnitude"), value: fmt.num(f.v, 1) }];
    if (f.bv !== undefined)
      rows.push({
        label: t("sheet.colour"),
        value: capitalise(t(`sheet.colour.${starColour(f.bv)}`)),
      });
    rows.push(distance(false));
    return { lead: starLead(f, t), sight, rows, latin: true };
  }
  const rows: SheetRow[] = [
    { label: t("data.ra"), value: fmt.ra(f.ra) },
    { label: t("data.dec"), value: fmt.dec(f.dec) },
    { label: t("data.v"), value: fmt.num(f.v, 2) },
  ];
  if (f.bv !== undefined) rows.push({ label: t("data.bv"), value: fmt.num(f.bv, 2) });
  rows.push(distance(false), ...horizontalRows(f, t, fmt));
  return { lead: [], sight: null, rows, latin: true };
}

function horizontalRows(
  p: { altitude: number; azimuth: number },
  t: Translate,
  fmt: SheetFormat,
): SheetRow[] {
  return [
    { label: t("body.altitude"), value: `${fmt.num(p.altitude, 1)}°` },
    { label: t("body.azimuth"), value: `${fmt.num(p.azimuth, 1)}°` },
  ];
}

// --- Planets, Sun and Moon.

const KM_PER_AU = 149_597_870.7;
const LIGHT_KM_PER_MIN = 299_792.458 * 60;

/** A distance in kilometres for children: « 840 millions de km », « 4,3 milliards de km ». */
function kmInWords(km: number, t: Translate, fmt: SheetFormat): string {
  if (km < 1e6) return t("body.distance", { km: Math.round(km / 100) * 100 });
  if (km < 1e9) return t("sheet.millionKm", { n: Number((km / 1e6).toPrecision(3)) });
  const n = Number((km / 1e9).toPrecision(2));
  return t("sheet.billionKm", { n: fmt.num(n, Number.isInteger(n) ? 0 : 1), count: n });
}

/** How long light takes to come from it: « 47 minutes », « 4 h 10 min ». */
function lightTime(km: number, t: Translate): string {
  const minutes = Math.round(km / LIGHT_KM_PER_MIN);
  return minutes < 60
    ? t("sheet.minutes", { min: minutes })
    : t("sheet.hoursMinutes", { h: Math.floor(minutes / 60), min: minutes % 60 });
}

export interface PlanetFacts {
  name: string;
  ra: number;
  dec: number;
  altitude: number;
  azimuth: number;
  magnitude: number;
  distanceKm: number;
  /** Catalogue stars brighter than the planet now (V lower than its magnitude). */
  brighterStars: number;
}

export function planetSheet(
  level: FigureLevel,
  f: PlanetFacts,
  sight: string,
  t: Translate,
  fmt: SheetFormat,
): Sheet {
  const au = Math.round((f.distanceKm / KM_PER_AU) * 100) / 100;
  const minutes = Math.round(f.distanceKm / LIGHT_KM_PER_MIN);
  const light =
    minutes < 60
      ? t("planet.lightTime", { min: minutes })
      : t("planet.lightTimeHours", { h: Math.floor(minutes / 60), min: minutes % 60 });
  const distance: SheetRow[] = [
    { label: t("data.dist"), value: t("planet.distance", { au }) },
    { label: "", value: light },
  ];
  if (level === "expert")
    return {
      lead: [],
      sight: null,
      rows: [
        { label: t("data.v"), value: fmt.num(f.magnitude, 1) },
        ...horizontalRows(f, t, fmt),
        { label: t("data.ra"), value: fmt.ra(f.ra) },
        { label: t("data.dec"), value: fmt.dec(f.dec) },
        ...distance,
      ],
      latin: true,
    };
  const lead: string[] = [];
  if (f.brighterStars === 0) lead.push(t("sheet.planet.brightest", { name: f.name }));
  else if (f.brighterStars <= 25)
    lead.push(t("sheet.planet.brighter", { name: f.name, n: f.brighterStars }));
  lead.push(t("sheet.light", { time: lightTime(f.distanceKm, t) }));
  if (level === "discovery")
    return {
      lead,
      sight,
      rows: [{ label: t("data.dist"), value: kmInWords(f.distanceKm, t, fmt) }],
      latin: false,
    };
  return {
    lead,
    sight,
    rows: [{ label: t("data.magnitude"), value: fmt.num(f.magnitude, 1) }, ...distance],
    latin: true,
  };
}

export interface BodyFacts {
  body: "Sun" | "Moon";
  ra: number;
  dec: number;
  altitude: number;
  azimuth: number;
  distanceKm: number;
}

export function bodySheet(
  level: FigureLevel,
  f: BodyFacts,
  sight: string,
  t: Translate,
  fmt: SheetFormat,
): Sheet {
  const exact =
    f.body === "Sun"
      ? t("body.distanceAu", { au: Math.round((f.distanceKm / KM_PER_AU) * 1000) / 1000 })
      : t("body.distance", { km: Math.round(f.distanceKm) });
  if (level === "expert")
    return {
      lead: [],
      sight: null,
      rows: [
        ...horizontalRows(f, t, fmt),
        { label: t("data.ra"), value: fmt.ra(f.ra) },
        { label: t("data.dec"), value: fmt.dec(f.dec) },
        { label: t("data.dist"), value: exact },
      ],
      latin: true,
    };
  const lead = [t("sheet.light", { time: lightTime(f.distanceKm, t) })];
  return {
    // The Moon's light takes about a second: not worth a sentence.
    lead: f.body === "Sun" ? lead : [],
    sight,
    rows: [
      {
        label: t("data.dist"),
        value: level === "discovery" ? kmInWords(f.distanceKm, t, fmt) : exact,
      },
    ],
    latin: false,
  };
}

// --- Deep sky.

export interface DeepSkyFacts {
  ra: number;
  dec: number;
  altitude: number;
  azimuth: number;
  see: Observability | null;
  magnitude: { band: "V" | "B"; value: number } | null;
  /** Apparent size, already worded (lib/deepsky `apparentSize`), and its hint. */
  size: { value: string; title: string } | null;
}

export function deepSkySheet(
  level: FigureLevel,
  f: DeepSkyFacts,
  sight: string,
  t: Translate,
  fmt: SheetFormat,
): Sheet {
  const magnitude = (label: string): SheetRow[] =>
    f.magnitude ? [{ label, value: fmt.num(f.magnitude.value, 1) }] : [];
  const size: SheetRow[] = f.size
    ? [{ label: t("deepsky.size"), value: f.size.value, title: f.size.title }]
    : [];
  if (level === "expert") {
    const rows: SheetRow[] = [];
    if (f.see)
      rows.push({
        label: t("deepsky.see"),
        value: t(`deepsky.see.${f.see}`),
        title: t("deepsky.see.hint"),
      });
    rows.push(
      ...magnitude(t(f.magnitude?.band === "B" ? "data.b" : "data.v")),
      ...size,
      { label: t("data.ra"), value: fmt.ra(f.ra) },
      { label: t("data.dec"), value: fmt.dec(f.dec) },
      ...horizontalRows(f, t, fmt),
    );
    return { lead: [], sight: null, rows, latin: true };
  }
  const lead = f.see ? [t(`sheet.deepsky.see.${f.see}`)] : [];
  if (level === "discovery") return { lead, sight, rows: [], latin: false };
  return { lead, sight, rows: [...magnitude(t("data.magnitude")), ...size], latin: true };
}
