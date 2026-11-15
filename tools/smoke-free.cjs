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
  // The interface tour is checked on its own; skip it here.
  await page.evaluate(() => {
    window.playnes.progress.tourDone = true;
    // This test uses the co-pilot's landing help (a grown-up setting, off by default).
    window.playnes.settings.freeLandingHelp = true;
  });
  await shot("0-home");
  await page.evaluate(() => localStorage.setItem("playnes.freeSave.v1", ""));
  await page.click(".home-card.free", { force: true });
  await page.waitForSelector(".airport-grid", { timeout: 10000 });
  check((await page.$$(".airport-card")).length >= 12, "Free Flight shows the airport picker");
  check(!(await page.isVisible(".free-resume")), "no resume card without a saved flight");
  await shot("0b-picker");
  await page.click(".airport-card:has-text('AVL')");
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 60000 });
  const avl = await page.evaluate(() => window.playnes.flight.dep.airport.code);
  check(avl === "AVL", `starts at the picked airport (${avl})`);
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

  // Guided landing: put the plane on a 2.5 nm final to CLT and let go of the controls.
  await page.evaluate(() => {
    const f = window.playnes.flight;
    const r = f.allRunways.find((x) => x.airport.code === "CLT");
    const d = 2.5 * 1852;
    const R = 6371008.8, br = ((r.heading + 180) * Math.PI) / 180, la = (r.end.lat * Math.PI) / 180, lo = (r.end.lon * Math.PI) / 180, dd = d / R;
    const la2 = Math.asin(Math.sin(la) * Math.cos(dd) + Math.cos(la) * Math.sin(dd) * Math.cos(br));
    const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(dd) * Math.cos(la), Math.cos(dd) - Math.sin(la) * Math.sin(la2));
    Object.assign(f.s, { lat: (la2 * 180) / Math.PI, lon: (lo2 * 180) / Math.PI, alt: r.hEnd + d * Math.tan((3 * Math.PI) / 180) + 16, heading: r.heading, bank: 0, gamma: -3, onGround: false, gearDown: true, flaps: 3, speed: f.p.vapp });
    window.playnes.controls.setThrottle(0.1);
  });
  const t0 = Date.now();
  const probe = setInterval(async () => {
    try {
      console.log(`  [${Math.round((Date.now() - t0) / 1000)}s]`, await page.evaluate(() => { const f = window.playnes.flight; const s = f.s; const c = f.d.controls.state; const r = f.allRunways.find((x) => x.airport.code === "CLT"); const dx = (s.lon - r.end.lon) * 111320 * Math.cos(s.lat * Math.PI / 180), dy = (s.lat - r.end.lat) * 111320; return `dist=${Math.round(Math.hypot(dx, dy))}m alt=${s.alt.toFixed(1)} hEnd=${r.hEnd.toFixed(1)} phase=${f.phase} gnd=${s.onGround} agl=${(s.alt - f.groundHeightAt(s)).toFixed(1)} kt=${(s.speed / 0.5144).toFixed(0)} vs=${s.vs.toFixed(1)} pitchIn=${c.pitch.toFixed(2)} rollIn=${c.roll.toFixed(2)} lever=${c.throttle.toFixed(2)} paused=${f.paused} landedAt=${f.landedAt} ap=${!!f.autopilot}`; }));
    } catch {}
  }, 2000);
  await page.waitForFunction(() => window.playnes.flight.landedAt === "CLT" && window.playnes.flight.s.onGround, null, { timeout: 420000, polling: 500 }).finally(() => clearInterval(probe));
  check(true, "landing helper brought the plane down on the CLT runway");
  await page.waitForTimeout(1500);
  await shot("6-landed");
  const prog = await page.evaluate(() => window.playnes.progress);
  check(prog.airportsVisited.includes("CLT") && prog.currentAirport === "CLT", "passport stamp + current airport saved");
  // Full stop on the runway: welcome pop-up, then line up again on the same runway.
  await page.waitForSelector(".pause-overlay.arrival", { timeout: 120000 });
  check((await page.textContent(".pause-overlay.arrival h1")).includes("Charlotte"), "welcome pop-up after stopping on the runway");
  await shot("6b-arrival");
  await page.click(".pause-overlay.arrival [data-a=again]");
  await page.waitForTimeout(800);
  const again = await page.evaluate(() => { const f = window.playnes.flight; return { paused: f.paused, ground: f.s.onGround, spd: f.s.speed, dep: f.dep.airport.code }; });
  check(!again.paused && again.ground && again.spd < 1 && again.dep === "CLT", "fly again from here: lined up on the CLT runway");

  // Crash: enable crashes, nose into the ground away from a runway.
  await page.evaluate(() => {
    const f = window.playnes.flight;
    f.d.crashes = true;
    window.__crashes = 0;
    const orig = f.crash.bind(f);
    f.crash = () => { window.__crashes++; orig(); };
    Object.assign(f.s, { lat: 35.6, lon: -81.3, alt: f.groundHeightAt({ lat: 35.6, lon: -81.3 }) + 60, onGround: false, gamma: -10, speed: 70, heading: 90 });
  });
  await page.mouse.move(yoke.x + yoke.width / 2, yoke.y + yoke.height / 2);
  await page.mouse.down();
  await page.mouse.move(yoke.x + yoke.width / 2, yoke.y + yoke.height * 0.1, { steps: 4 });
  await page.waitForFunction(() => window.__crashes > 0, null, { timeout: 60000, polling: 100 }).catch(async (e) => {
    console.log("crash wait failed:", await page.evaluate(() => { const f = window.playnes.flight; const s = f.s; return JSON.stringify({ phase: f.phase, agl: s.alt - f.groundHeightAt(s), vs: s.vs, spd: s.speed, ground: s.onGround, pitchIn: f.d.controls.state.pitch, lastVs: f.lastCmd.targetVs, ap: !!f.autopilot, crashes: f.d.crashes, landedAt: f.landedAt }); }));
    throw e;
  });
  await page.mouse.up();
  check(true, "crash happens with crashes enabled");
  await shot("7-crash");
  await page.waitForFunction(() => window.playnes.flight.phase === "free" && window.playnes.flight.s.onGround, null, { timeout: 30000 });
  check(true, "respawned on a runway after the crash");

  // Leave to the menu and come back: the flight should resume where it was.
  await page.evaluate(() => {
    const s = window.playnes.flight.s;
    Object.assign(s, { onGround: false, alt: 2500, speed: 110, heading: 123, gearDown: false, flaps: 0, lat: 35.6, lon: -81.6 });
  });
  await page.waitForTimeout(300);
  const saved = await F();
  await page.evaluate(() => window.playnes.togglePause());
  await page.waitForSelector(".pause-card", { timeout: 5000 });
  check((await page.textContent(".pause-card [data-a=home]")).includes("Save"), "pause offers Save & go home");
  await page.click(".pause-card [data-a=home]");
  await page.waitForSelector(".home-grid", { timeout: 10000 });
  check(!!(await page.evaluate(() => localStorage.getItem("playnes.freeSave.v1"))), "free flight saved to the device");
  await page.click(".home-card.free", { force: true });
  await page.waitForSelector(".free-resume-go", { timeout: 10000 });
  await shot("8-resume-card");
  await page.click(".free-resume-go");
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 60000 });
  await page.waitForSelector(".pause-card", { timeout: 10000 });
  check(true, "resumed flight starts paused");
  const after = await F();
  const moved = Math.hypot(after.lat - saved.lat, after.lon - saved.lon);
  check(moved < 0.02 && Math.abs(after.hdg - saved.hdg) < 3 && !after.ground && Math.abs(after.alt - saved.alt) < 80, `resumes at the same spot (moved ${moved.toFixed(4)} deg, alt ${saved.alt.toFixed(0)}->${after.alt.toFixed(0)}, hdg ${after.hdg.toFixed(0)})`);
  await shot("9-resumed");
  await page.click(".pause-card [data-a=go]");
  await page.waitForTimeout(1500);
  const flying = await F();
  check(!flying.ground && flying.phase === "free", "keeps flying after resume");

  // Collisions: fly low and level straight at TRI's biggest real building with crashes on.
  const target = await page.evaluate(async () => {
    const json = await (await fetch("./world/buildings.json")).json();
    const ap = json.airports.TRI;
    const b = ap.b.filter((x) => x.h >= 10 && x.a > 400).sort((x, y) => y.h - x.h)[0];
    let lon = 0, lat = 0;
    const n = b.p.length / 2;
    for (let i = 0; i < n; i++) { lon += ap.lon + b.p[2 * i] / 1e6; lat += ap.lat + b.p[2 * i + 1] / 1e6; }
    return { lat: lat / n, lon: lon / n, h: b.h };
  });
  await page.evaluate((t) => {
    const f = window.playnes.flight;
    f.d.crashes = true;
    f.timeScale = 6;
    window.__crashes = 0;
    const orig = f.crash.bind(f);
    f.crash = () => { window.__crashes++; orig(); };
    const base = f.d.world.cartoon.height(t.lat, t.lon);
    // 400 m south of the building, heading north, a few meters below its roof.
    Object.assign(f.s, { lat: t.lat - 400 / 111320, lon: t.lon, heading: 0, alt: base + t.h * 0.6, speed: 60, onGround: false, gearDown: false, flaps: 0, bank: 0, gamma: 0, vs: 0 });
    f.d.controls.setThrottle(0.6, false);
    window.playnes.world.updateScenery(f.s, f.s.alt, 5);
  }, target);
  const hit = await page.waitForFunction(() => window.__crashes > 0, null, { timeout: 60000, polling: 100 }).then(() => true, () => false);
  const where = await page.evaluate((t) => { const s = window.playnes.flight.s; return Math.hypot((s.lat - t.lat) * 111320, (s.lon - t.lon) * 111320 * Math.cos(t.lat * Math.PI / 180)); }, target);
  const st = await F();
  check(hit && where < 250, `flying into a building crashes the playne (${Math.round(where)} m from its middle, ${target.h} m tall, phase ${st.phase}, on ground ${st.ground})`);
  await shot("10-building-crash");

  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
