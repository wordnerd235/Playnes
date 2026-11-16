// Dev tool: a long, fast F-16 flight (offline world) watching for anything that grows with
// distance: memory after garbage collection, scene objects, listeners, page elements.
// Usage: node tools/diag-fastflight.cjs <base-url> [minutes=6]
const { chromium } = require("playwright");

(async () => {
  const [base, minutesArg] = process.argv.slice(2);
  const minutes = Number(minutesArg ?? 6);
  const browser = await chromium.launch({ args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  await page.evaluate(() => {
    const p = window.playnes.progress;
    p.tourDone = true;
    p.unlockAll = true;
    p.selectedPlane = "f16";
    localStorage.setItem("playnes.freeSave.v1", "");
    window.playnes.startMission({ kind: "sandbox", airport: "MYR", resume: { v: 1, aircraft: "f16", airport: "MYR", worldKind: window.playnes.worldKind, refHeight: 0, lat: 33.75, lon: -78.95, alt: 3000, heading: 300, pitch: 0, bank: 0, gamma: 0, speed: 420, vs: 0, throttle: 1, flaps: 0, gearDown: false, onGround: false, navTarget: null, landedAt: null, from: "MYR", savedAt: Date.now() } });
  });
  await page.waitForSelector(".pause-overlay [data-a=go]", { timeout: 120000 });
  await page.evaluate(() => document.querySelector(".pause-overlay [data-a=go]").click());
  await page.evaluate(() => { window.playnes.controls.setThrottle(1); window.playnes.flight.timeScale = 8; });
  const start = await page.evaluate(() => ({ lat: window.playnes.flight.s.lat, lon: window.playnes.flight.s.lon }));
  let km = 0;
  let last = start;
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < minutes * 60000) {
    await page.waitForTimeout(30000);
    const s = await page.evaluate(async () => {
      for (let k = 0; k < 3; k++) { window.gc?.(); await new Promise((r) => setTimeout(r, 150)); }
      const sc = window.playnes.world.widget.scene;
      const f = window.playnes.flight;
      return { lat: f.s.lat, lon: f.s.lon, kt: Math.round(f.s.speed / 0.5144), heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), prims: sc.primitives.length, preUpdate: sc.preUpdate.numberOfListeners, postRender: sc.postRender.numberOfListeners, dom: document.querySelectorAll("*").length };
    });
    km += Math.hypot((s.lat - last.lat) * 111.32, (s.lon - last.lon) * 92);
    last = s;
    samples.push({ km: Math.round(km), ...s });
    console.log(JSON.stringify({ km: Math.round(km), kt: s.kt, heapMB: s.heapMB, prims: s.prims, preUpdate: s.preUpdate, postRender: s.postRender, dom: s.dom }));
  }
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
})();
