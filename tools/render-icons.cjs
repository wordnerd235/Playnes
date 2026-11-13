// Dev tool: render public/icons/icon.svg to the PNG sizes iPad and Android want.
// Usage: node tools/render-icons.cjs   (uses the pre-installed Playwright Chromium)
const { chromium } = require("playwright");
const { readFileSync } = require("fs");
const { join } = require("path");

(async () => {
  const dir = join(__dirname, "..", "public", "icons");
  const svg = readFileSync(join(dir, "icon.svg"), "utf8");
  const browser = await chromium.launch();
  for (const [size, name] of [[180, "apple-touch-icon.png"], [192, "icon-192.png"], [512, "icon-512.png"]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:#1d5d9b">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: join(dir, name), omitBackground: false });
    await page.close();
    console.log(name);
  }
  await browser.close();
})();
