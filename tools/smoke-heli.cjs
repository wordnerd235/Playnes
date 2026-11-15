// Dev tool: the Chinook. Unlock rule in the hangar, its tour, helicopter controls (lift off,
// hover, fly forward, turn, land), airport and field landings, and the field-landing pop-up.
// Usage: node tools/smoke-heli.cjs <base-url> <out-dir>
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
  const shot = (n) => page.screenshot({ path: path.join(out, `heli-${n}.png`) });
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });

  // ----- Hangar: locked until every other playne is owned.
  await page.evaluate(() => {
    const p = window.playnes.progress;
    p.tourDone = true;
    p.heliTourDone = false;
    p.wings = 3000;
    p.planes = ["c172", "phenom100"];
    localStorage.setItem("playnes.freeSave.v1", "");
    window.playnes.screens.hangar();
  });
  await page.waitForTimeout(600);
  const cardText = () => page.evaluate(() => [...document.querySelectorAll(".plane-card")].find((c) => c.querySelector("img")?.getAttribute("src")?.includes("/ch47."))?.textContent ?? "");
  check(/Own every other playne/.test(await cardText()), "Chinook card is locked until every other playne is owned");
  await page.evaluate(() => [...document.querySelectorAll(".plane-card")].find((c) => c.querySelector("img")?.getAttribute("src")?.includes("/ch47.")).click());
  await page.waitForSelector(".plane-sheet");
  check(await page.evaluate(() => !!document.querySelector(".plane-sheet .btn.primary[disabled]") && /to go/.test(document.querySelector(".plane-note")?.textContent ?? "")), "details card explains how many playnes are left");
  await page.evaluate(() => document.querySelector(".plane-sheet").remove());
  // Own them all: now it can be bought.
  await page.evaluate(() => {
    // Every playne id from the hangar cards except the Chinook.
    const ids = [...document.querySelectorAll(".plane-card img")].map((i) => i.getAttribute("src").split("/").pop().split(".")[0]).filter((id) => id !== "ch47");
    window.playnes.progress.planes = ids;
    window.playnes.screens.hangar();
  });
  await page.waitForTimeout(600);
  check(/1,?500/.test(await cardText()), "with every other playne owned, the Chinook shows its price (1,500)");
  await page.evaluate(() => [...document.querySelectorAll(".plane-card")].find((c) => c.querySelector("img")?.getAttribute("src")?.includes("/ch47.")).click());
  await page.waitForSelector(".plane-sheet .buy-btn");
  await page.click(".plane-sheet .buy-btn");
  await page.waitForTimeout(400);
  const owned = await page.evaluate(() => window.playnes.progress.planes.includes("ch47"));
  check(owned && (await page.evaluate(() => window.playnes.progress.wings)) === 1500, "bought the Chinook for 1,500 Wings");
  await shot("1-bought");
  await page.evaluate(() => {
    document.querySelector(".plane-sheet")?.remove();
    window.playnes.progress.selectedPlane = "ch47";
  });

  // ----- First flight: the helicopter tour.
  await page.evaluate(() => window.playnes.startMission({ kind: "sandbox", airport: "TRI" }));
  await page.waitForSelector(".tour", { timeout: 120000 });
  const steps = [];
  for (let i = 0; i < 12 && (await page.$(".tour")); i++) {
    steps.push(await page.evaluate(() => document.querySelector(".tour-text").textContent));
    if (i === 1) {
      await shot("2-tour-lever");
      // The Chinook is on screen during the tour (placed where it sits, not waiting to unpause).
      const d = await page.evaluate(() => {
        const f = window.playnes.flight;
        const m = f.view.model.modelMatrix;
        const C3 = window.playnes.world.widget.camera.position.constructor;
        const at = C3.fromDegrees(f.s.lon, f.s.lat, f.s.alt);
        return Math.hypot(m[12] - at.x, m[13] - at.y, m[14] - at.z);
      });
      check(d < 20, `the Chinook is in place during the tour (${d.toFixed(1)} m from where it sits)`);
    }
    await page.evaluate(() => document.querySelector(".tour [data-t=next]").click());
    await page.waitForTimeout(250);
  }
  check(steps.length === 6 && /lever/.test(steps[1]) && /stick/.test(steps[2]) && /sideways/.test(steps[3]), `Chinook tour: ${steps.length} steps (lift lever, stick, slide, landing)`);
  check(await page.evaluate(() => window.playnes.progress.heliTourDone === true), "tour remembered");
  const hud = await page.evaluate(() => ({
    heli: document.querySelector(".hud").classList.contains("heli"),
    flapsHidden: getComputedStyle(document.querySelector("#hud-flaps")).display === "none",
    up: document.querySelector(".lever-notches span").textContent,
    yoke: document.querySelector(".yoke-label.up").textContent,
  }));
  check(hud.heli && hud.flapsHidden && hud.up === "UP" && /forward/.test(hud.yoke), `helicopter controls on the HUD (${JSON.stringify(hud)})`);

  // ----- Fly: lift off, hover, forward, turn, back to a hover.
  const F = () => page.evaluate(() => { const f = window.playnes.flight; const s = f.s; return { on: s.onGround, agl: s.alt - f.groundHeightAt(s), kt: s.speed / 0.5144, vs: s.vs, hdg: s.heading, phase: f.phase, paused: f.paused, lat: s.lat, lon: s.lon }; });
  const set = (o) => page.evaluate((o) => {
    const c = window.playnes.controls;
    if (o.lever !== undefined) c.setThrottle(o.lever);
    c.touchActive = o.pitch !== undefined || o.roll !== undefined;
    c.touchPitch = o.pitch ?? 0;
    c.touchRoll = o.roll ?? 0;
  }, o);
  await page.evaluate(() => (window.playnes.flight.timeScale = 6));
  const startHdg = (await F()).hdg;
  // Lift off with a real drag on the lever (finger/mouse), not by setting it in code.
  const lev = await page.locator(".lever-track").boundingBox();
  check(lev && lev.height > 100, `lever track has its normal size (${lev ? Math.round(lev.height) : 0} px tall)`);
  await page.mouse.move(lev.x + lev.width / 2, lev.y + lev.height * 0.97);
  await page.mouse.down();
  await page.mouse.move(lev.x + lev.width / 2, lev.y + lev.height * 0.05, { steps: 8 });
  await page.mouse.up();
  const lever = await page.evaluate(() => window.playnes.controls.state.throttle);
  check(lever > 0.85, `dragging the lever up raises it (${lever.toFixed(2)})`);
  await page.waitForFunction(() => { const f = window.playnes.flight; return !f.s.onGround && f.s.alt - f.groundHeightAt(f.s) > 60; }, null, { timeout: 240000 });
  let st = await F();
  check(!st.on && st.kt < 3, `lifted straight up (${st.agl.toFixed(0)} m, ${st.kt.toFixed(1)} kt)`);
  await set({ lever: 0.5 });
  await page.waitForTimeout(5000);
  const a1 = (await F()).agl;
  await page.waitForTimeout(4000);
  st = await F();
  check(Math.abs(st.agl - a1) < 4 && Math.abs(st.vs) < 0.6, `hovers with the lever in the middle (vs ${st.vs.toFixed(2)} m/s)`);
  await shot("3-hover");
  // Hold the "slide right" button (a real press): moves sideways without turning.
  const before = await F();
  const sb = await page.locator(".slide-btn.right").boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  // Hold until it's really sliding (headless rendering is slow, so wait on the game, not the clock).
  await page.waitForFunction(() => window.playnes.flight.s.speed / 0.5144 > 15, null, { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const sliding = await page.evaluate(() => window.playnes.flight.s.speed / 0.5144);
  await shot("3b-slide");
  await page.mouse.up();
  const after = await F();
  const moved = Math.hypot((after.lat - before.lat) * 111320, (after.lon - before.lon) * 89500);
  check(sliding > 12 && moved > 30 && Math.abs(((after.hdg - before.hdg + 540) % 360) - 180) < 3, `slide button slides sideways (${sliding.toFixed(0)} kt, moved ${moved.toFixed(0)} m, heading ${before.hdg.toFixed(0)} -> ${after.hdg.toFixed(0)})`);
  // Pull back from a hover: flies backward.
  await set({ lever: 0.5, pitch: 1 });
  await page.waitForFunction(() => window.playnes.flight.s.speed / 0.5144 > 12 && window.playnes.flight.s.pitch > 0, null, { timeout: 180000 }).catch(() => {});
  const backing = await page.evaluate(() => { const f = window.playnes.flight; const h = f.s.heading * Math.PI / 180; return { pitch: f.s.pitch, kt: f.s.speed / 0.5144 }; });
  check(backing.kt > 8 && backing.pitch > 0, `stick back from a hover: flying backward, nose up (${backing.kt.toFixed(0)} kt, pitch ${backing.pitch.toFixed(1)})`);
  await set({ lever: 0.5 });
  await page.waitForTimeout(5000);
  await set({ lever: 0.62, pitch: -1 });
  await page.waitForFunction(() => window.playnes.flight.s.speed / 0.5144 > 80, null, { timeout: 240000 });
  check(true, "stick forward: flying forward (80+ kt)");
  await set({ lever: 0.5, roll: 1 });
  await page.waitForTimeout(6000);
  st = await F();
  check(Math.abs(((st.hdg - startHdg + 540) % 360) - 180) > 20, `turns with the stick (heading ${startHdg.toFixed(0)} -> ${st.hdg.toFixed(0)})`);
  await shot("4-turning");
  // Away from the airport, slow to a hover and land in a field.
  await set({ lever: 0.5, pitch: -1 });
  await page.waitForFunction(() => { const f = window.playnes.flight; const s = f.s; const a = { lat: 36.4752, lon: -82.4074 }; return Math.hypot((s.lat - a.lat) * 111320, (s.lon - a.lon) * 89500) > 4500; }, null, { timeout: 240000 });
  await set({ lever: 0.5, pitch: 1 });
  await page.waitForFunction(() => window.playnes.flight.s.speed < 1, null, { timeout: 240000 });
  await set({ lever: 0.15 });
  await page.waitForFunction(() => window.playnes.flight.s.onGround || window.playnes.flight.paused || !!document.querySelector(".pause-overlay"), null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  const pop = await page.evaluate(() => document.querySelector(".pause-overlay")?.textContent ?? "");
  const fieldOrBounce = /Safe landing/.test(pop);
  check(fieldOrBounce || /flat ground|water/.test(await page.evaluate(() => document.querySelector(".caption")?.textContent ?? "")), `landed in the open: ${pop.slice(0, 80) || "(co-pilot found it too bumpy)"}`);
  await shot("5-field");
  if (fieldOrBounce) {
    check(/Take off from here/.test(pop) && /Fly from/.test(pop), "field pop-up offers take off here / fly from nearest / go home");
    await page.click(".pause-overlay [data-a=nearest]");
    await page.waitForTimeout(1500);
    st = await F();
    check(st.on && !st.paused, "Fly from the nearest airport: back on a runway");
  }
  // Lift off at the airport and land right there: welcome pop-up.
  await set({ lever: 0.9 });
  await page.waitForFunction(() => { const f = window.playnes.flight; return !f.s.onGround && f.s.alt - f.groundHeightAt(f.s) > 40; }, null, { timeout: 240000 });
  await set({ lever: 0.5 });
  await page.waitForTimeout(16000);
  await set({ lever: 0.1 });
  await page.waitForSelector(".pause-overlay.arrival", { timeout: 240000 }).catch(() => {});
  const welcome = await page.evaluate(() => document.querySelector(".pause-overlay")?.textContent ?? "");
  check(/Welcome to/.test(welcome), `landing at an airport: ${welcome.slice(0, 60)}`);
  await shot("6-welcome");
  if (/Welcome to/.test(welcome)) {
    await page.click(".pause-overlay [data-a=again]");
    await page.waitForTimeout(800);
    st = await F();
    check(st.on && !st.paused, "Fly again from here: ready to lift off where it landed");
  }
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
