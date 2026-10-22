/**
 * The sky of the games (#163, #164): a SkyMap of its own (same stars, lines, figures and
 * highlight as the map), without names, planets, grids or deep sky, and a ground the colour of
 * the sky. A constellation is shown at the zenith of a made-up observer (zenithObserver): north
 * up, east left, the horizon far outside the frame. *
 * Zoom (#183): the players of Découverte and Amateur (and every level once a question is
 * answered) may pinch or scroll out, and pan, to see where the figure sits in the sky; the view
 * stays within zoomLimits (never wider than what keeps the made-up horizon off the screen) and
 * goes back to the framing with « Recentrer » or at the next question.
 */
import {
  SkyMap,
  type CatalogStar,
  type FigureLevel,
  type SkyLayers,
  type SkyTheme,
  type ViewLimits,
  type ViewState,
  fovForCornerAngle,
} from "@asteria/sky-renderer";
import type { Vec3 } from "@asteria/astro-core";
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

/** The view of a framing: the zenith, north up turned by `roll` degrees, with the given field. */
export function framedView(fov: number, roll = 0): ViewState {
  return { azimuth: 180, altitude: 90, roll, fov };
}

/** Puts a figure at the zenith, north up (or turned by `roll`), with the given field of view. */
export function showFigure(
  map: SkyMap,
  shape: ConstellationShape,
  date: Date,
  fov: number,
  roll = 0,
): ViewState {
  return showDirection(map, shape.centre, date, fov, roll);
}

/**
 * Puts a direction (J2000 unit vector) at the zenith, north up (or turned by `roll` degrees),
 * with the given field of view; returns that view (the framing « Recentrer » goes back to).
 */
export function showDirection(
  map: SkyMap,
  centre: Vec3,
  date: Date,
  fov: number,
  roll = 0,
): ViewState {
  const view = framedView(fov, roll);
  map.setObserver(zenithObserver(centre, date));
  map.setView(view);
  return view;
}

/**
 * The screen's corners stay this close to the zenith (degrees) while zooming out or panning:
 * the made-up horizon and its glow (≈ 5° high) stay off the screen.
 */
export const ZENITH_REACH = 84;
/** Zooming in stops at this fraction of the framing's field. */
export const ZOOM_IN = 0.6;

/**
 * Bounds of the player's zoom around a framing of field `fov` on a stage of the given aspect
 * (width / height): in to ZOOM_IN of it, out to the widest field whose corners stay within
 * ZENITH_REACH of the zenith (never narrower than the framing itself), panning within that cap.
 */
export function zoomLimits(fov: number, aspect: number): ViewLimits {
  const widest = fovForCornerAngle(ZENITH_REACH, aspect);
  return { minFov: fov * ZOOM_IN, maxFov: Math.max(fov, widest), zenithReach: ZENITH_REACH };
}

/** Angle between two angles in degrees, in [0, 180]. */
const turn = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/**
 * The player has moved the view away from its framing (zoom, pan or twist): « Recentrer » is
 * then offered. Tolerances absorb the rounding of the map's own clamping.
 */
export function viewMoved(view: Readonly<ViewState>, framed: Readonly<ViewState>): boolean {
  if (Math.abs(view.fov - framed.fov) > 0.05) return true;
  if (Math.abs(view.altitude - framed.altitude) > 0.05) return true;
  // At the zenith, azimuth and roll turn the screen alike: only roll − azimuth tells its turn.
  const spin = (v: Readonly<ViewState>) => (v.roll ?? 0) - v.azimuth;
  if (framed.altitude > 89.95 && view.altitude > 89.95)
    return turn(spin(view), spin(framed)) > 0.05;
  return turn(view.azimuth, framed.azimuth) > 0.05 || turn(view.roll ?? 0, framed.roll ?? 0) > 0.05;
}

/**
 * Keeps the picture while moving the made-up observer's zenith to the view centre (#184): the
 * whole sky can then be panned without ever nearing the horizon (no dimmed ground side). The
 * roll is chosen so that what was up on screen stays up. `width`, `height`: canvas, CSS px.
 */
export function recentre(map: SkyMap, date: Date, width: number, height: number): void {
  const [cx, cy] = [width / 2, height / 2];
  const centre = map.directionAt(cx, cy);
  const up = map.directionAt(cx, cy - Math.min(40, height / 4));
  map.setObserver(zenithObserver(centre, date));
  const out = new Float64Array(2);
  const angleOf = (roll: number): number => {
    map.setView({ azimuth: 180, altitude: 90, roll });
    map.projectDirections(up, out);
    return Math.atan2(out[0]! - cx, cy - out[1]!); // 0 when `up` is straight up
  };
  const phi = angleOf(0);
  if (!Number.isFinite(phi) || Math.abs(phi) < 1e-6) return;
  // Roll turns the picture about the centre; its sign convention is checked, not assumed.
  const roll = (phi * 180) / Math.PI;
  if (Math.abs(angleOf(roll)) > Math.abs(phi) / 2) angleOf(-roll);
}

/** Looks straight at a direction (J2000) with the given roll and field, as `recentre` leaves it. */
export function aimAt(map: SkyMap, dir: Vec3, date: Date, roll: number, fov: number): void {
  map.setObserver(zenithObserver(dir, date));
  map.setView({ azimuth: 180, altitude: 90, roll, fov });
}
