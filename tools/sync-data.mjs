// Copies the sky-data pipeline output into the web app's public folder (not versioned).
import { cpSync, existsSync, mkdirSync } from "node:fs";

const from = "packages/sky-data/out";
const to = "apps/web/public/data";

if (!existsSync(`${from}/stars.bin`)) {
  console.error(`Missing ${from}/stars.bin — run: python packages/sky-data/build_stars.py`);
  process.exit(1);
}
mkdirSync(to, { recursive: true });
for (const f of ["stars.json", "stars.bin", "star-strings.json", "constellation-lines.json"])
  cpSync(`${from}/${f}`, `${to}/${f}`);
console.log(`Synced sky data → ${to}`);
