// node dims.cjs id...: true overall span / length / height of each model (all parts, gear hidden)
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const repo = path.join(__dirname, "..", ".."), here = __dirname;
const real = {c172:[11.0,8.28,2.72],phenom100:[12.3,12.82,4.35],pc12:[16.28,14.4,4.26],hondajet:[12.12,12.99,4.54],phenom300:[16.2,15.64,5.1],pc24:[17.0,16.85,5.4],latitude:[22.05,18.97,6.38],praetor600:[21.5,20.74,6.44],challenger3500:[21.0,20.92,6.1],falcon8x:[26.29,24.46,7.94],g650er:[30.36,30.41,7.82],g700:[31.39,33.48,7.75],global8000:[31.7,33.8,8.2],f16:[9.96,15.06,4.88],ch47:[18.3,30.1,5.7]};
(async () => {
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]); const f = u.startsWith("/repo/") ? path.join(repo, u.slice(6)) : path.join(here, u); fs.readFile(f, (e, d) => e ? res.writeHead(404).end() : res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : f.endsWith(".js") ? "text/javascript" : "application/octet-stream" }).end(d)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch(); const page = await browser.newPage();
  for (const id of process.argv.slice(2)) {
    const src = process.env.SRC ? `&src=${process.env.SRC}/${id}.glb` : "";
    await page.goto(`http://127.0.0.1:${server.address().port}/fit.html?id=${id}${src}&hide=gearL,gearR,gearN,wheelL,wheelR,wheelN,gearDoors,propDisc,prop,rotorF,rotorR,pilot,burner`);
    await page.waitForFunction(() => document.title === "ready");
    const d = await page.evaluate(() => window.dims); const r = real[id] || [0, 0, 0];
    const s = d.max[0] - d.min[0], l = d.max[2] - d.min[2], h = d.max[1];
    console.log(id.padEnd(15), `span ${s.toFixed(2)} (real ${r[0]}, ${(100 * (s / r[0] - 1)).toFixed(1)}%)  length ${l.toFixed(2)} (real ${r[1]}, ${(100 * (l / r[1] - 1)).toFixed(1)}%)  top ${h.toFixed(2)} (real height ${r[2]})`);
  }
  await browser.close(); server.close();
})();
