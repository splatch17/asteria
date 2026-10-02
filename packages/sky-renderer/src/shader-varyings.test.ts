import { describe, expect, it } from "vitest";
import * as map from "./shaders";
import * as space from "./space-shaders";

const varyings = (src: string) => [...src.matchAll(/varying\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]);

/**
 * WebGL refuses to link a program whose fragment shader reads a varying the vertex shader does
 * not declare: the Earth view reuses the map's fragment shaders, so #69's vFade broke its Sun,
 * Moon, planet and path glyphs (#73).
 */
describe("vertex / fragment varyings", () => {
  const pairs: [string, string, string][] = [
    ["map star", map.starVert, map.starFrag],
    ["map line", map.lineVert, map.lineFrag],
    ["map body", map.bodyVert, map.bodyFrag],
    ["map planet", map.planetVert, map.planetFrag],
    ["map path", map.pathVert, map.pathFrag],
    ["map guide", map.guideVert, map.guideFrag],
    ["earth star", space.skyStarVert, space.skyStarFrag],
    ["earth line", space.skyLineVert, space.skyLineFrag],
    ["earth body", space.skyBodyVert, map.bodyFrag],
    ["earth planet", space.skyPlanetVert, map.planetFrag],
    ["earth path", space.skyPathVert, map.pathFrag],
    ["earth globe", space.globeVert, space.globeFrag],
  ];
  it.each(pairs)("%s: every fragment varying comes from the vertex shader", (_, vert, frag) => {
    const declared = new Set(varyings(vert));
    for (const name of varyings(frag)) expect(declared, name).toContain(name);
  });
});
