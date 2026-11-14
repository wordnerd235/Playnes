// Dev tool: exercise Free Flight headless. Takeoff with on-screen controls, big map + autopilot,
// a guided landing at another airport, and a crash with crashes enabled.
// Usage: node tools/smoke-free.cjs <base-url> <out-dir>
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce", hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let failed = false;
  const check = (ok, msg) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) failed = true;
  };
  const shot = (n) => page.screenshot({ path: path.join(out, `free-${n}.png`) });
  const F = () => page.evaluate(() => {
    const f = window.playnes.flight;
    return f ? { phase: f.phase, lat: f.s.lat, lon: f.s.lon, alt: f.s.alt, hdg: f.s.heading, spd: f.s.speed, ground: f.s.onGround, ap: !!f.autopilot } : null;
  });

  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  await shot("0-home");
  await page.click(".home-card.free", { force: true });
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 60000 });
  await page.evaluate(() => (window.playnes.flight.timeScale = 14));
  await page.waitForTimeout(3000);
  check(await page.isVisible(".minimap"), "minimap is on the HUD");
  await shot("1-lineup");

  // Full power with the lever, then pull back on the yoke when fast.
  const lever = await page.locator(".lever-track").boundingBox();
  await page.mouse.move(lever.x + lever.width / 2, lever.y + lever.height * 0.98);
  await page.mouse.down();
  await page.mouse.move(lever.x + lever.width / 2, lever.y + lever.height * 0.02, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.playnes.flight.s.speed > window.playnes.flight.p.vr, null, { timeout: 240000 });
  const yoke = await page.locator(".yoke").boundingBox();
  await page.mouse.move(yoke.x + yoke.width / 2, yoke.y + yoke.height / 2);
  await page.mouse.down();
  await page.mouse.move(yoke.x + yoke.width / 2, yoke.y + yoke.height * 0.85, { steps: 5 });
  await page.waitForFunction(() => !window.playnes.flight.s.onGround && window.playnes.flight.s.alt > window.playnes.flight.dep.hEnd + 150, null, { timeout: 240000 });
  await page.mouse.up();
  check(true, "took off with the lever and yoke");
  await page.waitForTimeout(2500);
  await shot("2-airborne");

  // Look around with the bubble, then reset.
  const look = await page.locator(".look-pad").boundingBox();
  await page.mouse.move(look.x + look.width / 2, look.y + look.height / 2);
  await page.mouse.down();
  await page.mouse.move(look.x + look.width / 2 + 120, look.y + look.height / 2 - 30, { steps: 6 });
  await page.mouse.up();
  const lookYaw = await page.evaluate(() => window.playnes.flight.view.lookYaw);
  check(Math.abs(lookYaw) > 20, `look bubble turns the camera (${lookYaw.toFixed(0)} deg)`);
  await page.waitForTimeout(800);
  await shot("3-look");
  await page.click(".look-reset", { force: true });
  check((await page.evaluate(() => window.playnes.flight.view.lookYaw)) === 0, "reset view button");

  // Big map: autopilot holds heading.
  const before = await F();
  await page.dispatchEvent(".minimap", "pointerdown");
  await page.waitForSelector(".bigmap:not([hidden])");
  await page.waitForTimeout(4000);
  const during = await F();
  check(during.ap, "autopilot engaged while the map is open");
  check(Math.abs(((during.hdg - before.hdg + 540) % 360) - 180) < 12, `heading held (${before.hdg.toFixed(0)} -> ${during.hdg.toFixed(0)})`);
  await page.click(".bigmap-airport:has-text('CLT')");
  await shot("4-bigmap");
  await page.click(".bigmap-go");
  await page.waitForSelector(".bigmap", { state: "hidden" });
  check(!(await F()).ap, "autopilot off after closing the map");
  await page.waitForTimeout(1500);
  await shot("5-minimap-target");

  // Guided landing: put the plane on a 4 nm final to CLT and let go of the controls.
  await page.evaluate(() => {
    const f = window.playnes.flight;
    const r = f.allRunways.find((x) => x.airport.code === "CLT");
    const d = 4 * 1852;
    const R = 6371008.8, br = ((r.heading + 180) * Math.PI) / 180, la = (r.end.lat * Math.PI) / 180, lo = (r.end.lon * Math.PI) / 180, dd = d / R;
    const la2 = Math.asin(Math.sin(la) * Math.cos(dd) + Math.cos(la) * Math.sin(dd) * Math.cos(br));
    const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(dd) * Math.cos(la), Math.cos(dd) - Math.sin(la) * Math.sin(la2));
    Object.assign(f.s, { lat: (la2 * 180) / Math.PI, lon: (lo2 * 180) / Math.PI, alt: r.hEnd + d * Math.tan((3 * Math.PI) / 180) + 16, heading: r.heading, bank: 0, gamma: -3, onGround: false, gearDown: true, flaps: 3, speed: f.p.vapp });
    window.playnes.controls.setThrottle(0.1);
  });
  await page.waitForFunction(() => window.playnes.flight.landedAt === "CLT" && window.playnes.flight.s.onGround, null, { timeout: 240000 });
  check(true, "landing helper brought the plane down on the CLT runway");
  await page.waitForTimeout(1500);
  await shot("6-landed");
  const prog = await page.evaluate(() => window.playnes.progress);
  check(prog.airportsVisited.includes("CLT") && prog.currentAirport === "CLT", "passport stamp + current airport saved");

  // Crash: enable crashes, nose into the ground away from a runway.
  await page.evaluate(() => {
    const f = window.playnes.flight;
    f.d.crashes = true;
    Object.assign(f.s, { lat: 35.6, lon: -81.3, alt: f.groundHeightAt({ lat: 35.6, lon: -81.3 }) + 60, onGround: false, gamma: -10, speed: 70, heading: 90 });
  });
  await page.mouse.move(yoke.x + yoke.width / 2, yoke.y + yoke.height / 2);
  await page.mouse.down();
  await page.mouse.move(yoke.x + yoke.width / 2, yoke.y + yoke.height * 0.1, { steps: 4 });
  await page.waitForFunction(() => window.playnes.flight.phase === "crashed", null, { timeout: 60000 });
  await page.mouse.up();
  check(true, "crash happens with crashes enabled");
  await shot("7-crash");
  await page.waitForFunction(() => window.playnes.flight.phase === "free" && window.playnes.flight.s.onGround, null, { timeout: 30000 });
  check(true, "respawned on a runway after the crash");

  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
