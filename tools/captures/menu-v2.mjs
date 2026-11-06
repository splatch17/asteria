// Captures of the menu v2 (tabs as destinations, illustrated homes, settings apart, permanent
// compass). Usage: node menu-v2.mjs <outDir> [only...]
// Playwright is installed globally in the cloud container: ESM imports ignore NODE_PATH, require does not.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const out = process.argv[2];
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const BASE = "http://localhost:4317/";
const WHEN = new Date("2026-10-24T21:30:00+02:00");

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM, // optional: a Chromium other than Playwright's own
  args: ["--disable-accelerated-2d-canvas", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});

const PHONE = {
  viewport: { width: 360, height: 780 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};
const DESKTOP = { viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1 };

const day = 86_400_000;
const memory = (interval) => ({
  reps: 2,
  lapses: 0,
  ease: 2.5,
  interval,
  due: WHEN.getTime() + interval * day,
  last: WHEN.getTime() - day,
  seen: 3,
  correct: 3,
});
/** Someone who played and looked at a few cards. */
const PLAYED = {
  "asteria.catalogue.recent": JSON.stringify(["Peg", "Psc", "Aqr"]),
  "asteria.games.last": '"whichConstellation"',
  "asteria.games.settings.whichConstellation": JSON.stringify({ mode: "streak", scope: "tonight" }),
  "asteria.games.progress": JSON.stringify({
    version: 3,
    items: Object.fromEntries(
      ["Ori", "UMa", "Cas", "Cyg", "Lyr", "Peg", "Leo", "Sco", "Tau"].map((a, i) => [
        `con:${a}`,
        memory(i < 3 ? 9 : 2),
      ]),
    ),
    records: {
      "whichConstellation:streak:amateur": { played: 4, best: 8 },
      "whichConstellation:training:amateur": { played: 6, best: 9 },
      "whereIsIt:timed:amateur": { played: 2, best: 4200 },
    },
    seen: Object.fromEntries(
      ["Peg", "Psc", "Aqr", "Ori", "And", "Cas", "Cyg", "Lyr", "UMa", "Leo", "Sco", "Tau"].map(
        (a, i) => [`con:${a}`, WHEN.getTime() - (i + 1) * day],
      ),
    ),
  }),
};

async function open(device, query = "", storage = {}) {
  const ctx = await browser.newContext({ ...device, locale: "fr-FR", timezoneId: "Europe/Paris" });
  await ctx.addInitScript((s) => {
    // Not a first launch: no welcome (#207).
    localStorage.setItem("asteria.prefs.level", JSON.stringify({ v: 1, level: "amateur" }));
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, storage);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.clock.setFixedTime(WHEN);
  await page.goto(BASE + query);
  await page.waitForSelector("[data-corner='button']", { timeout: 30000 });
  await page.waitForTimeout(2500);
  return { ctx, page };
}

const tap = async (page, sel, wait = 450) => {
  await page.locator(sel).first().tap();
  await page.waitForTimeout(wait);
};
const click = async (page, sel, wait = 450) => {
  await page.locator(sel).first().click();
  await page.waitForTimeout(wait);
};
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 82 });
  console.log("✓", name);
}

const SKY = "?az=200&alt=40";

const shots = {
  async "apres-01-base"() {
    const { ctx, page } = await open(PHONE, SKY, PLAYED);
    await shot(page, "apres-01-base");
    await ctx.close();
  },
  async "apres-02-ciel"() {
    const { ctx, page } = await open(PHONE, SKY, PLAYED);
    await tap(page, "[data-corner='button']");
    await shot(page, "apres-02-ciel");
    await ctx.close();
  },
  async "apres-03-catalogue"() {
    const { ctx, page } = await open(PHONE, SKY, PLAYED);
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-tab='catalogue']", 1200);
    await shot(page, "apres-03-catalogue");
    await tap(page, "[data-action='deck']", 3500);
    await shot(page, "apres-04-paquet");
    await ctx.close();
  },
  async "apres-05-catalogue-vide"() {
    const { ctx, page } = await open(PHONE, SKY);
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-tab='catalogue']", 1200);
    await shot(page, "apres-05-catalogue-vide");
    await ctx.close();
  },
  async "apres-06-jeux"() {
    const { ctx, page } = await open(PHONE, SKY, PLAYED);
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-tab='games']", 1000);
    await shot(page, "apres-06-jeux");
    await ctx.close();
  },
  async "apres-07-orbites"() {
    const { ctx, page } = await open(PHONE, SKY, PLAYED);
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-tab='orbits']", 7000);
    await shot(page, "apres-07-orbites");
    await ctx.close();
  },
  async "apres-08-reglages"() {
    const { ctx, page } = await open(PHONE, SKY, { ...PLAYED, "asteria.menu.settings": '"display"' });
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-action='settings']");
    await shot(page, "apres-08-reglages-affichage");
    await tap(page, "[data-part='place']");
    await shot(page, "apres-09-reglages-lieu");
    await ctx.close();
  },
  async "apres-10-boussole"() {
    const { ctx, page } = await open(PHONE, "?az=110&alt=40", PLAYED);
    await shot(page, "apres-10-boussole-tournee");
    await tap(page, "[data-tool='compass']", 1500);
    await shot(page, "apres-11-boussole-nord");
    await ctx.close();
  },
  async "apres-12-nuit-rouge"() {
    const { ctx, page } = await open(PHONE, SKY + "&night=1", PLAYED);
    await shot(page, "apres-12-nuit-rouge");
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-tab='catalogue']", 1200);
    await shot(page, "apres-13-nuit-rouge-catalogue");
    await ctx.close();
  },
  async "apres-14-bureau"() {
    const { ctx, page } = await open(DESKTOP, SKY, PLAYED);
    await click(page, "[data-corner='button']");
    await click(page, "[data-tab='catalogue']", 1200);
    await shot(page, "apres-14-bureau");
    await ctx.close();
  },
};

for (const [name, run] of Object.entries(shots))
  if (!only.length || only.some((o) => name.includes(o))) await run();
await browser.close();
