// Captures of #176 (modes behind the single button). Usage: node capture.mjs <outDir> [only...]
import { chromium } from "playwright"; // pre-installed in the cloud container
import { mkdirSync } from "node:fs";

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

const tap = async (page, sel) => {
  await page.locator(sel).first().tap();
  await page.waitForTimeout(450);
};
const click = async (page, sel) => {
  await page.locator(sel).first().click();
  await page.waitForTimeout(450);
};
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 82 });
  console.log("✓", name);
}

const shots = {
  async "01-base"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35");
    await shot(page, "01-base");
    await ctx.close();
  },
  async "02-feuille-observer"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35", { "asteria.menu.panel": '"view"' });
    await tap(page, "[data-corner='button']");
    await shot(page, "02-feuille-observer");
    await ctx.close();
  },
  async "03-ligne-du-temps"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35", { "asteria.menu.panel": '"view"' });
    await tap(page, "[data-corner='button']");
    await tap(page, ".row");
    await shot(page, "03-ligne-du-temps");
    await ctx.close();
  },
  async "04-pas-maintenant"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35&offset=10800000");
    await shot(page, "04-pas-maintenant");
    await ctx.close();
  },
  async "05-viser"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35", { "asteria.menu.panel": '"view"' });
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-tile='pointing']");
    // A phone's orientation: pointing on.
    await page.evaluate(() => {
      for (const type of ["deviceorientationabsolute", "deviceorientation"])
        window.dispatchEvent(
          Object.assign(new Event(type), { alpha: 200, beta: 70, gamma: 0, absolute: true }),
        );
    });
    await page.waitForTimeout(800);
    await shot(page, "05-viser");
    await ctx.close();
  },
  async "06-orbites"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35", { "asteria.menu.panel": '"view"' });
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-mode='orbits']");
    await page.waitForTimeout(6000);
    await shot(page, "06-orbites");
    await tap(page, "[data-corner='button']");
    await shot(page, "07-feuille-orbites");
    await ctx.close();
  },
  async "08-apprendre"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35", {
      "asteria.games.last": '"whichConstellation"',
      "asteria.games.settings.whichConstellation": JSON.stringify({
        mode: "streak",
        scope: "tonight",
      }),
    });
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-mode='learn']");
    await page.waitForTimeout(1200);
    await shot(page, "08-apprendre");
    await tap(page, ".games [data-corner='button']");
    await shot(page, "09-feuille-apprendre");
    await ctx.close();
  },
  async "10-nuit-rouge"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35&night=1", {
      "asteria.menu.panel": '"view"',
    });
    await shot(page, "10-nuit-rouge-base");
    await tap(page, "[data-corner='button']");
    await shot(page, "11-nuit-rouge-feuille");
    await ctx.close();
  },
  async "12-reglages"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35", {
      "asteria.menu.panel": '"settings"',
    });
    await tap(page, "[data-corner='button']");
    await shot(page, "12-feuille-reglages");
    await ctx.close();
  },
  async "13-boussole"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35");
    // A drag on the sky: compass and mini-globe come, then go 2 s after.
    const cdp = await ctx.newCDPSession(page);
    const pts = (x, y) => [{ x, y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(180, 400) });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: pts(180 + i * 8, 400 + i * 3),
      });
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(300);
    await shot(page, "13-geste-boussole");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await ctx.close();
  },
  async "14-bureau"() {
    const { ctx, page } = await open(DESKTOP, "?az=150&alt=35", { "asteria.menu.panel": '"view"' });
    await shot(page, "14-bureau-base");
    await click(page, "[data-corner='button']");
    await shot(page, "15-bureau-feuille");
    await click(page, ".row");
    await shot(page, "16-bureau-ligne-du-temps");
    await ctx.close();
  },
  async "18-accueil"() {
    const ctx = await browser.newContext({ ...PHONE, locale: "fr-FR", timezoneId: "Europe/Paris" });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(WHEN);
    await page.goto(BASE + "?az=150&alt=35&welcome=1");
    await page.waitForTimeout(4000);
    await shot(page, "18-accueil-debut");
    await page.waitForTimeout(1500);
    await tap(page, ".opt.text");
    await tap(page, ".opt.ink.go");
    await page.waitForTimeout(1500);
    await shot(page, "18-accueil-geste");
    await ctx.close();
  },
  async "17-masquee"() {
    const { ctx, page } = await open(PHONE, "?az=150&alt=35", { "asteria.menu.panel": '"view"' });
    await tap(page, "[data-corner='button']");
    await tap(page, "[data-tile='hide']");
    await page.waitForTimeout(400);
    await shot(page, "17-interface-masquee");
    await ctx.close();
  },
};

for (const [name, run] of Object.entries(shots)) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  try {
    await run();
  } catch (e) {
    console.error("✗", name, e.message);
  }
}
await browser.close();
