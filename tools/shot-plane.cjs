// Dev tool: in-game pictures of one playne in the cartoon world: parked, taking off (full
// power), gear travelling, and cruising, from the chase camera with a look-around angle.
// Usage: node tools/shot-plane.cjs <base-url> <out-dir> [plane-id]
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out, plane = "f16"] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  for (let i = 0; i < 30 && !(await page.$(".home-grid")); i++) {
    await page.click(".big-go", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.evaluate((plane) => {
    const g = window.playnes;
    g.progress.tourDone = true;
    g.progress.heliTourDone = true;
    g.progress.unlockAll = true;
    g.progress.selectedPlane = plane;
    localStorage.setItem("playnes.freeSave.v1", "");
    g.freeSave = null;
    g.startMission({ kind: "sandbox", airport: "TRI" });
  }, plane);
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free" && !window.playnes.flight.paused, null, { timeout: 120000 });
  const look = (yaw, pitch) => page.evaluate(([yaw, pitch]) => { const v = window.playnes.flight.view; v.lookYaw = yaw; v.lookPitch = pitch; }, [yaw, pitch]);
  const shot = async (name) => { await page.waitForTimeout(2500); await page.screenshot({ path: path.join(out, `${plane}-${name}.png`) }); console.log("shot", name); };
  await look(140, 8);
  await shot("parked-front");
  await look(-60, 10);
  await shot("parked-rear");
  // Full power: afterburner, wheels turning.
  await look(-35, 6);
  await page.evaluate(() => window.playnes.controls.setThrottle(1, false));
  await page.waitForFunction(() => window.playnes.flight.s.speed > 40, null, { timeout: 240000 });
  await shot("takeoff-roll");
  // In the air: gear travelling, then up.
  await page.evaluate(() => {
    const f = window.playnes.flight, s = f.s;
    Object.assign(s, { alt: s.alt + 400, onGround: false, speed: 160, vs: 0, pitch: 3, gamma: 0 });
    f.airborneTime = 30;
  });
  await page.evaluate(() => { const f = window.playnes.flight; f.s.gearDown = false; });
  await look(120, -12);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `${plane}-gear-moving.png`) });
  await shot("gear-up-below");
  await look(-150, 14);
  await shot("cruise-front");
  await look(0, 0);
  await shot("cruise-chase");
  console.log(errors.length ? `page errors: ${[...new Set(errors)].join(" | ")}` : "no page errors");
  await browser.close();
})();
