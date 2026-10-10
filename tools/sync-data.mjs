// Copies the sky-data pipeline output into the web app's public folder (not versioned).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const from = "packages/sky-data/out";
const to = "apps/web/public/data";

if (!existsSync(`${from}/stars.bin`)) {
  console.error(`Missing ${from}/stars.bin — run: python packages/sky-data/build_stars.py`);
  process.exit(1);
}
mkdirSync(to, { recursive: true });
// The app loads the compact binary catalogue; stars.json stays a pipeline artefact only.
rmSync(`${to}/stars.json`, { force: true });
for (const f of ["stars.bin", "star-strings.json", "constellation-lines.json"])
  cpSync(`${from}/${f}`, `${to}/${f}`);
// Earth assets for the space view (optional until build_earth.py has run).
if (existsSync(`${from}/earth`)) cpSync(`${from}/earth`, `${to}/earth`, { recursive: true });
// Deep-sky catalogue (build_deepsky.py, #100), loaded on demand: optional until it has run.
if (existsSync(`${from}/deepsky.json`)) cpSync(`${from}/deepsky.json`, `${to}/deepsky.json`);
// Textures of the realistic style (build_space.py), loaded on demand: optional too.
if (existsSync(`${from}/space`)) cpSync(`${from}/space`, `${to}/space`, { recursive: true });
// Illustrated constellation figures (build_figures.py, #95), loaded on demand: optional.
if (existsSync(`${from}/figures`)) cpSync(`${from}/figures`, `${to}/figures`, { recursive: true });
console.log(`Synced sky data → ${to}`);
