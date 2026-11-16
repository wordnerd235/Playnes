// Dev tool: a saved Free Flight in the air (the F-16) resumes in the air where it was left,
// via "Save & go home" then "Keep flying" (and again after a page reload).
// Usage: node tools/smoke-resume.cjs <base-url>
const { chromium } = require("playwright");

(async () => {
  const [base] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let failed = false;
  const check = (ok, msg) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) failed = true;
  };
  const state = () => page.evaluate(() => { const f = window.playnes.flight; const s = f.s; return { lat: s.lat, lon: s.lon, alt: s.alt, onGround: s.onGround, speed: s.speed, phase: f.phase, save: window.playnes.freeSave && { alt: window.playnes.freeSave.alt, onGround: window.playnes.freeSave.onGround } }; });
  const home = async () => {
    for (let i = 0; i < 30 && !(await page.$(".home-grid")); i++) {
      await page.click(".big-go", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  };
  await page.goto(base);
  await home();
  await page.evaluate(() => {
    const p = window.playnes.progress;
    p.tourDone = true;
    p.unlockAll = true;
    p.selectedPlane = "f16";
    localStorage.setItem("playnes.freeSave.v1", "");
    window.playnes.freeSave = null;
    window.playnes.startMission({ kind: "sandbox", airport: "TRI" });
  });
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free" && !window.playnes.flight.paused, null, { timeout: 120000 });
  // Up and away: 20 km south-west, 6,000 m up, 250 m/s.
  await page.evaluate(() => {
    const s = window.playnes.flight.s;
    Object.assign(s, { lat: s.lat - 0.15, lon: s.lon - 0.12, alt: 6000, onGround: false, speed: 250, gearDown: false, flaps: 0, vs: 0, pitch: 2, gamma: 0 });
    window.playnes.flight.airborneTime = 60;
  });
  await page.waitForTimeout(9000);
  const before = await state();
  console.log("before", JSON.stringify(before));
  check(!before.onGround && before.alt > 5000, "flying high before saving");
  // Pause -> Save & go home.
  await page.evaluate(() => window.playnes.togglePause());
  await page.waitForSelector(".pause-overlay [data-a=home]", { timeout: 10000 });
  await page.click(".pause-overlay [data-a=home]");
  await page.waitForSelector(".home-grid", { timeout: 30000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("playnes.freeSave.v1")));
  console.log("saved", JSON.stringify({ alt: saved.alt, onGround: saved.onGround, lat: saved.lat }));
  check(saved.alt > 5000 && !saved.onGround, "the save holds the height in the air");
  // Free Flight -> Keep flying.
  await page.click(".home-grid [data-card=free], .home-grid .card-free", { timeout: 5000 }).catch(async () => {
    await page.evaluate(() => window.playnes.screens.freeFlight());
  });
  await page.waitForSelector(".free-resume-go", { timeout: 10000 });
  await page.click(".free-resume-go");
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 120000 });
  await page.waitForSelector(".pause-overlay [data-a=go]", { timeout: 60000 });
  const paused = await state();
  console.log("resumed (paused)", JSON.stringify(paused));
  await page.click(".pause-overlay [data-a=go]");
  await page.waitForTimeout(4000);
  const after = await state();
  console.log("after", JSON.stringify(after));
  check(!after.onGround && after.alt > 4000, "resumed in the air, high up");
  check(Math.abs(after.lat - saved.lat) < 0.2, "resumed where it was left");
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
