// Dev tool: screenshot a local page with the pre-installed Playwright Chromium.
// Usage: node tools/screenshot.cjs <url> <out.png> [width] [height] [waitTitle]
const { chromium } = require("playwright");

(async () => {
  const [url, out, w, h, waitTitle] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(w) || 1200, height: Number(h) || 800 } });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.log(`console ${m.type()}:`, m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(url);
  try {
    await page.waitForFunction((t) => document.title === t, waitTitle || "ready", { timeout: 45000 });
  } catch {
    console.log("timed out waiting for page title");
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out });
  await browser.close();
})();
