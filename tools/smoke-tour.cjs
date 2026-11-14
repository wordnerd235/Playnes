// Dev tool: the interface tour on a first flight, and the height bar.
// Usage: node tools/smoke-tour.cjs <base-url> <out-dir>
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
  await page.evaluate(() => window.playnes.startMission({ kind: "lesson", lesson: "l2", airport: "TRI" }));
  await page.waitForSelector(".tour", { timeout: 90000 });
  check(true, "tour starts on the first flight");
  check(await page.evaluate(() => window.playnes.flight.paused), "flight is paused during the tour");
  const steps = [];
  for (let i = 0; i < 25 && (await page.$(".tour")); i++) {
    const info = await page.evaluate(() => ({
      text: document.querySelector(".tour-text").textContent,
      count: document.querySelector(".tour-count").textContent,
      ring: getComputedStyle(document.querySelector(".tour-ring")).display !== "none",
    }));
    steps.push(info);
    if ([1, 3, 6, 8].includes(i)) await page.screenshot({ path: path.join(out, `tour-${i}.png`) });
    // One real tap proves the button works; the rest step through quickly (headless rendering is slow).
    if (i === 0) await page.click(".tour [data-t=next]", { timeout: 60000 });
    else await page.evaluate(() => document.querySelector(".tour [data-t=next]").click());
    await page.waitForTimeout(250);
  }
  console.log(steps.map((s) => `${s.count} ${s.ring ? "◎" : "·"} ${s.text.slice(0, 50)}`).join("\n"));
  check(steps.length >= 12, `tour walks through ${steps.length} steps`);
  check(steps.slice(1, -1).every((s) => s.ring), "every middle step highlights something on screen");
  await page.waitForTimeout(500);
  check(!(await page.evaluate(() => window.playnes.flight.paused)), "flight resumes after the tour");
  check(await page.evaluate(() => window.playnes.progress.tourDone), "tour remembered as seen");
  // The ? button brings it back.
  await page.click("#hud-help", { force: true, timeout: 60000 });
  await page.waitForSelector(".tour", { timeout: 60000 });
  check(true, "the ? button shows the tour again");
  await page.click(".tour [data-t=skip]", { timeout: 60000 });
  await page.waitForTimeout(300);
  check(!(await page.$(".tour")), "skip closes the tour");
  // Height bar: fill = height / cruising height.
  const bar = await page.evaluate(() => {
    const f = window.playnes.flight;
    return {
      fill: parseInt(document.querySelector(".alt-fill").style.width),
      label: document.querySelector(".alt-target").textContent,
      alt: Number(document.querySelector(".gauge-alt .gauge-v").textContent.replace(/\D/g, "")),
      cruise: f.ac.cruiseAltFt,
    };
  });
  const expect = Math.round((bar.alt / bar.cruise) * 100);
  check(Math.abs(bar.fill - expect) <= 2 && /cruise/.test(bar.label), `height bar shows progress to cruise (${bar.alt} of ${bar.cruise} ft = ${bar.fill}%, "${bar.label}")`);
  await page.locator(".gauge-alt").screenshot({ path: path.join(out, "alt-bar.png"), timeout: 60000 }).catch(() => {});
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
