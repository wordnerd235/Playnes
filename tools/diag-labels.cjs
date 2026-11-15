// Dev tool: audit the flying screen's labels at several screen sizes, for a playne and the
// Chinook: any label overlapping a different control or label, or cut off by its container.
// Usage: node tools/diag-labels.cjs <base-url> <out-dir>
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  let total = 0;
  for (const [w, h] of [[1180, 820], [1024, 768], [874, 402]]) {
    for (const plane of ["c172", "ch47"]) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
      await page.goto(base);
      await page.click(".big-go");
      await page.waitForSelector(".home-grid", { timeout: 60000 });
      await page.evaluate((plane) => {
        const p = window.playnes.progress;
        p.tourDone = true;
        p.heliTourDone = true;
        p.unlockAll = true;
        p.selectedPlane = plane;
        localStorage.setItem("playnes.freeSave.v1", "");
        window.playnes.startMission({ kind: "sandbox", airport: "TRI" });
      }, plane);
      await page.waitForFunction(() => window.playnes.flight && window.playnes.flight.phase === "free", null, { timeout: 120000 });
      await page.waitForTimeout(1500);
      const issues = await page.evaluate(() => {
        const hud = document.querySelector(".hud");
        const visible = (el) => {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !el.closest("[hidden]");
        };
        // Controls: the things a finger aims at.
        const controls = [...hud.querySelectorAll(".hud-btn, .lever, .flap-lever, .yoke, .look-pad, .minimap, .gauge, .att, .slide-btn, .hud-route, .round-btn")].filter(visible);
        // Labels: elements with their own visible text.
        const labels = [...hud.querySelectorAll("*")].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
        const name = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")} "${el.textContent.trim().slice(0, 18)}"`;
        const ownControl = (el) => controls.find((c) => c.contains(el)) ?? null;
        const textRect = (el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getBoundingClientRect();
        };
        const hit = (a, b, pad = 1) => a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
        const found = [];
        for (const l of labels) {
          const tr = textRect(l);
          if (tr.width === 0) continue;
          const mine = ownControl(l);
          // Overlapping a different control.
          for (const c of controls) {
            if (c === mine || c.contains(l) || l.contains(c) || (mine && mine.contains(c))) continue;
            if (hit(tr, c.getBoundingClientRect())) found.push(`overlaps control: ${name(l)} ~ ${name(c)}`);
          }
          // Overlapping another label from a different control.
          for (const o of labels) {
            if (o === l || o.contains(l) || l.contains(o) || ownControl(o) === mine) continue;
            const or = textRect(o);
            if (or.width && hit(tr, or) && name(l) < name(o)) found.push(`overlaps label: ${name(l)} ~ ${name(o)}`);
          }
          // Cut off: text sticks out of an ancestor that hides overflow (or off screen).
          for (let a = l.parentElement; a && a !== hud; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (cs.overflow === "visible" && cs.overflowX === "visible" && cs.overflowY === "visible") continue;
            const ar = a.getBoundingClientRect();
            if (tr.left < ar.left - 1 || tr.right > ar.right + 1 || tr.top < ar.top - 1 || tr.bottom > ar.bottom + 1) found.push(`cut off: ${name(l)} by ${name(a)}`);
            break;
          }
          if (tr.left < 0 || tr.top < 0 || tr.right > innerWidth || tr.bottom > innerHeight) found.push(`off screen: ${name(l)}`);
        }
        return [...new Set(found)];
      });
      console.log(`${w}x${h} ${plane}: ${issues.length ? "" : "no problems"}`);
      for (const i of issues) console.log("   " + i);
      total += issues.length;
      await page.screenshot({ path: path.join(out, `labels-${w}-${plane}.png`) });
      await page.close();
    }
  }
  console.log(`total issues: ${total}`);
  await browser.close();
})();
