// Dev tool: look at runways in the offline world, close up and from a few km out, to spot
// terrain poking through or smearing. Usage: node tools/diag-runways.cjs <base-url> <out-dir> [codes]
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out, codesArg] = process.argv.slice(2);
  const codes = (codesArg ?? "ROA,AVL,ATL,CAE").split(",");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  await page.evaluate(() => {
    window.playnes.progress.tourDone = true;
    localStorage.setItem("playnes.freeSave.v1", "");
    window.playnes.startMission({ kind: "sandbox", airport: "TRI" });
  });
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 120000 });
  // Every runway is drawn in Free Flight. Freeze the game and move the camera around.
  await page.evaluate(() => {
    window.playnes.frame = () => {};
    document.getElementById("app").style.visibility = "hidden";
  });
  for (const code of codes) {
    const rw = await page.evaluate((code) => {
      const r = window.playnes.flight.allRunways.find((x) => x.airport.code === code);
      return { a: r.end, b: r.other, h: r.hEnd, h2: r.hOther, hdg: r.heading, len: r.length };
    }, code);
    const views = [
      // Low, from just off the threshold looking down the runway.
      { name: "low", back: 250, side: 30, up: 18, pitch: -4 },
      // Final approach, 4 km out.
      { name: "final", back: 4000, side: 0, up: 260, pitch: -4 },
      // Off to the side, 2.5 km away.
      { name: "side", back: -rw.len / 2, side: 2500, up: 400, pitch: -9, turn: -90 },
    ];
    for (const v of views) {
      await page.evaluate(([rw, v]) => {
        const cam = window.playnes.world.widget.camera;
        const C3 = cam.position.constructor;
        const r = Math.PI / 180;
        const hd = rw.hdg * r;
        const back = v.back;
        const north = -Math.cos(hd) * back + -Math.sin(hd) * v.side;
        const east = -Math.sin(hd) * back + Math.cos(hd) * v.side;
        const lat = rw.a.lat + north / 111320;
        const lon = rw.a.lon + east / (111320 * Math.cos(rw.a.lat * r));
        cam.setView({ destination: C3.fromDegrees(lon, lat, rw.h + v.up), orientation: { heading: (rw.hdg + (v.turn ?? 0)) * r, pitch: v.pitch * r, roll: 0 } });
      }, [rw, v]);
      await page.waitForFunction(() => window.playnes.world.widget.scene.globe.tilesLoaded, null, { timeout: 90000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(out, `rwy-${code}-${v.name}.png`) });
      console.log("shot", code, v.name);
    }
  }
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
})();
