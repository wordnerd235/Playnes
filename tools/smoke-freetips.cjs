// Dev tool: the grown-up "Free Flight: co-pilot tips" setting. Off: no spoken how-to tips and
// no flashing hints on the controls in Free Flight. On: the intro and takeoff tips come back.
// Usage: node tools/smoke-freetips.cjs <base-url>
const { chromium } = require("playwright");

(async () => {
  const [base] = process.argv.slice(2);
  const browser = await chromium.launch();
  let failed = false;
  const check = (ok, msg) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
    if (!ok) failed = true;
  };
  for (const tips of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: "reduce" });
    await page.goto(base);
    for (let i = 0; i < 30 && !(await page.$(".home-grid")); i++) {
      await page.click(".big-go", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
    await page.evaluate((tips) => {
      const g = window.playnes;
      g.progress.tourDone = true;
      g.progress.selectedPlane = "c172";
      g.settings.freeTips = tips;
      localStorage.setItem("playnes.freeSave.v1", "");
      g.freeSave = null;
      // Record what the co-pilot says and which hints light up.
      window.__said = [];
      window.__prompts = [];
      const say = g.audio.say.bind(g.audio);
      g.audio.say = (line, o) => {
        window.__said.push(line.text);
        return say(line, o);
      };
      const setPrompt = g.hud.setPrompt.bind(g.hud);
      g.hud.setPrompt = (p) => {
        if (p) window.__prompts.push(p);
        return setPrompt(p);
      };
      g.startMission({ kind: "sandbox", airport: "TRI" });
    }, tips);
    await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free" && !window.playnes.flight.paused, null, { timeout: 120000 });
    // Full power down the runway until airborne (the takeoff tip comes past rotation speed).
    await page.evaluate(() => window.playnes.controls.setThrottle(1, false));
    await page.waitForFunction(() => window.playnes.flight.s.speed > window.playnes.flight.p.vr * 1.05, null, { timeout: 240000 });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => ({ said: window.__said, prompts: window.__prompts }));
    console.log(`tips ${tips ? "on" : "off"}: said ${JSON.stringify(r.said)} prompts ${JSON.stringify(r.prompts)}`);
    const intro = r.said.some((t) => t.startsWith("Free flight!"));
    const pull = r.said.some((t) => t.startsWith("Pull back to take off"));
    if (tips) {
      check(intro, "tips on: the Free Flight intro is spoken");
      check(pull && r.prompts.includes("pull"), "tips on: 'pull back' tip and hint on the yoke");
    } else {
      check(!intro && !pull, "tips off: no intro or takeoff tip");
      check(r.prompts.length === 0, "tips off: no flashing hints on the controls");
    }
    await page.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
