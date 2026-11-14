// Free Flight maps: a heading-up minimap on the HUD and a full-screen map of the playable area.
// Both draw the bundled cartoon map tiles, so they work offline and in every world mode.

import { AIRPORTS, LANDMARKS, type Airport } from "../data/airports.ts";
import { REGION } from "../data/region.ts";
import { bearing, distance, type LatLon } from "../sim/geo.ts";

const TILE = 256;

function px(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

class TileCache {
  private imgs = new Map<string, HTMLImageElement>();
  get(z: number, x: number, y: number, onload: () => void): HTMLImageElement | null {
    const key = `${z}/${x}/${y}`;
    let img = this.imgs.get(key);
    if (!img) {
      img = new Image();
      img.onload = onload;
      img.src = `./world/tiles/${key}.webp`;
      this.imgs.set(key, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }
}
const tiles = new TileCache();

export interface MapState {
  pos: LatLon;
  heading: number;
  target: Airport | null;
}

/** Round, heading-up minimap with nearby airports and landmarks. Tap to open the big map. */
export class Minimap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dirty = true;
  private last = 0;
  private state: MapState | null = null;
  rangeM = 14000;

  constructor(onOpen: () => void) {
    this.el = document.createElement("button");
    this.el.className = "minimap";
    this.el.setAttribute("aria-label", "Open the big map");
    this.canvas = document.createElement("canvas");
    this.el.append(this.canvas);
    const label = document.createElement("span");
    label.className = "minimap-label";
    label.textContent = "MAP";
    this.el.append(label);
    this.ctx = this.canvas.getContext("2d")!;
    this.el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onOpen();
    });
  }

  update(s: MapState): void {
    this.state = s;
    const now = performance.now();
    if (now - this.last < 100 && !this.dirty) return;
    this.last = now;
    this.dirty = false;
    this.draw();
  }

  private draw(): void {
    const s = this.state;
    if (!s) return;
    const size = this.el.clientWidth || 170;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== size * dpr) {
      this.canvas.width = size * dpr;
      this.canvas.height = size * dpr;
      this.canvas.style.width = `${size}px`;
      this.canvas.style.height = `${size}px`;
    }
    const c = this.ctx;
    const W = size * dpr;
    const R = W / 2;
    const z = 10;
    const center = px(s.pos.lat, s.pos.lon, z);
    const mPerPx = (156543.03392 * Math.cos((s.pos.lat * Math.PI) / 180)) / 2 ** z;
    const scale = (R / this.rangeM) * mPerPx; // canvas px per tile px
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath();
    c.arc(R, R, R - 1, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = "#8fcf72";
    c.fillRect(0, 0, W, W);
    c.translate(R, R);
    c.rotate((-s.heading * Math.PI) / 180);
    const span = R / scale;
    const t0x = Math.floor((center.x - span * 1.5) / TILE);
    const t1x = Math.floor((center.x + span * 1.5) / TILE);
    const t0y = Math.floor((center.y - span * 1.5) / TILE);
    const t1y = Math.floor((center.y + span * 1.5) / TILE);
    for (let tx = t0x; tx <= t1x; tx++) {
      for (let ty = t0y; ty <= t1y; ty++) {
        const img = tiles.get(z, tx, ty, () => (this.dirty = true));
        if (img) c.drawImage(img, (tx * TILE - center.x) * scale, (ty * TILE - center.y) * scale, TILE * scale + 1, TILE * scale + 1);
      }
    }
    const toCanvas = (p: LatLon) => {
      const q = px(p.lat, p.lon, z);
      return { x: (q.x - center.x) * scale, y: (q.y - center.y) * scale };
    };
    if (s.target) {
      const t = toCanvas(s.target);
      c.strokeStyle = "#ff2fa0";
      c.lineWidth = 3 * dpr;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(t.x, t.y);
      c.stroke();
    }
    const upright = (x: number, y: number, draw: () => void) => {
      c.save();
      c.translate(x, y);
      c.rotate((s.heading * Math.PI) / 180);
      draw();
      c.restore();
    };
    for (const l of LANDMARKS) {
      if (distance(s.pos, l) > this.rangeM * 1.4) continue;
      const q = toCanvas(l);
      upright(q.x, q.y, () => {
        c.font = `${14 * dpr}px system-ui`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("⭐", 0, 0);
      });
    }
    for (const a of AIRPORTS) {
      if (distance(s.pos, a) > this.rangeM * 1.5) continue;
      const q = toCanvas(a);
      upright(q.x, q.y, () => {
        c.fillStyle = a === s.target ? "#ff2fa0" : "#1d5d9b";
        c.beginPath();
        c.arc(0, 0, 11 * dpr, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#fff";
        c.font = `bold ${11 * dpr}px system-ui`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("✈", 0, 0);
        c.font = `800 ${11 * dpr}px system-ui`;
        c.lineWidth = 3 * dpr;
        c.strokeStyle = "rgba(16,35,58,.85)";
        c.strokeText(a.code, 0, 19 * dpr);
        c.fillText(a.code, 0, 19 * dpr);
      });
    }
    c.restore();
    // Plane (always pointing up) and north marker.
    c.save();
    c.translate(R, R);
    c.fillStyle = "#ffc21a";
    c.strokeStyle = "#10233a";
    c.lineWidth = 2 * dpr;
    c.beginPath();
    c.moveTo(0, -12 * dpr);
    c.lineTo(9 * dpr, 9 * dpr);
    c.lineTo(0, 4 * dpr);
    c.lineTo(-9 * dpr, 9 * dpr);
    c.closePath();
    c.fill();
    c.stroke();
    const na = (-s.heading * Math.PI) / 180;
    const nx = Math.sin(na) * (R - 12 * dpr);
    const ny = -Math.cos(na) * (R - 12 * dpr);
    c.fillStyle = "#c8262e";
    c.font = `900 ${13 * dpr}px system-ui`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("N", nx, ny);
    c.restore();
  }
}

/** Full-screen map of the playable area. Tap an airport to fly there. */
export class BigMap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layer: HTMLElement;
  private info: HTMLElement;
  private goBtn: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private picked: Airport | null = null;
  private state: MapState | null = null;
  private raf = 0;
  onClose: () => void = () => {};
  onPick: (a: Airport | null) => void = () => {};
  onSelect: (a: Airport) => void = () => {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "bigmap";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="bigmap-top">
        <div class="bigmap-title">Map <span>· the autopilot is flying</span></div>
        <button type="button" class="btn primary bigmap-close">Back to flying</button>
      </div>
      <div class="bigmap-stage"><canvas></canvas><div class="bigmap-layer"></div></div>
      <div class="bigmap-info"><span class="bigmap-info-text">Tap an airport to plan a trip.</span><button type="button" class="btn secondary bigmap-clear" hidden>Clear route</button><button type="button" class="btn secondary bigmap-go" hidden>Fly there</button></div>`;
    this.canvas = this.el.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.layer = this.el.querySelector(".bigmap-layer")!;
    this.info = this.el.querySelector(".bigmap-info-text")!;
    this.goBtn = this.el.querySelector(".bigmap-go")!;
    this.el.querySelector(".bigmap-close")!.addEventListener("click", () => this.onClose());
    this.goBtn.addEventListener("click", () => {
      if (this.picked) this.onPick(this.picked);
      this.onClose();
    });
    this.clearBtn = this.el.querySelector(".bigmap-clear")!;
    this.clearBtn.addEventListener("click", () => {
      this.picked = null;
      if (this.state) this.state = { ...this.state, target: null };
      this.onPick(null);
      this.drawBase();
      this.updateInfo();
    });
    parent.append(this.el);
    window.addEventListener("resize", () => !this.el.hidden && this.layout());
  }

  open(s: MapState): void {
    this.state = s;
    this.picked = s.target;
    this.el.hidden = false;
    this.layout();
    this.updateInfo();
  }

  close(): void {
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  update(s: MapState): void {
    this.state = s;
    if (!this.el.hidden) this.drawPlane();
  }

  private z = 8;
  private origin = { x: 0, y: 0 };
  private scale = 1;

  private layout(): void {
    const stage = this.canvas.parentElement!;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    const nw = px(REGION.north, REGION.west, this.z);
    const se = px(REGION.south, REGION.east, this.z);
    this.scale = Math.min(W / (se.x - nw.x), H / (se.y - nw.y));
    this.origin = { x: nw.x - (W / this.scale - (se.x - nw.x)) / 2, y: nw.y - (H / this.scale - (se.y - nw.y)) / 2 };
    this.drawBase();
    this.placeMarkers();
    this.drawPlane();
  }

  private toScreen(p: LatLon): { x: number; y: number } {
    const q = px(p.lat, p.lon, this.z);
    return { x: (q.x - this.origin.x) * this.scale, y: (q.y - this.origin.y) * this.scale };
  }

  private drawBase(): void {
    const c = this.ctx;
    const dpr = this.canvas.width / this.canvas.clientWidth;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#9ccbe8";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const nw = px(REGION.north, REGION.west, this.z);
    const se = px(REGION.south, REGION.east, this.z);
    for (let tx = Math.floor(nw.x / TILE); tx <= Math.floor(se.x / TILE); tx++) {
      for (let ty = Math.floor(nw.y / TILE); ty <= Math.floor(se.y / TILE); ty++) {
        const img = tiles.get(this.z, tx, ty, () => this.drawBase());
        if (img) c.drawImage(img, (tx * TILE - this.origin.x) * this.scale, (ty * TILE - this.origin.y) * this.scale, TILE * this.scale + 1, TILE * this.scale + 1);
      }
    }
    // Edge of the playable area.
    const a = this.toScreen({ lat: REGION.north, lon: REGION.west });
    const b = this.toScreen({ lat: REGION.south, lon: REGION.east });
    c.strokeStyle = "rgba(255,255,255,.9)";
    c.setLineDash([10, 8]);
    c.lineWidth = 3;
    c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    c.setLineDash([]);
  }

  private placeMarkers(): void {
    this.layer.innerHTML = "";
    for (const l of LANDMARKS) {
      const q = this.toScreen(l);
      const m = document.createElement("div");
      m.className = "bigmap-landmark";
      m.style.left = `${q.x}px`;
      m.style.top = `${q.y}px`;
      m.textContent = "⭐";
      m.title = l.spoken;
      this.layer.append(m);
    }
    for (const a of AIRPORTS) {
      const q = this.toScreen(a);
      const b = document.createElement("button");
      b.type = "button";
      b.className = `bigmap-airport${this.picked === a ? " picked" : ""}`;
      b.style.left = `${q.x}px`;
      b.style.top = `${q.y}px`;
      b.innerHTML = `<span class="ap-dot">✈</span><span class="ap-code">${a.code}</span>`;
      b.addEventListener("click", () => {
        this.picked = a;
        for (const x of Array.from(this.layer.querySelectorAll(".bigmap-airport"))) x.classList.remove("picked");
        b.classList.add("picked");
        this.updateInfo();
        this.onSelect(a);
      });
      this.layer.append(b);
    }
    const plane = document.createElement("div");
    plane.className = "bigmap-plane";
    plane.innerHTML = `<svg viewBox="0 0 48 48"><path d="M24 4c2 0 3 3 3 6v9l15 9v4l-15-4v9l5 4v3l-8-2-8 2v-3l5-4v-9L6 32v-4l15-9v-9c0-3 1-6 3-6z" fill="#ffc21a" stroke="#10233a" stroke-width="2.5"/></svg>`;
    this.layer.append(plane);
  }

  private drawPlane(): void {
    const s = this.state;
    const plane = this.layer.querySelector(".bigmap-plane") as HTMLElement | null;
    if (!s || !plane) return;
    const q = this.toScreen(s.pos);
    plane.style.left = `${q.x}px`;
    plane.style.top = `${q.y}px`;
    plane.style.transform = `translate(-50%, -50%) rotate(${s.heading}deg)`;
  }

  private updateInfo(): void {
    const s = this.state;
    this.clearBtn.hidden = !s?.target;
    if (!this.picked || !s) {
      this.info.textContent = "Tap an airport to plan a trip. The dashed line is the edge of the map.";
      this.goBtn.hidden = true;
      return;
    }
    const nm = Math.round(distance(s.pos, this.picked) / 1852);
    const brg = Math.round(bearing(s.pos, this.picked));
    this.info.textContent = `${this.picked.spoken} (${this.picked.code}): ${nm} nm away, heading ${String(brg).padStart(3, "0")}°. ${this.picked.blurb}`;
    this.goBtn.hidden = false;
    this.goBtn.textContent = `Fly to ${this.picked.code}`;
  }
}
