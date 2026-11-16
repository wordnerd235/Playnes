// Dev tool: screenshots of the clouds from a playne in the air (offline cartoon world), from
// below, level with and above the cloud layer, plus frame times with clouds on and off.
// Usage: node tools/diag-clouds.cjs <base-url> <out-dir>
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const errors = [];
  for (const [name, alt] of [["below", 1300], ["level", 2300], ["above", 4200]]) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.click(".big-go");
    await page.waitForSelector(".home-grid", { timeout: 60000 });
    await page.evaluate((alt) => {
      const p = window.playnes.progress;
      p.tourDone = true;
      p.selectedPlane = "c172";
      localStorage.setItem("playnes.freeSave.v1", "");
      window.playnes.startMission({
        kind: "sandbox",
        airport: "TRI",
        resume: { v: 1, aircraft: "c172", airport: "TRI", worldKind: window.playnes.worldKind, refHeight: 0, lat: 36.3, lon: -82.6, alt, heading: 200, pitch: 0, bank: 0, gamma: 0, speed: 55, vs: 0, throttle: 0.6, flaps: 0, gearDown: true, onGround: false, navTarget: null, landedAt: null, from: null, savedAt: Date.now() },
      });
    }, alt);
    await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 120000 });
    await page.waitForSelector(".pause-overlay [data-a=go]", { timeout: 60000 });
    await page.evaluate(() => document.querySelector(".pause-overlay [data-a=go]").click());
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(out, `clouds-${name}.png`) });
    console.log("shot", name);
    await page.close();
  }
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
})();
