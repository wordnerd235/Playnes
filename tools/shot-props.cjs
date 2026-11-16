// Dev tool: pictures of the cartoon world's trees and buildings from several heights and
// looking-down angles (over a town and woods near an airport).
// Usage: node tools/shot-props.cjs <base-url> <out-dir> [airport]
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out, airport = "CLT"] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  for (let i = 0; i < 30 && !(await page.$(".home-grid")); i++) {
    await page.click(".big-go", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.evaluate((airport) => {
    const g = window.playnes;
    g.progress.tourDone = true;
    g.progress.selectedPlane = "c172";
    localStorage.setItem("playnes.freeSave.v1", "");
    g.freeSave = null;
    g.startMission({ kind: "sandbox", airport });
  }, airport);
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free" && !window.playnes.flight.paused, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(out, "props-ground.png") });
  const start = await page.evaluate(() => ({ lat: window.playnes.flight.s.lat, lon: window.playnes.flight.s.lon, alt: window.playnes.flight.s.alt }));
  for (const [name, agl, pitch] of [["low", 60, 0], ["mid", 250, 18], ["high", 600, 40], ["over", 500, 68]]) {
    await page.evaluate(([start, agl, pitch]) => {
      const f = window.playnes.flight, s = f.s;
      // Hold still in the air a little way from the runway (paused physics, live view).
      Object.assign(s, { lat: start.lat + 0.012, lon: start.lon + 0.012, alt: start.alt + agl, onGround: false, speed: 45, vs: 0, pitch: 0, bank: 0, gamma: 0, heading: 40 });
      f.view.lookPitch = pitch;
      f.view.lookYaw = 0;
      f.airborneTime = 30;
    }, [start, agl, pitch]);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(out, `props-${name}.png`) });
    console.log("shot", name);
  }
  console.log(errors.length ? `page errors: ${[...new Set(errors)].join(" | ")}` : "no page errors");
  await browser.close();
})();
