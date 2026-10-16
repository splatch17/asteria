import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { isPrecached, type PrecacheEntry } from "./src/lib/offline";

/**
 * Offline mode (#142): after the build, lists every file of `dist` (with the sky data synced into
 * `public/data`) and writes `sw.js` from the service-worker template, with that list and a build
 * id. Revisions are content hashes, so that the next install only downloads what changed.
 */
export function offlineServiceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "asteria-offline-sw",
    apply: "build",
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = config.build.outDir;
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) walk(path);
          else files.push(relative(outDir, path).split("\\").join("/"));
        }
      };
      walk(outDir);
      const entries: PrecacheEntry[] = files
        .filter(isPrecached)
        .sort()
        .map((url) => {
          const content = readFileSync(join(outDir, url));
          const rev = createHash("sha256").update(content).digest("hex").slice(0, 16);
          return { url, rev, size: content.length };
        });
      const build = createHash("sha256")
        .update(entries.map((e) => `${e.url}@${e.rev}`).join("\n"))
        .digest("hex")
        .slice(0, 12);
      const template = readFileSync(new URL("src/sw/service-worker.js", import.meta.url), "utf8");
      const sw = template
        .replace("self.__ASTERIA_PRECACHE__", JSON.stringify(entries))
        .replace("self.__ASTERIA_BUILD__", JSON.stringify(build));
      writeFileSync(join(outDir, "sw.js"), sw);
      const mb = entries.reduce((s, e) => s + e.size, 0) / 1e6;
      config.logger.info(`offline: sw.js precaches ${entries.length} files, ${mb.toFixed(1)} MB`);
    },
  };
}
