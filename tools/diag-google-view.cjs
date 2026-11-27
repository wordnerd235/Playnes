// Dev tool: how much Google 3D map an iPad-sized view draws from a few thousand feet, at
// different detail settings. Headless drawing is in software, so frame rates mean nothing here;
// what it measures is the work the device would be given: tiles, triangles and draw calls in
// view, tile memory, and processor time per frame. Also a picture per setting.
// Needs the Google key injected by the network (see tools/diag-google.cjs).
// Usage: node tools/diag-google-view.cjs <base-url> <out-dir> [lat,lon,altMeters,heading]
// Settings: SETS="sse:factor[:clouds 0/1[:fxaa 0/1[:resolutionScale]]],..." (default compares
// detail levels). Also reports the median frame time with the view held still: drawing here
// is in software, so it is only a rough guide to how much drawing work each setting is, but
// differences between settings in the same run are meaningful.
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out, where = "36.47,-82.42,1490,70"] = process.argv.slice(2);
  const [lat, lon, alt, heading] = where.split(",").map(Number);
  const sets = (process.env.SETS || "14:24,21:24,36:24").split(",").map((s) => s.split(":").map(Number));
  const browser = await chromium.launch({
    proxy: (process.env.HTTPS_PROXY || process.env.https_proxy) ? { server: process.env.HTTPS_PROXY || process.env.https_proxy, bypass: "127.0.0.1,localhost" } : undefined,
  });
  // An iPad in landscape (the game then uses its iPad budgets: 300 MB of tiles, detail 14).
  const ctx = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    screen: { width: 1180, height: 820 },
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    reducedMotion: "reduce",
    extraHTTPHeaders: { referer: "https://wordnerd235.github.io/Playnes/" },
  });
  await ctx.route(/tile\.googleapis\.com/, (route) => {
    const u = new URL(route.request().url());
    u.searchParams.delete("key");
    route.continue({ url: u.toString() });
  });
  await ctx.addInitScript(() => {
    try {
      const s = JSON.parse(localStorage.getItem("playnes.settings.v1") || "{}");
      Object.assign(s, { world: "google", googleKey: "from-network", perfStats: true, clouds: true });
      localStorage.setItem("playnes.settings.v1", JSON.stringify(s));
    } catch {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  for (let i = 0; i < 40 && !(await page.$(".home-grid")); i++) {
    await page.click(".big-go", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  const kind = await page.evaluate(() => window.playnes.worldKind);
  if (kind !== "google") {
    console.log("Google 3D didn't load:", await page.evaluate(() => window.playnes.worldNote), errors.slice(0, 3));
    await browser.close();
    process.exit(1);
  }
  await page.evaluate(({ lat, lon, alt, heading }) => {
    const g = window.playnes;
    g.progress.tourDone = true;
    localStorage.setItem("playnes.freeSave.v1", "");
    g.freeSave = null;
    g.startMission({ kind: "sandbox", airport: "TRI", resume: { v: 1, aircraft: "c172", airport: "TRI", worldKind: "google", refHeight: 0, lat, lon, alt, heading, pitch: 0, bank: 0, gamma: 0, speed: 55, vs: 0, throttle: 0.75, flaps: 0, gearDown: true, onGround: false, navTarget: "CLT", landedAt: null, from: "TRI", savedAt: Date.now() } });
  }, { lat, lon, alt, heading });
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 180000 });
  // Stays paused ("Keep flying" not pressed): the camera holds still, so every setting sees the
  // same view.
  await page.evaluate(() => {
    const scene = window.playnes.world.widget.scene;
    const ts = scene.primitives._primitives.find((p) => p && p.statistics && "numberOfTilesTotal" in p.statistics);
    window.__ts = ts;
    window.__force = null;
    window.__frames = [];
    let lastT = performance.now();
    scene.postRender.addEventListener(() => { const t = performance.now(); window.__frames.push(t - lastT); lastT = t; if (window.__frames.length > 40) window.__frames.shift(); });
    scene.preRender.addEventListener(() => {
      const f = window.__force;
      if (!f) return;
      ts.dynamicScreenSpaceErrorFactor = f[1];
      if (f[2] !== undefined && !Number.isNaN(f[2]) && window.__clouds !== f[2]) { window.__clouds = f[2]; window.playnes.world.setClouds(!!f[2]); }
      if (f[3] !== undefined && !Number.isNaN(f[3])) scene.postProcessStages.fxaa.enabled = !!f[3];
      if (f[4] && window.playnes.world.widget.resolutionScale !== f[4]) window.playnes.world.widget.resolutionScale = f[4];
      if (ts.maximumScreenSpaceError !== f[0]) { ts.maximumScreenSpaceError = f[0]; ts._memoryAdjustedScreenSpaceError = f[0]; }
    });
    window.__cpu = [];
    let t0 = 0;
    scene.preUpdate.addEventListener(() => { t0 = performance.now(); });
    scene.postRender.addEventListener(() => { window.__cpu.push(performance.now() - t0); if (window.__cpu.length > 30) window.__cpu.shift(); });
  });
  for (const [sse, factor, ...rest] of sets) {
    await page.evaluate((f) => { window.__force = f; window.__frames = []; }, [sse, factor, ...rest]);
    await page.waitForTimeout(3000);
    await page.waitForFunction(() => window.__ts.tilesLoaded, null, { timeout: 150000 }).catch(() => {});
    await page.evaluate(() => { window.__frames = []; });
    await page.waitForTimeout(12000);
    const r = await page.evaluate(() => {
      const ts = window.__ts, st = ts.statistics;
      const cpu = window.__cpu.slice().sort((a, b) => a - b);
      const fr = window.__frames.slice().sort((a, b) => a - b);
      return {
        frame: fr[Math.floor(fr.length / 2)], tiles: st.selected, tri: st.numberOfTrianglesSelected, draws: st.numberOfCommands, mb: Math.round(ts.totalMemoryUsageInBytes / 1048576), cpu: cpu[Math.floor(cpu.length / 2)] };
    });
    const extra = rest => rest.length ? `  clouds ${rest[0] ?? "-"} fxaa ${rest[1] ?? "-"} res ${rest[2] ?? "-"}` : "";
    console.log(`detail ${String(sse).padStart(2)}  far ${factor}${extra(rest)}:  frame ${r.frame?.toFixed(0)} ms   ${String(r.tiles).padStart(4)} tiles  ${(r.tri / 1e6).toFixed(2)}M triangles  ${String(r.draws).padStart(4)} draws  ${String(r.mb).padStart(3)} MB  cpu ${r.cpu?.toFixed(0)} ms`);
    await page.screenshot({ path: path.join(out, `view-${sse}-${factor}${rest.length ? "-" + rest.join("-") : ""}.png`) });
  }
  if (errors.length) console.log("errors:", errors.slice(0, 5));
  await browser.close();
})();
