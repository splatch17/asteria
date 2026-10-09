// GLSL for the space view (globe + celestial sphere at infinity). World frame: equator of date.
import { dither, properMotion } from "./shaders";
import { STAR_SPRITE_GLSL, STAR_STYLE, STAR_STYLE_GLSL } from "./star-style";

/** Directions at infinity: rotate with the camera only and sit on the far plane. */
const atInfinity = /* glsl */ `
  vec4 projectDirection(vec3 dir) {
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * dir, 1.0);
    return p.xyww;
  }
`;

/** Stars at infinity: same point-of-light law as the sky map (STAR_STYLE, #104). */
export const skyStarVert = /* glsl */ `
  ${atInfinity}
  ${properMotion}
  ${STAR_STYLE_GLSL}
  uniform mat3 uPrec;
  uniform float uDpr;
  uniform float uLimitMag;
  uniform float uFigures;
  attribute vec3 aDir;
  attribute float aMag;
  attribute float aMember;
  varying vec4 vStyle;
  varying float vSpike;
  void main() {
    vStyle = starStyle(aMag, uLimitMag, aMember * uFigures);
    vSpike = aMag < ${STAR_STYLE.SPIKE_MAG.toFixed(2)} ? 1.0 : 0.0;
    if (vStyle.x <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    gl_Position = projectDirection(uPrec * starDirection(aDir));
    gl_PointSize = vStyle.w * uDpr;
  }
`;

export const skyStarFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  uniform float uDpr;
  varying vec4 vStyle;
  varying float vSpike;
  ${STAR_SPRITE_GLSL}
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float a = starSprite(p, vStyle.w, vStyle.x, vStyle.y, vStyle.z, vSpike, 0.5 / uDpr);
    if (a < 0.02) discard;
    gl_FragColor = vec4(uInk, a);
  }
`;

/** Constellation lines at infinity: each end follows its star's proper motion (#78). */
export const constellationLineVert = /* glsl */ `
  ${atInfinity}
  ${properMotion}
  uniform mat3 uPrec;
  attribute vec3 aDir;
  void main() {
    gl_Position = projectDirection(uPrec * starDirection(aDir));
  }
`;

/** Fixed lines at infinity (celestial equator, ecliptic, grid). */
export const skyLineVert = /* glsl */ `
  ${atInfinity}
  uniform mat3 uPrec;
  attribute vec3 aDir;
  void main() {
    gl_Position = projectDirection(uPrec * aDir);
  }
`;

export const skyLineFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uInk, uOpacity);
  }
`;

/** Sun / Moon glyphs at infinity: same fragment shader as the sky map (bodyFrag). */
export const skyBodyVert = /* glsl */ `
  ${atInfinity}
  uniform float uDpr;
  uniform float uBodySize;
  attribute vec3 aDir;
  attribute float aKind;
  varying float vKind;
  varying float vFade; // shared fragment shaders fade below the horizon (#69): never here
  void main() {
    vKind = aKind;
    vFade = 1.0;
    gl_Position = projectDirection(aDir);
    gl_PointSize = uBodySize * (aKind < 0.5 ? 1.25 : 1.0) * uDpr;
  }
`;

/** Planets at infinity (directions precessed on the CPU): same fragment shader as the map. */
export const skyPlanetVert = /* glsl */ `
  ${atInfinity}
  uniform float uDpr;
  attribute vec3 aDir;
  attribute float aMag;
  attribute float aKind;
  varying float vKind;
  varying float vFade; // shared fragment shaders fade below the horizon (#69): never here
  void main() {
    vKind = aKind;
    vFade = 1.0;
    if (aMag > 50.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    gl_Position = projectDirection(aDir);
    float saturn = 1.0 - step(0.5, abs(aKind - 4.0));
    gl_PointSize = clamp(9.0 - aMag * 1.3, 6.0, 16.0) * mix(1.0, 1.6, saturn) * uDpr;
  }
`;

/** Apparent path of a planet at infinity (J2000 directions, precessed): same fragment as the map. */
export const skyPathVert = /* glsl */ `
  ${atInfinity}
  uniform mat3 uPrec;
  uniform float uDpr;
  attribute vec3 aDir;
  attribute float aMark;
  varying float vMark;
  varying float vFade;
  void main() {
    vMark = aMark;
    vFade = 1.0;
    gl_Position = projectDirection(uPrec * aDir);
    gl_PointSize = (aMark > 0.5 ? 5.0 : 2.2) * uDpr;
  }
`;

/** Globe: positions are Earth-fixed unit vectors; modelMatrix applies the Earth's rotation. */
export const globeVert = /* glsl */ `
  varying vec3 vEarth;
  void main() {
    vEarth = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const globeFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uRelief;
  uniform sampler2D uLights;
  uniform vec3 uSunEarth;   // Sun direction in the Earth-fixed frame
  uniform vec3 uInk;
  uniform vec3 uBase;
  uniform float uDpr;
  uniform float uDetail;    // 0 = far (pure engraving) … 1 = close (relief shows through)
  varying vec3 vEarth;
  ${dither}

  const float PI = 3.14159265359;

  void main() {
    vec3 n = normalize(vEarth);
    vec2 uv = vec2(atan(n.y, n.x) / (2.0 * PI) + 0.5, 0.5 - asin(n.z) / PI);
    float relief = texture2D(uRelief, uv).r;
    // City lights: sharp sample plus a mipmap-blurred halo (cities are only a few texels wide).
    // Unlit land sits around 0.2 in the texture, so the threshold starts above it.
    float sharp = texture2D(uLights, uv).r;
    float halo = texture2D(uLights, uv, 2.5).r;
    float lights = max(smoothstep(0.3, 0.7, sharp), smoothstep(0.26, 0.5, halo) * 0.7);
    float day = smoothstep(-0.06, 0.1, dot(n, uSunEarth));

    // Ink density: lit relief by day, city lights by night, a faint twilight band in between.
    float ink = mix(lights * 0.95, relief * 0.85 + 0.05, day);
    ink = max(ink, (1.0 - abs(dot(n, uSunEarth)) * 12.0) * 0.12);

    // Engraving: 1-bit ordered dither, finer when close; relief blends in at close range.
    float cell = mix(1.0, 0.5, uDetail);
    // +0.001: Bayer returns 0 on 1/64 of the pixels, a zero density must stay dark.
    float on = step(bayer8(gl_FragCoord.xy / (uDpr * cell)) + 0.001, ink);
    vec3 engraved = mix(uBase, uInk, on);
    vec3 continuous = mix(uBase, uInk, ink);
    gl_FragColor = vec4(mix(engraved, continuous, uDetail * 0.55), 1.0);
  }
`;
