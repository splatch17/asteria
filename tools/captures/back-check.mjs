// Checks Android/browser back over the layers (#176, menu v2) in Chromium: settings page → tab
// home → sheet; a screen opened from a tab (deck, game, latitude) → that tab's home.
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
  localStorage.setItem("asteria.prefs.level", JSON.stringify({ v: 1, level: "amateur" }));
  localStorage.setItem("asteria.games.last", '"whichConstellation"');
});
const page = await ctx.newPage();
let failed = 0;
page.on("pageerror", (e) => {
  failed++;
  console.error("pageerror", e.message);
});
await page.goto("http://localhost:4317/about-blank-guard");
await page.goto("http://localhost:4317/?az=200&alt=40");
await page.waitForSelector("[data-corner='button']");
await page.waitForTimeout(1500);
const back = async () => {
  await page.evaluate(() => history.back());
  await page.waitForTimeout(700);
};
const tap = async (sel, wait = 500) => {
  await page.locator(sel).first().tap();
  await page.waitForTimeout(wait);
};
const has = (sel) => page.locator(sel).count();
const check = (label, ok) => {
  if (!ok) failed++;
  console.log(ok ? "ok  " : "FAIL", label);
};
const sheetTab = () => page.locator("#main-menu").getAttribute("data-tab");

await tap("[data-corner='button']");
check("sheet open on Ciel", (await sheetTab()) === "sky");
await back();
check("back closes the sheet", (await has("#main-menu")) === 0);
check("still on the app", !page.url().includes("guard"));

// × closes; the history entry is taken back.
await tap("[data-corner='button']");
await tap(".close", 600);
check("× closes the sheet", (await has("#main-menu")) === 0);

// Settings page → back → tab home → back → closed.
await tap("[data-corner='button']");
await tap("[data-tab='catalogue']", 900);
await tap("[data-action='settings']");
check("settings open", (await has("#main-menu[data-settings]")) === 1);
check(
  "tab of origin still marked",
  (await has("[data-tab='catalogue'][aria-selected='true']")) === 1,
);
await back();
check("back: settings → Catalogue home", (await sheetTab()) === "catalogue");
check("settings closed", (await has("#main-menu[data-settings]")) === 0);
await back();
check("back closes the sheet", (await has("#main-menu")) === 0);

// Heure → time line → back folds it.
await tap("[data-corner='button']");
await tap("[data-row='time']", 700);
check("time line open", (await has(".timeline")) === 1);
await back();
check("back folds the time line", (await has(".timeline")) === 0);

// Catalogue → deck → back → Catalogue home → back → sky.
await tap("[data-corner='button']");
await tap("[data-tab='catalogue']", 900);
await tap("[data-action='deck']", 2500);
check("deck open", (await has(".games")) === 1 && (await has("#main-menu")) === 0);
await back();
check(
  "back: deck → Catalogue home",
  (await has(".games")) === 0 && (await sheetTab()) === "catalogue",
);
await back();
check("back closes the sheet", (await has("#main-menu")) === 0);

// Jeux → Reprendre (game) → back → Jeux home.
await tap("[data-corner='button']");
await tap("[data-tab='games']", 900);
await tap("[data-action='resume']", 1500);
check("game playing", (await has(".games")) === 1);
await back();
check("back: game → Jeux home", (await has(".games")) === 0 && (await sheetTab()) === "games");

// Jeux → a game's settings → back → Jeux home.
await tap("[data-game='nameStar']", 1200);
check("game settings open", (await has(".games")) === 1);
await back();
check("back: settings → Jeux home", (await has(".games")) === 0 && (await sheetTab()) === "games");

// Catalogue → « Selon la latitude » → enlarged map → back ×2 → Catalogue home.
await tap("[data-tab='catalogue']", 900);
await tap("[data-action='latitude']", 1800);
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
await back();
check(
  "back: latitude → Catalogue home",
  (await has(".map-block")) === 0 && (await sheetTab()) === "catalogue",
);

// Ciel/Orbites tabs switch the map behind the sheet.
await tap("[data-tab='orbits']", 6000);
check("Orbites tab: the sheet stays", (await sheetTab()) === "orbits");
check("the compass becomes the reframe", (await has("[data-tool='reframe']")) === 1);
await back();
await back();
check("back: Orbites → sky", (await has("[data-tool='compass']")) === 1);

// The compass: north up in one tap.
const heading = () => page.locator("[data-tool='compass']").getAttribute("data-heading");
await tap("[data-tool='compass']", 1500);
check("compass: north up", (await heading()) === "0");

console.log(failed ? `${failed} problem(s)` : "all good");
await browser.close();
process.exit(failed ? 1 : 0);
