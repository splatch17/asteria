import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { offlineServiceWorker } from "./offline";
import { pwaManifest } from "./pwa-manifest";
import { thirdPartyLicenses } from "./third-party-licenses";

const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as {
  version: string;
};

/** Short commit of the build (CI: GITHUB_SHA), shown in the credits next to the version. */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the app under /asteria/
  base: process.env.BASE_PATH ?? "/",
  define: {
    "import.meta.env.APP_VERSION": JSON.stringify(version),
    "import.meta.env.APP_COMMIT": JSON.stringify(commit()),
  },
  resolve: {
    alias: {
      // satellite.js (#12) also ships WebAssembly builds of SGP4 (≈ 400 KB, Node-only parts),
      // reached only through createSingleThreadRuntime / createMultiThreadRuntime, which the app
      // never calls: a stub keeps them out of the build and of the offline copy.
      "#wasm-single-thread": fileURLToPath(new URL("src/lib/no-wasm.ts", import.meta.url)),
      "#wasm-multi-thread": fileURLToPath(new URL("src/lib/no-wasm.ts", import.meta.url)),
    },
  },
  // `--mode phone`: self-signed HTTPS for testing on a phone over Wi-Fi
  // (Brave forces HTTPS, and orientation sensors need a secure context).
  plugins: [
    svelte(),
    pwaManifest(),
    offlineServiceWorker(),
    thirdPartyLicenses(),
    ...(mode === "phone" ? [basicSsl()] : []),
  ],
}));
