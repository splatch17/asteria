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

const dither = /* glsl */ `
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
    if (v.z < -0.2 || h.z < -0.02 || rel < 0.35) {
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
    vVisible = v.z > -0.2 ? 1.0 : 0.0;
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
