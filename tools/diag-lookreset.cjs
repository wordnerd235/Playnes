// Dev tool: frame times when the look-around view is reset (Cessna, offline world).
// Looks behind the plane for a few seconds, then presses reset, and reports the frame times
// in the 3 s after, plus the busiest functions during that time (CPU profile).
// Usage: node tools/diag-lookreset.cjs <base-url> [chase|cockpit] [profile.json]
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const [base, mode = "chase", profOut] = process.argv.slice(2);
  const browser = await chromium.launch();
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
  await page.evaluate(() =>
    window.playnes.startMission({
      kind: "sandbox",
      airport: "TRI",
      resume: { v: 1, aircraft: "c172", airport: "TRI", worldKind: window.playnes.worldKind, refHeight: 0, lat: 36.47, lon: -82.42, alt: 900, heading: 70, pitch: 0, bank: 0, gamma: 0, speed: 55, vs: 0, throttle: 0.75, flaps: 0, gearDown: true, onGround: false, navTarget: "CLT", landedAt: null, from: "TRI", savedAt: Date.now() },
    }),
  );
  await page.waitForFunction(() => { const f = window.playnes.flight; return f && f.phase === "free"; }, null, { timeout: 120000 });
  await page.waitForSelector(".pause-overlay [data-a=go]", { timeout: 60000 });
  await page.evaluate(() => document.querySelector(".pause-overlay [data-a=go]").click());
  if (mode === "cockpit") await page.evaluate(() => window.playnes.flight.view.mode = "cockpit");
  await page.waitForFunction(() => window.playnes.world.widget.scene.globe.tilesLoaded, null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => { window.__frames.push([t, t - last]); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const stats = (fr) => {
    const d = fr.map((x) => x[1]).sort((a, b) => a - b);
    const q = (p) => d[Math.min(d.length - 1, Math.floor(d.length * p))]?.toFixed(0);
    return `${d.length} frames  median ${q(0.5)} ms  p90 ${q(0.9)}  max ${d[d.length - 1]?.toFixed(0)}  >100ms: ${d.filter((x) => x > 100).length}`;
  };
  // Look behind (turn the view a little at a time, like a finger drag), then hold.
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.playnes.flight.view.addLook(6, 0.3));
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.playnes.world.widget.scene.globe.tilesLoaded, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const held = await page.evaluate(() => window.__frames.splice(0).slice(-60));
  let cdp;
  if (profOut) { cdp = await page.context().newCDPSession(page); await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); }
  const t0 = await page.evaluate(() => { window.playnes.flight.view.resetLook(true); window.__yaw = []; const f = () => { window.__yaw.push(window.playnes.flight.view.lookYaw.toFixed(0)); if (window.__yaw.length < 40) requestAnimationFrame(f); }; requestAnimationFrame(f); return performance.now(); });
  await page.waitForTimeout(3000);
  const after = await page.evaluate((t0) => window.__frames.splice(0).filter((x) => x[0] >= t0), t0);
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop");
    fs.writeFileSync(profOut, JSON.stringify(profile));
    // Self time per function.
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas; let i = 0;
    for (const id of profile.samples) { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + (dt[i++] ?? 0) / 1000); }
    console.log("top self time (ms) after reset:");
    [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(v.toFixed(0).padStart(6), k));
  }
  console.log("holding (looking back):", stats(held));
  console.log("3 s after reset:       ", stats(after));
  console.log("first 30 frames after reset (ms):", after.slice(0, 30).map((x) => x[1].toFixed(0)).join(" "));
  await page.waitForFunction(() => window.playnes.flight.view.lookYaw === 0, null, { timeout: 60000 }).catch(() => {});
  console.log("look angle per frame during the swing:", await page.evaluate(() => (window.__yaw ?? []).join(" ")));
  if (errors.length) console.log("errors:", errors.slice(0, 5));
  await browser.close();
})();
