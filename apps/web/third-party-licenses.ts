import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { creditedPackages } from "../../packages/content/src/credits";

/**
 * Third-party licences (#66). At build time, lists every npm package that ends up in the bundle
 * (JavaScript and CSS, hence the self-hosted fonts), fails if one is missing from the credits
 * (`packages/content/fr/credits.json`), and emits `THIRD-PARTY-LICENSES.txt` with the full text
 * of each licence — MIT, BSD and OFL all require it to travel with the copies.
 */
export const LICENSES_FILE = "THIRD-PARTY-LICENSES.txt";

interface BundledPackage {
  name: string;
  version: string;
  license: string;
  text: string;
}

const NODE_MODULES = "/node_modules/";

/** Package root of a module id inside node_modules, or null for workspace sources. */
function packageRoot(id: string): { root: string; name: string } | null {
  const path = id.replace(/^\0/, "").split("?")[0]!.replace(/\\/g, "/");
  const at = path.lastIndexOf(NODE_MODULES);
  if (at < 0) return null;
  const rest = path.slice(at + NODE_MODULES.length).split("/");
  const name = rest[0]!.startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0]!;
  return { root: path.slice(0, at + NODE_MODULES.length) + name, name };
}

/** LICENSE file, or the licence block comment at the top of the entry file (astronomy-engine). */
function licenseText(root: string, pkg: { main?: string }): string | null {
  const file = readdirSync(root).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  if (file) return readFileSync(join(root, file), "utf8").trim();
  const main = pkg.main && join(root, pkg.main);
  if (main && existsSync(main)) {
    const header = /\/\*[\s\S]*?\*\//.exec(readFileSync(main, "utf8"))?.[0];
    if (header && /copyright/i.test(header) && /permission/i.test(header))
      return header
        .replace(/^\/\*+|\*+\/$/g, "")
        .split("\n")
        .map((l) => l.replace(/^\s*\*? ?/, ""))
        .join("\n")
        .trim();
  }
  return null;
}

export function thirdPartyLicenses(): Plugin {
  let root = process.cwd();
  return {
    name: "asteria-third-party-licenses",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_options, bundle) {
      const credited = creditedPackages("fr");
      const found = new Map<string, BundledPackage>();
      // Code that survived tree-shaking, and emitted files (fonts, imported from CSS).
      const shipped = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type === "asset") {
          for (const file of output.originalFileNames) shipped.add(resolve(root, file));
          continue;
        }
        for (const [id, info] of Object.entries(output.modules))
          if (info.renderedLength > 0) shipped.add(id);
      }
      for (const id of shipped) {
        const pkgRoot = packageRoot(id);
        if (!pkgRoot || found.has(pkgRoot.name)) continue;
        const pkg = JSON.parse(readFileSync(join(pkgRoot.root, "package.json"), "utf8")) as {
          version: string;
          license?: string;
          main?: string;
        };
        const text = licenseText(pkgRoot.root, pkg);
        if (!text) this.error(`No licence text found for bundled package ${pkgRoot.name}`);
        found.set(pkgRoot.name, {
          name: pkgRoot.name,
          version: pkg.version,
          license: pkg.license ?? "UNKNOWN",
          text,
        });
      }
      const missing = [...found.keys()].filter((name) => !credited.has(name));
      if (missing.length)
        this.error(
          `Bundled packages missing from packages/content/fr/credits.json: ${missing.join(", ")}`,
        );
      const rule = "=".repeat(72);
      const body = [...found.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => `${rule}\n${p.name}@${p.version} (${p.license})\n${rule}\n\n${p.text}\n`)
        .join("\n");
      this.emitFile({
        type: "asset",
        fileName: LICENSES_FILE,
        source:
          "Asteria — third-party software bundled in this application and their licences.\n" +
          "Data and assets credits: see the in-app « Crédits et sources » page.\n\n" +
          body,
      });
    },
  };
}
