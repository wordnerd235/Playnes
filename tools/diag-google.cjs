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
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined,
    args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
  });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, reducedMotion: "reduce" });
  // The key comes from the network's saved credential (a header). Drop the placeholder key
  // from the address, and say we're the game's website (for keys locked to it).
  await ctx.route(/tile\.googleapis\.com/, (route) => {
    const u = new URL(route.request().url());
    u.searchParams.delete("key");
    route.continue({ url: u.toString(), headers: { ...route.request().headers(), referer: "https://wordnerd235.github.io/Playnes/" } });
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
  console.log("t(s)  km   fps  tree   tilesMB  heapMB  liveTiles  tilesets  pending  fresh");
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
    if (el - last >= 10 || el >= secs) {
      last = el;
      await page.evaluate(() => window.gc && window.gc());
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
        const proto = await page.evaluateHandle(() => window.__tilesets()[0].root.constructor.prototype);
        const { objects } = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto._remoteObject.objectId });
        const props = await cdp.send("Runtime.callFunctionOn", { objectId: objects.objectId, functionDeclaration: "function(){return this.length}", returnByValue: true });
        live = props.result.value;
        await cdp.send("Runtime.releaseObject", { objectId: objects.objectId });
      } catch (e) {
        live = "err";
      }
      console.log(`${el.toFixed(0).padStart(4)} ${((330 * el) / 1000).toFixed(0).padStart(4)} ${String(r.fps).padStart(4)} ${String(r.tree).padStart(6)} ${String(r.tilesMB).padStart(8)} ${String(r.heapMB).padStart(7)} ${String(live).padStart(10)} ${String(r.tilesets).padStart(9)} ${String(r.pending).padStart(8)} ${String(r.fresh).padStart(6)}`);
    }
  }
  console.log(errors.length ? `errors: ${[...new Set(errors)].slice(0, 6).join(" | ")}` : "no page errors");
  await browser.close();
})();
