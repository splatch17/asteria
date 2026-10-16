/** One file of the build downloaded for offline use (#142); `url` is relative to the app base. */
export type PrecacheEntry = { url: string; rev: string; size: number };

/**
 * Files of `dist` the service worker downloads: everything the app can load, except the `.woff`
 * fallbacks of the fonts (every browser that runs the app takes the `.woff2`), the prototypes
 * (`proto-*`), source maps and the worker itself.
 */
export function isPrecached(path: string): boolean {
  if (path === "sw.js" || path.startsWith("proto-")) return false;
  return !/\.(woff|map)$/.test(path);
}

/** State of the offline copy, as the service worker reports it. */
export type OfflineState =
  | { state: "unsupported" }
  | {
      state: "idle" | "downloading" | "ready" | "error";
      done: number;
      total: number;
      bytes: number;
    };

/** Percentage shown while downloading (never 100 before the end). */
export function offlinePercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(99, Math.floor((done / total) * 100));
}
