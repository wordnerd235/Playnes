// node ortho3.cjs <id> <outprefix> <views json {view: [pxm, nogear]}> [src]: orthographic outlines for several views, one browser
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const repo = path.join(__dirname, "..", ".."), here = __dirname;
(async () => {
  const [id, pre, vj, src] = process.argv.slice(2); const views = JSON.parse(vj);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]); const f = u.startsWith("/repo/") ? path.join(repo, u.slice(6)) : path.join(here, u); fs.readFile(f, (e, d) => e ? res.writeHead(404).end() : res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : f.endsWith(".js") ? "text/javascript" : "application/octet-stream" }).end(d)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  for (const ng of [false, true]) {
    const vs = Object.entries(views).filter(([, [, n]]) => !!n === ng); if (!vs.length) continue;
    await page.goto(`http://127.0.0.1:${server.address().port}/fit.html?id=${id}&hide=propDisc,rotorF,rotorR,burner,pilot${ng ? ",gearL,gearR,gearN,wheelL,wheelR,wheelN,gearDoors" : ""}${src && src !== "-" ? "&src=" + src : ""}`);
    await page.waitForFunction(() => document.title === "ready");
    for (const [v, [s]] of vs) { const r = await page.evaluate(([v, s]) => window.ortho(v, s), [v, s]); fs.writeFileSync(`${pre}_${v}_m.png`, Buffer.from(r.url.split(",")[1], "base64")); }
  }
  await browser.close(); server.close();
})();
