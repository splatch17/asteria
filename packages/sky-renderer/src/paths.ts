import * as THREE from "three";
import type { SkyPath } from "./sky-map";

/**
 * Writes paths into a Points object's buffers (direction + mark flag), reusing them while they are
 * large enough. Returns the number of points drawn.
 */
export function fillPathBuffers(points: THREE.Points, paths: readonly SkyPath[]): number {
  let total = 0;
  for (const p of paths) total += p.points.length;
  const geo = points.geometry;
  let dirs = geo.getAttribute("aDir") as THREE.BufferAttribute | undefined;
  let marks = geo.getAttribute("aMark") as THREE.BufferAttribute | undefined;
  if (!dirs || !marks || dirs.count < total) {
    // Headroom so that sliding windows keep reusing the same buffers.
    const capacity = Math.max(256, Math.ceil(total * 1.25));
    dirs = new THREE.Float32BufferAttribute(new Float32Array(capacity * 3), 3);
    marks = new THREE.Float32BufferAttribute(new Float32Array(capacity), 1);
    geo.setAttribute("position", dirs);
    geo.setAttribute("aDir", dirs);
    geo.setAttribute("aMark", marks);
  }
  const DEG = Math.PI / 180;
  let k = 0;
  for (const path of paths) {
    for (const pt of path.points) {
      const ra = pt.ra * DEG;
      const dec = pt.dec * DEG;
      const c = Math.cos(dec);
      dirs.setXYZ(k, c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec));
      marks.setX(k, pt.mark ? 1 : 0);
      k++;
    }
  }
  dirs.needsUpdate = true;
  marks.needsUpdate = true;
  geo.setDrawRange(0, total);
  return total;
}
