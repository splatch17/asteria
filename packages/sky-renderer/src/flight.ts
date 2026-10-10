/**
 * Continuous Sky ↔ Earth transition (#37): the camera flies between the observer's eye (the sky
 * map's point of view) and the orbit of the Earth view, through one family of poses.
 *
 * Progress is an altitude parameter s ∈ [0, 1]: s = 0 is the observer's eye on the ground,
 * looking where the sky map looks; s = 1 is the Earth view's orbit camera, looking at the
 * Earth's centre with celestial north up. Leaving the sky plays s from 0 to 1, landing plays it
 * back, so both directions follow the same path. Stars sit at infinity in both views (same
 * directions), so the celestial sphere stays put while the camera turns and climbs.
 *
 * Pure geometry (three.js maths only, no renderer): FlightPath.pose() fills caller-owned
 * vectors and is allocation-free, so it can run every frame.
 */
import * as THREE from "three";
import { viewMatrix, type ViewState } from "./view";

const DEG = Math.PI / 180;

/** Camera distance on the ground (Earth radii): ~4 km, above the faceted globe's surface. */
export const SURFACE_RADIUS = 1.0006;
/** Earth view distance after leaving the sky (same as SpaceView.focusObserver's default). */
export const ORBIT_RADIUS = 4;
/** Vertical field of view of the Earth view's camera, degrees. */
export const ORBIT_FOV = 40;
/** Widest perspective field the flight starts from (perspective breaks down beyond). */
export const MAX_PERSPECTIVE_FOV = 150;
/** Sky map view after landing: looking towards the horizon, wide field. */
export const LANDING_VIEW = { altitude: 20, fov: 120 } as const;
/** Duration of a flight, ms. */
export const FLIGHT_MS = 2200;
/**
 * Over-zoom that triggers a flight: the pinch or wheel must push this far past the limit
 * (product of the zoom factors beyond it), so that reaching the limit alone does not leave.
 */
export const OVERZOOM_THRESHOLD = 1.25;
/** Zooming in on the Earth enters the sky only when "you are here" is this close to the centre. */
export const DIVE_MAX_ANGLE = 35;

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Ease-in-out (sine) on [0, 1]: the time curve of a flight. Gentler at the ends than a cubic,
 * so the map answers the gesture at once (a cubic left it still for the first fifth).
 */
export const flightEase = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return (1 - Math.cos(Math.PI * x)) / 2;
};

/**
 * Altitude progress s at time fraction t of a flight: eased, and played backwards when landing.
 */
export function flightProgress(t: number, direction: "out" | "in"): number {
  const e = flightEase(t);
  return direction === "out" ? e : 1 - e;
}

/**
 * Perspective vertical field of view with the same angular scale at the centre of the screen as
 * the stereographic map (r = 2·tan(θ/2)·k, k = 1 / (2·tan(fov/4))): the starting frame of a flight
 * matches the map where the eye looks. Edges differ (no perspective reaches 200°): the short
 * cross-fade at the start of the flight covers them.
 */
export function perspectiveFovForStereo(stereoFovDeg: number): number {
  const fov = (2 * Math.atan(2 * Math.tan((stereoFovDeg * DEG) / 4))) / DEG;
  return Math.min(MAX_PERSPECTIVE_FOV, fov);
}

/**
 * Camera distance (Earth radii) at altitude progress s: geometric interpolation between the
 * ground and the orbit, so the climb looks steady at every scale (4 km → 25 000 km).
 */
export function flightRadius(s: number, orbit = ORBIT_RADIUS): number {
  const k = smoothstep(0.04, 1, s);
  return SURFACE_RADIUS * Math.exp(Math.log(orbit / SURFACE_RADIUS) * k);
}

/** Opacity of the sky map over the Earth view: it fades during the first fifth of the climb. */
export const skyOpacity = (s: number): number => 1 - smoothstep(0, 0.2, s);

/** Engraved globe detail (SpaceView's uDetail) at a camera distance: relief shows when close. */
export const globeDetail = (dist: number): number => Math.min(1, Math.max(0, (6 - dist) / 3.5));

/**
 * Accumulates zoom pushed beyond a limit (pinch or wheel steps): true once the product of the
 * overflows reaches the threshold within one gesture. Moving back inside the limit, or a pause
 * longer than `gapMs`, starts over.
 */
export class OverZoom {
  private excess = 1;
  private last = -Infinity;

  constructor(
    private readonly threshold = OVERZOOM_THRESHOLD,
    private readonly gapMs = 500,
  ) {}

  /** `beyond`: requested value / limit (> 1 when the gesture pushes past it). */
  push(beyond: number, now: number): boolean {
    if (now - this.last > this.gapMs) this.excess = 1;
    this.last = now;
    if (!(beyond > 1)) {
      this.excess = 1;
      return false;
    }
    this.excess *= beyond;
    if (this.excess < this.threshold) return false;
    this.excess = 1;
    return true;
  }

  reset(): void {
    this.excess = 1;
  }
}

/** Local horizon of the observer in the Earth view's world frame (equator of date). */
export interface HorizonBasis {
  north: THREE.Vector3;
  east: THREE.Vector3;
  up: THREE.Vector3;
}

/**
 * Observer's local basis in the world frame (equator of date, z = celestial pole), the Earth
 * turned by the Greenwich sidereal time `gstDeg`. `out` is filled and returned.
 */
export function horizonBasis(
  latitudeDeg: number,
  longitudeDeg: number,
  gstDeg: number,
  out: HorizonBasis = {
    north: new THREE.Vector3(),
    east: new THREE.Vector3(),
    up: new THREE.Vector3(),
  },
): HorizonBasis {
  const lon = (longitudeDeg + gstDeg) * DEG;
  const lat = latitudeDeg * DEG;
  out.up.set(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
  out.east.set(-Math.sin(lon), Math.cos(lon), 0);
  out.north.crossVectors(out.up, out.east);
  return out;
}

const scratchMatrix = new THREE.Matrix4();
const ORIGIN = new THREE.Vector3();
const CELESTIAL_NORTH = new THREE.Vector3(0, 0, 1);

/** Camera orientation looking along `forward` with `up` towards the top of the screen. */
export function lookQuaternion(
  forward: THREE.Vector3,
  up: THREE.Vector3,
  out: THREE.Quaternion,
): THREE.Quaternion {
  scratchMatrix.lookAt(ORIGIN, forward, up);
  return out.setFromRotationMatrix(scratchMatrix);
}

/**
 * Orientation of the sky map's view (azimuth, altitude, roll) as a camera on the ground: same
 * forward direction and same screen up (viewMatrix rows), expressed in the world frame.
 */
export function mapViewQuaternion(
  view: ViewState,
  basis: HorizonBasis,
  out: THREE.Quaternion,
  scratch = { f: new THREE.Vector3(), u: new THREE.Vector3() },
): THREE.Quaternion {
  const m = viewMatrix(view);
  const toWorld = (v: THREE.Vector3, n: number, e: number, u: number) =>
    v
      .copy(basis.north)
      .multiplyScalar(n)
      .addScaledVector(basis.east, e)
      .addScaledVector(basis.up, u);
  toWorld(scratch.u, m[3], m[4], m[5]);
  toWorld(scratch.f, m[6], m[7], m[8]);
  return lookQuaternion(scratch.f, scratch.u, out);
}

/**
 * Map azimuth matching a camera orientation at the observer: the direction "ahead" on the
 * ground. Looking straight down it is the top of the screen; looking level, the forward
 * direction; in between, the blend of the two that undoes the pitch (zero roll assumed).
 */
export function headingOf(quaternion: THREE.Quaternion, basis: HorizonBasis): number {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const sinPitch = Math.max(-1, Math.min(1, f.dot(basis.up)));
  const cosPitch = Math.sqrt(1 - sinPitch * sinPitch);
  const h = f.multiplyScalar(cosPitch).addScaledVector(u, -sinPitch);
  const az = Math.atan2(h.dot(basis.east), h.dot(basis.north)) / DEG;
  return (az + 360) % 360;
}

/** Signed angle in (−180, 180] degrees. */
const wrap180 = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * The flight between the observer's eye (s = 0) and an orbit (s = 1). Built once per flight by
 * setup(); pose(s) is then allocation-free.
 *
 * Path (all eased in s):
 *  - position: straight up from the observer, distance interpolated geometrically, while its
 *    direction swings from the zenith to the orbit's (landing from an orbit off the zenith);
 *  - orientation: the map view tilts down to the nadir keeping its heading (a pure pitch: the
 *    horizon ahead becomes the Earth's limb at the top of the screen), then turns about the
 *    vertical until celestial north is up, as in the Earth view;
 *  - field of view: from the map's (matched at the centre) to the Earth view's.
 */
export class FlightPath {
  private readonly basis: HorizonBasis = {
    north: new THREE.Vector3(),
    east: new THREE.Vector3(),
    up: new THREE.Vector3(),
  };
  private readonly mapQuat = new THREE.Quaternion();
  /** Rotation from the zenith to the orbit's direction (identity when leaving the sky). */
  private readonly swing = new THREE.Quaternion();
  /** Map heading less the azimuth of `orbitUp` seen from above the observer, degrees. */
  private heading = 0;
  /** Top of the screen at the orbit (celestial north, or the reference frame's pole, #122). */
  private readonly orbitUp = new THREE.Vector3(0, 0, 1);
  private startFov = 90;
  private orbitDist = ORBIT_RADIUS;
  private readonly tmp = {
    q: new THREE.Quaternion(),
    q2: new THREE.Quaternion(),
    id: new THREE.Quaternion(),
    turn: new THREE.Quaternion(),
    dir: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
  };

  /**
   * `view`: the sky map's view at s = 0. `orbitDir`: unit direction of the camera at s = 1
   * (null: above the observer). `orbitDist`: its distance, Earth radii. `orbitUp`: the world
   * direction at the top of the screen at s = 1 (the Earth view's reference frame pole, #122).
   */
  setup(
    basis: Readonly<HorizonBasis>,
    view: ViewState,
    orbitDir: THREE.Vector3 | null = null,
    orbitDist = ORBIT_RADIUS,
    orbitUp: THREE.Vector3 = CELESTIAL_NORTH,
  ): this {
    this.basis.north.copy(basis.north);
    this.basis.east.copy(basis.east);
    this.basis.up.copy(basis.up);
    this.orbitUp.copy(orbitUp);
    mapViewQuaternion(view, this.basis, this.mapQuat);
    // Looking down at the observer with orbitUp at the top, the top of the screen is at this
    // azimuth (0 for celestial north): the turn to the map's heading is measured from it.
    const upAzimuth = Math.atan2(orbitUp.dot(basis.east), orbitUp.dot(basis.north)) / DEG;
    this.heading = wrap180(view.azimuth - upAzimuth);
    this.startFov = perspectiveFovForStereo(view.fov);
    this.orbitDist = orbitDist;
    if (orbitDir) this.swing.setFromUnitVectors(this.basis.up, orbitDir);
    else this.swing.identity();
    return this;
  }

  /** Observer's horizon the flight was set up with. */
  get horizon(): Readonly<HorizonBasis> {
    return this.basis;
  }

  /** Fills the camera position and orientation at altitude progress s; returns the vertical FOV. */
  pose(s: number, position: THREE.Vector3, quaternion: THREE.Quaternion): number {
    const { q, q2, id, turn, dir, fwd } = this.tmp;
    const up = this.basis.up;
    // Position: the zenith swung towards the orbit's direction, high up.
    q.slerpQuaternions(id, this.swing, smoothstep(0.3, 1, s));
    dir.copy(up).applyQuaternion(q);
    position.copy(dir).multiplyScalar(flightRadius(s, this.orbitDist));
    // Orientation of the orbit camera there (looking at the centre, orbitUp up)…
    fwd.copy(position).negate();
    lookQuaternion(fwd, this.orbitUp, q2);
    // … turned about the vertical to the map's heading, so the pitch keeps the heading.
    turn.setFromAxisAngle(up, -this.heading * DEG);
    q2.premultiply(turn);
    quaternion.slerpQuaternions(this.mapQuat, q2, smoothstep(0, 0.6, s));
    // Then back to orbitUp up, high in the climb.
    turn.setFromAxisAngle(up, this.heading * DEG * smoothstep(0.45, 1, s));
    quaternion.premultiply(turn);
    return this.startFov + (ORBIT_FOV - this.startFov) * smoothstep(0, 0.55, s);
  }
}

/**
 * Leaving the Earth view by zooming in: only when "you are here" faces the camera near the
 * centre of the globe (angle between the camera's direction and the observer's zenith).
 */
export function shouldEnterSky(cameraDir: THREE.Vector3, observerUp: THREE.Vector3): boolean {
  const cos = cameraDir.dot(observerUp) / (cameraDir.length() * observerUp.length() || 1);
  return cos >= Math.cos(DIVE_MAX_ANGLE * DEG);
}
