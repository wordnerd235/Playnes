// Dev tool: Google Photorealistic 3D, a fast low jet flight (the F-16 out of Myrtle Beach),
// logging what grows: the tile tree, tile memory, JS heap and live Cesium3DTile objects.
// Needs the Google key injected by the network (this tool sends no key of its own).
// Usage: node tools/diag-google.cjs <base-url> <seconds> [variant]
//   variant: base | cull | dsse | both   (experiments applied from outside the game)
const { chromium } = require("playwright");

(async () => {
  const [base, secsArg, variant = "base"] = process.argv.slice(2);
  const secs = Number(secsArg || 240);
  const browser = await chromium.launch({
    proxy: (process.env.HTTPS_PROXY || process.env.https_proxy) ? { server: process.env.HTTPS_PROXY || process.env.https_proxy, bypass: "127.0.0.1,localhost" } : undefined,
    args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
  });
  // Say we're the game's website (for keys locked to it).
  const [vw, vh] = (process.env.VIEW || "960x600").split("x").map(Number);
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, reducedMotion: "reduce", extraHTTPHeaders: { referer: "https://wordnerd235.github.io/Playnes/" } });
  // The key comes from the network's saved credential (a header): drop the placeholder key
  // from the address.
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
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  const cdp = await ctx.newCDPSession(page);
  // Count map index files (tileset JSON) and tile models fetched.
  const fetched = { json: 0, glb: 0 };
  page.on("request", (r) => {
    const u = r.url();
    if (!u.includes("tile.googleapis.com")) return;
    if (u.includes(".json")) fetched.json++;
    else if (u.includes(".glb")) fetched.glb++;
  });
  await page.goto(base);
  for (let i = 0; i < 40 && !(await page.$(".home-grid")); i++) {
    await page.click(".big-go", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  const kind = await page.evaluate(() => window.playnes.worldKind);
  console.log("world:", kind, await page.evaluate(() => window.playnes.worldNote));
  if (kind !== "google") {
    console.log("Google 3D didn't load:", errors.slice(0, 5).join(" | "));
    await browser.close();
    process.exit(1);
  }
  await page.evaluate(() => {
    const g = window.playnes;
    g.progress.tourDone = true;
    g.progress.unlockAll = true;
    g.progress.selectedPlane = "f16";
    localStorage.setItem("playnes.freeSave.v1", "");
    g.freeSave = null;
    g.startMission({ kind: "sandbox", airport: "MYR" });
  });
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 180000 });
  await page.evaluate(() => document.querySelector(".pause-overlay [data-a=go]")?.click());
  // Experiments, applied to the live tileset(s).
  await page.evaluate((variant) => {
    const scene = window.playnes.world.widget.scene;
    const tilesets = () => scene.primitives._primitives.filter((p) => p && p.statistics && "numberOfTilesTotal" in p.statistics);
    window.__tilesets = tilesets;
    const ts = tilesets()[0];
    const Tile = ts.root.constructor;
    if (variant === "cull" || variant === "both") {
      // Skip tiles past a distance (as if fully hidden in haze).
      const vis = Tile.prototype.visibility;
      Tile.prototype.visibility = function (fs, mask) {
        if (this._distanceToCamera > (window.__cullM || 60000)) return 0xffffffff;
        return vis.call(this, fs, mask);
      };
    }
    window.__variant = variant;
    window.__applyDsse = () => {
      if (variant !== "dsse" && variant !== "both") return;
      for (const t of tilesets()) t.dynamicScreenSpaceErrorFactor = 64;
    };
    window.__applyDsse();
  }, variant);
  // Fly: 640 kt, ~3,000 ft above ground, heading inland (north-west), moved along by the test
  // at true speed (the headless renderer is too slow to let the physics run in real time).
  const t0 = Date.now();
  let last = 0;
  console.log("t(s)  km   fps  tree   tilesMB  heapMB(raw)  liveTiles  tilesets  pending  fresh  json  glb");
  // Optional: sample where JS memory is allocated, from ALLOC_FROM to ALLOC_TO seconds.
  const allocFrom = Number(process.env.ALLOC_FROM || 0), allocTo = Number(process.env.ALLOC_TO || 0);
  let sampling = false;
  // Optional: CPU profile from CPU_FROM to CPU_TO seconds (where the frame time goes).
  const cpuFrom = Number(process.env.CPU_FROM || 0), cpuTo = Number(process.env.CPU_TO || 0);
  let profiling = false;
  while ((Date.now() - t0) / 1000 < secs) {
    await page.evaluate((elapsed) => {
      const f = window.playnes.flight;
      const s = f.s;
      if (!window.__start) window.__start = { lat: s.lat, lon: s.lon };
      const d = 330 * elapsed; // metres flown
      const hdg = (315 * Math.PI) / 180;
      s.lat = window.__start.lat + (Math.cos(hdg) * d) / 111320;
      s.lon = window.__start.lon + (Math.sin(hdg) * d) / (111320 * Math.cos((s.lat * Math.PI) / 180));
      const ground = window.playnes.world.groundHeight(s) ?? 0;
      Object.assign(s, { alt: ground + 950, onGround: false, speed: 330, heading: 315, pitch: 0, bank: 0, vs: 0, gamma: 0, gearDown: false, flaps: 0 });
      window.__applyDsse?.();
    }, (Date.now() - t0) / 1000);
    await page.waitForTimeout(1000);
    const el = (Date.now() - t0) / 1000;
    if (cpuTo && !profiling && el >= cpuFrom && el < cpuTo) {
      profiling = true;
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
      await cdp.send("Profiler.start");
    }
    if (profiling && el >= cpuTo) {
      profiling = false;
      const { profile } = await cdp.send("Profiler.stop");
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const parent = new Map();
      for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const counts = new Map();
      for (const id of profile.samples) counts.set(id, (counts.get(id) || 0) + 1);
      const self = new Map();
      let total = 0;
      for (const [id, c] of counts) {
        total += c;
        const n = byId.get(id);
        const chain = [];
        for (let k = id, i = 0; k && i < 3; k = parent.get(k), i++) {
          const f = byId.get(k).callFrame;
          chain.push(`${f.functionName || "(anon)"}:${f.lineNumber}`);
        }
        const key = chain.join(" < ");
        self.set(key, (self.get(key) || 0) + c);
        void n;
      }
      console.log(`--- CPU ${cpuFrom}-${cpuTo}s (self time, % of samples)`);
      for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) console.log(`${((100 * v) / total).toFixed(1).padStart(5)}%  ${k}`);
    }
    if (allocTo && !sampling && el >= allocFrom && el < allocTo) {
      sampling = true;
      await cdp.send("HeapProfiler.enable");
      // RETAIN=1: only what's still alive at the end (what builds up); otherwise everything.
      const keepCollected = !process.env.RETAIN;
      await cdp.send("HeapProfiler.startSampling", { samplingInterval: 16384, includeObjectsCollectedByMajorGC: keepCollected, includeObjectsCollectedByMinorGC: keepCollected });
    }
    if (sampling && el >= allocTo) {
      sampling = false;
      if (process.env.RETAIN) await page.evaluate(() => window.gc && window.gc());
      const { profile } = await cdp.send("HeapProfiler.stopSampling");
      const by = new Map();
      const name = (f) => `${f.functionName || "(anon)"}:${f.lineNumber}`;
      const walk = (n, stack) => {
        const here = [name(n.callFrame), ...stack];
        // Self allocations with their 4 nearest callers.
        const k = here.slice(0, 5).join(" < ");
        by.set(k, (by.get(k) || 0) + n.selfSize);
        for (const c of n.children || []) walk(c, here);
      };
      walk(profile.head, []);
      const total = [...by.values()].reduce((a, b) => a + b, 0);
      console.log(`--- allocations ${allocFrom}-${allocTo}s: ${(total / 1048576).toFixed(0)} MB sampled (${process.env.RETAIN ? "still alive at the end" : "incl. collected"})`);
      for (const [k, v] of [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${(v / 1048576).toFixed(1).padStart(7)} MB  ${k}`);
    }
    if (el - last >= 10 || el >= secs) {
      last = el;
      const rawMB = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
      if (!process.env.NOGC) await page.evaluate(() => window.gc && window.gc());
      const r = await page.evaluate(() => {
        const ts = window.__tilesets();
        const t = ts[0];
        const fps = document.querySelector(".perf-stats")?.textContent.match(/^(\d+) fps/)?.[1] ?? "?";
        const fresh = document.querySelector(".perf-stats")?.textContent.match(/fresh starts (\d+)/)?.[1] ?? "?";
        return {
          fps,
          fresh,
          tree: ts.map((x) => x.statistics.numberOfTilesTotal).join("+"),
          tilesMB: Math.round(ts.reduce((a, x) => a + x.totalMemoryUsageInBytes, 0) / 1048576),
          heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
          pending: t ? t.statistics.numberOfPendingRequests : 0,
          tilesets: ts.length,
          protoReady: !!t,
        };
      });
      // Live Cesium3DTile objects (catches old tile trees that never get freed).
      let live = "?";
      try {
        const { result } = await cdp.send("Runtime.evaluate", { expression: "window.__tilesets()[0].root.constructor.prototype" });
        const { objects } = await cdp.send("Runtime.queryObjects", { prototypeObjectId: result.objectId });
        const props = await cdp.send("Runtime.callFunctionOn", { objectId: objects.objectId, functionDeclaration: "function(){return this.length}", returnByValue: true });
        live = props.result.value;
        await cdp.send("Runtime.releaseObject", { objectId: objects.objectId });
      } catch (e) {
        live = "err";
      }
      console.log(`${el.toFixed(0).padStart(4)} ${((330 * el) / 1000).toFixed(0).padStart(4)} ${String(r.fps).padStart(4)} ${String(r.tree).padStart(6)} ${String(r.tilesMB).padStart(8)} ${String(r.heapMB).padStart(6)}(${rawMB}) ${String(live).padStart(10)} ${String(r.tilesets).padStart(9)} ${String(r.pending).padStart(8)} ${String(r.fresh).padStart(6)} ${String(fetched.json).padStart(5)} ${String(fetched.glb).padStart(5)}`);
    }
  }
  console.log(errors.length ? `errors: ${[...new Set(errors)].slice(0, 6).join(" | ")}` : "no page errors");
  await browser.close();
})();
