import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { heliocentricPosition, precessionMatrix, seasons } from "@asteria/astro-core";
import {
  BACKDROP_RADIUS,
  GHOST_EARTH_RADIUS,
  GROUND_MOON_RADIUS,
  GROUND_SUN_RADIUS,
  PovScene,
} from "./pov-scene";
import { SEASONS_SCALE } from "./points-of-view";

const uniform = <T>(value: T) => ({ value });
const scene = () =>
  new PovScene(
    { uInk: uniform(new THREE.Color()), uBase: uniform(new THREE.Color()), uDpr: uniform(1) },
    { uInk: uniform(new THREE.Color()), uDpr: uniform(1), uMoonT: uniform(0) },
  );
const date = new Date("2026-10-10T09:00:00Z");
const prec = new THREE.Matrix3().set(...precessionMatrix(date));
const sun = new THREE.Vector3(0.98, -0.17, -0.07).normalize();
const moon = new THREE.Vector3(0.9, -0.3, -0.1).normalize();
const all = { ground: true, seasons: true, solar: true };
const weights = (id: "stars" | "earth" | "ecliptic" | "heliocentric" | "body") => ({
  stars: 0,
  earth: 0,
  ecliptic: 0,
  heliocentric: 0,
  body: 0,
  [id]: 1,
});

describe("PovScene anchors (#128)", () => {
  const pov = scene();
  pov.update({ date, prec, sun, moon }, all);
  const a = pov.anchors;

  it("puts the Sun and the Moon of « Vu du sol » on their daily circles", () => {
    expect(a.groundSun.length()).toBeCloseTo(GROUND_SUN_RADIUS, 12);
    expect(a.groundMoon.length()).toBeCloseTo(GROUND_MOON_RADIUS, 12);
    expect(a.groundSun.clone().normalize().angleTo(sun)).toBeLessThan(1e-7);
    // The sub-solar point on the globe, under the Sun.
    expect(a.subSolar.length()).toBeCloseTo(1.004, 12);
  });

  it("marks the year's equinoxes and solstices on the true orbit, round the drawn Sun", () => {
    const s = seasons(2026);
    expect(a.marks.map((m) => m.date.getTime())).toEqual([
      s.marchEquinox.getTime(),
      s.juneSolstice.getTime(),
      s.septemberEquinox.getTime(),
      s.decemberSolstice.getTime(),
    ]);
    for (const m of a.marks) {
      const h = heliocentricPosition("Earth", m.date);
      // Distance from the drawn Sun: SEASONS_SCALE × the true Sun–Earth distance (1e-6 relative:
      // the J2000 → date rotation is applied as a quaternion of the precession matrix).
      const r = m.position.distanceTo(a.seasonsSun);
      expect(Math.abs(r / (SEASONS_SCALE * h.distanceAu) - 1)).toBeLessThan(1e-6);
    }
    // The Earth (origin) is SEASONS_SCALE × its distance from the Sun.
    const h = heliocentricPosition("Earth", date);
    expect(a.seasonsSun.length() / (SEASONS_SCALE * h.distanceAu)).toBeCloseTo(1, 9);
    expect(GHOST_EARTH_RADIUS).toBeLessThan(1);
  });

  it("aims the Earth → Mars line of sight at the backdrop through Mars", () => {
    const mars = a.planets[2]!; // PLANETS order: Mercury, Venus, Mars…
    expect(a.marsHit.distanceTo(a.solarSun)).toBeCloseTo(BACKDROP_RADIUS, 4);
    // Earth (origin), Mars and the hit are aligned, Mars between the two.
    const toMars = mars.clone().normalize();
    const toHit = a.marsHit.clone().normalize();
    expect(toMars.angleTo(toHit)).toBeLessThan(1e-5);
    expect(a.marsHit.length()).toBeGreaterThan(mars.length());
  });

  it("shows only the anchors of the point of view in front", () => {
    pov.setWeights(weights("ecliptic"), false);
    const visible = () => pov.object.children.filter((o) => o.visible).length;
    const seasonsCount = visible();
    expect(pov.planetShown()).toBe(false);
    pov.setWeights(weights("heliocentric"), false);
    expect(pov.planetShown()).toBe(true);
    pov.setWeights(weights("body"), false);
    expect(pov.planetShown()).toBe(false);
    // The glyph points stay in the scene (faded per vertex), every line is hidden.
    expect(visible()).toBeLessThan(seasonsCount);
  });
});
