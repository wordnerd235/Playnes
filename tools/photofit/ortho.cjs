// node ortho.cjs <id> <view> <px per m> <out.png> [src]: orthographic outline of the visible model (gear down)
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const repo = path.join(__dirname, "..", ".."), here = __dirname;
(async () => {
  const [id, view, s, out, src, nogear] = process.argv.slice(2);
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]); const f = u.startsWith("/repo/") ? path.join(repo, u.slice(6)) : path.join(here, u); fs.readFile(f, (e, d) => e ? res.writeHead(404).end() : res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : f.endsWith(".js") ? "text/javascript" : "application/octet-stream" }).end(d)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/fit.html?id=${id}&hide=propDisc,rotorF,rotorR,burner,pilot${nogear === "1" ? ",gearL,gearR,gearN,wheelL,wheelR,wheelN,gearDoors" : ""}${src && src !== "-" ? "&src=" + src : ""}`);
  await page.waitForFunction(() => document.title === "ready");
  const r = await page.evaluate(([v, s]) => window.ortho(v, s), [view, Number(s)]);
  fs.writeFileSync(out, Buffer.from(r.url.split(",")[1], "base64"));
  console.log(JSON.stringify({ w: r.w, h: r.h, min: r.min, max: r.max }));
  await browser.close(); server.close();
})();
