// Free Flight maps: a heading-up minimap on the HUD and a full-screen map of the playable area.
// Both draw the bundled cartoon map tiles, so they work offline and in every world mode.

import { AIRPORTS, LANDMARKS, playableBounds, type Airport } from "../data/airports.ts";

/** The big map's own zoom for positions (tiles are drawn at whatever zoom suits the view). */
const VIEW_Z = 8;
/** The lower 48 states, for the big map's widest zoom. */
const BOUNDS_ALL = { south: 24.3, north: 49.6, west: -125, east: -66.8 };
import { planRoute } from "../sim/route.ts";
import { bearing, distance, type LatLon } from "../sim/geo.ts";

const TILE = 256;

function px(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

/**
 * Map pictures for the minimap and big map. Each decoded tile is ~256 KB, so only the most
 * recently drawn ones are kept (enough for the big map's full screen); the rest reload from
 * the cached file when needed again.
 */
class TileCache {
  private imgs = new Map<string, HTMLImageElement>();
  /** Tiles that don't exist (outside the detailed area): drawn from a coarser tile instead. */
  private missing = new Set<string>();
  private static readonly MAX = 160;
  get(z: number, x: number, y: number, onload: () => void): HTMLImageElement | null {
    const key = `${z}/${x}/${y}`;
    if (this.missing.has(key)) return null;
    let img = this.imgs.get(key);
    if (img) {
      this.imgs.delete(key);
    } else {
      img = new Image();
      img.decoding = "async";
      img.onload = onload;
      img.onerror = () => {
        this.missing.add(key);
        this.imgs.delete(key);
        onload();
      };
      img.src = `./world/tiles/${key}.webp`;
    }
    this.imgs.set(key, img);
    if (this.imgs.size > TileCache.MAX) {
      const oldest = this.imgs.keys().next().value as string;
      const old = this.imgs.get(oldest)!;
      old.onload = null;
      old.onerror = null;
      old.src = "";
      this.imgs.delete(oldest);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  isMissing(z: number, x: number, y: number): boolean {
    return this.missing.has(`${z}/${x}/${y}`);
  }

  /**
   * Draw tile z/x/y at (dx, dy) with the given size. Where the detailed map doesn't reach (the
   * rest of the country has map pictures only up to zoom 8), the matching part of the nearest
   * coarser tile is drawn, enlarged.
   */
  draw(c: CanvasRenderingContext2D, z: number, x: number, y: number, dx: number, dy: number, size: number, onload: () => void): void {
    for (let k = 0; z - k >= 4; k++) {
      const pz = z - k, px_ = x >> k, py_ = y >> k;
      if (this.isMissing(pz, px_, py_)) continue;
      const img = this.get(pz, px_, py_, onload);
      if (!img) return; // still loading (or just found missing: redrawn when known)
      const sub = TILE / 2 ** k;
      c.drawImage(img, (x - (px_ << k)) * sub, (y - (py_ << k)) * sub, sub, sub, dx, dy, size, size);
      return;
    }
  }
}
const tiles = new TileCache();

export interface MapState {
  pos: LatLon;
  heading: number;
  target: Airport | null;
  /** The planned path to the target (curving onto the runway's final approach). */
  route?: LatLon[] | null;
  /** Helicopter: routes go straight to the airport. */
  direct?: boolean;
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
        tiles.draw(c, z, tx, ty, (tx * TILE - center.x) * scale, (ty * TILE - center.y) * scale, TILE * scale + 1, () => (this.dirty = true));
      }
    }
    const toCanvas = (p: LatLon) => {
      const q = px(p.lat, p.lon, z);
      return { x: (q.x - center.x) * scale, y: (q.y - center.y) * scale };
    };
    if (s.target) {
      // The route: a curve that lines up with the runway (or a straight line if none yet).
      const pts = s.route && s.route.length > 1 ? s.route.map(toCanvas) : [{ x: 0, y: 0 }, toCanvas(s.target)];
      c.strokeStyle = "#ff2fa0";
      c.lineWidth = 3 * dpr;
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(0, 0);
      for (const q of pts) c.lineTo(q.x, q.y);
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
      <div class="bigmap-stage"><canvas></canvas><div class="bigmap-layer"></div><div class="bigmap-zoom"><button type="button" class="bigmap-zin" aria-label="Zoom in">+</button><button type="button" class="bigmap-zout" aria-label="Zoom out">−</button><button type="button" class="bigmap-me" aria-label="Back to the playne">◎</button></div></div>
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
      this.drawRoute();
    });
    parent.append(this.el);
    window.addEventListener("resize", () => !this.el.hidden && this.layout());
    this.el.querySelector(".bigmap-zin")!.addEventListener("click", () => this.zoomBy(2));
    this.el.querySelector(".bigmap-zout")!.addEventListener("click", () => this.zoomBy(0.5));
    this.el.querySelector(".bigmap-me")!.addEventListener("click", () => {
      if (!this.state) return;
      const q = px(this.state.pos.lat, this.state.pos.lon, VIEW_Z);
      this.view.cx = q.x;
      this.view.cy = q.y;
      this.redraw();
    });
    this.setupPanZoom();
  }

  // ----- view: centre (pixels at zoom 8) and scale (screen px per zoom-8 px) -----
  private view = { cx: 0, cy: 0, scale: 1 };
  private W = 0;
  private H = 0;

  /** Drag to move the map, two fingers (or the mouse wheel) to zoom. Taps on airports still work. */
  private setupPanZoom(): void {
    const stage = this.el.querySelector(".bigmap-stage") as HTMLElement;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    stage.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    stage.addEventListener("pointermove", (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        this.view.cx -= dx / this.view.scale;
        this.view.cy -= dy / this.view.scale;
        this.redraw();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0 && Math.abs(d / pinch0 - 1) > 0.04) {
          this.zoomBy(d / pinch0);
          pinch0 = d;
        }
      }
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch0 = 0;
    };
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.25 : 0.8);
    }, { passive: false });
  }

  private zoomBy(f: number): void {
    // From the whole country down to about zoom 10 (the detailed Southeast tiles).
    const min = this.fitScale(BOUNDS_ALL) * 0.8;
    this.view.scale = Math.max(min, Math.min(4, this.view.scale * f));
    this.redraw();
  }

  /** Scale that fits these bounds in the stage. */
  private fitScale(b: { south: number; north: number; west: number; east: number }): number {
    const nw = px(b.north, b.west, VIEW_Z), se = px(b.south, b.east, VIEW_Z);
    return Math.min(this.W / (se.x - nw.x), this.H / (se.y - nw.y));
  }

  private redrawQueued = false;
  private redraw(): void {
    if (this.redrawQueued) return;
    this.redrawQueued = true;
    requestAnimationFrame(() => {
      this.redrawQueued = false;
      if (this.el.hidden) return;
      this.drawBase();
      this.placeMarkers();
      this.drawPlane();
    });
  }

  open(s: MapState): void {
    this.state = s;
    this.picked = s.target;
    this.fitted = false;
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

  private fitted = false;

  private layout(): void {
    const stage = this.canvas.parentElement!;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.W = W;
    this.H = H;
    // On opening: the offline map's whole area, or (3D map, the whole country) about 700 km
    // around the playne.
    if (!this.fitted) {
      this.fitted = true;
      if (playableBounds) {
        const nw = px(playableBounds.north, playableBounds.west, VIEW_Z), se = px(playableBounds.south, playableBounds.east, VIEW_Z);
        this.view = { cx: (nw.x + se.x) / 2, cy: (nw.y + se.y) / 2, scale: this.fitScale(playableBounds) };
      } else {
        const p = this.state?.pos ?? { lat: 36, lon: -82 };
        const q = px(p.lat, p.lon, VIEW_Z);
        const mPerPx = (156543.03392 * Math.cos((p.lat * Math.PI) / 180)) / 2 ** VIEW_Z;
        this.view = { cx: q.x, cy: q.y, scale: Math.min(W, H) / (700_000 / mPerPx) };
      }
    }
    this.drawBase();
    this.placeMarkers();
    this.drawPlane();
  }

  private toScreen(p: LatLon): { x: number; y: number } {
    const q = px(p.lat, p.lon, VIEW_Z);
    return { x: (q.x - this.view.cx) * this.view.scale + this.W / 2, y: (q.y - this.view.cy) * this.view.scale + this.H / 2 };
  }

  private drawBase(): void {
    const c = this.ctx;
    const dpr = this.canvas.width / this.canvas.clientWidth;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#489cde"; // the map pictures' ocean colour, for beyond their edge
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Tile zoom to match the view (zoom 4-8 everywhere, 9-10 in the detailed Southeast).
    const tz = Math.max(4, Math.min(10, Math.round(VIEW_Z + Math.log2(this.view.scale))));
    const k = 2 ** (tz - VIEW_Z); // tile-zoom px per view px
    const s = this.view.scale / k; // screen px per tile-zoom px
    const cx = this.view.cx * k, cy = this.view.cy * k;
    const x0 = Math.floor((cx - this.W / 2 / s) / TILE), x1 = Math.floor((cx + this.W / 2 / s) / TILE);
    const y0 = Math.floor((cy - this.H / 2 / s) / TILE), y1 = Math.floor((cy + this.H / 2 / s) / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        tiles.draw(c, tz, tx, ty, (tx * TILE - cx) * s + this.W / 2, (ty * TILE - cy) * s + this.H / 2, TILE * s + 1, () => this.redraw());
      }
    }
    // Edge of the playable area (the offline maps).
    if (playableBounds) {
      const a = this.toScreen({ lat: playableBounds.north, lon: playableBounds.west });
      const b = this.toScreen({ lat: playableBounds.south, lon: playableBounds.east });
      c.strokeStyle = "rgba(255,255,255,.9)";
      c.setLineDash([10, 8]);
      c.lineWidth = 3;
      c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      c.setLineDash([]);
    }
  }

  private placeMarkers(): void {
    this.layer.innerHTML = "";
    const onScreen = (q: { x: number; y: number }) => q.x > -40 && q.y > -40 && q.x < this.W + 40 && q.y < this.H + 40;
    // Zoomed out over the country: only the big airports (and the home ones), or it's a crowd.
    const zoomedOut = !playableBounds && this.view.scale < 0.45;
    for (const l of LANDMARKS) {
      const q = this.toScreen(l);
      if (!onScreen(q)) continue;
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
      if (!onScreen(q)) continue;
      if (zoomedOut && a.size === "medium" && a !== this.picked && a !== this.state?.target) continue;
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
        this.drawRoute();
        this.onSelect(a);
      });
      this.layer.append(b);
    }
    const plane = document.createElement("div");
    plane.className = "bigmap-plane";
    plane.innerHTML = `<svg viewBox="0 0 48 48"><path d="M24 4c2 0 3 3 3 6v9l15 9v4l-15-4v9l5 4v3l-8-2-8 2v-3l5-4v-9L6 32v-4l15-9v-9c0-3 1-6 3-6z" fill="#ffc21a" stroke="#10233a" stroke-width="2.5"/></svg>`;
    this.layer.append(plane);
  }

  private routeSvg: SVGSVGElement | null = null;

  /** The route on the big map: the flight's planned path, or a preview to the airport just tapped. */
  private drawRoute(): void {
    const s = this.state;
    if (!this.routeSvg || !this.routeSvg.isConnected) {
      this.routeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.routeSvg.classList.add("bigmap-route");
      this.layer.prepend(this.routeSvg);
    }
    const svg = this.routeSvg;
    svg.setAttribute("width", String(this.canvas.clientWidth));
    svg.setAttribute("height", String(this.canvas.clientHeight));
    let route: LatLon[] | null = null;
    let preview = false;
    if (s && this.picked && this.picked !== s.target) {
      route = planRoute(s.pos, s.heading, this.picked, { direct: s.direct }).points;
      preview = true;
    } else if (s?.target) route = s.route && s.route.length > 1 ? [s.pos, ...s.route] : [s.pos, s.target];
    if (!route) {
      svg.innerHTML = "";
      return;
    }
    const d = route.map((p, i) => {
      const q = this.toScreen(p);
      return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    }).join(" ");
    svg.innerHTML = `<path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/><path d="${d}" fill="none" stroke="#ff2fa0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"${preview ? ' stroke-dasharray="10 8"' : ""}/>`;
  }

  private drawPlane(): void {
    const s = this.state;
    const plane = this.layer.querySelector(".bigmap-plane") as HTMLElement | null;
    this.drawRoute();
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
      this.info.textContent = playableBounds ? "Tap an airport to plan a trip. The dashed line is the edge of the map." : "Tap an airport to plan a trip. Drag to move the map; + and − zoom.";
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
