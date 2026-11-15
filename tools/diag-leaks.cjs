// Dev tool: look for things that pile up over crashes/respawns and new flights (scene
// objects, per-frame listeners, page elements, memory). Usage: node tools/diag-leaks.cjs <base-url>
const { chromium } = require("playwright");

(async () => {
  const [base] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  const stats = (label) => page.evaluate(async (label) => {
    for (let k = 0; k < 3; k++) { window.gc?.(); await new Promise((r) => setTimeout(r, 200)); }
    const sc = window.playnes.world.widget.scene;
    const count = (coll) => { let n = 0; for (let i = 0; i < coll.length; i++) { const p = coll.get(i); n += 1 + (p && p.length !== undefined && p.get ? count(p) : 0); } return n; };
    const ev = (e) => e.numberOfListeners ?? e._listeners?.length ?? -1;
    return { label, prims: count(sc.primitives), groundPrims: sc.groundPrimitives.length, entities: window.playnes.world.widget.entities.values.length, preUpdate: ev(sc.preUpdate), postRender: ev(sc.postRender), preRender: ev(sc.preRender), dom: document.querySelectorAll("*").length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, exclude: window.playnes.world.exclude.length };
  }, label);
  const out = [];
  out.push(await stats("home"));
  await page.evaluate(() => { const p = window.playnes.progress; p.tourDone = true; localStorage.setItem("playnes.freeSave.v1", ""); window.playnes.settings.crashes = true; });
  const freeFlight = async () => {
    await page.evaluate(() => window.playnes.startMission({ kind: "sandbox", airport: "TRI" }));
    await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 120000 });
    await page.waitForTimeout(1500);
  };
  await freeFlight();
  out.push(await stats("free flight 1"));
  for (let i = 1; i <= 4; i++) {
    await page.evaluate(() => { const f = window.playnes.flight; f.d.crashes = true; f.crash(); f.timeScale = 4; });
    await page.waitForFunction(() => window.playnes.flight.phase === "free", null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    out.push(await stats(`after crash ${i}`));
  }
  for (let i = 2; i <= 4; i++) {
    await page.evaluate(() => { window.playnes.endFlight(); window.playnes.screens.home(); });
    await page.waitForTimeout(1500);
    await freeFlight();
    out.push(await stats(`free flight ${i}`));
  }
  for (const s of out) console.log(JSON.stringify(s));
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
})();
