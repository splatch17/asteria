// Checks Android/browser back over the layers (#176) in Chromium.
// Playwright is installed globally in the cloud container: ESM imports ignore NODE_PATH, require does not.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM, // optional: a Chromium other than Playwright's own
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await browser.newContext({
  viewport: { width: 360, height: 780 },
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript(() => {
  localStorage.setItem("asteria.menu.panel", '"view"');
  localStorage.setItem("asteria.games.last", '"whichConstellation"');
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto("http://localhost:4317/about-blank-guard");
await page.goto("http://localhost:4317/");
await page.waitForSelector("[data-corner='button']");
await page.waitForTimeout(1500);
const back = async () => {
  await page.evaluate(() => history.back());
  await page.waitForTimeout(600);
};
const has = (sel) => page.locator(sel).count();
const check = (label, ok) => console.log(ok ? "ok  " : "FAIL", label);

await page.locator("[data-corner='button']").first().tap();
await page.waitForTimeout(400);
check("sheet open", (await has("#main-menu")) === 1);
await back();
check("back closes the sheet", (await has("#main-menu")) === 0);
check(
  "still on the app",
  page.url().startsWith("http://localhost:4317/") && !page.url().includes("guard"),
);

// Close by ×, then back must leave nothing open but stay in the app only once more.
await page.locator("[data-corner='button']").first().tap();
await page.waitForTimeout(300);
await page.locator(".close").first().tap();
await page.waitForTimeout(600);
check("× closes the sheet", (await has("#main-menu")) === 0);
const len1 = await page.evaluate(() => history.length);

// Heure → time line → back folds it.
await page.locator("[data-corner='button']").first().tap();
await page.waitForTimeout(300);
await page.locator(".row").first().tap();
await page.waitForTimeout(700);
check("time line open", (await has(".timeline")) === 1);
await back();
check("back folds the time line", (await has(".timeline")) === 0);

// Apprendre → Reprendre (game) → back → hub → back → sky.
await page.locator("[data-corner='button']").first().tap();
await page.waitForTimeout(300);
await page.locator("[data-mode='learn']").tap();
await page.waitForTimeout(1500);
check("Apprendre open", (await has(".games")) === 1);
await page.locator("[data-learn='resume']").tap();
await page.waitForTimeout(1500);
check("game playing (no hub button)", (await has(".games [data-corner='button']")) === 0);
await back();
check("back leaves the game for the hub", (await has(".games [data-corner='button']")) === 1);
await back();
check("back closes Apprendre", (await has(".games")) === 0);

// Latitude explorer and its enlarged map.
await page.locator("[data-corner='button']").first().tap();
await page.waitForTimeout(300);
await page.locator("[data-mode='learn']").tap();
await page.waitForTimeout(1200);
await page.locator("[data-game='latitude']").tap();
await page.waitForTimeout(1500);
const expand = page.locator(".map-block button").first();
console.log("latitude open:", await has(".latitude, [aria-labelledby*='latitude']"));
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    /agrandir/i.test(x.getAttribute("aria-label") ?? x.textContent ?? ""),
  );
  b?.click();
});
await page.waitForTimeout(800);
check("map enlarged", (await has(".map-block.expanded")) === 1);
await back();
check("back reduces the map", (await has(".map-block.expanded")) === 0);
check("explorer still open", (await has(".map-block")) === 1);
await back();
check("back closes the explorer", (await has(".map-block")) === 0);
check("Apprendre still open under it", (await has(".games")) === 1);
await back();
check("back closes Apprendre", (await has(".games")) === 0);
console.log("history length after × close", len1, "now", await page.evaluate(() => history.length));
await browser.close();
void expand;
