// Dev tool: play Lesson 2 ("Go fast, go slow") using only the on-screen controls, the way a
// finger would on the iPad. Fails if anything covers the controls or they don't respond.
// Usage: node tools/smoke-touch.cjs <base-url> <out-dir>
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce", hasTouch: true });
  let failed = false;
  const check = (ok, msg) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) failed = true;
  };
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  await page.evaluate(() => window.playnes.startMission({ kind: "lesson", lesson: "l2", airport: "TRI" }));
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "l2go", null, { timeout: 60000 });
  await page.evaluate(() => (window.playnes.flight.timeScale = 4));
  // The flight starts behind the loading screen while the ground loads; wait until it's gone.
  await page.waitForFunction(() => { const l = document.querySelector(".loading"); return !l || !!l.closest("[hidden]"); }, null, { timeout: 30000 });
  await page.waitForTimeout(800);

  // Nothing may sit on top of the controls.
  for (const sel of [".lever", ".yoke", "#hud-flaps", "#hud-radio", "#hud-brake"]) {
    const top = await page.evaluate((s) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    }, sel);
    check(top, `${sel} is the top element under a finger`);
  }

  const lever = await page.locator(".lever-track").boundingBox();
  const drag = async (fromFrac, toFrac) => {
    const x = lever.x + lever.width / 2;
    await page.mouse.move(x, lever.y + lever.height * (1 - fromFrac));
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, lever.y + lever.height * (1 - (fromFrac + ((toFrac - fromFrac) * i) / 8)));
    await page.mouse.up();
  };

  await drag(0.02, 0.98);
  const t1 = await page.evaluate(() => window.playnes.controls.state.throttle);
  check(t1 > 0.9, `dragging the lever up sets full power (${t1.toFixed(2)})`);
  await page.waitForFunction(() => window.playnes.flight.phase === "l2slow", null, { timeout: 60000 });
  check(true, "plane sped up and the co-pilot asked to slow down");
  await page.screenshot({ path: path.join(out, "touch-l2-fast.png") });

  await drag(0.95, 0.0);
  const t2 = await page.evaluate(() => window.playnes.controls.state.throttle);
  check(t2 < 0.05, `dragging the lever down cuts power (${t2.toFixed(2)})`);
  await page.waitForFunction(() => window.playnes.flight.phase === "l2brake", null, { timeout: 30000 });

  const brake = await page.locator("#hud-brake").boundingBox();
  await page.mouse.move(brake.x + brake.width / 2, brake.y + brake.height / 2);
  await page.mouse.down();
  await page.waitForSelector(".debrief", { timeout: 60000 });
  await page.mouse.up();
  check(true, "holding the brake button stopped the plane and finished the lesson");
  await page.screenshot({ path: path.join(out, "touch-l2-done.png") });

  await browser.close();
  process.exit(failed ? 1 : 0);
})();
