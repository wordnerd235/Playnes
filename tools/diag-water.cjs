// Dev tool: how many trees/houses stand on water (by the map tile's own colour) around a few
// airports by rivers and lakes, from the playne's spot in Free Flight. Should be 0.
// Usage: node tools/diag-water.cjs <base-url> [out-dir]
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  let total = 0;
  for (const ap of (process.env.APS || "TRI,CHA,CLT").split(",")) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
    await page.goto(base);
    for (let i = 0; i < 30 && !(await page.$(".home-grid")); i++) {
      await page.click(".big-go", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
    const ok = await page.evaluate((ap) => {
      const g = window.playnes;
      g.progress.tourDone = true;
      g.progress.selectedPlane = "c172";
      localStorage.setItem("playnes.freeSave.v1", "");
      g.freeSave = null;
      try {
        g.startMission({ kind: "sandbox", airport: ap });
        return true;
      } catch {
        return false;
      }
    }, ap);
    if (!ok) continue;
    await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free" && !window.playnes.flight.paused, null, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const r = await page.evaluate(async () => {
      const scene = window.playnes.world.widget.scene;
      const prims = scene.primitives._primitives;
      // The trees/houses collection: the big billboard collection with tree pictures.
      const props = prims.filter((p) => typeof p.length === "number" && p.length > 200).sort((a, b) => b.length - a.length)[0];
      if (!props) return { n: 0, wet: 0 };
      const meta = window.playnes.world.cartoon.meta;
      const cache = new Map();
      const tileImg = async (z, x, y) => {
        const k = `${z}/${x}/${y}`;
        if (!cache.has(k)) {
          cache.set(k, (async () => {
            const res = await fetch(`./world/tiles/${k}.webp`);
            if (!res.ok) return null;
            const bmp = await createImageBitmap(await res.blob());
            const cv = document.createElement("canvas");
            cv.width = cv.height = 256;
            const c = cv.getContext("2d");
            c.drawImage(bmp, 0, 0, 256, 256);
            return c.getImageData(0, 0, 256, 256).data;
          })());
        }
        return cache.get(k);
      };
      const isW = (r, g, b) => Math.abs(r - 72) + Math.abs(g - 156) + Math.abs(b - 222) < 54 || Math.abs(r - 150) + Math.abs(g - 205) + Math.abs(b - 240) < 54;
      let wet = 0;
      // Which map tiles exist: all of the base zooms, plus patches above them.
      const [zMin, zMax] = meta.baseZoom;
      const avail = (x, y, z) => {
        if (z < zMin) return false;
        if (z <= zMax) {
          const n = 2 ** z;
          const ty = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n); };
          return x >= Math.floor(((meta.bounds.west + 180) / 360) * n) && x <= Math.floor(((meta.bounds.east + 180) / 360) * n) && y >= ty(meta.bounds.north) && y <= ty(meta.bounds.south);
        }
        return meta.patches.some((p) => p.z === z && x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
      };
      for (let i = 0; i < props.length; i++) {
        const p = props.get(i).position;
        const lon = (Math.atan2(p.y, p.x) * 180) / Math.PI;
        const lat = (Math.atan2(p.z, Math.hypot(p.x, p.y) * (1 - 0.00669438)) * 180) / Math.PI;
        for (let z = 15; z >= 6; z--) {
          const n = 2 ** z;
          const fx = ((lon + 180) / 360) * n;
          const rr = (lat * Math.PI) / 180;
          const fy = ((1 - Math.log(Math.tan(rr) + 1 / Math.cos(rr)) / Math.PI) / 2) * n;
          const x = Math.floor(fx), y = Math.floor(fy);
          if (!avail(x, y, z)) continue;
          const d = await tileImg(z, x, y);
          if (!d) break;
          const px = Math.min(255, Math.floor((fx - x) * 256)), py = Math.min(255, Math.floor((fy - y) * 256));
          const o = (py * 256 + px) * 4;
          if (isW(d[o], d[o + 1], d[o + 2])) wet++;
          break;
        }
      }
      return { n: props.length, wet };
    });
    console.log(`${ap}: ${r.wet} of ${r.n} trees/houses on water`);
    total += r.wet;
    if (out) await page.screenshot({ path: path.join(out, `water-${ap}.png`) });
    await page.close();
  }
  console.log(`total on water: ${total}`);
  await browser.close();
})();
