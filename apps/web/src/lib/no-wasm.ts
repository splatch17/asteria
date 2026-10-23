/**
 * Stand-in for satellite.js's WebAssembly runtimes (aliased in vite.config.ts, #12): the app
 * propagates with the JavaScript SGP4 only, so these modules must never load.
 */
export default function createModule(): never {
  throw new Error("satellite.js WebAssembly runtime is not bundled");
}
