/**
 * Layers panel (#54): catalogue of the switchable layers, and their persistence.
 *
 * Each view (sky map, Earth view) keeps its own layers state, remembered between sessions.
 * Adding a layer (Milky Way, Messier, ISS, boundaries…) = a renderer key in SkyLayers, then one
 * entry here (section, icon, i18n keys `layers.<key>` and optionally `layers.<key>.hint`).
 */
import type { GraduationKind, SkyLayers } from "@asteria/sky-renderer";
import type { IconName } from "./icons";

export type LayerKey = keyof SkyLayers;
export type LayerView = "sky" | "space";

export interface LayerEntry {
  key: LayerKey;
  /** Icon name in Icon.svelte. */
  icon: IconName;
  /** Short explanation under the label (i18n key `layers.<key>.hint`). */
  hint?: boolean;
  /** Views where the renderer honours this layer. */
  views: readonly LayerView[];
}

export interface LayerSection {
  /** i18n key `layers.section.<id>`. */
  id: string;
  entries: readonly LayerEntry[];
}

const BOTH: readonly LayerView[] = ["sky", "space"];
const SKY: readonly LayerView[] = ["sky"];

export const LAYER_SECTIONS: readonly LayerSection[] = [
  {
    id: "sky",
    entries: [
      { key: "constellationLines", icon: "lines", views: BOTH },
      { key: "constellationNames", icon: "conNames", views: SKY },
      { key: "starNames", icon: "starNames", views: SKY },
      { key: "seeThroughGround", icon: "seeThrough", hint: true, views: SKY },
    ],
  },
  {
    id: "solar",
    entries: [
      { key: "planets", icon: "planets", views: BOTH },
      { key: "allPaths", icon: "paths", hint: true, views: SKY },
    ],
  },
  {
    id: "guides",
    entries: [
      { key: "equatorialGrid", icon: "eqGrid", hint: true, views: BOTH },
      { key: "azimuthalGrid", icon: "azGrid", hint: true, views: SKY },
      { key: "ecliptic", icon: "ecliptic", hint: true, views: BOTH },
    ],
  },
];

/** Sections restricted to the entries a view honours (empty sections dropped). */
export function sectionsFor(view: LayerView): LayerSection[] {
  return LAYER_SECTIONS.map((s) => ({
    ...s,
    entries: s.entries.filter((e) => e.views.includes(view)),
  })).filter((s) => s.entries.length > 0);
}

export const LAYERS_STORAGE_KEY: Record<LayerView, string> = {
  sky: "asteria.layers.sky",
  space: "asteria.layers.space",
};

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Restores remembered layers over the defaults: only known keys with boolean values are kept,
 * so a damaged or older/newer record never breaks the map (new layers get their default).
 */
export function restoreLayers(saved: unknown, defaults: Readonly<SkyLayers>): SkyLayers {
  const layers = { ...defaults };
  if (!isRecord(saved)) return layers;
  for (const key of Object.keys(defaults) as LayerKey[]) {
    const value = saved[key];
    if (typeof value === "boolean") layers[key] = value;
  }
  return layers;
}

/** What is written to storage: the full state, known keys only. */
export function serializeLayers(layers: Readonly<SkyLayers>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(layers).filter(([, v]) => typeof v === "boolean"));
}

/**
 * Layers from the URL (captures): `?layers=equatorialGrid,ecliptic` switches these on over the
 * defaults, `-key` switches one off. Returns null without the parameter (the memory applies).
 */
export function layersFromUrl(
  param: string | null,
  defaults: Readonly<SkyLayers>,
): SkyLayers | null {
  if (param === null) return null;
  const layers = { ...defaults };
  for (const raw of param.split(",")) {
    const off = raw.startsWith("-");
    const key = (off ? raw.slice(1) : raw).trim();
    if (key in layers) layers[key as LayerKey] = !off;
  }
  return layers;
}

/**
 * Graduation text through i18n, with a prefix per kind so that several grids stay readable
 * ("δ +20°", "Az 90°", "h 30°", "λ 120°", "8h"). `t` is the svelte-i18n formatter.
 */
export function graduationFormatter(
  t: (key: string, options: { values: Record<string, string | number> }) => string,
): (kind: GraduationKind, value: number) => string {
  return (kind, value) => {
    if (kind === "ra") return t("layers.grad.ra", { values: { h: Math.round(value / 15) } });
    const sign = value > 0 && kind === "dec" ? "+" : value < 0 ? "−" : "";
    return t(`layers.grad.${kind}`, { values: { sign, n: Math.abs(value) } });
  };
}
