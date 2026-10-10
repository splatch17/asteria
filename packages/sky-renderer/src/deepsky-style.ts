/**
 * Deep-sky glyphs of the sky map (#101): engraved 1-bit symbols, one per kind of object, in the
 * two inks of the art direction (docs/ART_DIRECTION.md). Pure rules (tested) and their GLSL twins,
 * as for the stars (star-style.ts).
 *
 * Glyphs (the usual symbols of star atlases, engraved):
 *  - galaxy: ellipse along the major axis at the position angle, dithered core, solid nucleus;
 *    a group of galaxies has a dashed outline;
 *  - open cluster: dotted circle; an association, asterism or double star: sparser dots;
 *  - globular cluster: circle crossed by its two diameters, dithered core;
 *  - planetary nebula: small ring, centre dot (the central star), four outward ticks;
 *  - nebula (emission or unclassified): irregular dithered patch inside square corner brackets;
 *    a reflection nebula is sparser; a cluster with nebulosity adds the cluster's dotted ring;
 *  - dark nebula: dashed square, diagonal engraved hatching;
 *  - supernova remnant: irregular dithered shell.
 *
 * Size: the apparent dimension (OpenNGC axes) projected at the object's place, never under the
 * kind's minimum (a little larger for bright objects), so a small object stays a readable symbol.
 *
 * Visibility: an object is drawn while its rank (deepSkyRank: magnitude, Messier and well-known
 * objects first) is below the deep-sky limit of the field (deepSkyLimit), so zooming in reveals
 * fainter objects, fading in over GLYPH_FADE magnitudes. With the realisticDaylight layer, daylight
 * lowers that limit (DEEP_SKY_DAYLIGHT_EXTINCTION); below the horizon it is always night (#65).
 */

/** Glyph shape codes (the `aShape` attribute of the shader). */
export const GLYPH = {
  GALAXY: 0,
  OPEN_CLUSTER: 1,
  GLOBULAR_CLUSTER: 2,
  PLANETARY_NEBULA: 3,
  NEBULA: 4,
  REFLECTION_NEBULA: 5,
  CLUSTER_NEBULA: 6,
  DARK_NEBULA: 7,
  SUPERNOVA_REMNANT: 8,
  STAR_GROUP: 9,
  GALAXY_GROUP: 10,
} as const;
export type GlyphShape = (typeof GLYPH)[keyof typeof GLYPH];

/** Glyph of each catalogue type (`DeepSkyType` of @asteria/catalog). */
const SHAPE_OF: Readonly<Record<string, GlyphShape>> = {
  galaxy: GLYPH.GALAXY,
  "galaxy-group": GLYPH.GALAXY_GROUP,
  "globular-cluster": GLYPH.GLOBULAR_CLUSTER,
  "open-cluster": GLYPH.OPEN_CLUSTER,
  "cluster-nebula": GLYPH.CLUSTER_NEBULA,
  association: GLYPH.STAR_GROUP,
  "planetary-nebula": GLYPH.PLANETARY_NEBULA,
  "emission-nebula": GLYPH.NEBULA,
  "reflection-nebula": GLYPH.REFLECTION_NEBULA,
  nebula: GLYPH.NEBULA,
  "dark-nebula": GLYPH.DARK_NEBULA,
  "supernova-remnant": GLYPH.SUPERNOVA_REMNANT,
  "double-star": GLYPH.STAR_GROUP,
  asterism: GLYPH.STAR_GROUP,
};

/** Glyph of a catalogue type; an unknown type is drawn as a generic nebula. */
export function glyphShape(type: string): GlyphShape {
  return SHAPE_OF[type] ?? GLYPH.NEBULA;
}

/** Shapes always drawn as circles (no meaningful orientation). */
const ROUND: ReadonlySet<GlyphShape> = new Set([
  GLYPH.OPEN_CLUSTER,
  GLYPH.GLOBULAR_CLUSTER,
  GLYPH.PLANETARY_NEBULA,
  GLYPH.STAR_GROUP,
]);

export const DEEP_SKY_STYLE = {
  /** Smallest semi-major axis on screen (CSS px), per shape (index = GLYPH code). */
  MIN_RADIUS: [5.5, 6, 5.5, 5.5, 6.5, 6.5, 7, 6, 6.5, 6.5, 6] as readonly number[],
  /** The minimum grows by this share per magnitude brighter than BRIGHT_FROM (up to BRIGHT_MAX). */
  BRIGHT_GAIN: 0.06,
  BRIGHT_FROM: 6,
  BRIGHT_MAX: 6,
  /** Smallest axis ratio drawn: galaxies (edge-on ones stay ellipses), other oriented shapes. */
  MIN_RATIO_GALAXY: 0.32,
  MIN_RATIO: 0.55,
  /** Smallest semi-minor axis on screen (CSS px). */
  MIN_MINOR: 3,
  /** Largest semi-major axis, in screen half-heights (huge objects at high zoom). */
  MAX_RADIUS_HALF_HEIGHTS: 2,
  /** Room around the ellipse for strokes and ticks (CSS px). */
  PAD: 2.5,
  /** Ink opacity of the glyphs at night (raised by day like the lines: dayInkAlpha). */
  ALPHA: 0.78,
  /** An object fades in over this many magnitudes before its rank reaches the limit. */
  GLYPH_FADE: 0.6,
  /** Labels only for objects this far inside the limit (fully drawn). */
  LABEL_MARGIN: 1.5,
} as const;

/**
 * Rank used for visibility and label priority: the magnitude, lowered for Messier objects
 * (MESSIER_BONUS) and objects with a common name (NAMED_BONUS), so the well-known ones show
 * first. Without a magnitude (large nebulae, dark clouds), NO_MAG_RANK, or NO_MAG_LARGE_RANK
 * for an object of a degree or more.
 */
export const DEEP_SKY_RANK = {
  MESSIER_BONUS: 1.5,
  NAMED_BONUS: 1,
  NO_MAG_RANK: 8,
  NO_MAG_LARGE_RANK: 5.5,
  LARGE_ARCMIN: 60,
} as const;

/** The fields of a deep-sky object the glyph needs (a subset of `DeepSkyMapObject`). */
export interface GlyphSource {
  type: string;
  /** Magnitude used for visibility (the brighter of V and B when V is doubtful, see the app). */
  mag?: number | undefined;
  /** Axes in arcminutes; position angle in degrees, from north through east. */
  majorAxis?: number | undefined;
  minorAxis?: number | undefined;
  positionAngle?: number | undefined;
  messier?: number | undefined;
  /** Common (localised) name, if any: well-known objects come first. */
  name?: string | undefined;
}

export interface GlyphParams {
  shape: GlyphShape;
  /** Half the major axis, radians (0 when unknown: the glyph keeps its minimum size). */
  semiMajor: number;
  /** Minor / major axis drawn, in [MIN_RATIO…, 1]; 1 for round shapes. */
  ratio: number;
  /** Position angle of the major axis, radians from north through east (0 when unknown). */
  positionAngle: number;
  /** Smallest semi-major axis on screen, CSS px. */
  minRadius: number;
  /** Visibility and label priority (lower first), see deepSkyRank. */
  rank: number;
}

const ARCMIN = Math.PI / (180 * 60);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Visibility rank of an object (see DEEP_SKY_RANK). */
export function deepSkyRank(o: GlyphSource): number {
  const R = DEEP_SKY_RANK;
  const base =
    o.mag ?? ((o.majorAxis ?? 0) >= R.LARGE_ARCMIN ? R.NO_MAG_LARGE_RANK : R.NO_MAG_RANK);
  return base - (o.messier ? R.MESSIER_BONUS : 0) - (o.name ? R.NAMED_BONUS : 0);
}

/** Shape, size, orientation and rank of an object's glyph. */
export function glyphParams(o: GlyphSource): GlyphParams {
  const S = DEEP_SKY_STYLE;
  const shape = glyphShape(o.type);
  const major = o.majorAxis ?? 0;
  const round = ROUND.has(shape);
  const minRatio =
    shape === GLYPH.GALAXY || shape === GLYPH.GALAXY_GROUP ? S.MIN_RATIO_GALAXY : S.MIN_RATIO;
  const ratio = round || !major || !o.minorAxis ? 1 : clamp(o.minorAxis / major, minRatio, 1);
  const bright = o.mag === undefined ? 0 : clamp(S.BRIGHT_FROM - o.mag, 0, S.BRIGHT_MAX);
  return {
    shape,
    semiMajor: (major / 2) * ARCMIN,
    ratio,
    positionAngle: round ? 0 : ((o.positionAngle ?? 0) * Math.PI) / 180,
    minRadius: S.MIN_RADIUS[shape]! * (1 + S.BRIGHT_GAIN * bright),
    rank: deepSkyRank(o),
  };
}

/**
 * Faintest rank drawn for a vertical field of view (degrees): 6.2 at 90°, one magnitude deeper
 * each time the field shrinks by 10^(1/4) ≈ 1.8, between 4.5 (whole sky) and 11 (whole catalogue).
 * At the default 100° field: Messier objects to magnitude ≈ 7.5 and the brightest others; at 20°,
 * nearly everything.
 */
export function deepSkyLimit(fov: number): number {
  return clamp(6.2 + 4 * Math.log10(90 / fov), 4.5, 11);
}

/**
 * Widest field (degrees) in which an object of this rank is drawn and named (deepSkyLimit
 * inverted, with LABEL_MARGIN): where a search brings the view so the object shows among its
 * neighbours. At least 2° (the narrowest field of the map).
 */
export function deepSkyFieldFor(rank: number): number {
  return Math.max(2, 90 * 10 ** ((6.2 - rank - DEEP_SKY_STYLE.LABEL_MARGIN) / 4));
}

/**
 * Magnitudes daylight takes from the deep-sky limit at full day with the realisticDaylight layer:
 * more than for the stars (DAYLIGHT_EXTINCTION = 7), as extended objects are spread over the
 * bright sky: none remains by day.
 */
export const DEEP_SKY_DAYLIGHT_EXTINCTION = 10;

/**
 * Deep-sky limit above the horizon (`daylight`: 0 night … 1 day, see daylight.ts): unchanged
 * unless the realistic daylight layer is on (#106).
 */
export function deepSkyDayLimit(fov: number, daylight: number, realistic: boolean): number {
  const limit = deepSkyLimit(fov);
  return realistic ? limit - daylight * DEEP_SKY_DAYLIGHT_EXTINCTION : limit;
}

/** Opacity factor of a glyph from its rank and the limit (0: not drawn), as in the shader. */
export function glyphVisibility(rank: number, limit: number): number {
  return clamp((limit - rank) / DEEP_SKY_STYLE.GLYPH_FADE, 0, 1);
}

/** The object is labelled (well inside the limit). */
export function glyphLabelled(rank: number, limit: number): boolean {
  return rank <= limit - DEEP_SKY_STYLE.LABEL_MARGIN;
}

/**
 * Semi-axes on screen (CSS px) of a glyph whose centre lies at view-frame depth `z`: the angular
 * size times the local scale of the stereographic projection, 2/(1+z) · scale · halfHeight px per
 * radian (conformal: the same in every direction), never under the minimum nor over
 * MAX_RADIUS_HALF_HEIGHTS. Writes [semi-major, semi-minor] into `out`.
 */
export function glyphAxes(
  p: Pick<GlyphParams, "semiMajor" | "ratio" | "minRadius">,
  z: number,
  scale: number,
  halfHeight: number,
  out: [number, number] = [0, 0],
): [number, number] {
  const S = DEEP_SKY_STYLE;
  const pxPerRad = (2 / (1 + Math.max(z, -0.999))) * scale * halfHeight;
  const a = clamp(p.semiMajor * pxPerRad, p.minRadius, S.MAX_RADIUS_HALF_HEIGHTS * halfHeight);
  out[0] = a;
  out[1] = Math.max(a * p.ratio, Math.min(a, S.MIN_MINOR));
  return out;
}

/**
 * Unit vector (J2000) along the major axis on the sky at the object's place: cos(PA)·north +
 * sin(PA)·east, with north towards the celestial pole and east towards increasing RA. `ra`, `dec`
 * in degrees.
 */
export function majorAxisDirection(
  ra: number,
  dec: number,
  positionAngle: number,
): [number, number, number] {
  const a = (ra * Math.PI) / 180;
  const d = (dec * Math.PI) / 180;
  const [sa, ca, sd, cd] = [Math.sin(a), Math.cos(a), Math.sin(d), Math.cos(d)];
  const north = [-sd * ca, -sd * sa, cd];
  const east = [-sa, ca, 0];
  const [c, s] = [Math.cos(positionAngle), Math.sin(positionAngle)];
  return [c * north[0]! + s * east[0]!, c * north[1]! + s * east[1]!, c * north[2]! + s * east[2]!];
}

const g = (x: number) => x.toFixed(4);
const S = DEEP_SKY_STYLE;

/** GLSL twin of glyphAxes: `vec2 glyphAxes(semiMajor, ratio, minRadius, z, scale, halfHeight)`. */
export const DEEP_SKY_AXES_GLSL = /* glsl */ `
  vec2 glyphAxes(float semiMajor, float ratio, float minRadius, float z, float scale, float halfHeight) {
    float pxPerRad = 2.0 / (1.0 + max(z, -0.999)) * scale * halfHeight;
    float a = clamp(semiMajor * pxPerRad, minRadius, ${g(S.MAX_RADIUS_HALF_HEIGHTS)} * halfHeight);
    return vec2(a, max(a * ratio, min(a, ${g(S.MIN_MINOR)})));
  }
`;
