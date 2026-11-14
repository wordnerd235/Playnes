// Cockpit view: an inside-the-playne overlay (window frame, glareshield and instrument panel)
// drawn over the 3D world, which shows through the windows.
// Piston playnes get classic round dials; turboprops and jets get glass screens.

import type { AircraftDef } from "../data/aircraft.ts";

export interface CockpitData {
  iasKt: number;
  altFt: number;
  heading: number;
  pitch: number;
  bank: number;
  vsFpm: number;
  throttle: number;
  flaps: number;
  gearDown: boolean;
  fixedGear: boolean;
}

const NS = "http://www.w3.org/2000/svg";
const W = 1600;
const H = 1000;

function s(tag: string, attrs: Record<string, string | number> = {}, parent?: Element): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
}

/** One rotating needle + its transform, for round gauges. */
interface Needle {
  el: SVGElement;
  cx: number;
  cy: number;
}

export class Cockpit {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private glass: boolean;
  private horizon!: SVGElement;
  private horizonClipCx = 0;
  private horizonClipCy = 0;
  private texts: Record<string, SVGElement> = {};
  private needles: Record<string, Needle> = {};
  private bars: Record<string, SVGElement> = {};
  private rose!: SVGElement;
  private roseC = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private ac: AircraftDef) {
    this.el = document.createElement("div");
    this.el.className = "cockpit";
    this.el.hidden = true;
    this.glass = ac.kind !== "piston";
    this.svg = s("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMax slice" }) as SVGSVGElement;
    this.el.append(this.svg);
    this.build();
    parent.prepend(this.el);
  }

  show(on: boolean): void {
    this.el.hidden = !on;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  // ------------------------------------------------------------------ drawing

  private build(): void {
    const root = this.svg;
    const defs = s("defs", {}, root);
    const g1 = s("linearGradient", { id: "ck-panel", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    const panelTop = this.glass ? "#2b3138" : "#2e2e2e";
    const panelBot = this.glass ? "#171b20" : "#1a1a1a";
    s("stop", { offset: 0, "stop-color": panelTop }, g1);
    s("stop", { offset: 1, "stop-color": panelBot }, g1);
    const g2 = s("linearGradient", { id: "ck-frame", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    s("stop", { offset: 0, "stop-color": "#3a4048" }, g2);
    s("stop", { offset: 1, "stop-color": "#22262b" }, g2);
    const sky = s("linearGradient", { id: "ck-sky", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    s("stop", { offset: 0, "stop-color": "#1f6fd1" }, sky);
    s("stop", { offset: 1, "stop-color": "#6fb4ff" }, sky);
    const gnd = s("linearGradient", { id: "ck-gnd", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    s("stop", { offset: 0, "stop-color": "#a0652e" }, gnd);
    s("stop", { offset: 1, "stop-color": "#5e3a17" }, gnd);

    // --- Window frame: roof, side posts and (jets) a center post.
    const frame = s("g", { fill: "url(#ck-frame)" }, root);
    if (this.ac.shape.wing === "high") {
      // High wing: the wing root and roof fill the top of the view.
      s("path", { d: `M0 0 H${W} V120 Q${W / 2} 160 0 120 Z` }, frame);
      s("path", { d: `M0 0 H140 L260 620 H0 Z` }, frame);
      s("path", { d: `M${W} 0 H${W - 140} L${W - 260} 620 H${W} Z` }, frame);
    } else {
      s("path", { d: `M0 0 H${W} V70 Q${W / 2} 120 0 70 Z` }, frame);
      s("path", { d: `M0 0 H90 L330 620 H0 Z` }, frame);
      s("path", { d: `M${W} 0 H${W - 90} L${W - 330} 620 H${W} Z` }, frame);
      // Jets have a centre post between the windshields; a fighter's bubble canopy doesn't.
      if (this.ac.kind !== "fighter") s("path", { d: `M${W / 2 - 16} 90 L${W / 2 + 16} 90 L${W / 2 + 26} 610 L${W / 2 - 26} 610 Z` }, frame);
    }

    // --- Glareshield and panel.
    s("path", { d: `M0 610 Q${W / 2} 560 ${W} 610 V${H} H0 Z`, fill: "url(#ck-panel)" }, root);
    s("path", { d: `M0 600 Q${W / 2} 548 ${W} 600 L${W} 640 Q${W / 2} 590 0 640 Z`, fill: "#111417" }, root);

    // Instruments sit between the yoke pad (left) and the buttons (right) of the HUD.
    const inst = s("g", {}, root);
    if (this.glass) {
      inst.setAttribute("transform", "translate(728 812) scale(0.86) translate(-830 -812)");
      this.buildGlass(inst);
    } else {
      inst.setAttribute("transform", "translate(716 820) scale(0.86) translate(-800 -820)");
      this.buildSixPack(inst);
    }
  }

  private screen(root: Element, x: number, y: number, w: number, h: number): SVGElement {
    s("rect", { x: x - 10, y: y - 10, width: w + 20, height: h + 20, rx: 18, fill: "#0b0d10" }, root);
    return s("rect", { x, y, width: w, height: h, rx: 8, fill: "#05070a" }, root);
  }

  private buildGlass(root: Element): void {
    // PFD: attitude, speed and altitude.
    const px = 470;
    const py = 660;
    const pw = 380;
    const ph = 300;
    this.screen(root, px, py, pw, ph);
    const clipId = "ck-pfd-clip";
    const clip = s("clipPath", { id: clipId }, root);
    s("rect", { x: px, y: py, width: pw, height: ph, rx: 8 }, clip);
    const att = s("g", { "clip-path": `url(#${clipId})` }, root);
    this.horizonClipCx = px + pw / 2;
    this.horizonClipCy = py + ph / 2;
    this.horizon = s("g", {}, att);
    s("rect", { x: px - 400, y: py - 600, width: pw + 800, height: 600 + ph / 2, fill: "url(#ck-sky)" }, this.horizon);
    s("rect", { x: px - 400, y: py + ph / 2, width: pw + 800, height: 600 + ph / 2, fill: "url(#ck-gnd)" }, this.horizon);
    s("line", { x1: px - 400, y1: py + ph / 2, x2: px + pw + 400, y2: py + ph / 2, stroke: "#fff", "stroke-width": 3 }, this.horizon);
    for (const p of [-20, -10, 10, 20]) {
      const yy = py + ph / 2 - p * 6;
      s("line", { x1: px + pw / 2 - 30, y1: yy, x2: px + pw / 2 + 30, y2: yy, stroke: "#fff", "stroke-width": 2 }, this.horizon);
    }
    // Fixed plane symbol.
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    s("path", { d: `M${cx - 90} ${cy} H${cx - 30} L${cx} ${cy + 18} L${cx + 30} ${cy} H${cx + 90}`, stroke: "#ffd21f", "stroke-width": 8, fill: "none", "stroke-linejoin": "round" }, att);
    // Speed and altitude boxes.
    s("rect", { x: px + 6, y: cy - 26, width: 92, height: 52, rx: 6, fill: "#000", stroke: "#fff", "stroke-width": 2 }, att);
    this.texts.ias = s("text", { x: px + 52, y: cy + 14, fill: "#fff", "font-size": 34, "font-weight": 800, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, att);
    s("rect", { x: px + pw - 118, y: cy - 26, width: 112, height: 52, rx: 6, fill: "#000", stroke: "#fff", "stroke-width": 2 }, att);
    this.texts.alt = s("text", { x: px + pw - 62, y: cy + 14, fill: "#fff", "font-size": 32, "font-weight": 800, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, att);
    s("text", { x: px + 52, y: py + 26, fill: "#9fe", "font-size": 18, "font-weight": 700, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, att).textContent = "KNOTS";
    s("text", { x: px + pw - 62, y: py + 26, fill: "#9fe", "font-size": 18, "font-weight": 700, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, att).textContent = "FEET";

    // MFD: compass rose, engine power bars, gear and flaps.
    const mx = 890;
    const my = 660;
    const mw = 300;
    const mh = 300;
    this.screen(root, mx, my, mw, mh);
    this.roseC = { x: mx + 120, y: my + 150 };
    s("circle", { cx: this.roseC.x, cy: this.roseC.y, r: 104, fill: "#0d1a26", stroke: "#3a5a78", "stroke-width": 2 }, root);
    this.rose = s("g", {}, root);
    for (let d = 0; d < 360; d += 30) {
      const a = (d * Math.PI) / 180;
      const r1 = 104;
      const r2 = d % 90 === 0 ? 82 : 92;
      s("line", { x1: this.roseC.x + Math.sin(a) * r1, y1: this.roseC.y - Math.cos(a) * r1, x2: this.roseC.x + Math.sin(a) * r2, y2: this.roseC.y - Math.cos(a) * r2, stroke: "#fff", "stroke-width": 3 }, this.rose);
      if (d % 90 === 0) {
        const t = s("text", { x: this.roseC.x + Math.sin(a) * 64, y: this.roseC.y - Math.cos(a) * 64 + 10, fill: d === 0 ? "#ff5a5a" : "#fff", "font-size": 28, "font-weight": 900, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, this.rose);
        t.textContent = ["N", "E", "S", "W"][d / 90];
      }
    }
    s("path", { d: `M${this.roseC.x} ${this.roseC.y - 30} L${this.roseC.x + 14} ${this.roseC.y + 18} L${this.roseC.x} ${this.roseC.y + 8} L${this.roseC.x - 14} ${this.roseC.y + 18} Z`, fill: "#ffd21f" }, root);
    // Engine power bars (one per engine).
    const engines = this.ac.shape.engines === "rear-twin" || this.ac.shape.engines === "over-wing" ? 2 : this.ac.shape.engines === "rear-tri" ? 3 : 1;
    for (let i = 0; i < engines; i++) {
      const bx = mx + 238 + i * (48 / engines) - (engines - 1) * 8;
      s("rect", { x: bx, y: my + 40, width: 14, height: 180, rx: 4, fill: "#1b2733" }, root);
      this.bars[`eng${i}`] = s("rect", { x: bx, y: my + 220, width: 14, height: 0, rx: 4, fill: "#38d36b" }, root);
    }
    s("text", { x: mx + 252, y: my + 250, fill: "#9fe", "font-size": 18, "font-weight": 700, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, root).textContent = "POWER";
    this.texts.gear = s("text", { x: mx + 252, y: my + 280, fill: "#38d36b", "font-size": 18, "font-weight": 800, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, root);
  }

  private gauge(root: Element, cx: number, cy: number, label: string, ticks: number): void {
    s("circle", { cx, cy, r: 92, fill: "#0b0b0b", stroke: "#555", "stroke-width": 6 }, root);
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2;
      s("line", { x1: cx + Math.sin(a) * 80, y1: cy - Math.cos(a) * 80, x2: cx + Math.sin(a) * 68, y2: cy - Math.cos(a) * 68, stroke: "#eee", "stroke-width": 3 }, root);
    }
    s("text", { x: cx, y: cy + 46, fill: "#ccc", "font-size": 16, "font-weight": 700, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, root).textContent = label;
  }

  private needle(root: Element, id: string, cx: number, cy: number, len: number, color = "#fff"): void {
    const el = s("g", {}, root);
    s("path", { d: `M${cx - 5} ${cy + 12} L${cx} ${cy - len} L${cx + 5} ${cy + 12} Z`, fill: color }, el);
    s("circle", { cx, cy, r: 8, fill: "#333" }, root);
    this.needles[id] = { el, cx, cy };
  }

  private buildSixPack(root: Element): void {
    const xs = [600, 800, 1000];
    const ys = [720, 920];
    // Top row: airspeed, attitude, altimeter. Bottom row: turn, heading, vertical speed.
    this.gauge(root, xs[0], ys[0], "KNOTS", 16);
    this.needle(root, "ias", xs[0], ys[0], 74);
    this.texts.ias = s("text", { x: xs[0], y: ys[0] - 26, fill: "#fff", "font-size": 26, "font-weight": 800, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, root);

    // Attitude indicator.
    const cx = xs[1];
    const cy = ys[0];
    const clip = s("clipPath", { id: "ck-ai-clip" }, root);
    s("circle", { cx, cy, r: 86 }, clip);
    s("circle", { cx, cy, r: 92, fill: "#0b0b0b", stroke: "#555", "stroke-width": 6 }, root);
    const att = s("g", { "clip-path": "url(#ck-ai-clip)" }, root);
    this.horizonClipCx = cx;
    this.horizonClipCy = cy;
    this.horizon = s("g", {}, att);
    s("rect", { x: cx - 300, y: cy - 300, width: 600, height: 300, fill: "url(#ck-sky)" }, this.horizon);
    s("rect", { x: cx - 300, y: cy, width: 600, height: 300, fill: "url(#ck-gnd)" }, this.horizon);
    s("line", { x1: cx - 300, y1: cy, x2: cx + 300, y2: cy, stroke: "#fff", "stroke-width": 3 }, this.horizon);
    s("path", { d: `M${cx - 56} ${cy} H${cx - 18} L${cx} ${cy + 12} L${cx + 18} ${cy} H${cx + 56}`, stroke: "#ffb21f", "stroke-width": 6, fill: "none" }, att);

    this.gauge(root, xs[2], ys[0], "FEET", 10);
    this.needle(root, "alt100", xs[2], ys[0], 76);
    this.needle(root, "alt1000", xs[2], ys[0], 48, "#ffd21f");
    this.texts.alt = s("text", { x: xs[2], y: ys[0] - 26, fill: "#fff", "font-size": 24, "font-weight": 800, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, root);

    // Turn coordinator: a little plane that banks.
    this.gauge(root, xs[0], ys[1], "TURN", 0);
    const tp = s("g", {}, root);
    s("path", { d: `M${xs[0] - 60} ${ys[1]} H${xs[0] + 60} M${xs[0]} ${ys[1] - 14} V${ys[1] + 10}`, stroke: "#fff", "stroke-width": 8, "stroke-linecap": "round" }, tp);
    s("circle", { cx: xs[0], cy: ys[1], r: 12, fill: "#fff" }, tp);
    this.needles.turn = { el: tp, cx: xs[0], cy: ys[1] };

    // Heading indicator.
    this.gauge(root, xs[1], ys[1], "", 0);
    this.roseC = { x: xs[1], y: ys[1] };
    this.rose = s("g", {}, root);
    for (let d = 0; d < 360; d += 30) {
      const a = (d * Math.PI) / 180;
      s("line", { x1: xs[1] + Math.sin(a) * 84, y1: ys[1] - Math.cos(a) * 84, x2: xs[1] + Math.sin(a) * 70, y2: ys[1] - Math.cos(a) * 70, stroke: "#fff", "stroke-width": 3 }, this.rose);
      if (d % 90 === 0) {
        const t = s("text", { x: xs[1] + Math.sin(a) * 52, y: ys[1] - Math.cos(a) * 52 + 9, fill: d === 0 ? "#ff5a5a" : "#fff", "font-size": 26, "font-weight": 900, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, this.rose);
        t.textContent = ["N", "E", "S", "W"][d / 90];
      }
    }
    s("path", { d: `M${xs[1]} ${ys[1] - 26} L${xs[1] + 12} ${ys[1] + 14} L${xs[1]} ${ys[1] + 6} L${xs[1] - 12} ${ys[1] + 14} Z`, fill: "#ffb21f" }, root);

    this.gauge(root, xs[2], ys[1], "UP / DOWN", 12);
    this.needle(root, "vs", xs[2], ys[1], 74);

    // Throttle knob position (a power bar on the right of the panel).
    s("rect", { x: 1130, y: 700, width: 18, height: 220, rx: 6, fill: "#111" }, root);
    this.bars.eng0 = s("rect", { x: 1130, y: 920, width: 18, height: 0, rx: 6, fill: "#38d36b" }, root);
    s("text", { x: 1139, y: 950, fill: "#ccc", "font-size": 16, "font-weight": 700, "text-anchor": "middle", "font-family": "system-ui, sans-serif" }, root).textContent = "POWER";
  }

  // ------------------------------------------------------------------ per frame

  update(d: CockpitData): void {
    if (this.el.hidden) return;
    const deg = (v: number) => v;
    // Horizon: rotate opposite the bank, move with pitch.
    const ppd = this.glass ? 6 : 3.2;
    this.horizon.setAttribute("transform", `rotate(${-d.bank} ${this.horizonClipCx} ${this.horizonClipCy}) translate(0 ${d.pitch * ppd})`);
    this.rose.setAttribute("transform", `rotate(${-d.heading} ${this.roseC.x} ${this.roseC.y})`);
    this.texts.ias.textContent = String(Math.round(d.iasKt));
    this.texts.alt.textContent = String(Math.round(d.altFt / 10) * 10);
    if (this.texts.gear) this.texts.gear.textContent = d.fixedGear ? "" : d.gearDown ? "WHEELS DOWN" : "WHEELS UP";
    if (this.texts.gear) this.texts.gear.setAttribute("fill", d.gearDown ? "#38d36b" : "#cfd8e3");
    const rot = (id: string, a: number) => {
      const n = this.needles[id];
      if (n) n.el.setAttribute("transform", `rotate(${deg(a)} ${n.cx} ${n.cy})`);
    };
    rot("ias", Math.min(d.iasKt, 200) * 1.6 - 160 + 160);
    rot("alt100", ((d.altFt % 1000) / 1000) * 360);
    rot("alt1000", ((d.altFt % 10000) / 10000) * 360);
    rot("vs", -90 + Math.max(-2000, Math.min(2000, d.vsFpm)) * 0.08);
    rot("turn", Math.max(-30, Math.min(30, d.bank)));
    for (const [k, bar] of Object.entries(this.bars)) {
      void k;
      const full = this.glass ? 180 : 220;
      const h = full * Math.max(0, Math.min(1, d.throttle));
      const y0 = this.glass ? 880 : 920;
      bar.setAttribute("height", String(h));
      bar.setAttribute("y", String(y0 - h));
    }
  }
}

/** Passenger window view: an oval cabin window with the cabin wall around it. */
export class PassengerWindow {
  readonly el: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "pax-window";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="pax-hole"></div><div class="pax-shade"></div>`;
    parent.prepend(this.el);
  }

  show(on: boolean): void {
    this.el.hidden = !on;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }
}
