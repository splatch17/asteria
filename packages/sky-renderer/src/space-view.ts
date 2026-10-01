import * as THREE from "three";
import {
  PLANETS,
  greenwichMeanSiderealTime,
  precessionMatrix,
  unitVector,
  type Mat3,
  type Observer,
  type Planet,
  type Vec3,
} from "@asteria/astro-core";
import { bodyFrag, planetFrag } from "./shaders";
import {
  globeFrag,
  globeVert,
  skyBodyVert,
  skyLineFrag,
  skyLineVert,
  skyPlanetVert,
  skyStarFrag,
  skyStarVert,
} from "./space-shaders";
import type { CatalogStar, SkyBodies, SkyPlanet, SkyTheme } from "./sky-map";

export interface EarthAssets {
  relief: HTMLImageElement | ImageBitmap;
  lights: HTMLImageElement | ImageBitmap;
  /** Interleaved lon/lat (degrees) and polyline offsets, as decoded by @asteria/catalog. */
  coastlines: { offsets: Uint32Array; coords: Float32Array };
}

export interface SpaceViewOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  stars: CatalogStar[];
  lines: Record<string, number[][]>;
  earth: EarthAssets;
  theme: SkyTheme;
  labels: { here: string; sun: string; moon: string; pole: string };
  /** Localised planet names, drawn as labels. */
  planetNames?: Record<Planet, string>;
}

const DEG = Math.PI / 180;
const OBLIQUITY = 23.4392911 * DEG;
const DIST_MIN = 1.6;
const DIST_MAX = 40;

const toMatrix3 = (m: Mat3) => new THREE.Matrix3().set(...m);

/** Earth-fixed unit vector for a geographic position. */
function geo(lonDeg: number, latDeg: number, r = 1): THREE.Vector3 {
  const [lon, lat] = [lonDeg * DEG, latDeg * DEG];
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  ).multiplyScalar(r);
}

/**
 * The Earth seen from space, inside the celestial sphere.
 * World frame = mean equator and equinox of date (z = celestial north pole); the globe turns
 * by Greenwich sidereal time, stars and constellations sit at infinity.
 */
export class SpaceView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  private readonly ctx: CanvasRenderingContext2D;
  private readonly earth = new THREE.Group(); // rotated by sidereal time
  private readonly uniforms;
  private readonly bodyPoints: THREE.Points;
  private readonly observerMarker = new THREE.Group();
  private orbit = { lon: 0, lat: 30, dist: 4 }; // camera, in world (equatorial) coordinates
  private observer: Observer = { latitude: 48.8566, longitude: 2.3522 };
  private date = new Date();
  private bodies: { sun: Vec3; moon: Vec3 } | null = null;
  private readonly planetPoints: THREE.Points;
  /** J2000 directions of the planets (PLANETS order), null when unset or hidden. */
  private planets: (Vec3 | null)[] | null = null;
  private showPlanets = true;
  private dirty = true;
  private running = false;
  private raf = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private velocity = { lon: 0, lat: 0 };
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly options: SpaceViewOptions) {
    const { canvas, overlay, stars, lines, earth } = options;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.ctx = overlay.getContext("2d")!;
    this.camera.up.set(0, 0, 1);

    const texture = (img: HTMLImageElement | ImageBitmap) => {
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = 4;
      t.needsUpdate = true;
      return t;
    };

    this.uniforms = {
      uPrec: { value: new THREE.Matrix3() },
      uDpr: { value: this.renderer.getPixelRatio() },
      uLimitMag: { value: 5.2 },
      uInk: { value: new THREE.Color() },
      uBase: { value: new THREE.Color() },
      uOpacity: { value: 0.3 },
      uRelief: { value: texture(earth.relief) },
      uLights: { value: texture(earth.lights) },
      uSunEarth: { value: new THREE.Vector3(1, 0, 0) },
      uDetail: { value: 0 },
      uBodySize: { value: 26 },
      uMoonT: { value: 0 },
      uSunAngle: { value: 0 },
    };

    // --- Celestial sphere (at infinity)
    const dirs = stars.map((s) => unitVector(s.ra, s.dec));
    const byHip = new Map(stars.map((s, i) => [s.hip, dirs[i]!]));
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(dirs.flat(), 3));
    starGeo.setAttribute("aDir", new THREE.Float32BufferAttribute(dirs.flat(), 3));
    starGeo.setAttribute(
      "aMag",
      new THREE.Float32BufferAttribute(
        stars.map((s) => s.v),
        1,
      ),
    );
    const starPoints = new THREE.Points(starGeo, this.material(skyStarVert, skyStarFrag, true));

    const segs: number[] = [];
    for (const polys of Object.values(lines)) {
      for (const poly of polys) {
        for (let i = 0; i < poly.length - 1; i++) {
          const a = byHip.get(poly[i]!);
          const b = byHip.get(poly[i + 1]!);
          if (a && b) segs.push(...a, ...b);
        }
      }
    }
    const constellationLines = this.skyLines(segs, 0.28);

    // Celestial equator and ecliptic (J2000 directions, precessed like the stars)
    const circle = (tilt: number) => {
      const pts: number[] = [];
      for (let i = 0; i < 180; i++) {
        const [a, b] = [(i / 180) * 2 * Math.PI, ((i + 1) / 180) * 2 * Math.PI];
        for (const t of [a, b])
          pts.push(Math.cos(t), Math.sin(t) * Math.cos(tilt), Math.sin(t) * Math.sin(tilt));
      }
      return pts;
    };
    const equator = this.skyLines(circle(0), 0.35);
    const ecliptic = this.skyLines(circle(OBLIQUITY), 0.5);

    // Sun and Moon glyphs (reuse the sky map's engraved fragment shader)
    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    bodyGeo.setAttribute("aDir", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    bodyGeo.setAttribute("aKind", new THREE.Float32BufferAttribute([0, 1], 1));
    this.bodyPoints = new THREE.Points(bodyGeo, this.material(skyBodyVert, bodyFrag, false));
    this.bodyPoints.visible = false;

    // Planets (PLANETS order), on the celestial sphere like the Sun and Moon
    const planetGeo = new THREE.BufferGeometry();
    const planetDirs = new THREE.Float32BufferAttribute(new Float32Array(PLANETS.length * 3), 3);
    planetGeo.setAttribute("position", planetDirs);
    planetGeo.setAttribute("aDir", planetDirs);
    planetGeo.setAttribute(
      "aMag",
      new THREE.Float32BufferAttribute(new Float32Array(PLANETS.length), 1),
    );
    planetGeo.setAttribute(
      "aKind",
      new THREE.Float32BufferAttribute(
        PLANETS.map((_, i) => i),
        1,
      ),
    );
    this.planetPoints = new THREE.Points(
      planetGeo,
      this.material(skyPlanetVert, planetFrag, false),
    );
    this.planetPoints.visible = false;

    for (const o of [
      starPoints,
      constellationLines,
      equator,
      ecliptic,
      this.bodyPoints,
      this.planetPoints,
    ]) {
      o.frustumCulled = false;
      o.renderOrder = 1; // after the globe, so the depth test hides what is behind the Earth
    }

    // --- Globe (Earth-fixed geometry, rotated by sidereal time)
    const globe = new THREE.Mesh(
      this.sphereGeometry(96, 48),
      this.material(globeVert, globeFrag, false),
    );
    (globe.material as THREE.ShaderMaterial).transparent = false;
    (globe.material as THREE.ShaderMaterial).depthWrite = true;
    (globe.material as THREE.ShaderMaterial).depthTest = true;

    const coastPts: number[] = [];
    const { offsets, coords } = earth.coastlines;
    for (let l = 0; l < offsets.length - 1; l++) {
      for (let i = offsets[l]!; i < offsets[l + 1]! - 1; i++) {
        const a = geo(coords[i * 2]!, coords[i * 2 + 1]!, 1.002);
        const b = geo(coords[i * 2 + 2]!, coords[i * 2 + 3]!, 1.002);
        coastPts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const coast = this.surfaceLines(coastPts, 0.75);

    const grat: number[] = [];
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -88; lat < 88; lat += 4)
        grat.push(...geo(lon, lat, 1.001).toArray(), ...geo(lon, lat + 4, 1.001).toArray());
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 4)
        grat.push(...geo(lon, lat, 1.001).toArray(), ...geo(lon + 4, lat, 1.001).toArray());
    }
    const graticule = this.surfaceLines(grat, 0.14);

    this.earth.add(globe, coast, graticule, this.observerMarker);

    // Earth's axis, through the poles towards the celestial pole (fixed in the world frame)
    const axis = this.surfaceLines([0, 0, -1.5, 0, 0, 1.5], 0.6);

    this.scene.add(
      this.earth,
      axis,
      starPoints,
      constellationLines,
      equator,
      ecliptic,
      this.planetPoints,
      this.bodyPoints,
    );
    this.setTheme(options.theme);
    this.buildObserverMarker();
    this.bindInput(canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.update();
  }

  // --- public API

  setDate(date: Date): void {
    this.date = date;
    this.update();
  }

  setObserver(observer: Observer): void {
    this.observer = observer;
    this.buildObserverMarker();
    this.update();
  }

  setBodies(bodies: SkyBodies | null): void {
    this.bodies = bodies
      ? {
          sun: unitVector(bodies.sun.ra, bodies.sun.dec),
          moon: unitVector(bodies.moon.ra, bodies.moon.dec),
        }
      : null;
    if (bodies) this.uniforms.uMoonT.value = 1 - 2 * bodies.moon.illumination;
    this.update();
  }

  setPlanets(planets: SkyPlanet[] | null): void {
    if (!planets) {
      this.planets = null;
    } else {
      this.planets = PLANETS.map(() => null);
      const mags = this.planetPoints.geometry.getAttribute("aMag") as THREE.BufferAttribute;
      for (let i = 0; i < PLANETS.length; i++) mags.setX(i, 99); // left out: hidden by the shader
      for (const p of planets) {
        const i = PLANETS.indexOf(p.name);
        this.planets[i] = unitVector(p.ra, p.dec);
        mags.setX(i, p.magnitude);
      }
      mags.needsUpdate = true;
    }
    this.update();
  }

  setPlanetsVisible(visible: boolean): void {
    this.showPlanets = visible;
    this.update();
  }

  setTheme(theme: SkyTheme): void {
    this.options.theme = theme;
    this.uniforms.uInk.value.set(theme.ink);
    this.uniforms.uBase.value.set(theme.ground);
    this.renderer.setClearColor(theme.sky);
    // Surface lines (coastlines, graticule, marker) use plain materials: recolour them too.
    this.scene.traverse((o) => {
      const m = (o as THREE.LineSegments).material as THREE.LineBasicMaterial | undefined;
      if (m?.userData?.ink) m.color.set(theme.ink);
    });
    this.dirty = true;
  }

  /** Points the camera at the observer's place, at the given distance (Earth radii). */
  focusObserver(dist = 4): void {
    const gst = greenwichMeanSiderealTime(this.date);
    this.orbit = { lon: this.observer.longitude + gst, lat: this.observer.latitude, dist };
    this.velocity = { lon: 0, lat: 0 };
    this.dirty = true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.dirty = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }

  // --- internals

  private material(vertexShader: string, fragmentShader: string, additive: boolean) {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  private skyLines(points: number[], opacity: number): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    g.setAttribute("aDir", new THREE.Float32BufferAttribute(points, 3));
    const m = this.material(skyLineVert, skyLineFrag, false);
    m.uniforms = { ...this.uniforms, uOpacity: { value: opacity } };
    return new THREE.LineSegments(g, m);
  }

  private surfaceLines(points: number[], opacity: number): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const m = new THREE.LineBasicMaterial({ transparent: true, opacity, depthWrite: false });
    m.userData.ink = true; // recoloured by setTheme
    return new THREE.LineSegments(g, m);
  }

  private sphereGeometry(segLon: number, segLat: number): THREE.BufferGeometry {
    const pos: number[] = [];
    const index: number[] = [];
    for (let j = 0; j <= segLat; j++) {
      const lat = 90 - (180 * j) / segLat;
      for (let i = 0; i <= segLon; i++) pos.push(...geo(-180 + (360 * i) / segLon, lat).toArray());
    }
    for (let j = 0; j < segLat; j++) {
      for (let i = 0; i < segLon; i++) {
        const a = j * (segLon + 1) + i;
        const b = a + segLon + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(index);
    return g;
  }

  /** "You are here": dot, local horizon disc and zenith line, in Earth-fixed coordinates. */
  private buildObserverMarker(): void {
    this.observerMarker.clear();
    const { latitude, longitude } = this.observer;
    const up = geo(longitude, latitude);
    const east = new THREE.Vector3(-Math.sin(longitude * DEG), Math.cos(longitude * DEG), 0);
    const north = new THREE.Vector3().crossVectors(up, east);
    const centre = up.clone().multiplyScalar(1.004);
    const disc: number[] = [];
    const r = 0.14;
    for (let i = 0; i < 64; i++) {
      for (const k of [i, i + 1]) {
        const t = (k / 64) * 2 * Math.PI;
        const p = centre
          .clone()
          .addScaledVector(east, Math.cos(t) * r)
          .addScaledVector(north, Math.sin(t) * r);
        disc.push(p.x, p.y, p.z);
      }
    }
    const zenith = [...centre.toArray(), ...up.clone().multiplyScalar(1.3).toArray()];
    this.observerMarker.add(this.surfaceLines(disc, 0.95), this.surfaceLines(zenith, 0.95));
    this.setTheme(this.options.theme);
  }

  private update(): void {
    const gst = greenwichMeanSiderealTime(this.date) * DEG;
    this.earth.rotation.set(0, 0, gst);
    this.uniforms.uPrec.value = toMatrix3(precessionMatrix(this.date));
    if (this.bodies) {
      const prec = precessionMatrix(this.date);
      const toWorld = (v: Vec3) => new THREE.Vector3(...v).applyMatrix3(toMatrix3(prec));
      const sun = toWorld(this.bodies.sun);
      const moon = toWorld(this.bodies.moon);
      const dirs = this.bodyPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      dirs.set([...sun.toArray(), ...moon.toArray()]);
      dirs.needsUpdate = true;
      this.bodyPoints.visible = true;
      // Sun in the Earth-fixed frame lights the globe (terminator, night lights).
      this.uniforms.uSunEarth.value.copy(sun).applyAxisAngle(new THREE.Vector3(0, 0, 1), -gst);
    }
    if (this.planets) {
      const prec = toMatrix3(precessionMatrix(this.date));
      const dirs = this.planetPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      this.planets.forEach((d, i) => {
        if (d) v.set(...d).applyMatrix3(prec);
        else v.set(0, 0, 1);
        dirs.setXYZ(i, v.x, v.y, v.z);
      });
      dirs.needsUpdate = true;
    }
    this.planetPoints.visible = this.showPlanets && !!this.planets;
    this.dirty = true;
  }

  private resize(): void {
    const { canvas, overlay } = this.options;
    const [w, h] = [canvas.clientWidth, canvas.clientHeight];
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = this.renderer.getPixelRatio();
    overlay.width = w * dpr;
    overlay.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    if (
      !this.pointers.size &&
      (Math.abs(this.velocity.lon) > 0.01 || Math.abs(this.velocity.lat) > 0.01)
    ) {
      this.orbit.lon += this.velocity.lon;
      this.orbit.lat = Math.max(-89, Math.min(89, this.orbit.lat + this.velocity.lat));
      this.velocity.lon *= 0.9;
      this.velocity.lat *= 0.9;
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.render();
    }
  };

  private render(): void {
    const { lon, lat, dist } = this.orbit;
    this.camera.position.copy(geo(lon, lat, dist));
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    // Mix with zoom: engraved from afar, relief shows through when close.
    this.uniforms.uDetail.value = Math.min(1, Math.max(0, (6 - dist) / 3.5));
    if (this.bodies) {
      const sun = this.screenOf(this.dirAt(0));
      const moon = this.screenOf(this.dirAt(1));
      if (sun && moon)
        this.uniforms.uSunAngle.value = Math.atan2(-(sun[1] - moon[1]), sun[0] - moon[0]);
    }
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
  }

  private dirAt(i: number): THREE.Vector3 {
    const a = this.bodyPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
    return new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i));
  }

  /** Screen position of a world point, or of a direction at infinity (w = 0). */
  private screenOf(p: THREE.Vector3, atInfinity = true): [number, number] | null {
    const { clientWidth: w, clientHeight: h } = this.options.canvas;
    const v = atInfinity ? p.clone().multiplyScalar(1000).add(this.camera.position) : p.clone();
    const toCam = v.clone().sub(this.camera.position);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    if (toCam.dot(forward) <= 0) return null;
    v.project(this.camera);
    if (Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
  }

  /** True when the segment camera → world point passes through the globe. */
  private hiddenByEarth(p: THREE.Vector3, atInfinity: boolean): boolean {
    const o = this.camera.position;
    const d = (atInfinity ? p.clone() : p.clone().sub(o)).normalize();
    const b = o.dot(d);
    const c = o.lengthSq() - 1;
    const disc = b * b - c;
    if (disc < 0) return false;
    const t = -b - Math.sqrt(disc);
    return t > 0 && (atInfinity || t < p.distanceTo(o) - 1e-3);
  }

  private drawLabels(): void {
    const { ctx } = this;
    const { canvas, theme, labels } = this.options;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.fillStyle = theme.ink;
    ctx.textBaseline = "middle";
    ctx.font = "700 11px 'JetBrains Mono', monospace";
    ctx.letterSpacing = "0.12em";
    const label = (text: string, p: THREE.Vector3, atInfinity: boolean, dx = 10) => {
      if (this.hiddenByEarth(p, atInfinity)) return;
      const s = this.screenOf(p, atInfinity);
      if (s) ctx.fillText(text.toUpperCase(), s[0] + dx, s[1]);
    };
    const here = geo(this.observer.longitude, this.observer.latitude, 1.3).applyMatrix4(
      this.earth.matrixWorld,
    );
    label(labels.here, here, false);
    label(labels.pole, new THREE.Vector3(0, 0, 1), true);
    if (this.bodies) {
      label(labels.sun, this.dirAt(0), true, 20);
      label(labels.moon, this.dirAt(1), true, 18);
    }
    const names = this.options.planetNames;
    if (this.showPlanets && this.planets && names) {
      ctx.font = "700 10px 'JetBrains Mono', monospace";
      const dirs = this.planetPoints.geometry.getAttribute("aDir") as THREE.BufferAttribute;
      const d = new THREE.Vector3();
      this.planets.forEach((p, i) => {
        if (!p) return;
        label(names[PLANETS[i]!], d.fromBufferAttribute(dirs, i), true, 12);
      });
    }
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = "none";
    let pinch = 0;
    const distance = () => {
      const [a, b] = [...this.pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.velocity = { lon: 0, lat: 0 };
      if (this.pointers.size === 2) pinch = distance();
    });
    canvas.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const [dx, dy] = [e.clientX - prev.x, e.clientY - prev.y];
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        // Dragging turns the globe under the finger (the camera orbits the other way).
        const k = (60 / canvas.clientHeight) * (this.orbit.dist / 4);
        this.velocity = { lon: -dx * k, lat: dy * k };
        this.orbit.lon += this.velocity.lon;
        this.orbit.lat = Math.max(-89, Math.min(89, this.orbit.lat + this.velocity.lat));
      } else if (this.pointers.size === 2) {
        const d = distance();
        if (pinch > 0) this.zoom(pinch / d);
        pinch = d;
      }
      this.dirty = true;
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      pinch = 0;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
  }

  private zoom(factor: number): void {
    this.orbit.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, this.orbit.dist * factor));
    this.dirty = true;
  }
}
