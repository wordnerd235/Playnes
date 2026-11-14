// Dev tool: screenshots of the real airport buildings (offline world), from the runway and
// from a low pass. Usage: node tools/diag-buildings.cjs <base-url> <out-dir> [AIRPORT ...]
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out, ...codes] = process.argv.slice(2);
  const list = codes.length ? codes : ["CLT", "TRI"];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  for (const code of list) {
    await page.evaluate((code) => {
      const g = window.playnes;
      g.freeSave = null;
      g.startMission({ kind: "sandbox", airport: code });
    }, code);
    await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(out, `bld-${code}-runway.png`) });
    // Low pass: hold position 250 m up, looking back at the field.
    await page.evaluate(() => {
      const f = window.playnes.flight;
      Object.assign(f.s, { onGround: false, alt: f.s.alt + 260, speed: 0.01, gearDown: false });
      f.update = () => {};
      f.view.lookYaw = 140;
      f.view.lookPitch = 15;
      f.view.updateCamera(f.s, 0);
      window.playnes.world.updateScenery(f.s, f.s.alt, 260);
    });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(out, `bld-${code}-air.png`) });
    await page.evaluate(() => window.playnes.endFlight());
    await page.waitForTimeout(500);
  }
  await browser.close();
})();
