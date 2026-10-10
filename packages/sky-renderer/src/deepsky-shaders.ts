/**
 * GLSL of the deep-sky glyphs (#101), see deepsky-style.ts for the design. One instanced draw
 * call: a quad per object, oriented along the object's major axis on screen and sized to its
 * glyph; the fragment shader engraves the glyph in 1-bit ink (solid hairlines, Bayer-dithered
 * fills), so it stays crisp at any zoom and turns red with the ink in night mode.
 */
import { DEEP_SKY_AXES_GLSL, DEEP_SKY_STYLE, GLYPH } from "./deepsky-style";
import { dither, projection } from "./shaders";

const f = (x: number) => x.toFixed(4);
const S = DEEP_SKY_STYLE;
/** Shape tests on the float attribute: `is(GLYPH.X)`. */
const is = (code: number) => `abs(vShape - ${f(code)}) < 0.5`;

/**
 * Per instance: aDir (J2000 unit vector), aAxis (J2000 unit vector along the major axis, see
 * majorAxisDirection), aGlyph = (shape, semi-major in radians, axis ratio, minimum radius in CSS
 * px), aInfo = (rank, Messier 0/1, index, seed). The base quad's `position` spans [−1, 1]².
 * The major axis is oriented on screen by projecting a point AXIS_STEP radians along it: the
 * stereographic projection is conformal, so the angle holds whatever the precession and the view.
 */
export const deepSkyVert = /* glsl */ `
  ${projection}
  ${DEEP_SKY_AXES_GLSL}
  uniform float uHalfHeight;
  uniform float uDeepLimit;
  uniform float uDeepLimitBelow; // below the horizon: night limit whatever the Sun (#65)
  uniform float uDeepAlpha;
  uniform float uSelected;    // index of the selected object (always drawn), −1 for none
  uniform float uMessierOnly; // 1: only Messier objects (Découverte level)
  attribute vec3 aDir;
  attribute vec3 aAxis;
  attribute vec4 aGlyph;
  attribute vec4 aInfo;
  varying vec2 vLocal;
  varying vec2 vAxes;
  varying float vShape;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec3 h = uEq2Hor * aDir;
    vec3 v = uView * h;
    float fade = horizonFade(h.z);
    float limit = h.z < 0.0 ? uDeepLimitBelow : uDeepLimit;
    float vis = clamp((limit - aInfo.x) / ${f(S.GLYPH_FADE)}, 0.0, 1.0);
    vis *= 1.0 - uMessierOnly * (1.0 - aInfo.y);
    vis = max(vis, 1.0 - step(0.5, abs(aInfo.z - uSelected)));
    if (v.z < uBackZ || fade <= 0.0 || vis <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec4 c = projectView(v);
    vec4 tip = projectView(uView * (uEq2Hor * normalize(aDir + 0.01 * aAxis)));
    vec2 px = vec2(uAspect, 1.0) * uHalfHeight;
    vec2 d = (tip.xy - c.xy) * px;
    vec2 major = dot(d, d) > 1e-12 ? normalize(d) : vec2(0.0, 1.0);
    vec2 axes = glyphAxes(aGlyph.y, aGlyph.z, aGlyph.w, v.z, uScale, uHalfHeight);
    vec2 local = position.xy * (axes + ${f(S.PAD)});
    vec2 offset = major * local.x + vec2(-major.y, major.x) * local.y;
    gl_Position = vec4(c.xy + offset / px, 0.0, 1.0);
    vLocal = local;
    vAxes = axes;
    vShape = aGlyph.x;
    vAlpha = uDeepAlpha * vis * fade;
    vSeed = aInfo.w;
  }
`;

export const deepSkyFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  uniform float uDpr;
  varying vec2 vLocal;
  varying vec2 vAxes;
  varying float vShape;
  varying float vAlpha;
  varying float vSeed;
  ${dither}

  const float TAU = 6.2831853;

  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // Hairline of width w (CSS px) at signed distance d, antialiased over aa.
  float hairline(float d, float w, float aa) { return 1.0 - smoothstep(0.5 * w - aa, 0.5 * w + aa, abs(d)); }
  // Approximate signed distance (CSS px) to the ellipse of semi-axes ab (first order, exact on
  // the axes; good near the outline, where it is used).
  float ellipseDistance(vec2 p, vec2 ab) {
    vec2 q = p / ab;
    vec2 grad = p / (ab * ab);
    float g = length(grad);
    return g > 1e-6 ? (dot(q, q) - 1.0) / (2.0 * g) : -min(ab.x, ab.y);
  }
  // Dots spaced ~spacing px along the ellipse of semi-axes ab, radius r px.
  float dottedEllipse(vec2 p, vec2 ab, float spacing, float r, float aa) {
    float n = max(6.0, floor(3.14159 * (ab.x + ab.y) / spacing));
    float cell = TAU / n;
    float t = (floor(atan(p.y / ab.y, p.x / ab.x) / cell) + 0.5) * cell;
    return 1.0 - smoothstep(r - aa, r + aa, length(p - vec2(cos(t), sin(t)) * ab));
  }
  // 1-bit fill: on where the ordered dither threshold is under the density.
  float stipple(float density) { return step(bayer8(gl_FragCoord.xy / uDpr) + 0.001, density); }
  // Irregular nebulous patch: dithered, its edge wobbling with a noise fixed to the object.
  float nebulaPatch(vec2 p, float r, float A, float density) {
    float n = valueNoise(p / max(A, 1.0) * 2.4 + vSeed * 37.0);
    float edge = 0.7 + 0.32 * n;
    return stipple(density * (1.0 - smoothstep(0.25 * edge, edge, r)) * (0.7 + 0.6 * n));
  }

  void main() {
    vec2 p = vLocal;
    vec2 ab = vAxes;
    float A = ab.x;
    float B = ab.y;
    float aa = 0.6 / uDpr;
    float r = length(p / ab);
    float L = length(p);
    float a = 0.0;

    if (${is(GLYPH.GALAXY)} || ${is(GLYPH.GALAXY_GROUP)}) {
      float outline = hairline(ellipseDistance(p, ab), 1.1, aa);
      if (${is(GLYPH.GALAXY_GROUP)}) {
        float n = max(8.0, floor(3.14159 * (A + B) / 5.0));
        outline *= step(0.45, fract(atan(p.y / B, p.x / A) / TAU * n));
      }
      float core = stipple(0.75 * exp(-4.0 * r * r)) * step(r, 1.0);
      float nucleus = 1.0 - smoothstep(1.1 - aa, 1.1 + aa, L);
      a = max(outline, max(0.85 * core, nucleus));
    } else if (${is(GLYPH.OPEN_CLUSTER)}) {
      a = dottedEllipse(p, ab, 4.5, 0.95, aa);
    } else if (${is(GLYPH.STAR_GROUP)}) {
      a = 0.9 * dottedEllipse(p, ab, 8.0, 0.85, aa);
    } else if (${is(GLYPH.GLOBULAR_CLUSTER)}) {
      float ring = hairline(L - A, 1.1, aa);
      float cross = max(hairline(p.x, 1.0, aa), hairline(p.y, 1.0, aa)) * step(L, A);
      float core = stipple(0.6 * exp(-5.0 * r * r));
      a = max(ring, max(0.9 * cross, 0.85 * core));
    } else if (${is(GLYPH.PLANETARY_NEBULA)}) {
      float ring = hairline(L - 0.62 * A, 1.2, aa);
      float star = 1.0 - smoothstep(1.2 - aa, 1.2 + aa, L);
      float ticks = max(hairline(p.x, 1.0, aa) * step(0.8 * A, abs(p.y)),
        hairline(p.y, 1.0, aa) * step(0.8 * A, abs(p.x))) * step(L, A);
      a = max(ring, max(star, ticks));
    } else if (${is(GLYPH.DARK_NEBULA)}) {
      vec2 q = abs(p);
      float side = max(
        hairline(q.x - A, 1.0, aa) * step(q.y, B + 0.5) * step(fract(p.y / 5.0), 0.55),
        hairline(q.y - B, 1.0, aa) * step(q.x, A + 0.5) * step(fract(p.x / 5.0), 0.55));
      float diagonal = (p.x + p.y) * 0.7071 / 4.0;
      float hatch = hairline((fract(diagonal + 0.5) - 0.5) * 4.0, 0.9, aa) * step(r, 0.92);
      a = max(0.85 * side, 0.5 * hatch);
    } else if (${is(GLYPH.SUPERNOVA_REMNANT)}) {
      float n = valueNoise(p / max(A, 1.0) * 3.0 + vSeed * 37.0);
      float shell = exp(-pow((r - 0.78) / 0.2, 2.0)) * (0.35 + 0.75 * n);
      a = 0.9 * stipple(0.8 * shell);
    } else {
      // Nebulae: emission or unclassified (dense), reflection (sparse), with a cluster (dotted ring).
      float density = ${is(GLYPH.REFLECTION_NEBULA)} ? 0.3 : ${is(GLYPH.CLUSTER_NEBULA)} ? 0.4 : 0.5;
      a = 0.9 * nebulaPatch(p, r, A, density);
      if (${is(GLYPH.CLUSTER_NEBULA)}) {
        a = max(a, dottedEllipse(p, ab, 4.5, 0.95, aa));
      } else {
        // Square corner brackets around the patch.
        vec2 q = abs(p);
        float arm = 0.4 * min(A, B) + 1.5;
        float bracket = max(
          hairline(q.x - A, 1.0, aa) * step(B - arm, q.y) * step(q.y, B + 0.5),
          hairline(q.y - B, 1.0, aa) * step(A - arm, q.x) * step(q.x, A + 0.5));
        a = max(a, 0.85 * bracket);
      }
    }
    if (a < 0.02) discard;
    gl_FragColor = vec4(uInk, a * vAlpha);
  }
`;
