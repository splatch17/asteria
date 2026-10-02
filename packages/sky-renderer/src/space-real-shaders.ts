// GLSL of the realistic style of the space view (#55). World frame: mean equator of date.
// Colours are computed in linear light and encoded to sRGB at the end; in red night mode the
// whole output is reduced to its luminance and tinted with the night ink (finish()).
import { properMotion } from "./shaders";

/** Directions at infinity: rotate with the camera only and sit on the far plane. */
const atInfinity = /* glsl */ `
  vec4 projectDirection(vec3 dir) {
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * dir, 1.0);
    return p.xyww;
  }
`;

const finish = /* glsl */ `
  uniform float uMono;
  uniform vec3 uMonoInk;
  vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
  vec3 finish(vec3 linear) {
    vec3 c = pow(max(linear, 0.0), vec3(1.0 / 2.2));
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(c, min(l, 1.0) * uMonoInk, uMono);
  }
`;

/** Stars: colour from B−V (aColor, sRGB), size and halo from the flux. No twinkling: no air. */
export const realStarVert = /* glsl */ `
  ${atInfinity}
  ${properMotion}
  uniform mat3 uPrec;
  uniform float uDpr;
  uniform float uLimitMag;
  attribute vec3 aDir;
  attribute float aMag;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vFlux;
  varying float vSize;
  void main() {
    float rel = pow(10.0, -0.4 * (aMag - uLimitMag)); // flux relative to the faintest shown
    if (rel < 0.45) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    gl_Position = projectDirection(uPrec * starDirection(aDir));
    vSize = clamp(3.0 + 1.3 * sqrt(rel), 3.0, 34.0); // CSS px, halo included
    gl_PointSize = vSize * uDpr;
    vFlux = rel;
    vColor = aColor;
  }
`;

export const realStarFrag = /* glsl */ `
  precision highp float;
  ${finish}
  varying vec3 vColor;
  varying float vFlux;
  varying float vSize;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0) * vSize * 0.5; // CSS px from the centre
    float sigma = clamp(0.5 + 0.12 * log2(vFlux), 0.5, 1.4);
    float core = exp(-d * d / (2.0 * sigma * sigma)) * clamp(0.3 + 0.12 * log2(vFlux), 0.3, 1.0);
    float halo = exp(-d / (0.9 + 0.08 * vSize)) * clamp(vFlux / 400.0, 0.0, 0.35);
    float edge = 1.0 - smoothstep(0.75, 1.0, d / (vSize * 0.5));
    float i = (core + halo) * edge;
    if (i < 0.004) discard;
    // Bright cores saturate to white, the colour shows in the halo.
    vec3 c = mix(toLinear(vColor), vec3(1.0), clamp(core * 0.6, 0.0, 0.6)) * i;
    gl_FragColor = vec4(finish(c), 1.0);
  }
`;

/** The Sun: limb-darkened disc and glow (additive). Hidden behind the globe by the depth test. */
export const realSunVert = /* glsl */ `
  ${atInfinity}
  uniform float uDpr;
  uniform float uSunSize;
  attribute vec3 aDir;
  void main() {
    gl_Position = projectDirection(aDir);
    gl_PointSize = uSunSize * uDpr;
  }
`;

export const realSunFrag = /* glsl */ `
  precision highp float;
  ${finish}
  uniform float uSunDisc; // disc radius as a fraction of the sprite's half-size
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float x = r / uSunDisc;
    // Limb darkening I(μ) = 1 − 0.6 (1 − μ), μ = cos of the angle from the disc centre.
    float mu = sqrt(max(0.0, 1.0 - x * x));
    float disc = (1.0 - smoothstep(0.96, 1.04, x)) * (0.4 + 0.6 * mu);
    float glow = exp(-max(x - 1.0, 0.0) * 1.6) * 0.55 + exp(-r * 5.0) * 0.35;
    glow *= 1.0 - smoothstep(0.6, 1.0, r);
    vec3 c = vec3(1.0, 0.96, 0.9) * disc * 3.0 + vec3(1.0, 0.82, 0.55) * glow;
    gl_FragColor = vec4(finish(c), 1.0);
  }
`;

/**
 * Moon and planets as small lit globes: aKind 0 = Moon, 1 … 7 = PLANETS order + 1.
 * The sprite's local frame has x right, y up and z towards the camera; the body's sunward
 * direction, pole and prime meridian are expressed in it by the vertex shader.
 * Atlas layout mirrors packages/sky-data/build_space.py (8 cells of 128 rows, 8 rows padding).
 */
export const realBodyVert = /* glsl */ `
  ${atInfinity}
  uniform float uDpr;
  attribute vec3 aDir;
  attribute vec3 aLight;
  attribute vec3 aPole;
  attribute vec3 aPrime;
  attribute float aKind;
  attribute float aSize;   // sprite size, CSS px (0: hidden)
  attribute float aGlow;   // halo strength (brightness of the point of light)
  varying vec3 vL;
  varying vec3 vP;
  varying vec3 vM;
  varying vec3 vE;
  varying float vKind;
  varying float vPx;
  varying float vGlow;
  void main() {
    if (aSize <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    gl_Position = projectDirection(aDir);
    gl_PointSize = aSize * uDpr;
    mat3 view = mat3(viewMatrix);
    vec3 z = -normalize(view * aDir);
    vec3 x = normalize(cross(vec3(0.0, 1.0, 0.0), z));
    vec3 y = cross(z, x);
    mat3 toLocal = mat3(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z); // transpose of (x y z)
    vL = toLocal * (view * aLight);
    vP = toLocal * (view * aPole);
    vM = toLocal * (view * aPrime);
    vE = cross(vP, vM);
    vKind = aKind;
    vPx = aSize * uDpr * 0.5;
    vGlow = aGlow;
  }
`;

export const realBodyFrag = /* glsl */ `
  precision highp float;
  ${finish}
  uniform sampler2D uMoonTex;
  uniform sampler2D uAtlas;
  uniform float uHasMoon;
  uniform float uHasAtlas;
  varying vec3 vL;
  varying vec3 vP;
  varying vec3 vM;
  varying vec3 vE;
  varying float vKind;
  varying float vPx;
  varying float vGlow;

  const float PI = 3.14159265359;
  const float CELLS = 8.0;
  const float CELL = 128.0;
  const float PAD = 8.0;
  const float RING_SPRITE = 2.4;  // Saturn's sprite half-size, in Saturn radii
  const float RING_TEX_IN = 1.171;
  const float RING_TEX_OUT = 2.336;
  const float RING_IN = 1.239;    // C ring inner edge
  const float RING_OUT = 2.27;    // A ring outer edge

  // Mean colours (sRGB) used until the textures are loaded, or if they fail to load.
  vec3 fallback(float k) {
    if (k < 0.5) return vec3(0.55, 0.54, 0.52);
    if (k < 1.5) return vec3(0.55, 0.53, 0.5);
    if (k < 2.5) return vec3(0.9, 0.82, 0.62);
    if (k < 3.5) return vec3(0.76, 0.42, 0.24);
    if (k < 4.5) return vec3(0.82, 0.74, 0.62);
    if (k < 5.5) return vec3(0.86, 0.78, 0.58);
    if (k < 6.5) return vec3(0.66, 0.85, 0.88);
    return vec3(0.3, 0.45, 0.85);
  }

  vec3 surface(vec3 n, float k) {
    float lon = atan(dot(n, vE), dot(n, vM));
    float lat = asin(clamp(dot(n, vP), -1.0, 1.0));
    vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
    vec3 c = fallback(k);
    if (k < 0.5) {
      if (uHasMoon > 0.5) c = texture2D(uMoonTex, uv).rgb;
    } else if (uHasAtlas > 0.5) {
      float row = (k - 1.0) * CELL + PAD + uv.y * (CELL - 2.0 * PAD);
      c = texture2D(uAtlas, vec2(uv.x, row / (CELLS * CELL))).rgb;
    }
    return c;
  }

  // Saturn's rings at radius r (Saturn radii): colour (rgb) and opacity (a).
  vec4 ring(float r) {
    if (r < RING_IN || r > RING_OUT) return vec4(0.0);
    if (uHasAtlas < 0.5) return vec4(0.8, 0.72, 0.6, 0.6);
    float u = (r - RING_TEX_IN) / (RING_TEX_OUT - RING_TEX_IN);
    float base = 7.0 * CELL;
    vec3 colour = texture2D(uAtlas, vec2(u, (base + 32.0) / (CELLS * CELL))).rgb;
    float alpha = texture2D(uAtlas, vec2(u, (base + 96.0) / (CELLS * CELL))).r;
    return vec4(colour, alpha);
  }

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y = -p.y;
    bool saturn = abs(vKind - 5.0) < 0.5;
    float spriteR = saturn ? RING_SPRITE : 1.6;  // halo room around the disc
    vec2 q = p * spriteR;                         // in body radii
    float r2 = dot(q, q);
    float aa = spriteR / vPx;                     // one device pixel, in body radii

    vec3 colour = vec3(0.0);
    float alpha = 0.0;

    // Globe
    if (r2 < 1.0) {
      vec3 n = vec3(q, sqrt(1.0 - r2));
      float lambert = max(dot(n, vL), 0.0);
      vec3 albedo = toLinear(surface(n, vKind));
      // Gas giants and Venus: softer limb darkening than a Lambert surface.
      float soft = vKind > 3.5 || abs(vKind - 2.0) < 0.5 ? 0.85 : 1.0;
      float light = mix(sqrt(lambert), lambert, soft);
      if (saturn) {
        // Shadow of the rings on the globe
        float denom = dot(vL, vP);
        if (abs(denom) > 1e-3) {
          float s = -dot(n, vP) / denom;
          if (s > 0.0) light *= 1.0 - 0.75 * ring(length(n + s * vL)).a;
        }
      }
      float earthshine = vKind < 0.5 ? 0.012 : 0.0;
      colour = albedo * (light * 1.25 + earthshine);
      alpha = 1.0 - smoothstep(1.0 - aa, 1.0, sqrt(r2));
    }

    // Saturn's rings (orthographic ray along −z through q, intersecting the ring plane)
    if (saturn && abs(vP.z) > 1e-3) {
      float t = -(q.x * vP.x + q.y * vP.y) / vP.z;
      vec3 hit = vec3(q, t);
      vec4 rg = ring(length(hit));
      bool inFront = r2 >= 1.0 || t > sqrt(1.0 - r2);
      if (rg.a > 0.0 && inFront) {
        // Lit face seen, or light filtering through from the other side.
        float sameSide = sign(dot(vP, vL)) * sign(vP.z);
        float lit = sameSide > 0.0 ? 1.0 : 0.22;
        // Shadow of the globe on the rings
        float b = dot(hit, vL);
        float disc = b * b - (dot(hit, hit) - 1.0);
        if (disc > 0.0 && -b + sqrt(disc) > 0.0 && b < 0.0) lit *= 0.08;
        vec3 rc = toLinear(rg.rgb) * lit * 1.2;
        colour = mix(colour, rc, rg.a);
        alpha = max(alpha, rg.a);
      }
    }

    // Point-of-light halo, outside the disc (its brightness follows the magnitude).
    float r = sqrt(r2);
    float halo = vGlow * exp(-max(r - 1.0, 0.0) * 2.2) * (1.0 - smoothstep(0.7, 1.0, length(p)));
    if (alpha < 0.999 && halo > 0.0) {
      vec3 hc = toLinear(fallback(vKind)) * halo;
      colour = colour * alpha + hc * (1.0 - alpha);
      alpha = alpha + halo * (1.0 - alpha);
      colour /= max(alpha, 1e-3);
    }
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(finish(colour), alpha);
  }
`;

/** Globe in colour: day texture, soft terminator, night lights, ocean glint and blue limb. */
export const realGlobeFrag = /* glsl */ `
  precision highp float;
  ${finish}
  uniform sampler2D uDay;
  uniform sampler2D uLights;
  uniform sampler2D uRelief;
  uniform float uHasDay;
  uniform vec3 uSunEarth;   // Sun direction, Earth-fixed frame
  uniform vec3 uCamEarth;   // camera position, Earth-fixed frame (Earth radii)
  varying vec3 vEarth;

  const float PI = 3.14159265359;

  void main() {
    vec3 n = normalize(vEarth);
    // Longitude seam: pick the parametrisation whose derivative is continuous (Tarini 2012).
    float lon = atan(n.y, n.x) / (2.0 * PI);
    float u1 = lon + 0.5;
    float u2 = fract(lon + 1.0) - 0.5; // same texel as u1 (repeat), seam moved to Greenwich
    float u = fwidth(u1) <= fwidth(u2) + 1e-6 ? u1 : u2;
    vec2 uv = vec2(u, 0.5 - asin(n.z) / PI);

    vec3 albedo;
    if (uHasDay > 0.5) {
      albedo = toLinear(texture2D(uDay, uv).rgb);
    } else {
      // Until the colour texture arrives: oceans and land from the relief luminance.
      float h = texture2D(uRelief, uv).r;
      albedo = toLinear(mix(vec3(0.02, 0.05, 0.13), vec3(0.32, 0.36, 0.2), smoothstep(0.35, 0.5, h)));
    }

    vec3 v = normalize(uCamEarth - n);
    float mu = dot(n, uSunEarth);
    float day = smoothstep(-0.05, 0.12, mu);
    float lambert = max(mu, 0.0);

    // Daylight with a little Rayleigh haze (bluer towards the limb), then the twilight band.
    float haze = pow(1.0 - max(dot(n, v), 0.0), 2.0);
    vec3 c = albedo * lambert * 1.9;
    c += vec3(0.012, 0.03, 0.08) * (0.25 + haze) * smoothstep(-0.1, 0.4, mu);
    c += vec3(0.6, 0.25, 0.08) * 0.008 * exp(-pow(mu / 0.05, 2.0)) * step(-0.1, mu);

    // Sun glint on water (dark and bluish pixels of the day texture).
    float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
    float water = smoothstep(0.004, 0.02, albedo.b - albedo.r) * (1.0 - smoothstep(0.02, 0.06, lum));
    water *= uHasDay;
    vec3 h = normalize(uSunEarth + v);
    c += vec3(1.0, 0.92, 0.8) * water * pow(max(dot(n, h), 0.0), 90.0) * 0.9 * day;

    // City lights on the night side (sharp sample plus a blurred halo, as in the engraving).
    float sharp = texture2D(uLights, uv).r;
    float glow = texture2D(uLights, uv, 2.5).r;
    float lights = max(smoothstep(0.3, 0.75, sharp), smoothstep(0.26, 0.5, glow) * 0.6);
    // The Black Marble composite also shows moonlit ice sheets: no city lights on white ice.
    lights *= 1.0 - uHasDay * smoothstep(0.2, 0.45, lum);
    c += vec3(1.0, 0.68, 0.32) * lights * 0.55 * (1.0 - smoothstep(-0.1, 0.04, mu));

    // Atmosphere seen edge-on: blue rim on the lit side, orange at the terminator.
    float rim = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    vec3 sky = mix(vec3(0.9, 0.45, 0.2), vec3(0.3, 0.55, 1.0), smoothstep(-0.05, 0.3, mu));
    c += sky * rim * 0.9 * smoothstep(-0.25, 0.2, mu);

    gl_FragColor = vec4(finish(c), 1.0);
  }
`;

/** Atmosphere halo around the globe: back faces of a slightly larger sphere, additive. */
export const atmosphereVert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

export const atmosphereFrag = /* glsl */ `
  precision highp float;
  ${finish}
  uniform vec3 uSunWorld;
  uniform float uAtmosphere; // outer radius, Earth radii
  varying vec3 vWorld;
  void main() {
    vec3 d = normalize(vWorld - cameraPosition);
    // Closest approach of the view ray to the Earth's centre.
    vec3 closest = cameraPosition - dot(cameraPosition, d) * d;
    float h = length(closest);
    if (h < 1.0) discard; // in front of the globe: the globe's own rim covers it
    float t = clamp((h - 1.0) / (uAtmosphere - 1.0), 0.0, 1.0);
    float density = exp(-t * 5.0) * (1.0 - t);
    float s = dot(closest / h, uSunWorld);
    float lit = smoothstep(-0.35, 0.25, s);
    vec3 colour = mix(vec3(0.95, 0.42, 0.15), vec3(0.32, 0.58, 1.0), smoothstep(-0.1, 0.35, s));
    vec3 c = colour * density * lit * 0.85;
    gl_FragColor = vec4(finish(c), 1.0);
  }
`;
