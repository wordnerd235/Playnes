// Dev tool: a charter to an airport landed at before is flown solo (no rings, tips or co-pilot help).
// Usage: node tools/smoke-solo.cjs <base-url> <out-dir>
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
  // Landed at Charlotte before (any way), never at Asheville.
  await page.evaluate(() => {
    const p = window.playnes.progress;
    p.tourDone = true;
    p.landedAt = ["CLT"];
    window.playnes.screens.charters();
  });
  await page.waitForTimeout(800);
  const badge = await page.evaluate(() => [...document.querySelectorAll(".charter-card")].some((c) => c.textContent.includes("CLT") && c.querySelector(".charter-solo")));
  check(badge, "charter card for a flown route shows the Solo badge");
  await page.screenshot({ path: path.join(out, "solo-cards.png") });
  await page.evaluate(() => window.playnes.startMission({ kind: "charter", from: "TRI", to: "CLT", passenger: { id: "family", icon: "x", spoken: "The family", count: 4 } }));
  await page.waitForFunction(() => { const f = window.playnes.flight; return f && f.phase === "lineup" && !f.paused; }, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const caption = await page.evaluate(() => document.querySelector(".caption")?.textContent ?? "");
  const said = await page.evaluate(() => window.playnes.flight.solo);
  check(said, "flight knows it is solo");
  check(await page.evaluate(() => window.playnes.flight.hoops.length === 0), "no rings to fly through on a solo charter");
  await page.waitForTimeout(6000);
  const pulses = await page.evaluate(() => document.querySelectorAll(".hud .pulse").length);
  check(pulses === 0, `no flashing button prompts (${pulses})`);
  // Normally the co-pilot taps the radio for you after 12 s; solo waits much longer.
  await page.evaluate(() => (window.playnes.flight.timeScale = 4));
  await page.waitForTimeout(6000);
  const phase = await page.evaluate(() => window.playnes.flight.phase);
  check(phase === "lineup", `co-pilot doesn't take over the radio right away (phase ${phase})`);
  console.log("caption:", caption.slice(0, 120));
  await page.screenshot({ path: path.join(out, "solo-lineup.png") });
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
