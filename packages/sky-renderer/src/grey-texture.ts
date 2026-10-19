import * as THREE from "three";

export interface GreyTextureOptions {
  /** Mipmapped trilinear minification (figure atlas) or plain bilinear (smooth maps). */
  mipmaps: boolean;
  /** Wrap mode along u (default: clamp to edge). */
  wrapS?: THREE.Wrapping;
}

/**
 * Decodes a greyscale image (WebP, PNG) into a single-channel (R8) texture: 1 byte per texel on
 * the GPU, rows top-down (uploaded without flipY: v = 0 is the image's first row).
 */
export async function loadGreyTexture(
  url: string,
  options: GreyTextureOptions,
): Promise<THREE.DataTexture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  const { width, height } = bitmap;
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error(`no 2D context to decode ${url}`);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const red = new Uint8Array(width * height);
  for (let i = 0; i < red.length; i++) red[i] = rgba[4 * i]!;
  const texture = new THREE.DataTexture(
    red,
    width,
    height,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = options.mipmaps;
  texture.minFilter = options.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (options.wrapS !== undefined) texture.wrapS = options.wrapS;
  texture.needsUpdate = true;
  return texture;
}
