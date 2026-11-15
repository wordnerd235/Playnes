// Dev tool: the edge of the map turns the playne firmly back (even the F-16 at full speed).
// Usage: node tools/smoke-edge.cjs <base-url>
const { chromium } = require("playwright");

(async () => {
  const [base] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let failed = false;
  const check = (ok, msg) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) failed = true;
  };
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  for (const [id, speed, alt] of [["f16", 320, 6000], ["c172", 55, 1500]]) {
    await page.evaluate(([id, speed, alt]) => {
      const p = window.playnes.progress;
      p.tourDone = true;
      p.unlockAll = true;
      p.selectedPlane = id;
      localStorage.setItem("playnes.freeSave.v1", "");
      window.playnes.startMission({ kind: "sandbox", airport: "RDU", resume: { v: 1, aircraft: id, airport: "RDU", worldKind: window.playnes.worldKind, refHeight: 0, lat: 35.6, lon: -78.1, alt, heading: 90, pitch: 0, bank: 0, gamma: 0, speed, vs: 0, throttle: 1, flaps: 0, gearDown: false, onGround: false, navTarget: null, landedAt: null, from: null, savedAt: Date.now() } });
    }, [id, speed, alt]);
    await page.waitForSelector(".pause-overlay [data-a=go]", { timeout: 120000 });
    await page.evaluate(() => document.querySelector(".pause-overlay [data-a=go]").click());
    // Hold the stick straight and full power the whole time: the co-pilot must still turn back.
    await page.evaluate(() => { const c = window.playnes.controls; c.setThrottle(1); window.playnes.flight.timeScale = 4; });
    let maxLon = -999;
    let turnedBack = false;
    for (let k = 0; k < (id === "f16" ? 45 : 160); k++) {
      await page.waitForTimeout(1500);
      const st = await page.evaluate(() => { const s = window.playnes.flight.s; return { lon: s.lon, hdg: s.heading, bank: s.bank }; });
      maxLon = Math.max(maxLon, st.lon);
      if (st.hdg > 180 && st.hdg < 360 && st.lon < -78.06) {
        turnedBack = true;
        break;
      }
    }
    check(turnedBack, `${id}: turned back into the map at the east edge`);
    check(maxLon < -77.75, `${id}: never went far past the edge (furthest ${maxLon.toFixed(3)}°, edge -78.0°)`);
    await page.evaluate(() => { window.playnes.endFlight?.(); });
  }
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
