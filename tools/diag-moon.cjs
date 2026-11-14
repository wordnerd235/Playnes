// Dev tool: point the camera at the Moon to see what Cesium draws there.
// Usage: node tools/diag-moon.cjs <base-url> <out-dir>
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion: "reduce" });
  await page.goto(base);
  await page.click(".big-go");
  await page.waitForSelector(".home-grid", { timeout: 60000 });
  await page.evaluate(() => localStorage.setItem("playnes.freeSave.v1", ""));
  await page.click(".home-card.free", { force: true });
  await page.click(".airport-card:has-text('TRI')");
  await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 60000 });
  for (const on of [true, false]) {
    const info = await page.evaluate((on) => {
      const f = window.playnes.flight;
      const scene = f.d.world.widget.scene;
      scene.moon.show = on;
      f.paused = true;
      f.update = () => {}; // freeze the game camera
      scene.requestRender();
      return new Promise((resolve) => {
        setTimeout(() => {
          const m = scene.moon._ellipsoidPrimitive && scene.moon._ellipsoidPrimitive.modelMatrix;
          if (!m) return resolve("no moon matrix");
          const cam = scene.camera;
          const target = { x: m[12], y: m[13], z: m[14] };
          const p = cam.positionWC;
          const d = { x: target.x - p.x, y: target.y - p.y, z: target.z - p.z };
          const len = Math.hypot(d.x, d.y, d.z);
          const dir = { x: d.x / len, y: d.y / len, z: d.z / len };
          const up = { x: p.x, y: p.y, z: p.z };
          const ul = Math.hypot(up.x, up.y, up.z);
          cam.direction = dir;
          cam.up = { x: up.x / ul, y: up.y / ul, z: up.z / ul };
          cam.right = { x: dir.y * cam.up.z - dir.z * cam.up.y, y: dir.z * cam.up.x - dir.x * cam.up.z, z: dir.x * cam.up.y - dir.y * cam.up.x };
          cam.frustum.fov = 0.25;
          const elev = Math.asin((dir.x * up.x + dir.y * up.y + dir.z * up.z) / ul) * 180 / Math.PI;
          resolve(`moon elevation ${elev.toFixed(1)} deg`);
        }, 500);
      });
    }, on);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(out, `moon-${on ? "on" : "off"}.png`) });
    console.log(on ? "moon on:" : "moon off:", info);
  }
  await browser.close();
})();
