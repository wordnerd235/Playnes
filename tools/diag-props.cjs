// Dev tool: count cartoon trees/houses standing inside real airport buildings (should be 0).
// Usage: node tools/diag-props.cjs <base-url> [airport=CLT]
const { chromium } = require("playwright");

(async () => {
  const [base, code = "CLT"] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, reducedMotion: "reduce" });
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  await page.evaluate((code) => { window.playnes.progress.tourDone = true; localStorage.setItem("playnes.freeSave.v1", ""); window.playnes.startMission({ kind: "sandbox", airport: code }); }, code);
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 120000 });
  await page.waitForTimeout(8000); // buildings load, trees/houses placed
  const r = await page.evaluate(async (code) => {
    const data = (await (await fetch("./world/buildings.json")).json()).airports[code];
    const mlon = 111320 * Math.cos((data.lat * Math.PI) / 180);
    const rings = data.b.map((b) => { const r = []; for (let k = 0; k + 1 < b.p.length; k += 2) r.push([(b.p[k] / 1e6) * mlon, (b.p[k + 1] / 1e6) * 111320]); return r; }).filter((r) => r.length >= 3);
    const inside = (ring, x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const sc = window.playnes.world.widget.scene;
    let props = 0, bad = 0;
    for (let i = 0; i < sc.primitives.length; i++) {
      const p = sc.primitives.get(i);
      if (!p || !p.get || p.length === undefined || !p._billboards) continue;
      for (let k = 0; k < p.length; k++) {
        const b = p.get(k);
        if (!b.show || !b.image || b.width > 40) continue;
        const { x, y, z } = b.position;
        const lon = Math.atan2(y, x) * 180 / Math.PI;
        const lat = Math.atan2(z, Math.hypot(x, y) * (1 - 0.00669438)) * 180 / Math.PI;
        const lx = (lon - data.lon) * mlon, ly = (lat - data.lat) * 111320;
        if (Math.abs(lx) > 6000 || Math.abs(ly) > 6000) continue;
        props++;
        if (rings.some((ring) => inside(ring, lx, ly))) bad++;
      }
    }
    return { buildings: rings.length, propsNearAirport: props, propsInsideBuildings: bad };
  }, code);
  console.log(code, JSON.stringify(r));
  await browser.close();
})();
