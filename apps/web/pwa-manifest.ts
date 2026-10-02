import type { Plugin } from "vite";
import fr from "../../packages/ui/src/i18n/locales/fr.json";

/**
 * Web app manifest (#27), built from the i18n catalogue and Vite's `base` so that it works both
 * at the root (dev) and under /asteria/ (GitHub Pages). Served in dev, emitted at build.
 *
 * `display: fullscreen` hides the status and navigation bars once installed (#59); browsers
 * without it fall back to standalone. No service worker: Chromium no longer requires one to
 * install (offline mode is a separate ticket).
 */
export function pwaManifest(): Plugin {
  let base = "/";
  const manifest = () =>
    JSON.stringify(
      {
        id: base,
        name: fr["app.name"],
        short_name: fr["app.name"],
        description: fr["app.tagline"],
        lang: "fr",
        start_url: base,
        scope: base,
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        background_color: "#101b52",
        theme_color: "#101b52",
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png" },
          {
            src: `${base}icons/icon-maskable-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: `${base}favicon.svg`, sizes: "any", type: "image/svg+xml" },
        ],
      },
      null,
      2,
    );
  return {
    name: "asteria-pwa-manifest",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== `${base}manifest.webmanifest`) return next();
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(manifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: manifest() });
    },
  };
}
