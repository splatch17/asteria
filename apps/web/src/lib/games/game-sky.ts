/**
 * The sky of the games (#163, #164): a SkyMap of its own (same stars, lines, figures and
 * highlight as the map), without names, planets, grids or deep sky, and a ground the colour of
 * the sky. A constellation is shown at the zenith of a made-up observer (zenithObserver): north
 * up, east left, the horizon far outside the frame.
 */
import {
  SkyMap,
  type CatalogStar,
  type FigureLevel,
  type SkyLayers,
  type SkyTheme,
  type ViewState,
} from "@asteria/sky-renderer";
import { zenithObserver, type ConstellationShape } from "./geometry";

/** The theme with no day blue and no visible ground (the frame never reaches the horizon). */
export const gameTheme = (theme: SkyTheme): SkyTheme => ({
  ...theme,
  daySky: theme.sky,
  ground: theme.sky,
});

export interface GameSkyOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  stars: CatalogStar[];
  lines: Record<string, number[][]>;
  names: Readonly<Record<string, string>>;
  theme: SkyTheme;
  figureSet: string;
  date: Date;
  level: FigureLevel;
  layers: Partial<SkyLayers>;
  onViewChange?: (view: Readonly<ViewState>) => void;
}

/** The games' sky map, or undefined without WebGL (the game then goes on without the sky). */
export function createGameSky(o: GameSkyOptions): SkyMap | undefined {
  let map: SkyMap;
  try {
    map = new SkyMap({
      canvas: o.canvas,
      overlay: o.overlay,
      stars: o.stars,
      lines: o.lines,
      constellationNames: o.names as Record<string, string>,
      theme: gameTheme(o.theme),
      figureSet: o.figureSet,
      ...(o.onViewChange && { onViewChange: o.onViewChange }),
      layers: {
        constellationNames: false,
        starNames: false,
        planets: false,
        allPaths: false,
        equatorialGrid: false,
        azimuthalGrid: false,
        ecliptic: false,
        seeThroughGround: true,
        deepSky: false,
        ...o.layers,
      },
    });
  } catch (e) {
    console.error(e);
    return undefined;
  }
  map.setDate(o.date);
  map.figureLayer.setLevel(o.level);
  return map;
}

/** Puts a figure at the zenith, north up, with the given field of view. */
export function showFigure(map: SkyMap, shape: ConstellationShape, date: Date, fov: number): void {
  map.setObserver(zenithObserver(shape.centre, date));
  map.setView({ azimuth: 180, altitude: 90, roll: 0, fov });
}
