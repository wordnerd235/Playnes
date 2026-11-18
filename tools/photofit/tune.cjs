// node tune.cjs <id> <photos.txt> <params.json> [rounds]
// photos.txt: "<photo.jpg> <up|down|land>" per line (each must already have .seg.json and .fit.json).
// params.json: [{"path": "latitude.wing.le0", "step": 0.2, "op": "+"}, ...]
// Coordinate descent on the spec: keeps a change only if the photos' mean outline overlap improves.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const repo = path.join(__dirname, "..", ".."), here = __dirname, varDir = path.join(here, "var");
const [id, photosFile, paramsFile, roundsArg = "2"] = process.argv.slice(2);
const photos = fs.readFileSync(photosFile, "utf8").trim().split("\n").filter((l) => l && !l.startsWith("#")).map((l) => {
  const [f, cfg] = l.trim().split(/\s+/); const base = f.replace(/\.[a-z]+$/i, "");
  return { f, cfg, seg: JSON.parse(fs.readFileSync(base + ".seg.json")).m2, pose: JSON.parse(fs.readFileSync(base + ".fit.json")) };
});
const params = JSON.parse(fs.readFileSync(paramsFile, "utf8"));
// Published overall span and length (m): the shape must also keep to these.
const REAL = { phenom100: [12.3, 12.82], pc12: [16.28, 14.4], hondajet: [12.12, 12.99], phenom300: [16.2, 15.64], pc24: [17.0, 16.85], latitude: [22.05, 18.97], praetor600: [21.5, 20.74], challenger3500: [21.0, 20.92], falcon8x: [26.29, 24.46], g650er: [30.36, 30.41], g700: [31.39, 33.48], global8000: [31.7, 33.8] };
const T = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const range = (a, b, s) => { const r = []; for (let v = a; v <= b + 1e-9; v += s) r.push(Math.round(v * 100) / 100); return r; };
(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    const f = u.startsWith("/repo/") ? path.join(repo, u.slice(6)) : path.join(here, u);
    fs.readFile(f, (e, d) => e ? res.writeHead(404).end() : res.writeHead(200, { "content-type": T[path.extname(f)] || "application/octet-stream" }).end(d));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
  let W = 2; // pose wiggle room: wide for the first (baseline) fit, then narrow
  const evaluate = async (patch) => {
    execSync(`node scripts/build-models.mjs ${id}`, { cwd: repo, env: { ...process.env, FAST: "1", OUT_DIR: varDir, SPEC_PATCH: JSON.stringify(patch) }, stdio: "ignore" });
    let sum = 0; const per = []; let dimPen = 0;
    for (const cfg of [...new Set(photos.map((p) => p.cfg))]) {
      const hide = (cfg === "up" ? "gearL,gearR,gearN,wheelL,wheelR,wheelN,gearDoors," : "") + "propDisc,prop";
      const rot = cfg === "land" ? "flapL:-30,flapR:-30" : "";
      await page.goto(`http://127.0.0.1:${port}/fit.html?id=${id}&src=/var/${id}.glb&hide=${hide}&rot=${rot}&R=512&N=320`);
      await page.waitForFunction(() => document.title === "ready", null, { timeout: 60000 });
      if (REAL[id] && !dimPen) {
        const d = await page.evaluate(() => window.dims);
        const err = [d.max[0] - d.min[0], d.max[2] - d.min[2]].map((v, k) => Math.abs(v / REAL[id][k] - 1));
        dimPen = err.reduce((a, e) => a + 0.5 * Math.max(0, e - 0.01), 0) + 1e-9;
      }
      for (const p of photos.filter((p) => p.cfg === cfg)) {
        await page.evaluate((m) => window.setPhoto(m), p.seg);
        const { az, el, roll, fov } = p.pose;
        const r = await page.evaluate(([a, e, ro, f]) => window.search(a, e, ro, f), [range(az - W, az + W, 1), range(el - W, el + W, 1), range(roll - W, roll + W, 1), fov]);
        p.trial = { az: r[0][1], el: r[0][2], roll: r[0][3], fov };
        sum += r[0][0]; per.push(r[0][0].toFixed(3));
      }
    }
    return { score: sum / photos.length - dimPen, per: per.map(Number) };
  };
  const key = (p) => p.path + p.op;
  let patch = [];
  let best = await evaluate(patch);
  for (const p of photos) p.pose = p.trial;
  W = 1;
  best = await evaluate(patch);
  console.log("baseline", best.score.toFixed(4), best.per.map((v) => v.toFixed(3)).join(" "));
  const rounds = Number(roundsArg);
  for (let r = 0; r < rounds; r++) {
    for (const prm of params) {
      const step = prm.step / 2 ** r;
      for (const dir of [1, -1]) {
        let improved = true;
        while (improved) {
          improved = false;
          const cur = patch.find((q) => q[0] === prm.path && q[1] === prm.op);
          const val = (cur ? cur[2] : prm.op === "*" ? 1 : 0) + dir * step;
          if (prm.max != null && val > prm.max) break;
          if (prm.min != null && val < prm.min) break;
          const trial = patch.filter((q) => !(q[0] === prm.path && q[1] === prm.op)).concat([[prm.path, prm.op, Math.round(val * 1000) / 1000]]);
          const t0 = Date.now();
          const res = await evaluate(trial);
          console.log("  try", prm.path, prm.op, val.toFixed(3), res.score.toFixed(4), `${((Date.now() - t0) / 1000).toFixed(0)}s`);
          // Keep it only if the photos agree: better on average, and at least as many photos
          // better as worse (one odd photo must not drag the shape its way).
          const up = res.per.filter((v, i) => v > best.per[i] + 0.0005).length;
          const down = res.per.filter((v, i) => v < best.per[i] - 0.0005).length;
          if (res.score > best.score + 0.001 && up > down) {
            best = res; patch = trial; improved = true;
            for (const p of photos) p.pose = p.trial;
            console.log("keep", prm.path, prm.op, val.toFixed(3), "->", res.score.toFixed(4), res.per.map((v) => v.toFixed(3)).join(" "));
          }
        }
      }
    }
  }
  console.log("FINAL", best.score.toFixed(4), JSON.stringify(patch));
  fs.writeFileSync(path.join(here, `${id}/tuned.json`), JSON.stringify({ score: best.score, patch }, null, 1));
  await browser.close(); server.close();
})();
