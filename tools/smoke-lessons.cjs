// Dev tool: run Flight School lessons 2-5 headless with fast-forwarded physics and the
// co-pilot's automatic help (no input), checking each one reaches its debrief.
// Usage: node tools/smoke-lessons.cjs <base-url> <out-dir>
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  for (const lesson of ["l2", "l3", "l4", "l5"]) {
    const t = Date.now();
    try {
      await page.evaluate((l) => window.playnes.startMission({ kind: "lesson", lesson: l, airport: "TRI" }), lesson);
      await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase !== "loading", null, { timeout: 60000 });
      await page.evaluate(() => (window.playnes.flight.timeScale = 12));
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(out, `lesson-${lesson}.png`) });
      await page.waitForSelector(".debrief", { timeout: 300000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(out, `lesson-${lesson}-done.png`) });
      console.log(`ok   ${lesson} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
    } catch (e) {
      const phase = await page.evaluate(() => window.playnes.flight?.phase);
      console.log(`FAIL ${lesson}: ${e.message.split("\n")[0]} (phase ${phase})`);
      await page.screenshot({ path: path.join(out, `lesson-${lesson}-fail.png`) });
      await page.evaluate(() => window.playnes.endFlight?.());
    }
  }
  const p = await page.evaluate(() => window.playnes.progress);
  console.log("lessons done:", p.lessonsDone.join(","), "wings:", p.wings);
  console.log(errors.length ? `errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
})();
