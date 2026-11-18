// node fit.cjs <modelId> <photo.jpg> <up|down> [elMin,elMax] [azMin,azMax]
// Needs <photo>.seg.json from seg.py. Finds the camera angle where the model's outline best
// matches the photo's, and writes <photo>.fit.json plus <photo>.mask-model.png / .shaded.png.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const repo = path.join(__dirname, "..", ".."), here = __dirname;
const [id, photo, gear = "down", elR = "-85,85", azR = "0,359"] = process.argv.slice(2);
const [elMin, elMax] = elR.split(",").map(Number), [azMin, azMax] = azR.split(",").map(Number);
const base = photo.replace(/\.[a-z]+$/i, "");
const seg = JSON.parse(fs.readFileSync(base + ".seg.json"));
const T = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const range = (a, b, s) => { const r = []; for (let v = a; v <= b + 1e-9; v += s) r.push(Math.round(v * 100) / 100); return r; };
(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    const f = u.startsWith("/repo/") ? path.join(repo, u.slice(6)) : path.join(here, u);
    fs.readFile(f, (e, d) => e ? res.writeHead(404).end() : res.writeHead(200, { "content-type": T[path.extname(f)] || "application/octet-stream" }).end(d));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
  const hide = (gear === "up" ? "gearL,gearR,gearN,wheelL,wheelR,wheelN,gearDoors," : "") + "propDisc,prop,rotorF,rotorR";
  const rot = gear === "land" ? "flapL:-30,flapR:-30" : "";
  await page.goto(`http://127.0.0.1:${server.address().port}/fit.html?id=${id}&hide=${hide}&rot=${rot}${process.env.SRC ? "&src=" + process.env.SRC : ""}${process.env.ZS ? "&zs=" + process.env.ZS : ""}`);
  await page.waitForFunction(() => document.title === "ready", null, { timeout: 60000 });
  await page.evaluate((m) => window.setPhoto(m), seg.m);
  let top = [];
  if (process.env.POSE || process.env.REFIT) {
    // Refine near a known pose (POSE=az,el,roll,fov, or REFIT=1 to start from <photo>.fit.json).
    const f0 = process.env.REFIT ? JSON.parse(fs.readFileSync(base + ".fit.json")) : null;
    const [a, e, r, f] = f0 ? [f0.az, f0.el, f0.roll, f0.fov] : process.env.POSE.split(",").map(Number);
    let res = await page.evaluate(([a, e, r, f]) => window.search(a, e, r, f), [range(a - 4, a + 4, 2), range(e - 4, e + 4, 2), range(r - 4, r + 4, 2), f || 6]);
    const b = res[0];
    res = await page.evaluate(([a, e, r, f]) => window.search(a, e, r, f), [range(b[1] - 1.5, b[1] + 1.5, 0.75), range(b[2] - 1.5, b[2] + 1.5, 0.75), range(b[3] - 1.5, b[3] + 1.5, 0.75), f || 6]);
    top = [[...res[0], f || 6]];
  }
  if (!top.length) {
  const azs = range(azMin, azMax, 10), els = range(elMin, elMax, 10).filter((e) => Math.abs(e) <= 85);
  let best = await page.evaluate(([a, e, r]) => window.search(a, e, r, 6), [azs, els, process.env.ROLL ? range(...process.env.ROLL.split(",").map(Number), 10) : range(-180, 170, 10)]);
  // Refine the three best (distinct) candidates.
  const seeds = [];
  for (const b of best) if (!seeds.some((s) => Math.abs(((s[1] - b[1] + 540) % 360) - 180) < 25 && Math.abs(s[2] - b[2]) < 25)) seeds.push(b);
  for (const s of seeds.slice(0, 5)) {
    for (const fov of [6, 20]) {
      const r1 = await page.evaluate(([a, e, r, f]) => window.search(a, e, r, f), [range(s[1] - 8, s[1] + 8, 2), range(Math.max(-85, s[2] - 8), Math.min(85, s[2] + 8), 2), range(s[3] - 8, s[3] + 8, 2), fov]);
      const b = r1[0];
      const r2 = await page.evaluate(([a, e, r, f]) => window.search(a, e, r, f), [range(b[1] - 1.5, b[1] + 1.5, 0.75), range(Math.max(-85, b[2] - 1.5), Math.min(85, b[2] + 1.5), 0.75), range(b[3] - 1.5, b[3] + 1.5, 0.75), fov]);
      top.push([...r2[0], fov]);
    }
  }
  }
  top.sort((a, b) => b[0] - a[0]);
  const [iou, az, el, roll, fov] = top[0];
  const fin = await page.evaluate(([a, e, f]) => window.final(a, e, f, 900), [az, el, fov]);
  fs.writeFileSync(base + ".mask-model.png", Buffer.from(fin.mask.split(",")[1], "base64"));
  fs.writeFileSync(base + ".shaded.png", Buffer.from(fin.shaded.split(",")[1], "base64"));
  if (!process.env.NOSAVE) fs.writeFileSync(base + ".fit.json", JSON.stringify({ id, iou, az, el, roll, fov, gear, others: top.slice(1, 4) }));
  console.log(path.basename(photo), "iou", iou.toFixed(3), "az", az, "el", el, "roll", roll, "fov", fov);
  await browser.close(); server.close();
})();
