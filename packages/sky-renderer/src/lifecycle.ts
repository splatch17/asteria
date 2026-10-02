/**
 * GPU resource lifecycle shared by SkyMap and SpaceView (#73): WebGL context loss and disposal.
 */
import * as THREE from "three";

/**
 * Listens for WebGL context loss (Android drops contexts of pages left in the background).
 * `lost`: the default action is prevented so the browser may restore the context. `restored`:
 * three.js re-creates its GL state and re-uploads geometries and textures from their CPU copies on
 * the next render, so the caller only has to ask for a frame.
 */
export function watchContext(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  handlers: { lost: () => void; restored: () => void },
): void {
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      handlers.lost();
    },
    { signal },
  );
  canvas.addEventListener("webglcontextrestored", () => handlers.restored(), { signal });
}

/**
 * Frees every geometry, material and texture of a scene graph (textures found in material
 * uniforms and maps included), each once. `extra`: objects not (or no longer) in the scene.
 */
export function disposeObjects(root: THREE.Object3D, extra: THREE.Object3D[] = []): void {
  const seen = new Set<{ dispose(): void }>();
  const add = (r: { dispose(): void } | null | undefined) => {
    if (r) seen.add(r);
  };
  const visit = (o: THREE.Object3D) => {
    const mesh = o as Partial<THREE.Mesh>;
    add(mesh.geometry as THREE.BufferGeometry | undefined);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of materials) {
      if (!m) continue;
      add(m);
      add((m as THREE.MeshBasicMaterial).map);
      for (const u of Object.values((m as THREE.ShaderMaterial).uniforms ?? {}))
        if (u?.value instanceof THREE.Texture) add(u.value);
    }
  };
  root.traverse(visit);
  for (const o of extra) o.traverse(visit);
  for (const r of seen) r.dispose();
}
