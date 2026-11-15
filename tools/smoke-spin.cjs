// Dev tool: the hangar details card shows the playne in 3D, and dragging spins it.
// Usage: node tools/smoke-spin.cjs <base-url> <out-dir>
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
  // Stop the 3D world behind the menu so headless rendering has time for the hangar viewer.
  await page.evaluate(() => {
    window.playnes.world.widget.useDefaultRenderLoop = false;
    window.playnes.screens.hangar();
  });
  await page.waitForTimeout(500);
  for (const id of ["c172", "g700"]) {
    await page.evaluate((id) => {
      const cards = [...document.querySelectorAll(".plane-card")];
      const card = cards.find((c) => c.querySelector("img.plane-pic")?.getAttribute("src")?.includes(`/${id}.webp`));
      card.click();
    }, id);
    await page.waitForSelector(".plane-sheet canvas.plane-spin.ready", { timeout: 60000 });
    check(true, `${id}: details card shows the 3D model`);
    await page.waitForTimeout(800);
    const canvas = page.locator(".plane-sheet canvas.plane-spin");
    const box = await canvas.boundingBox();
    const shot = async (name) => {
      await page.waitForTimeout(400);
      return canvas.screenshot({ path: path.join(out, `${name}.png`) });
    };
    const a = await shot(`spin-${id}-start`);
    // Drag sideways (turn) and down (look from above).
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (0.3 + i * 0.04), box.y + box.height * (0.5 + i * 0.025));
    await page.mouse.up();
    const b = await shot(`spin-${id}-dragged`);
    check(!a.equals(b), `${id}: dragging turns the playne`);
    // Fits the whole playne: nothing touches the edges of the box.
    const edge = await page.evaluate(() => {
      const c = document.querySelector(".plane-sheet canvas.plane-spin");
      const g = document.createElement("canvas");
      g.width = c.width;
      g.height = c.height;
      const x = g.getContext("2d");
      x.drawImage(c, 0, 0);
      const d = x.getImageData(0, 0, g.width, g.height).data;
      let hits = 0;
      let solid = 0;
      for (let i = 3; i < d.length; i += 16) if (d[i] > 40) solid++;
      const at = (px, py) => d[(py * g.width + px) * 4 + 3] > 40;
      for (let px = 0; px < g.width; px += 2) if (at(px, 1) || at(px, g.height - 2)) hits++;
      for (let py = 0; py < g.height; py += 2) if (at(1, py) || at(g.width - 2, py)) hits++;
      return { hits, solid };
    });
    if (edge.solid === 0) console.log(`  (${id}: couldn't read the 3D canvas back; edge check skipped)`);
    else check(edge.hits === 0, `${id}: whole playne stays inside the box (${edge.hits} edge pixels)`);
    await page.click(".plane-sheet .btn.secondary, .plane-sheet .btn.primary");
    await page.waitForTimeout(500);
    check(!(await page.$("canvas.plane-spin")), `${id}: closing the card removes the 3D view`);
  }
  console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
