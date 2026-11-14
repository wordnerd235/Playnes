// Dev tool: record what happens around liftoff (sounds, ground contacts, camera jumps) with
// a burst of screenshots, to hunt down anything that is not smooth.
// Usage: node tools/diag-takeoff.cjs <base-url> <out-dir> [plane]
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out, plane = "phenom100"] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, reducedMotion: "reduce" });
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  await page.evaluate((plane) => {
    const g = window.playnes;
    if (!g.progress.planes.includes(plane)) g.progress.planes.push(plane);
    g.progress.selectedPlane = plane;
    g.startMission({ kind: "charter", from: "TRI", to: "CLT", passenger: { id: "family", icon: "x", spoken: "The family", count: 4 } });
  }, plane);
  await page.waitForSelector(".hud:not([hidden])", { timeout: 60000 });
  await page.evaluate(() => {
    const f = window.playnes.flight;
    window.__log = [];
    const t0 = performance.now();
    const log = (m) => window.__log.push(`${((performance.now() - t0) / 1000).toFixed(2)} ${m}`);
    const sfx = f.d.audio.sfx.bind(f.d.audio);
    f.d.audio.sfx = (n) => { log(`sfx ${n} phase=${f.phase} alt=${(f.s.alt).toFixed(1)} gnd=${f.s.onGround}`); sfx(n); };
    const wo = f.d.hud.whiteout.bind(f.d.hud);
    f.d.hud.whiteout = (on, ms) => { log(`whiteout ${on} ${ms}`); return wo(on, ms); };
    const toast = f.d.hud.toast.bind(f.d.hud);
    f.d.hud.toast = (t, k) => { log(`toast ${t}`); return toast(t, k); };
    let lastG = f.s.onGround;
    let lastCam = null;
    const cam = f.d.world.widget.camera;
    f.d.world.widget.scene.postRender.addEventListener(() => {
      if (f.s.onGround !== lastG) { log(`onGround ${lastG}->${f.s.onGround} alt=${f.s.alt.toFixed(2)} vs=${f.s.vs.toFixed(2)} spd=${f.s.speed.toFixed(1)}`); lastG = f.s.onGround; }
      const p = cam.positionWC;
      if (lastCam) {
        const d = Math.hypot(p.x - lastCam.x, p.y - lastCam.y, p.z - lastCam.z);
        if (d > 40) log(`camera jump ${d.toFixed(0)} m`);
      }
      lastCam = { x: p.x, y: p.y, z: p.z };
    });
  });
  await page.keyboard.press("r");
  await page.waitForFunction(() => window.playnes.flight.phase !== "lineup", null, { timeout: 60000 });
  await page.evaluate(() => window.playnes.flight.d.controls.setThrottle(1, true));
  console.log(await page.evaluate(() => { const f = window.playnes.flight; return `phase=${f.phase} spd=${f.s.speed.toFixed(1)} thr=${f.s.throttle} vr=${f.p.vr.toFixed(1)}`; }));
  await page.evaluate(() => (window.playnes.flight.timeScale = 3));
  await page.waitForFunction(() => { const f = window.playnes.flight; return f.s.speed > f.p.vr * 0.9; }, null, { timeout: 90000 });
  await page.evaluate(() => (window.playnes.flight.timeScale = 1));
  await page.keyboard.down("ArrowDown");
  for (let i = 0; i < 40; i++) {
    await page.screenshot({ path: path.join(out, `to-${String(i).padStart(2, "0")}.png`) });
    if (i === 20) await page.keyboard.up("ArrowDown");
  }
  await page.waitForTimeout(3000);
  console.log((await page.evaluate(() => window.__log)).join("\n"));
  await browser.close();
})();
