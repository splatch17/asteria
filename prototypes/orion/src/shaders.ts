// GLSL for the Orion DA prototype. Bichrome output: every fragment is either
// transparent or uInk, the Hermes-style 1-bit look (see docs/ART_DIRECTION.md).

const common = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  // Ordered dithering matrix built recursively (values in [0,1)).
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
`;

export const figureVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const figureFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform vec3 uInk;
  uniform float uProgress;
  uniform float uTime;
  uniform float uStyle;
  uniform float uDpr;
  varying vec2 vUv;
  ${common}

  void main() {
    vec2 px = gl_FragCoord.xy / uDpr; // CSS pixels: pattern scale independent of screen density

    // Reveal front: grows from the torso outwards, broken up by noise.
    float n = hash(floor(vUv * 90.0));
    float d = length((vUv - vec2(0.45, 0.52)) * vec2(1.0, 1.35));
    float reveal = smoothstep(0.0, 0.10, uProgress * 1.35 - d - n * 0.18);

    // Scanline glitch while revealing (style B).
    vec2 uv = vUv;
    if (uStyle > 0.5 && uStyle < 1.5) {
      float row = floor(px.y / 4.0);
      uv.x += (hash(vec2(row, floor(uTime * 14.0))) - 0.5) * 0.05 * (1.0 - reveal);
    }

    float ink = smoothstep(0.20, 0.85, texture2D(uTex, uv).r);
    vec2 q = (vUv - vec2(0.50, 0.53)) / vec2(0.47, 0.45);
    ink *= 1.0 - smoothstep(0.72, 1.0, length(q)); // soft vignette hides plate border and captions
    ink *= reveal;

    float on;
    if (uStyle < 0.5) {
      // A — engraving, ordered 1-bit dither
      on = step(bayer8(px), ink * 1.08 - 0.04);
    } else if (uStyle < 1.5) {
      // B — halftone scanlines: line thickness follows ink
      float line = abs(fract(px.y / 4.0) - 0.5) * 2.0;
      float dots = abs(fract(px.x / 3.0) - 0.5) * 2.0;
      on = step(line, ink * 0.95) * step(dots * 0.6, ink + 0.25);
    } else {
      // C — animated stochastic grain
      float g = hash(px + fract(uTime * 0.9) * vec2(91.7, 37.3));
      on = step(g, ink * ink * 1.15);
    }
    if (on < 0.5) discard;
    gl_FragColor = vec4(uInk, 0.92);
  }
`;

export const starVert = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpike;
  uniform float uTime;
  uniform float uDpr;
  uniform float uProgress;
  varying float vSpike;
  void main() {
    vSpike = aSpike;
    float twinkle = 1.0 + 0.09 * sin(uTime * 2.3 + aPhase) * sin(uTime * 1.7 + aPhase * 3.1);
    gl_PointSize = aSize * uDpr * twinkle * mix(0.6, 1.0, uProgress);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const starFrag = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  varying float vSpike;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    float core = smoothstep(0.30, 0.18, r);
    float ang = atan(p.y, p.x);
    // six-pointed engraved star glyph for bright stars (as on 19th-century atlases)
    float spikes = pow(abs(cos(ang * 3.0)), 60.0) * smoothstep(1.0, 0.15, r) * vSpike;
    float halo = exp(-r * r * 9.0) * 0.35;
    float a = max(core, max(spikes, halo));
    if (a < 0.02) discard;
    gl_FragColor = vec4(uInk, a);
  }
`;
