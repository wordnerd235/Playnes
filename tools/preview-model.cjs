// Dev tool: a contact sheet of one model from several directions (and posed parts).
// Usage: node tools/preview-model.cjs <id> <out.png> ['view;view;...']
//   each view: "dir=x,y,z&zoom=1&rot=gearL:60&hide=burner&look=x,y,z"   (see preview-model.html)
// Serves the repo itself on a free port.
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const [id = "f16", out = "preview.png", viewsArg] = process.argv.slice(2);
const DEFAULT = ["dir=-1,0.45,0.9", "dir=-1,0.05,0", "dir=0.001,1,0", "dir=0,0.12,1", "dir=0.8,0.5,-1", "dir=-0.7,-0.6,0.9"];
const views = viewsArg ? viewsArg.split(";") : DEFAULT;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json" };
(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    fs.readFile(f, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }).end(data);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const cols = Math.min(3, views.length), rows = Math.ceil(views.length / cols);
  const W = 640, H = 420;
  const shots = [];
  for (const v of views) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`http://127.0.0.1:${port}/tools/preview-model.html?id=${id}&${v}`);
    await page.waitForFunction(() => document.title === "ready", null, { timeout: 60000 });
    shots.push((await page.screenshot()).toString("base64"));
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: W * cols, height: H * rows } });
  await page.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(${cols},${W}px)">${shots.map((s) => `<img src="data:image/png;base64,${s}" style="display:block">`).join("")}</body>`);
  await page.screenshot({ path: out });
  await browser.close();
  server.close();
  console.log("wrote", out);
})();
