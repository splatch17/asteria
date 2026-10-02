/**
 * Phone orientation → sky view, from W3C DeviceOrientation angles.
 *
 * W3C: earth frame x = East, y = North, z = Up; device frame x = right, y = top, z = out of
 * the screen; R = Rz(alpha) · Rx(beta) · Ry(gamma) maps device → earth.
 * The camera looks out of the back of the phone (−z); screen "up" depends on screen rotation.
 */

const RAD = Math.PI / 180;
type V3 = [number, number, number];

function rotate(alpha: number, beta: number, gamma: number, [x, y, z]: V3): V3 {
  const [ca, sa] = [Math.cos(alpha * RAD), Math.sin(alpha * RAD)];
  const [cb, sb] = [Math.cos(beta * RAD), Math.sin(beta * RAD)];
  const [cg, sg] = [Math.cos(gamma * RAD), Math.sin(gamma * RAD)];
  // Ry(gamma)
  const x1 = cg * x + sg * z;
  const z1 = -sg * x + cg * z;
  // Rx(beta)
  const y2 = cb * y - sb * z1;
  const z2 = sb * y + cb * z1;
  // Rz(alpha)
  return [ca * x1 - sa * y2, sa * x1 + ca * y2, z2];
}

export interface SkyPointing {
  azimuth: number;
  altitude: number;
  roll: number;
}

/** Back-camera direction and screen-up vector in (East, North, Up). */
export function devicePointing(
  alpha: number,
  beta: number,
  gamma: number,
  screenAngle = 0,
): { forward: V3; up: V3 } {
  const s = screenAngle * RAD;
  const screenUp: V3 = [Math.sin(s), Math.cos(s), 0]; // device +y rotated by −screenAngle
  return {
    forward: rotate(alpha, beta, gamma, [0, 0, -1]),
    up: rotate(alpha, beta, gamma, screenUp),
  };
}

/** Rotates v by the unit quaternion q = [x, y, z, w]: q · v · q⁻¹. */
function rotateByQuaternion([x, y, z, w]: readonly number[], v: V3): V3 {
  // t = 2 · (q.xyz × v); v' = v + w·t + q.xyz × t
  const tx = 2 * (y! * v[2] - z! * v[1]);
  const ty = 2 * (z! * v[0] - x! * v[2]);
  const tz = 2 * (x! * v[1] - y! * v[0]);
  return [
    v[0] + w! * tx + (y! * tz - z! * ty),
    v[1] + w! * ty + (z! * tx - x! * tz),
    v[2] + w! * tz + (x! * ty - y! * tx),
  ];
}

/**
 * Same as devicePointing, from a Generic Sensor quaternion [x, y, z, w]
 * (AbsoluteOrientationSensor, `referenceFrame: "device"`: device frame → East, North, Up).
 */
export function quaternionPointing(q: readonly number[], screenAngle = 0): { forward: V3; up: V3 } {
  const s = screenAngle * RAD;
  return {
    forward: rotateByQuaternion(q, [0, 0, -1]),
    up: rotateByQuaternion(q, [Math.sin(s), Math.cos(s), 0]),
  };
}

/** Converts pointing vectors (East, North, Up) to the sky map's azimuth / altitude / roll. */
export function pointingToView(forward: V3, up: V3): SkyPointing {
  const [e, n, u] = forward;
  const azimuth = (((Math.atan2(e, n) / RAD) % 360) + 360) % 360;
  const altitude = Math.asin(Math.max(-1, Math.min(1, u))) / RAD;
  // Unrolled basis for this direction, in (East, North, Up).
  const a = azimuth * RAD;
  const h = altitude * RAD;
  const right0: V3 = [Math.cos(a), -Math.sin(a), 0];
  const up0: V3 = [-Math.sin(h) * Math.sin(a), -Math.sin(h) * Math.cos(a), Math.cos(h)];
  const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const roll = Math.atan2(dot(up, right0), dot(up, up0)) / RAD;
  return { azimuth, altitude, roll };
}

/** Exponential smoothing of unit vectors (sensor jitter), renormalised. */
export function smooth(prev: V3 | null, next: V3, k: number): V3 {
  if (!prev) return next;
  const v: V3 = [0, 1, 2].map((i) => prev[i]! + (next[i]! - prev[i]!) * k) as V3;
  const len = Math.hypot(...v) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
