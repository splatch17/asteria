// GLSL of the illustrated constellation figures (#96, see figures.ts). The figure mesh carries
// J2000 directions: the same projection as the stars (precession → horizontal → view →
// stereographic) bends each figure with the map.
import { dither, projection } from "./shaders";

export const figureVert = /* glsl */ `
  ${projection}
  attribute vec3 aDir;
  attribute vec2 aUv;
  attribute float aFig;
  attribute float aSeed;
  varying vec2 vUv;
  varying float vUp;
  varying float vVisible;
  varying float vFig;
  varying float vSeed;

  void main() {
    vec3 h = uEq2Hor * aDir;
    vec3 v = uView * h;
    vVisible = v.z > uBackZ ? 1.0 : 0.0;
    vUp = h.z;
    vUv = aUv;
    vFig = aFig;
    vSeed = aSeed;
    gl_Position = projectView(v);
  }
`;

/**
 * 1-bit engraving (ART_DIRECTION §3, style A): the atlas luminance is the ink coverage, turned
 * into dots by an ordered Bayer 8×8 threshold in CSS pixels, in the theme ink (parchment, or red
 * at night). The reveal front starts at the anchor stars (vSeed: distance to the nearest one)
 * and the dots densify behind it.
 */
export const figureFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uAtlas;
  uniform vec3 uInk;
  uniform float uDpr;
  uniform float uBelowAlpha;
  uniform float uDensity;     // ink coverage of the figures (level, zoom)
  uniform float uAlpha;
  uniform float uReveal;      // 0 → 1 when the layer is switched on
  uniform float uSelected;    // index of the selected figure, −1: none
  uniform float uSelReveal;   // 0 → 1 when a constellation is selected
  uniform float uSelDensity;
  uniform float uSelAlpha;
  uniform float uOthers;      // density factor of the other figures while one is selected
  varying vec2 vUv;
  varying float vUp;
  varying float vVisible;
  varying float vFig;
  varying float vSeed;
  ${dither}

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float front(float progress, float noise) {
    return smoothstep(0.0, 0.12, progress * 1.3 - vSeed - noise * 0.15);
  }

  void main() {
    if (vVisible < 0.999) discard; // the figure reaches the back hemisphere
    float fade = vUp < 0.0 ? uBelowAlpha : 1.0;
    if (fade <= 0.0) discard;
    float noise = hash(floor(vUv * 512.0));
    float selected = 1.0 - step(0.5, abs(vFig - uSelected));
    float boost = selected * front(uSelReveal, noise);
    float density = mix(uDensity * mix(uOthers, 1.0, selected), uSelDensity, boost);
    float ink = smoothstep(0.06, 1.0, texture2D(uAtlas, vUv).r) * density * front(uReveal, noise);
    if (ink <= bayer8(gl_FragCoord.xy / uDpr) + 0.002) discard;
    gl_FragColor = vec4(uInk, mix(uAlpha, uSelAlpha, boost) * fade);
  }
`;
