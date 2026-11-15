// Dev tool: the satellite-photo test patch over the offline map, and its grown-up switch.
// Usage: node tools/smoke-sat.cjs <base-url> <out-dir>
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const satReqs = new Set();
  page.on("request", (r) => {
    if (r.url().includes("/world/sat/")) satReqs.add(r.url());
  });
  let failed = false;
  const check = (ok, msg) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) failed = true;
  };
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  check(await page.evaluate(() => window.playnes.worldKind === "cartoon"), "offline cartoon world loaded");
  // The switch is in grown-up settings, off by default (cartoon map first).
  await page.evaluate(() => window.playnes.screens.parentCorner(() => window.playnes.screens.home()));
  const box = await page.$("#set-detail");
  check(!!box && !(await box.isChecked()), "grown-up settings have the extra-detail switch, off by default");
  check(satReqs.size === 0, `no satellite tiles load by default (${satReqs.size})`);
  await page.evaluate(() => window.playnes.world.setExtraDetail(true));
  await page.evaluate(() => window.playnes.screens.home());

  // Look at the patch from the air: over Boone Lake towards the airport, then the patch edge.
  const look = async (name, lon, lat, h, heading, pitch) => {
    await page.evaluate(([lon, lat, h, heading, pitch]) => {
      const cam = window.playnes.world.widget.camera;
      const C3 = cam.position.constructor;
      const r = Math.PI / 180;
      cam.setView({ destination: C3.fromDegrees(lon, lat, h), orientation: { heading: heading * r, pitch: pitch * r, roll: 0 } });
      window.playnes.world.updateScenery({ lat, lon }, h, 500);
    }, [lon, lat, h, heading, pitch]);
    const t0 = Date.now();
    await page.waitForFunction(() => window.playnes.world.widget.scene.globe.tilesLoaded, null, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log(`  ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
  };
  await page.evaluate(() => {
    document.getElementById("app").style.visibility = "hidden";
    window.playnes.frame = () => {}; // stop the menu's slow orbit so the test camera stays put
  });
  await look("sat-on-airport", -82.37, 36.43, 1500, 320, -22);
  await look("sat-on-edge", -82.86, 36.47, 2500, 90, -14);
  check(satReqs.size > 5, `satellite tiles requested (${satReqs.size})`);
  await page.evaluate(() => window.playnes.world.setExtraDetail(false));
  await look("sat-off-airport", -82.37, 36.43, 1500, 320, -22);
  const n = satReqs.size;
  await look("sat-off-elsewhere", -80.95, 35.2, 2500, 0, -30);
  check(satReqs.size === n, "no satellite tiles loaded while switched off");
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
