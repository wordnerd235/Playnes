// Dev tool: screenshot the cockpit view for a few playnes, in the air and on the runway.
// Usage: node tools/diag-cockpit.cjs <base-url> <out-dir> [plane ...]
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out, ...planes] = process.argv.slice(2);
  const list = planes.length ? planes : ["c172", "phenom100"];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  for (const plane of list) {
    await page.evaluate((plane) => {
      const g = window.playnes;
      localStorage.setItem("playnes.freeSave.v1", "");
      g.freeSave = null;
      if (!g.progress.planes.includes(plane)) g.progress.planes.push(plane);
      g.progress.selectedPlane = plane;
      g.startMission({ kind: "sandbox", airport: "TRI" });
    }, plane);
    await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 60000 });
    await page.evaluate(() => (window.playnes.flight.view.mode = "cockpit"));
    for (const t of [1, 2, 3]) {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `ck-${plane}-ground${t}.png`) });
      console.log(plane, t, await page.evaluate(() => { const f = window.playnes.flight; const sc = f.d.world.widget.scene; const c = sc.camera.positionCartographic; const gAtCam = sc.globe.getHeight(c); const lat = c.latitude * 180 / Math.PI, lon = c.longitude * 180 / Math.PI; const dem = f.d.world.cartoon ? f.d.world.cartoon.height(lat, lon) : NaN; return `cam h=${c.height.toFixed(2)} plane alt=${f.s.alt.toFixed(2)} meshUnderCam=${(gAtCam ?? NaN).toFixed(2)} demUnderCam=${dem.toFixed(2)} underground=${sc.cameraUnderground}`; }));
    }
    await page.evaluate(() => {
      const f = window.playnes.flight;
      Object.assign(f.s, { onGround: false, alt: f.s.alt + 900, speed: f.p.vclimb, gearDown: false, flaps: 0, bank: 20, pitch: 4 });
      f.d.controls.state.roll = 0.6;
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(out, `ck-${plane}-air.png`) });
    await page.evaluate(() => {
      window.playnes.flight.view.mode = "chase";
      window.playnes.endFlight();
    });
    await page.waitForTimeout(500);
  }
  await browser.close();
})();
