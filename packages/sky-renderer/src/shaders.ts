// GLSL for the sky map. Positions are J2000 unit vectors; the whole projection
// (precession → horizontal → view → stereographic) runs on the GPU.

const projection = /* glsl */ `
  uniform mat3 uEq2Hor;
  uniform mat3 uView;
  uniform float uScale;
  uniform float uAspect;

  vec4 projectView(vec3 v) {
    float k = 2.0 / (1.0 + max(v.z, -0.999)) * uScale;
    return vec4(v.x * k / uAspect, v.y * k, 0.0, 1.0);
  }
`;

export const dither = /* glsl */ `
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
`;

export const starVert = /* glsl */ `
  ${projection}
  uniform float uDpr;
  uniform float uLimitMag;
  attribute vec3 aDir;
  attribute float aMag;
  varying float vAlpha;
  varying float vSpike;

  void main() {
    vec3 h = uEq2Hor * aDir;
    vec3 v = uView * h;
    float rel = pow(10.0, -0.4 * (aMag - uLimitMag)); // flux relative to the faintest shown star
    float size = clamp(2.3 * sqrt(rel), 0.0, 26.0);
    vAlpha = clamp(0.35 + rel * 0.9, 0.0, 1.0);
    vSpike = aMag < 1.6 ? 1.0 : 0.0;
    if (v.z < -0.6 || h.z < -0.02 || rel < 0.35) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectView(v);
    gl_PointSize = max(size, 2.2) * uDpr;
  }
`;

export const starFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  varying float vAlpha;
  varying float vSpike;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    float core = smoothstep(0.5, 0.22, r);
    float spikes = pow(abs(cos(atan(p.y, p.x) * 3.0)), 60.0) * smoothstep(1.0, 0.15, r) * vSpike;
    float halo = exp(-r * r * 6.0) * 0.45;
    float a = max(core, max(spikes, halo)) * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(uInk, a);
  }
`;

export const lineVert = /* glsl */ `
  ${projection}
  attribute vec3 aDir;
  varying float vVisible;

  void main() {
    vec3 v = uView * (uEq2Hor * aDir);
    vVisible = v.z > -0.6 ? 1.0 : 0.0;
    gl_Position = projectView(v);
  }
`;

export const lineFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  uniform float uLineOpacity;
  varying float vVisible;

  void main() {
    if (vVisible < 0.999) discard; // segment touches the back hemisphere
    gl_FragColor = vec4(uInk, uLineOpacity);
  }
`;

/** Full-screen pass: ground below the horizon, horizon line, engraved glow above it. */
export const groundVert = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const groundFrag = /* glsl */ `
  precision highp float;
  uniform mat3 uViewInv;
  uniform float uScale;
  uniform float uAspect;
  uniform float uDpr;
  uniform vec3 uInk;
  uniform vec3 uGround;
  varying vec2 vNdc;
  ${dither}

  void main() {
    vec2 p = vec2(vNdc.x * uAspect, vNdc.y) / uScale;
    float r2 = dot(p, p);
    vec3 h = uViewInv * (vec3(4.0 * p, 4.0 - r2) / (4.0 + r2));
    float up = h.z;
    float threshold = bayer8(gl_FragCoord.xy / uDpr);
    float line = 1.0 - smoothstep(0.0, 1.2 * fwidth(up), abs(up));

    if (up > 0.0) {
      float glow = (1.0 - smoothstep(0.0, 0.09, up)) * 0.2;
      float on = max(step(threshold + 0.001, glow), line);
      if (on < 0.5) discard;
      gl_FragColor = vec4(uInk, line > 0.5 ? 0.85 : 0.5);
      return;
    }
    // Ground: dark, with engraved stippling fading with depth below the horizon.
    float density = 0.16 * (1.0 - smoothstep(0.0, 0.25, -up));
    vec3 col = mix(uGround, uInk, step(threshold + 0.001, density) * 0.35);
    gl_FragColor = vec4(mix(col, uInk, line * 0.85), 1.0);
  }
`;

/** Sun and Moon: one point each (aKind 0 = Sun, 1 = Moon), engraved/dithered like the figures. */
export const bodyVert = /* glsl */ `
  ${projection}
  uniform float uDpr;
  uniform float uBodySize;
  attribute vec3 aDir;
  attribute float aKind;
  varying float vKind;

  void main() {
    vec3 h = uEq2Hor * aDir;
    vec3 v = uView * h;
    vKind = aKind;
    if (v.z < -0.6 || h.z < -0.01) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectView(v);
    gl_PointSize = uBodySize * (aKind < 0.5 ? 1.25 : 1.0) * uDpr;
  }
`;

export const bodyFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  uniform float uDpr;
  uniform float uMoonT;      // terminator position: 1 − 2 × illuminated fraction
  uniform float uSunAngle;   // screen angle of the Sun as seen from the Moon (radians)
  varying float vKind;
  ${dither}

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y = -p.y;
    float r = length(p);
    float threshold = bayer8(gl_FragCoord.xy / uDpr);

    if (vKind < 0.5) {
      // Sun: stippled disc, engraved ring and sixteen fine rays
      float disc = (1.0 - smoothstep(0.30, 0.33, r)) * step(threshold, 0.8);
      float ring = smoothstep(0.36, 0.38, r) * (1.0 - smoothstep(0.40, 0.42, r));
      float rays = pow(abs(cos(atan(p.y, p.x) * 8.0)), 48.0) * step(0.46, r) * (1.0 - smoothstep(0.85, 1.0, r));
      float on = max(disc, max(ring, step(0.5, rays)));
      if (on < 0.5) discard;
      gl_FragColor = vec4(uInk, 1.0);
      return;
    }

    // Moon: rotate so the Sun lies along +x, then light the part beyond the terminator ellipse.
    if (r > 1.0) discard;
    float c = cos(uSunAngle);
    float s = sin(uSunAngle);
    vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
    float lit = step(uMoonT * sqrt(max(0.0, 1.0 - q.y * q.y)), q.x);
    float limb = sqrt(max(0.0, 1.0 - r * r));
    float density = max(lit * (0.5 + 0.5 * limb), 0.07); // 0.07: earthshine on the dark side
    float on = step(threshold, density);
    float rim = smoothstep(0.9, 0.95, r) * (1.0 - smoothstep(0.97, 1.0, r));
    float a = max(on, rim * 0.7);
    if (a < 0.1) discard;
    gl_FragColor = vec4(uInk, a);
  }
`;

/**
 * Planets: engraved discs sized by magnitude; aKind = index in PLANETS (4 = Saturn, ringed).
 * uPlanetLimit = planetLimitingMagnitude(): with the Sun high, only Venus remains.
 */
export const planetVert = /* glsl */ `
  ${projection}
  uniform float uDpr;
  uniform float uPlanetLimit;
  attribute vec3 aDir;
  attribute float aMag;
  attribute float aKind;
  varying float vKind;
  void main() {
    vec3 h = uEq2Hor * aDir;
    vec3 v = uView * h;
    vKind = aKind;
    if (v.z < -0.6 || h.z < -0.01 || aMag > uPlanetLimit) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectView(v);
    float saturn = 1.0 - step(0.5, abs(aKind - 4.0));
    gl_PointSize = clamp(11.0 - aMag * 1.6, 7.0, 20.0) * mix(1.0, 1.6, saturn) * uDpr;
  }
`;

export const planetFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  uniform float uDpr;
  varying float vKind;
  ${dither}
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float saturn = step(3.5, vKind) * step(vKind, 4.5);
    float scale = mix(1.0, 1.6, saturn);
    float r = length(p) * scale;
    // stippled disc with a crisp outline
    float disc = (1.0 - step(0.62, r)) * step(bayer8(gl_FragCoord.xy / uDpr) + 0.001, 0.75);
    float outline = smoothstep(0.66, 0.7, r) * (1.0 - smoothstep(0.76, 0.8, r));
    // Saturn's ring: thin tilted ellipse around the disc
    vec2 q = vec2(p.x, p.y * 2.6) * scale;
    float rr = length(q);
    float ring = saturn * smoothstep(0.95, 1.0, rr) * (1.0 - smoothstep(1.06, 1.12, rr)) * step(0.0, abs(p.y) * 6.0 - (1.0 - step(0.62, r)) * 6.0);
    float a = max(max(disc, outline), ring);
    if (a < 0.5) discard;
    gl_FragColor = vec4(uInk, 1.0);
  }
`;

/** Apparent paths: small dots; monthly marks larger (aMark = 1). */
export const pathVert = /* glsl */ `
  ${projection}
  uniform float uDpr;
  attribute vec3 aDir;
  attribute float aMark;
  varying float vMark;
  void main() {
    vec3 h = uEq2Hor * aDir;
    vec3 v = uView * h;
    vMark = aMark;
    if (v.z < -0.6) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    gl_Position = projectView(v);
    gl_PointSize = (aMark > 0.5 ? 5.0 : 2.4) * uDpr;
  }
`;

export const pathFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  varying float vMark;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    float a = vMark > 0.5 ? (1.0 - smoothstep(0.8, 1.0, r)) * (smoothstep(0.35, 0.5, r) + step(r, 0.2)) : 1.0 - smoothstep(0.6, 1.0, r);
    if (a < 0.1) discard;
    gl_FragColor = vec4(uInk, a * 0.75);
  }
`;

/**
 * Reference lines (coordinate grids, ecliptic): engraved, 1-bit stippled wires.
 * aDir is expressed in the layer's own frame; uFrame takes it to horizontal coordinates.
 * aDash (degrees along the line) cuts dashes when uDash > 0.
 */
export const guideVert = /* glsl */ `
  ${projection}
  uniform mat3 uFrame;
  attribute vec3 aDir;
  attribute float aDash;
  varying float vVisible;
  varying float vDash;
  void main() {
    vec3 v = uView * (uFrame * aDir);
    vVisible = v.z > -0.6 ? 1.0 : 0.0;
    vDash = aDash;
    gl_Position = projectView(v);
  }
`;

export const guideFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  uniform float uDpr;
  uniform float uOpacity;
  uniform float uDensity; // share of the line's pixels kept by the ordered dither
  uniform float uDash;    // dash period in degrees (0: continuous)
  varying float vVisible;
  varying float vDash;
  ${dither}
  void main() {
    if (vVisible < 0.999) discard;
    if (uDash > 0.0 && fract(vDash / uDash) > 0.6) discard;
    if (bayer4(gl_FragCoord.xy / uDpr) + 0.001 > uDensity) discard;
    gl_FragColor = vec4(uInk, uOpacity);
  }
`;
