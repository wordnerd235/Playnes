// Dev tool: drive the built game in headless Chromium and save screenshots of key moments.
// Usage: node tools/smoke.cjs <base-url> <out-dir>
// Runs in key-free "simple globe" mode. Uses window.playnes (debug handle) to skip ahead.
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const shot = (p, name) => p.screenshot({ path: path.join(out, `${name}.png`) });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: false, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  const step = async (label, fn) => {
    const t = Date.now();
    try {
      await fn();
      console.log(`ok   ${label} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    } catch (e) {
      console.log(`FAIL ${label}: ${e.message.split("\n")[0]}`);
    }
  };

  await step("title", async () => {
    await page.goto(base);
    await page.waitForSelector(".big-go", { timeout: 20000 });
    await shot(page, "01-title");
  });
  await step("home", async () => {
    await page.click(".big-go");
    await page.waitForSelector(".home-grid", { timeout: 60000 });
    await page.waitForTimeout(2500);
    await shot(page, "02-home");
  });
  await step("school", async () => {
    await page.click(".home-card.school");
    await page.waitForSelector(".lesson-row");
    await page.waitForTimeout(500);
    await shot(page, "03-school");
  });
  await step("lesson 1", async () => {
    await page.click(".lesson >> nth=0");
    await page.waitForSelector(".meet-svg");
    for (const part of ["wings", "tail", "prop", "wheels", "cockpit"]) {
      await page.dispatchEvent(`[data-part="${part}"]`, "pointerdown");
      await page.waitForTimeout(150);
    }
    await shot(page, "04-lesson1");
    await page.waitForSelector(".debrief", { timeout: 15000 });
    await page.waitForTimeout(1500);
    await shot(page, "05-lesson1-debrief");
  });
  await step("hangar", async () => {
    await page.evaluate(() => window.playnes.screens.hangar());
    await page.waitForTimeout(600);
    await shot(page, "06-hangar");
  });
  await step("charters", async () => {
    await page.evaluate(() => window.playnes.screens.charters());
    await page.waitForTimeout(600);
    await page.click(".charter-card >> nth=0");
    await page.waitForTimeout(400);
    await shot(page, "07-charters");
  });
  await step("lineup", async () => {
    await page.evaluate(() => {
      window.playnes.progress.planes.push("phenom100");
      window.playnes.progress.selectedPlane = "phenom100";
      window.playnes.startMission({ kind: "charter", from: "TRI", to: "CLT", passenger: { id: "family", icon: "x", spoken: "The Lopez family", count: 4 } });
    });
    await page.waitForSelector(".hud:not([hidden])", { timeout: 60000 });
    await page.waitForTimeout(3000);
    await shot(page, "08-lineup");
    // Headless software rendering is slow; run several physics steps per frame.
    await page.evaluate(() => (window.playnes.flight.timeScale = 6));
  });
  await step("takeoff roll", async () => {
    await page.keyboard.press("r");
    await page.waitForTimeout(9000);
    await page.keyboard.down("PageUp");
    await page.waitForTimeout(2500);
    await page.keyboard.up("PageUp");
    await page.waitForTimeout(5000);
    await shot(page, "09-roll");
  });
  await step("rotate + climb", async () => {
    await page.keyboard.down("ArrowDown");
    await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "climb", null, { timeout: 60000 });
    await page.keyboard.up("ArrowDown");
    await page.waitForTimeout(4000);
    await shot(page, "10-climb");
    await page.keyboard.press("g");
    await page.waitForTimeout(6000);
    await shot(page, "11-hoops");
  });
  await step("cruise", async () => {
    await page.evaluate(() => window.playnes.flight.enterCruise());
    await page.waitForFunction(() => window.playnes.flight.phase === "cruise", null, { timeout: 20000 });
    await page.waitForTimeout(4000);
    await shot(page, "12-cruise");
    await page.evaluate(() => (window.playnes.flight.view.mode = "cockpit"));
    await page.waitForTimeout(1500);
    await shot(page, "13-cruise-cockpit");
    await page.evaluate(() => (window.playnes.flight.view.mode = "chase"));
  });
  await step("approach", async () => {
    await page.evaluate(() => window.playnes.flight.enterApproach());
    await page.waitForFunction(() => !window.playnes.flight || ["approach", "flare", "rollout", "done"].includes(window.playnes.flight.phase), null, { timeout: 20000 });
    await page.waitForTimeout(5000);
    await shot(page, "14-approach");
  });
  await step("landing", async () => {
    await page.waitForFunction(() => !window.playnes.flight || ["rollout", "done"].includes(window.playnes.flight.phase), null, { timeout: 240000 });
    await page.waitForTimeout(1500);
    await shot(page, "15-touchdown");
    await page.waitForSelector(".debrief", { timeout: 90000 });
    await page.waitForTimeout(2500);
    await shot(page, "16-debrief");
  });

  console.log(errors.length ? `\n${errors.length} errors:\n${[...new Set(errors)].slice(0, 15).join("\n")}` : "\nno page errors");
  await browser.close();
})();
