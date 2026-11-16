// Dev tool: full screen comes back on the next tap after Safari drops it on a downward swipe,
// but stays off after leaving it on purpose.
// Usage: node tools/smoke-fullscreen.cjs <base-url>
const { chromium } = require("playwright");

(async () => {
  const [base] = process.argv.slice(2);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  let failed = false;
  const check = (ok, msg) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) failed = true;
  };
  // Wait (up to 4 s) for full screen to settle into the expected state; returns the state.
  const settle = async (want) => {
    await page.waitForFunction((w) => !!document.fullscreenElement === w, want, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
    return page.evaluate(() => !!document.fullscreenElement);
  };
  const swipeDown = () =>
    page.evaluate(() => {
      const t = (y) => new Touch({ identifier: 1, target: document.body, clientX: 400, clientY: y });
      document.body.dispatchEvent(new TouchEvent("touchstart", { touches: [t(200)], bubbles: true }));
      document.body.dispatchEvent(new TouchEvent("touchmove", { touches: [t(320)], bubbles: true }));
      // What Safari does on that swipe.
      return document.exitFullscreen();
    });
  await page.goto(base);
  // The start button only works once the game has loaded: tap until the home screen opens.
  for (let i = 0; i < 30 && !(await page.$(".home-grid")); i++) {
    await page.tap(".big-go").catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.waitForSelector(".home-grid", { timeout: 10000 });
  await page.tap(".fs-btn");
  check(await settle(true), "full screen button enters full screen");
  await swipeDown();
  check(!(await settle(false)), "a downward swipe dropped full screen (as Safari does)");
  await page.tap(".screen-title");
  check(await settle(true), "the next tap brings full screen back");
  await page.tap(".fs-btn");
  check(!(await settle(false)), "the button leaves full screen");
  await page.tap(".screen-title");
  await page.waitForTimeout(1500);
  check(!(await settle(false)), "left on purpose: a tap doesn't bring it back");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
