import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PLANETS, heliocentricPosition, precessionMatrix, seasons } from "@asteria/astro-core";
import { PovScene, SCENE_INDEX } from "./pov-scene";
import { AU, SCENE_BODIES, trueRadius } from "./points-of-view";
import { worldPosition } from "./body-frame";

const uniform = <T>(value: T) => ({ value });
const scene = () =>
  new PovScene({
    uInk: uniform(new THREE.Color()),
    uBase: uniform(new THREE.Color()),
    uDpr: uniform(1),
  });
const date = new Date("2026-10-10T09:00:00Z");
const prec = new THREE.Matrix3().set(...precessionMatrix(date));
const weights = (id: "stars" | "ecliptic" | "heliocentric" | "body") => ({
  stars: 0,
  ecliptic: 0,
  heliocentric: 0,
  body: 0,
  [id]: 1,
});

describe("PovScene: the true-scale solar system (#131)", () => {
  const pov = scene();
  pov.update({ date, prec });
  const a = pov.anchors;

  it("places every body at its true distance, the Earth at the origin", () => {
    const sun = a.positions[SCENE_INDEX.Sun]!;
    expect(a.positions[SCENE_INDEX.Earth]!.length()).toBe(0);
    expect(sun.length() / AU).toBeCloseTo(heliocentricPosition("Earth", date).distanceAu, 6);
    for (const planet of PLANETS) {
      const r = a.positions[SCENE_INDEX[planet]]!.distanceTo(sun) / AU;
      expect(r / heliocentricPosition(planet, date).distanceAu, planet).toBeCloseTo(1, 6);
    }
    // The Moon where the visit puts it (light-time corrected geocentric position).
    const moon = worldPosition("Moon", date, prec, new THREE.Vector3());
    expect(a.positions[SCENE_INDEX.Moon]!.distanceTo(moon)).toBeLessThan(1e-9);
    expect(moon.length()).toBeGreaterThan(55);
    expect(moon.length()).toBeLessThan(64);
  });

  it("gives each body its true radius", () => {
    SCENE_BODIES.forEach((b, i) => expect(a.radii[i]).toBe(trueRadius(b)));
  });

  it("marks the year's equinoxes and solstices on the Earth's true orbit", () => {
    const s = seasons(2026);
    expect(a.marks.map((m) => m.date.getTime())).toEqual([
      s.marchEquinox.getTime(),
      s.juneSolstice.getTime(),
      s.septemberEquinox.getTime(),
      s.decemberSolstice.getTime(),
    ]);
    const sun = a.positions[SCENE_INDEX.Sun]!;
    for (const m of a.marks) {
      const r = m.position.distanceTo(sun) / AU;
      expect(Math.abs(r / heliocentricPosition("Earth", m.date).distanceAu - 1)).toBeLessThan(1e-6);
    }
  });

  it("shows the scene in « Les saisons » and « Le système solaire » only", () => {
    pov.setWeights(weights("heliocentric"));
    expect(pov.sceneShown()).toBe(true);
    pov.setWeights(weights("ecliptic"));
    expect(pov.sceneShown()).toBe(true);
    pov.setWeights(weights("stars"));
    expect(pov.sceneShown()).toBe(false);
    pov.setWeights(weights("body"));
    expect(pov.sceneShown()).toBe(false);
  });

  it("puts each orbit on its body, the line's middle point on it", () => {
    const lines = pov.object.children.filter(
      (o): o is THREE.Line => o instanceof THREE.Line && !(o instanceof THREE.LineSegments),
    );
    // The eight orbits and the Moon's.
    expect(lines.length).toBe(9);
    const at = lines.map((l) => l.position);
    for (const planet of PLANETS)
      expect(at.some((p) => p.distanceTo(a.positions[SCENE_INDEX[planet]]!) < 1e-9)).toBe(true);
  });
});
