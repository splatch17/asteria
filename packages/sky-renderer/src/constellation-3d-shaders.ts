// GLSL of the constellation 3D view (#8). Positions are cartesian, in light-years.
import { dither } from "./shaders";

/**
 * Morphing projection, GPU twin of projectPose (constellation-3d-model.ts): stereographic from
 * the Earth (the sky map's projection) → perspective camera, as uMorph goes 0 → 1.
 */
const project3d = /* glsl */ `
  uniform mat3 uStereoRot;
  uniform float uStereoScale;
  uniform float uMorph;
  uniform vec3 uCamPos;
  uniform mat3 uCamRot;
  uniform float uFocal;
  uniform float uAspect;
  uniform float uShiftY;

  vec4 project3d(vec3 p) {
    vec3 c = uCamRot * (p - uCamPos);
    vec4 persp = vec4(c.x * uFocal / uAspect, c.y * uFocal + uShiftY * c.z, 0.0, c.z);
    if (uMorph >= 1.0) return persp;
    float len = length(p);
    vec3 v = uStereoRot * (len > 0.0 ? p / len : vec3(0.0, 0.0, 1.0));
    float k = 2.0 / (1.0 + max(v.z, -0.999)) * uStereoScale;
    vec2 s = vec2(v.x * k / uAspect, v.y * k);
    if (uMorph <= 0.0) return vec4(s, 0.0, 1.0);
    return vec4(mix(s, persp.xy / max(persp.w, 1e-3), uMorph), 0.0, 1.0);
  }
`;

/**
 * Stars: apparent size from the magnitude (as seen from the Earth: the figure stays readable),
 * engraved core, 1-bit Bayer halo. aFlag: 0 reliable distance, 1 approximate (dotted ring),
 * 2 uncertain (hollow core).
 */
export const star3dVert = /* glsl */ `
  ${project3d}
  uniform float uDpr;
  attribute float aMag;
  attribute vec3 aColor;
  attribute float aFlag;
  varying vec3 vColor;
  varying float vFlag;

  void main() {
    gl_Position = project3d(position);
    float rel = pow(10.0, -0.4 * (aMag - 5.5));
    gl_PointSize = clamp(3.2 * sqrt(rel), 7.0, 34.0) * uDpr;
    vColor = aColor;
    vFlag = aFlag;
  }
`;

export const star3dFrag = /* glsl */ `
  precision highp float;
  ${dither}
  uniform vec3 uInk;
  uniform float uTint;
  uniform float uAlpha;
  uniform float uDpr;
  varying vec3 vColor;
  varying float vFlag;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    float threshold = bayer8(floor(gl_FragCoord.xy / uDpr));
    float core = smoothstep(0.36, 0.26, r);
    if (vFlag > 1.5) core = smoothstep(0.38, 0.32, r) * smoothstep(0.2, 0.26, r); // hollow
    float halo = exp(-r * r * 7.0) * 0.75;
    float grain = step(threshold, halo) * 0.8; // 1-bit halo
    float ring = vFlag > 0.5 && vFlag < 1.5
      ? step(abs(r - 0.6), 0.04) * step(threshold, 0.55)
      : 0.0;
    float a = max(core, max(grain * (1.0 - core), ring)) * uAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(mix(uInk, vColor, uTint), a);
  }
`;
