// Head-up display symbology for playnes with a 3D cockpit (the F-16): green figures drawn on
// the HUD glass in front of the pilot: speed on the left, height on the right, heading on top,
// and a horizon line with a pitch ladder that lines up with the real horizon seen through it.
// The game tells it where the glass is on screen each frame (it moves when you look around).

import { setAttr, setText } from "./dom.ts";

export interface HudGlassData {
  iasKt: number;
  altFt: number;
  heading: number;
  pitch: number;
  bank: number;
  mach: number;
  /** g being pulled (1 = level flight). */
  load: number;
}

/** Where the glass is on screen: centre and half-height in CSS pixels, and the angle half its height covers. */
export interface HudGlassRect {
  x: number;
  y: number;
  half: number;
  degHalf: number;
}

const NS = "http://www.w3.org/2000/svg";
const GREEN = "#62ff8e";

function s(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.append(e);
  return e;
}

export class HudGlass {
  readonly el: HTMLElement;
  private ladder: SVGElement;
  private texts: Record<string, SVGElement> = {};
  private unitsPerDeg = 16;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "hud-glass";
    this.el.hidden = true;
    // -100..100 in both directions = the glass.
    const svg = s("svg", { viewBox: "-100 -100 200 200", preserveAspectRatio: "none" }, this.el);
    const line = { stroke: GREEN, "stroke-width": 1.6, fill: "none", "stroke-linecap": "round" };
    const text = (id: string, x: number, y: number, size: number, anchor: string) => {
      this.texts[id] = s("text", { x, y, fill: GREEN, "font-size": size, "font-family": "ui-monospace, Menlo, monospace", "font-weight": 700, "text-anchor": anchor }, svg);
    };
    // Horizon and pitch ladder (every 5 degrees), turned and moved as one.
    this.ladder = s("g", {}, svg);
    s("line", { x1: -220, y1: 0, x2: -14, y2: 0, ...line }, this.ladder);
    s("line", { x1: 14, y1: 0, x2: 220, y2: 0, ...line }, this.ladder);
    for (let p = -90; p <= 90; p += 5) {
      if (p === 0) continue;
      const g = s("g", { "data-pitch": p }, this.ladder);
      const dash = p < 0 ? "4 3" : "";
      s("line", { x1: -46, y1: 0, x2: -16, y2: 0, ...line, "stroke-dasharray": dash }, g);
      s("line", { x1: 16, y1: 0, x2: 46, y2: 0, ...line, "stroke-dasharray": dash }, g);
      s("line", { x1: -46, y1: 0, x2: -46, y2: p > 0 ? 5 : -5, ...line }, g);
      s("line", { x1: 46, y1: 0, x2: 46, y2: p > 0 ? 5 : -5, ...line }, g);
      const t = s("text", { x: 50, y: 4, fill: GREEN, "font-size": 10, "font-family": "ui-monospace, Menlo, monospace", "font-weight": 700 }, g);
      t.textContent = String(Math.abs(p));
    }
    // Where the nose points: a small "W" with wings.
    s("path", { d: "M -12 0 L -5 0 L -2.5 5 L 0 0 L 2.5 5 L 5 0 L 12 0", ...line }, svg);
    // Speed (left), height (right), heading (top), Mach (below the speed).
    s("rect", { x: -98, y: -12, width: 41, height: 21, ...line, "stroke-width": 1.2 }, svg);
    s("rect", { x: 48, y: -12, width: 50, height: 21, ...line, "stroke-width": 1.2 }, svg);
    text("ias", -60, 5, 17, "end");
    text("alt", 95, 5, 15, "end");
    text("hdg", 0, -76, 17, "middle");
    text("mach", -94, 26, 12, "start");
    text("load", -94, 40, 12, "start");
    s("path", { d: "M -4 -72 L 0 -66 L 4 -72", ...line }, svg);
    parent.prepend(this.el);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** Put the symbology over the glass (null = the glass isn't in view). */
  place(r: HudGlassRect | null): void {
    if (!r || r.half < 24) {
      if (!this.el.hidden) this.el.hidden = true;
      return;
    }
    if (this.el.hidden) this.el.hidden = false;
    const st = this.el.style;
    st.left = `${(r.x - r.half).toFixed(1)}px`;
    st.top = `${(r.y - r.half).toFixed(1)}px`;
    st.width = st.height = `${(r.half * 2).toFixed(1)}px`;
    this.unitsPerDeg = 100 / Math.max(1, r.degHalf);
  }

  update(d: HudGlassData): void {
    if (this.el.hidden) return;
    const u = this.unitsPerDeg;
    setAttr(this.ladder, "transform", `rotate(${(-d.bank).toFixed(1)}) translate(0 ${(d.pitch * u).toFixed(1)})`);
    // Each rung sits at its own pitch (set once the scale is known, and when it changes).
    if (this.ladder.getAttribute("data-u") !== u.toFixed(2)) {
      this.ladder.setAttribute("data-u", u.toFixed(2));
      for (const g of this.ladder.querySelectorAll("g[data-pitch]")) g.setAttribute("transform", `translate(0 ${(-Number(g.getAttribute("data-pitch")) * u).toFixed(1)})`);
    }
    setText(this.texts.ias, String(Math.round(d.iasKt)));
    setText(this.texts.alt, String(Math.round(d.altFt / 10) * 10));
    setText(this.texts.hdg, String(Math.round(((d.heading % 360) + 360) % 360)).padStart(3, "0"));
    setText(this.texts.mach, d.mach >= 0.7 ? `M ${d.mach.toFixed(2)}` : "");
    setText(this.texts.load, `G ${d.load.toFixed(1)}`);
  }
}
