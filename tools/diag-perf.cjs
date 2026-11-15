// Dev tool: memory and smoothness check on a long Free Flight in the offline world, plus a
// before/after picture of the distance haze.
// Usage: node tools/diag-perf.cjs <base-url> <out-dir> [minutes=4]
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out, minutesArg] = process.argv.slice(2);
  const minutes = Number(minutesArg ?? 4);
  const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  await page.evaluate(() => {
    window.playnes.progress.tourDone = true;
    localStorage.setItem("playnes.freeSave.v1", "");
  });
  // Airborne over the ridges north-east of TRI, heading for the mountains, 1,500 m up.
  await page.evaluate(() =>
    window.playnes.startMission({
      kind: "sandbox",
      airport: "TRI",
      resume: { v: 1, aircraft: "c172", airport: "TRI", worldKind: window.playnes.worldKind, refHeight: 0, lat: 36.44, lon: -82.45, alt: 1500, heading: 70, pitch: 0, bank: 0, gamma: 0, speed: 55, vs: 0, throttle: 0.75, flaps: 0, gearDown: true, onGround: false, navTarget: "CLT", landedAt: null, from: "TRI", savedAt: Date.now() },
    }),
  );
  await page.waitForFunction(() => { const f = window.playnes.flight; return f && f.phase === "free"; }, null, { timeout: 120000 });
  // A resumed Free Flight starts paused ("tap to continue").
  // A resumed Free Flight starts paused ("Keep flying" to go on).
  await page.waitForSelector(".pause-overlay [data-a=go]", { timeout: 60000 });
  await page.evaluate(() => document.querySelector(".pause-overlay [data-a=go]").click());
  await page.waitForTimeout(4000);
  const scene = () => window.playnes.world.widget.scene;
  // Haze: now vs. the old settings, from the same spot.
  await page.evaluate(() => window.playnes.togglePause());
  await page.waitForFunction(() => window.playnes.world.widget.scene.globe.tilesLoaded, null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, "haze-new.png") });
  await page.evaluate(() => {
    const s = window.playnes.world.widget.scene;
    s.fog.density = 1.4e-4;
    s.fog.visualDensityScalar = 0.15;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, "haze-old.png") });
  await page.evaluate(() => {
    const s = window.playnes.world.widget.scene;
    s.fog.density = 5e-4;
    s.fog.visualDensityScalar = 0.18;
    window.playnes.togglePause();
  });
  void scene;

  // Long flight on autopilot, fast-forwarded: watch memory and frame times.
  await page.evaluate(() => {
    const f = window.playnes.flight;
    f.timeScale = 6;
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < minutes * 60000) {
    await page.waitForTimeout(20000);
    const s = await page.evaluate(() => {
      const f = window.playnes.flight;
      const sc = window.playnes.world.widget.scene;
      const fr = window.__frames.splice(0);
      fr.sort((a, b) => a - b);
      const audio = window.playnes.audio;
      return {
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        tilesRendered: sc.globe?._surface?._debug?.tilesRendered ?? null,
        voiceBuffers: audio?.buffers?.size ?? null,
        frames: fr.length,
        p50: fr.length ? +fr[Math.floor(fr.length * 0.5)].toFixed(1) : null,
        p95: fr.length ? +fr[Math.floor(fr.length * 0.95)].toFixed(1) : null,
        nm: f ? +(Math.hypot((f.s.lat - 36.44) * 60, (f.s.lon + 82.45) * 60 * Math.cos((f.s.lat * Math.PI) / 180))).toFixed(0) : null,
        phase: f?.phase,
      };
    });
    samples.push(s);
    console.log(JSON.stringify(s));
  }
  await page.screenshot({ path: path.join(out, "perf-end.png") });
  const heaps = samples.map((s) => s.heapMB).filter((x) => x !== null);
  if (heaps.length > 2) console.log(`heap: start ${heaps[0]} MB, max ${Math.max(...heaps)} MB, end ${heaps[heaps.length - 1]} MB`);
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
})();
