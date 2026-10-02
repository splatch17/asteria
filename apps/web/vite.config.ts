import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import basicSsl from "@vitejs/plugin-basic-ssl";
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
  // `--mode phone`: self-signed HTTPS for testing on a phone over Wi-Fi
  // (Brave forces HTTPS, and orientation sensors need a secure context).
  plugins: [
    svelte(),
    pwaManifest(),
    thirdPartyLicenses(),
    ...(mode === "phone" ? [basicSsl()] : []),
  ],
}));
