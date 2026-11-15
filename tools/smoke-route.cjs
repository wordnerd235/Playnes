// Dev tool: Free Flight route to a destination: a curve that lines up with the runway on the
// minimap and big map, and the faint sky guide line for a first landing at that airport.
// Usage: node tools/smoke-route.cjs <base-url> <out-dir>
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
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
  await page.evaluate(() => {
    const p = window.playnes.progress;
    p.tourDone = true;
    p.airportsVisited = ["TRI", "AVL", "GSP"];
    // Landed at GSP only by charter (doesn't count), at TRI and AVL in Free Flight.
    p.landedAt = ["TRI", "AVL", "GSP"];
    p.freeLandedAt = ["TRI", "AVL"];
    p.selectedPlane = "c172";
    localStorage.setItem("playnes.freeSave.v1", "");
  });
  // In the air north-east of Asheville, heading north, 1,500 m up.
  await page.evaluate(() =>
    window.playnes.startMission({
      kind: "sandbox",
      airport: "AVL",
      resume: { v: 1, aircraft: "c172", airport: "AVL", worldKind: window.playnes.worldKind, refHeight: 0, lat: 35.75, lon: -82.3, alt: 1600, heading: 0, pitch: 0, bank: 0, gamma: 0, speed: 55, vs: 0, throttle: 0.6, flaps: 0, gearDown: true, onGround: false, navTarget: null, landedAt: null, from: null, savedAt: Date.now() },
    }),
  );
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 120000 });
  // A resumed Free Flight starts paused ("Keep flying" to go on).
  await page.waitForSelector(".pause-overlay [data-a=go]", { timeout: 60000 });
  await page.evaluate(() => document.querySelector(".pause-overlay [data-a=go]").click());
  await page.waitForTimeout(1500);
  // Fly to Greenville-Spartanburg (never landed there): curved route + sky guide.
  await page.evaluate(() => {
    const f = window.playnes.flight;
    f.setNavTarget(f.allRunways.find((r) => r.airport.code === "GSP").airport);
  });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const f = window.playnes.flight;
    const pts = f.route.points;
    const brg = (a, b) => (Math.atan2((b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI;
    return {
      n: pts.length,
      startBrg: (brg(pts[0], pts[1]) + 360) % 360,
      finalBrg: (brg(pts[f.route.finalIndex], pts[pts.length - 1]) + 360) % 360,
      rwyHdg: f.route.heading,
      guide: !!f.skyGuide && !!f.skyGuide.line,
    };
  });
  const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  check(r.n > 20, `route to GSP has a curve (${r.n} points)`);
  check(diff(r.startBrg, 0) < 25, `route leaves along the playne's heading (${r.startBrg.toFixed(0)}°)`);
  check(diff(r.finalBrg, r.rwyHdg) < 2, `route ends lined up with the runway (${r.finalBrg.toFixed(0)}° vs ${r.rwyHdg.toFixed(0)}°)`);
  check(r.guide, "GSP landed at only by charter: the sky guide line still shows");
  await page.screenshot({ path: path.join(out, "route-sky.png") });
  await page.locator(".minimap").screenshot({ path: path.join(out, "route-minimap.png") }).catch(() => {});
  // Big map shows the same curved route.
  await page.evaluate(() => window.playnes.flight.openMap());
  await page.waitForTimeout(1500);
  const svg = await page.evaluate(() => document.querySelector(".bigmap-route path")?.getAttribute("d")?.split("L").length ?? 0);
  check(svg > 20, `big map draws the curved route (${svg} points)`);
  await page.screenshot({ path: path.join(out, "route-bigmap.png") });
  await page.evaluate(() => document.querySelector(".bigmap-close, .bigmap [data-a=close]")?.click());
  await page.evaluate(() => window.playnes.hud.bigmap.onClose());
  // An airport already landed at: route, but no sky guide.
  await page.evaluate(() => {
    const f = window.playnes.flight;
    f.setNavTarget(f.allRunways.find((r) => r.airport.code === "TRI").airport);
  });
  await page.waitForTimeout(800);
  check(await page.evaluate(() => !!window.playnes.flight.route && !window.playnes.flight.skyGuide.line), "landed at TRI in Free Flight before: route but no sky guide");
  await page.evaluate(() => window.playnes.flight.setNavTarget(null));
  check(await page.evaluate(() => !window.playnes.flight.route), "clearing the route removes it");
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
