// Things near the plane that make speed and height easy to feel: puffy painted clouds (every
// world), plus cartoon trees and town buildings in the offline world. Rebuilt as the plane moves.
// Trees and buildings are pictures of small 3D models, baked from four heights (side-on to
// nearly overhead, tools/bake-props.cjs); each one shows the picture that matches how steeply
// it's being looked down on, so they read as solid objects for the price of flat pictures.
// The clouds are soft pictures drawn once on a canvas and shown as camera-facing billboards
// (kept upright in the world, so they tilt with the horizon when the playne banks)
// sized in metres: one draw call for all of them, far cheaper than raymarched cumulus.

import { BillboardCollection, Cartesian3, Color, Ellipsoid, NearFarScalar, VerticalOrigin, type Scene } from "cesium";
import { asset } from "../assets.ts";
import { PROP_SHEET, PROP_SPRITES } from "../data/propSprites.ts";
import { destination, distance, type LatLon } from "../sim/geo.ts";
import { LAND, type CartoonData } from "./cartoon.ts";
import { gfxOn } from "./safety.ts";
import { cloudPrefs } from "./clouds.ts";
import { WaterMask } from "./watermask.ts";

const COS35 = Math.cos((35 * Math.PI) / 180);
/** Grid spacing for trees and houses, meters. */
const PROP_CELL = 46;

function frac(v: number): number {
  return v - Math.floor(v);
}
function hash(v: number, seed: number): number {
  return frac(Math.sin(v * 12.9898 + seed * 78.233) * 43758.5453);
}
/** Same value noise as scripts/world/build_world.py, so trees grow where the map shows forest. */
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const h = (ix: number, iy: number) => frac(Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return (h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx) * (1 - sy) + (h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx) * sy;
}

function sprite(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  return cv;
}

/**
 * A puffy cartoon cumulus: overlapping round puffs, lit from above (bright tops, soft blue-grey
 * undersides), a flat-ish base and soft edges. Drawn at 512x256; `seed` varies the shape.
 */
function cloudSprite(seed: number): HTMLCanvasElement {
  return sprite(512, 256, (c) => {
    const rnd = (i: number) => hash(i + seed * 31.7, seed + 3);
    const base = 200;
    const puffs: [number, number, number][] = [];
    const n = 6 + Math.floor(rnd(0) * 3);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = 70 + t * 372 + (rnd(i + 1) - 0.5) * 30;
      // Tallest in the middle, smaller toward the ends.
      const hump = Math.sin(t * Math.PI);
      const r = 34 + hump * 52 + rnd(i + 11) * 22;
      puffs.push([x, base - r * (0.55 + hump * 0.35), r]);
    }
    // A few small puffs along the bottom to fill the base.
    for (let i = 0; i < 5; i++) puffs.push([90 + i * 83 + (rnd(i + 21) - 0.5) * 30, base - 22, 30 + rnd(i + 31) * 10]);
    // Back puffs first (bottom ones), front/top ones last, each lit from the upper left.
    puffs.sort((a, b) => b[1] + b[2] * 0.2 - (a[1] + a[2] * 0.2));
    c.save();
    c.beginPath();
    c.rect(0, 0, 512, base + 6);
    c.clip();
    for (const [x, y, r] of puffs) {
      const g = c.createRadialGradient(x - r * 0.25, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.55, "rgba(250,252,255,1)");
      g.addColorStop(0.86, "rgba(214,226,240,0.97)");
      g.addColorStop(1, "rgba(214,226,240,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // Shade the underside, then soften the flat base.
    c.globalCompositeOperation = "source-atop";
    const under = c.createLinearGradient(0, base - 90, 0, base + 6);
    under.addColorStop(0, "rgba(160,182,210,0)");
    under.addColorStop(1, "rgba(160,182,210,0.6)");
    c.fillStyle = under;
    c.fillRect(0, 0, 512, 256);
    c.globalCompositeOperation = "destination-out";
    const fade = c.createLinearGradient(0, base - 14, 0, base + 6);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    c.fillStyle = fade;
    c.fillRect(0, base - 14, 512, 40);
    c.globalCompositeOperation = "source-over";
  });
}

const roundTree = (shade: string) =>
  sprite(64, 96, (c) => {
    c.fillStyle = "#6b4a2b";
    c.fillRect(28, 60, 8, 36);
    c.fillStyle = shade;
    for (const [x, y, r] of [[32, 40, 26], [20, 50, 16], [44, 50, 16], [32, 22, 18]]) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.beginPath();
    c.arc(25, 28, 9, 0, Math.PI * 2);
    c.fill();
  });

const pineTree = (shade: string) =>
  sprite(64, 112, (c) => {
    c.fillStyle = "#6b4a2b";
    c.fillRect(28, 88, 8, 24);
    c.fillStyle = shade;
    for (const [top, half, bottom] of [[4, 18, 44], [22, 24, 66], [42, 30, 92]]) {
      c.beginPath();
      c.moveTo(32, top);
      c.lineTo(32 + half, bottom);
      c.lineTo(32 - half, bottom);
      c.closePath();
      c.fill();
    }
  });

const building = (wall: string, roof: string) =>
  sprite(64, 96, (c) => {
    c.fillStyle = roof;
    c.fillRect(6, 0, 52, 10);
    c.fillStyle = wall;
    c.fillRect(8, 8, 48, 88);
    c.fillStyle = "rgba(40,60,90,0.75)";
    for (let y = 16; y < 88; y += 14) for (let x = 14; x < 52; x += 12) c.fillRect(x, y, 6, 8);
  });

export class Scenery {
  private clouds: BillboardCollection;
  private props: BillboardCollection;
  private cloudCenter: LatLon | null = null;
  private propCenter: LatLon | null = null;
  private visible = true;
  // Data URLs, so every billboard shares one texture-atlas entry per picture.
  private trees: string[] = [];
  private houses: string[] = [];
  private cloudPics: string[] = [];
  /** Baked pictures: sprites[kind][angle index] (empty until the sheet has loaded). */
  private sprites: Record<string, string[]> = {};
  private propAlt = 0;
  /** Where the map shows water (rivers too): no trees or houses there. */
  private water: WaterMask | null = null;

  /** 0..1 detail scale from the graphics setting. */
  /** Real buildings to keep clear of (airport terminals and hangars): (lat, lon, radius m) => taken? */
  blocked: (lat: number, lon: number, r: number) => boolean = () => false;

  /** Re-place trees and houses on the next update (e.g. once the real buildings are known). */
  refreshProps(): void {
    this.propCenter = null;
  }

  constructor(private scene: Scene, private data: CartoonData | null, private detail = 1) {
    this.clouds = scene.primitives.add(new BillboardCollection({ scene })) as BillboardCollection;
    this.cloudPics = [1, 2, 3, 4].map((k) => cloudSprite(k).toDataURL());
    this.props = scene.primitives.add(new BillboardCollection({ scene })) as BillboardCollection;
    if (data) {
      this.water = new WaterMask(data);
      // A map tile arrived: place the trees around here again, now knowing where the water is.
      let pending = 0;
      this.water.onTileLoaded = () => {
        clearTimeout(pending);
        pending = window.setTimeout(() => this.refreshProps(), 200);
      };
      this.loadSprites();
      this.trees = [roundTree("#3f9a4a"), roundTree("#55ad52"), pineTree("#2f7f45"), pineTree("#3b8f4c")].map((c) => c.toDataURL());
      this.houses = [building("#f2e6d0", "#c0573e"), building("#dfe7ef", "#5c6b7a"), building("#f6d9a8", "#8a5a3c")].map((c) => c.toDataURL());
    }
  }

  disableClouds(): void {
    this.clouds.removeAll();
    this.clouds.show = false;
  }

  disableProps(): void {
    this.props.removeAll();
    this.props.show = false;
  }

  /** The grown-up "Clouds" setting. */
  setClouds(on: boolean): void {
    cloudPrefs.on = on;
    this.clouds.show = this.visible && on && gfxOn("cumulus");
    if (on) this.cloudCenter = null;
    else this.clouds.removeAll();
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.clouds.show = v && cloudPrefs.on && gfxOn("cumulus");
    this.props.show = v && gfxOn("props");
  }

  /** Call every frame with the plane (or camera) position. heightAgl decides tree detail. */
  update(p: LatLon, alt: number, heightAgl: number): void {
    if (!this.visible) return;
    if (cloudPrefs.on && gfxOn("cumulus") && (!this.cloudCenter || distance(p, this.cloudCenter) > 7000)) this.buildClouds(p);
    if (this.data && gfxOn("props")) {
      const near = heightAgl < 1500;
      this.props.show = near;
      const climbed = Math.abs(alt - this.propAlt) > Math.max(25, heightAgl * 0.2);
      if (near && (!this.propCenter || distance(p, this.propCenter) > 450 || climbed)) this.buildProps(p, alt);
    }
  }

  /** Cut the baked sheet into one small picture per kind and angle. */
  private loadSprites(): void {
    const img = new Image();
    img.onload = () => {
      const c = PROP_SHEET.cell;
      for (const [kind, sp] of Object.entries(PROP_SPRITES)) {
        this.sprites[kind] = sp.frames.map((_, i) =>
          sprite(c, c, (ctx) => ctx.drawImage(img, i * c, sp.row * c, c, c, 0, 0, c, c)).toDataURL(),
        );
      }
      this.refreshProps();
    };
    img.src = asset(PROP_SHEET.file);
  }

  private buildClouds(p: LatLon): void {
    this.cloudCenter = { ...p };
    this.clouds.removeAll();
    const cell = 2600;
    const R = 26000;
    const mx = p.lon * 111320 * COS35;
    const my = p.lat * 111320;
    // Fade out when close, so flying through one is a soft white-out, not a flat card.
    const near = new NearFarScalar(900, 0, 3800, 1);
    for (let gx = Math.floor((mx - R) / cell); gx <= Math.floor((mx + R) / cell); gx++) {
      for (let gy = Math.floor((my - R) / cell); gy <= Math.floor((my + R) / cell); gy++) {
        const k = gx * 7919 + gy * 104729;
        if (hash(k, 1) > 0.18 * this.detail) continue;
        const cx = (gx + hash(k, 2)) * cell;
        const cy = (gy + hash(k, 3)) * cell;
        const lon = cx / (111320 * COS35);
        const lat = cy / 111320;
        const base = (this.data ? this.data.height(lat, lon) : 300) + 1200 + hash(k, 4) * 900;
        const w = 1100 + hash(k, 5) ** 1.5 * 2600;
        const at = Cartesian3.fromDegrees(lon, lat, base);
        this.clouds.add({
          position: at,
          // Stand upright in the world, not on the screen: when the playne banks, the clouds
          // tilt with the horizon instead of seeming to turn.
          alignedAxis: Ellipsoid.WGS84.geodeticSurfaceNormal(at, new Cartesian3()),
          image: this.cloudPics[Math.floor(hash(k, 6) * this.cloudPics.length)],
          width: w,
          height: w * 0.5 * (0.8 + hash(k, 8) * 0.35),
          sizeInMeters: true,
          verticalOrigin: VerticalOrigin.BOTTOM,
          translucencyByDistance: near,
        });
      }
    }
  }

  private buildProps(p: LatLon, alt = this.propAlt): void {
    this.propCenter = { ...p };
    this.propAlt = alt;
    this.props.removeAll();
    const R = 1400 + 900 * this.detail;
    const cell = PROP_CELL;
    const mx0 = p.lon * 111320 * COS35;
    const my0 = p.lat * 111320;
    const baked = Object.keys(this.sprites).length > 0;
    const angles = PROP_SHEET.elevations;
    let count = 0;
    for (let gx = Math.floor((mx0 - R) / cell); gx <= Math.floor((mx0 + R) / cell); gx++) {
      for (let gy = Math.floor((my0 - R) / cell); gy <= Math.floor((my0 + R) / cell); gy++) {
        if (((gx + 0.5) * cell - mx0) ** 2 + ((gy + 0.5) * cell - my0) ** 2 > (R + cell) ** 2) continue;
        const pr = this.propAt(gx, gy);
        if (!pr) continue;
        const mx = pr.lon * 111320 * COS35;
        const my = pr.lat * 111320;
        const d2 = (mx - mx0) ** 2 + (my - my0) ** 2;
        if (d2 > R * R) continue;
        const sp = PROP_SPRITES[pr.kind];
        if (baked && sp) {
          // How steeply this one is looked down on from the playne picks its picture.
          const elev = Math.atan2(alt - pr.base, Math.sqrt(d2)) * (180 / Math.PI);
          let i = 0;
          while (i < angles.length - 1 && elev > (angles[i] + angles[i + 1]) / 2) i++;
          const f = sp.frames[i];
          const size = f.size * pr.scale;
          const v = 228 + Math.floor(hash(gx * 3301 + gy * 9001, 13) * 27);
          const at = Cartesian3.fromDegrees(pr.lon, pr.lat, pr.base + (f.origin === "bottom" ? -0.3 : 0.2));
          this.props.add({
            position: at,
            alignedAxis: Ellipsoid.WGS84.geodeticSurfaceNormal(at, new Cartesian3()), // upright in the world, as the clouds
            image: this.sprites[pr.kind][i],
            width: size,
            height: size,
            sizeInMeters: true,
            verticalOrigin: f.origin === "bottom" ? VerticalOrigin.BOTTOM : VerticalOrigin.CENTER,
            // A picture centred on the ground would be cut by the ground in front of it: bring
            // it toward the eye by about the depth of its footprint.
            eyeOffset: f.origin === "bottom" ? Cartesian3.ZERO : new Cartesian3(0, 0, -(sp.radius * pr.scale * Math.sin((angles[i] * Math.PI) / 180) * 1.2 + 0.5)),
            color: Color.fromBytes(v, v, v, 255),
          });
        } else {
          const at = Cartesian3.fromDegrees(pr.lon, pr.lat, pr.base - 1.2);
          this.props.add({
            position: at,
            alignedAxis: Ellipsoid.WGS84.geodeticSurfaceNormal(at, new Cartesian3()),
            image: pr.image,
            width: pr.width,
            height: pr.height,
            sizeInMeters: true,
            verticalOrigin: VerticalOrigin.BOTTOM,
            color: Color.WHITE,
          });
        }
        count++;
        if (count > 2500 + 2500 * this.detail) return;
      }
    }
  }

  /**
   * The tree or house in grid cell (gx, gy), if any. One place decides what grows where, so
   * what is drawn and what you can bump into always match.
   */
  /** Water on the map here: rivers and shores the coarse land grid misses (or not known yet). */
  private wet(lat: number, lon: number): boolean {
    return !!this.water && this.water.isWater(lat, lon) !== false;
  }

  private propAt(gx: number, gy: number): { lat: number; lon: number; base: number; width: number; height: number; image: string; kind: string; scale: number } | null {
    const data = this.data;
    if (!data) return null;
    const cell = PROP_CELL;
    const k = gx * 3301 + gy * 9001;
    const mx = (gx + 0.15 + hash(k, 1) * 0.7) * cell;
    const my = (gy + 0.15 + hash(k, 2) * 0.7) * cell;
    const lon = mx / (111320 * COS35);
    const lat = my / 111320;
    if (!data.inside(lat, lon)) return null;
    const land = data.landAt(lat, lon);
    if (land === LAND.water || land === LAND.airport) return null;
    const h = data.height(lat, lon);
    if (land === LAND.town) {
      if (hash(k, 3) > 0.32) return null;
      const tall = 8 + hash(k, 4) * hash(k, 5) * hash(k, 12) * 60;
      const width = 14 + hash(k, 7) * 10;
      // Never inside (or touching) a real building, or in the water.
      if (this.blocked(lat, lon, width * 0.55 + 3) || this.wet(lat, lon)) return null;
      // A house, a mid-rise or a tall block, by height; the baked model is scaled to it.
      const pick = hash(k, 6);
      const kind = tall < 14 ? ["houseA", "houseB", "houseC"][Math.floor(pick * 3)] : tall < 26 ? (pick < 0.5 ? "midA" : "midB") : pick < 0.5 ? "tallA" : "tallB";
      const real = PROP_SPRITES[kind].height;
      const scale = tall < 14 ? Math.min(1.45, Math.max(0.95, tall / real)) : tall / real;
      return { lat, lon, base: h, width, height: real * scale, image: this.houses[Math.floor(pick * this.houses.length)], kind, scale };
    }
    const f = valueNoise(mx, my, 1800, 7) * 0.7 + valueNoise(mx, my, 500, 8) * 0.3;
    const thresh = Math.min(0.66, Math.max(0.2, 0.66 - h / 3600));
    const inForest = f > thresh;
    if (!inForest && hash(k, 8) > 0.04) return null; // a few lone trees in fields
    const size = 0.8 + hash(k, 9) * 0.6;
    if (this.blocked(lat, lon, 11 * size * 0.55 + 2) || this.wet(lat, lon)) return null;
    const pine = h > 700 ? hash(k, 10) < 0.7 : hash(k, 10) < 0.3;
    const variant = hash(k, 11) < 0.5 ? 0 : 1;
    const img = this.trees[(pine ? 2 : 0) + variant];
    const kind = (pine ? "pine" : "round") + (variant ? "B" : "A");
    return { lat, lon, base: h, width: 11 * size, height: (pine ? 19 : 16) * size, image: img, kind, scale: ((pine ? 19 : 16) * size) / PROP_SPRITES[kind].height };
  }

  /**
   * Top (ellipsoid height, m) of the tallest tree or house within `radius` meters of p, or null.
   * Only while trees and houses are shown (offline world, scenery on).
   */
  obstacleTop(p: LatLon, radius: number): number | null {
    if (!this.data || !gfxOn("props") || !this.props.show) return null;
    const mx0 = p.lon * 111320 * COS35;
    const my0 = p.lat * 111320;
    const reach = radius + 12;
    let top: number | null = null;
    for (let gx = Math.floor((mx0 - reach) / PROP_CELL); gx <= Math.floor((mx0 + reach) / PROP_CELL); gx++) {
      for (let gy = Math.floor((my0 - reach) / PROP_CELL); gy <= Math.floor((my0 + reach) / PROP_CELL); gy++) {
        const pr = this.propAt(gx, gy);
        if (!pr) continue;
        const d = Math.hypot(pr.lon * 111320 * COS35 - mx0, pr.lat * 111320 - my0);
        if (d > radius + pr.width * 0.4) continue;
        const t = pr.base + pr.height * 0.92;
        if (top === null || t > top) top = t;
      }
    }
    return top;
  }

  destroy(): void {
    this.scene.primitives.remove(this.clouds);
    this.scene.primitives.remove(this.props);
  }
}

export { destination };
