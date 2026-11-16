// Dev tool: taking off again from a field after an emergency landing (F-16, crashes on). A bump
// back onto the ground right after lifting off is still the takeoff: no "Safe landing!" pop-up,
// no crash; and it flies away.
// Usage: node tools/smoke-fieldtakeoff.cjs <base-url>
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
  await page.goto(base);
  for (let i = 0; i < 30 && !(await page.$(".home-grid")); i++) {
    await page.click(".big-go", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.evaluate(() => {
    const g = window.playnes;
    g.progress.tourDone = true;
    g.progress.unlockAll = true;
    g.progress.selectedPlane = "f16";
    g.settings.crashes = true;
    localStorage.setItem("playnes.freeSave.v1", "");
    g.freeSave = null;
    g.startMission({ kind: "sandbox", airport: "TRI" });
  });
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free" && !window.playnes.flight.paused, null, { timeout: 120000 });
  // Find a field a few km from the airport that's fine to land on, facing along flat ground.
  const spot = await page.evaluate(() => {
    const f = window.playnes.flight;
    const cd = window.playnes.world.cartoon;
    const s = f.s;
    for (let i = 0; i < 400; i++) {
      const lat = s.lat + 0.03 + (i % 20) * 0.004;
      const lon = s.lon - 0.05 + Math.floor(i / 20) * 0.004;
      const p = { lat, lon };
      const h = cd.height(lat, lon);
      Object.assign(s, { lat, lon, alt: h });
      // Flat for a good stretch north.
      let ok = true;
      for (let d = 0; d <= 1200 && ok; d += 100) ok = f.fieldOk({ lat: lat + d / 111320, lon }) && Math.abs(cd.height(lat + d / 111320, lon) - h) < 25;
      if (ok) return { lat, lon, h };
    }
    return null;
  });
  check(!!spot, "found a field to take off from");
  if (!spot) process.exit(1);
  // Stopped in the field (as after an emergency landing), then "Take off from here".
  await page.evaluate((spot) => {
    const f = window.playnes.flight;
    Object.assign(f.s, { lat: spot.lat, lon: spot.lon, alt: spot.h, onGround: true, speed: 0, vs: 0, heading: 0, pitch: 0, bank: 0, gearDown: true, flaps: 1 });
    f.groundCache.valid = false;
    f.continueFromField();
    window.playnes.controls.setThrottle(1, false);
  }, spot);
  await page.waitForFunction(() => window.playnes.flight.s.speed > window.playnes.flight.p.vr * 1.05, null, { timeout: 300000 });
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(() => !window.playnes.flight.s.onGround, null, { timeout: 120000 });
  await page.keyboard.up("ArrowDown");
  // Right after lifting off: bumped back onto the ground (uneven field / nose dipped).
  await page.evaluate(() => {
    const f = window.playnes.flight;
    f.s.alt = window.playnes.world.cartoon.height(f.s.lat, f.s.lon) + 0.05;
    f.s.vs = -2.5; // ~500 fpm down
  });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => ({ phase: window.playnes.flight.phase, fieldStop: window.playnes.flight.fieldStop, popup: !!document.querySelector(".pause-overlay.arrival") }));
  check(r.phase !== "crashed", `no crash from the bump (${r.phase})`);
  check(!r.fieldStop && !r.popup, "no 'Safe landing!' pop-up for the bump");
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(() => {
    const f = window.playnes.flight;
    return f.phase === "crashed" || (!f.s.onGround && f.s.alt - window.playnes.world.cartoon.height(f.s.lat, f.s.lon) > 40);
  }, null, { timeout: 300000 }).catch(() => {});
  await page.keyboard.up("ArrowDown");
  const end = await page.evaluate(() => ({ phase: window.playnes.flight.phase, agl: window.playnes.flight.s.alt - window.playnes.world.cartoon.height(window.playnes.flight.s.lat, window.playnes.flight.s.lon) }));
  check(end.phase === "free" && end.agl > 40, `flew away from the field (${end.agl.toFixed(0)} m up)`);
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
