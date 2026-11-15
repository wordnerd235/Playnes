// Things near the plane that make speed and height easy to feel: puffy cumulus clouds (every
// world), plus cartoon trees and town buildings in the offline world. Rebuilt as the plane moves.

import { BillboardCollection, BoundingSphere, Cartesian2, Cartesian3, CloudCollection, Color, VerticalOrigin, type Scene } from "cesium";
import { destination, distance, type LatLon } from "../sim/geo.ts";
import { LAND, type CartoonData } from "./cartoon.ts";
import { gfxOn } from "./safety.ts";

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

/**
 * Cesium's CloudCollection draws with no bounding volume. On devices without order-independent
 * translucency (iPad Safari), Cesium sorts see-through draws by distance and crashes on the
 * missing volume ("e.boundingVolume.distanceSquaredTo"). Give each cloud draw one.
 */
class SafeCloudCollection extends CloudCollection {
  sphere = new BoundingSphere(new Cartesian3(), 1);

  setBounds(positions: Cartesian3[]): void {
    this.sphere = positions.length ? BoundingSphere.fromPoints(positions) : new BoundingSphere(new Cartesian3(), 1);
    this.sphere.radius += 3000;
  }

  update(frameState: unknown): void {
    const fs = frameState as { commandList: { boundingVolume?: unknown; owner?: unknown }[] };
    const start = fs.commandList.length;
    (CloudCollection.prototype as unknown as { update: (f: unknown) => void }).update.call(this, frameState);
    for (let i = start; i < fs.commandList.length; i++) {
      const cmd = fs.commandList[i];
      if (!cmd.boundingVolume) cmd.boundingVolume = this.sphere;
    }
  }
}

export class Scenery {
  private clouds: SafeCloudCollection;
  private props: BillboardCollection;
  private cloudCenter: LatLon | null = null;
  private propCenter: LatLon | null = null;
  private visible = true;
  // Data URLs, so every billboard shares one texture-atlas entry per picture.
  private trees: string[] = [];
  private houses: string[] = [];

  /** 0..1 detail scale from the graphics setting. */
  /** Real buildings to keep clear of (airport terminals and hangars): (lat, lon, radius m) => taken? */
  blocked: (lat: number, lon: number, r: number) => boolean = () => false;

  /** Re-place trees and houses on the next update (e.g. once the real buildings are known). */
  refreshProps(): void {
    this.propCenter = null;
  }

  constructor(private scene: Scene, private data: CartoonData | null, private detail = 1) {
    this.clouds = scene.primitives.add(new SafeCloudCollection({ noiseDetail: 16 })) as SafeCloudCollection;
    this.props = scene.primitives.add(new BillboardCollection({ scene })) as BillboardCollection;
    if (data) {
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

  setVisible(v: boolean): void {
    this.visible = v;
    this.clouds.show = v && gfxOn("cumulus");
    this.props.show = v && gfxOn("props");
  }

  /** Call every frame with the plane (or camera) position. heightAgl decides tree detail. */
  update(p: LatLon, alt: number, heightAgl: number): void {
    if (!this.visible) return;
    if (gfxOn("cumulus") && (!this.cloudCenter || distance(p, this.cloudCenter) > 7000)) this.buildClouds(p);
    if (this.data && gfxOn("props")) {
      const near = heightAgl < 1500;
      this.props.show = near;
      if (near && (!this.propCenter || distance(p, this.propCenter) > 450)) this.buildProps(p);
    }
    void alt;
  }

  private buildClouds(p: LatLon): void {
    this.cloudCenter = { ...p };
    this.clouds.removeAll();
    const positions: Cartesian3[] = [];
    const cell = 2600;
    const R = 26000;
    const mx = p.lon * 111320 * COS35;
    const my = p.lat * 111320;
    for (let gx = Math.floor((mx - R) / cell); gx <= Math.floor((mx + R) / cell); gx++) {
      for (let gy = Math.floor((my - R) / cell); gy <= Math.floor((my + R) / cell); gy++) {
        const k = gx * 7919 + gy * 104729;
        if (hash(k, 1) > 0.22 * this.detail) continue;
        const cx = (gx + hash(k, 2)) * cell;
        const cy = (gy + hash(k, 3)) * cell;
        const lon = cx / (111320 * COS35);
        const lat = cy / 111320;
        const base = (this.data ? this.data.height(lat, lon) : 300) + 1200 + hash(k, 4) * 900;
        const sx = 1100 + hash(k, 5) * 1300;
        const sy = 450 + hash(k, 6) * 350;
        const pos = Cartesian3.fromDegrees(lon, lat, base);
        positions.push(pos);
        this.clouds.add({
          position: pos,
          scale: new Cartesian2(sx, sy),
          maximumSize: new Cartesian3(sx * 0.9, sy, sy * 0.9),
          slice: 0.36 + hash(k, 7) * 0.2,
          brightness: 1,
        });
      }
    }
    this.clouds.setBounds(positions);
  }

  private buildProps(p: LatLon): void {
    this.propCenter = { ...p };
    this.props.removeAll();
    const R = 1400 + 900 * this.detail;
    const cell = PROP_CELL;
    const mx0 = p.lon * 111320 * COS35;
    const my0 = p.lat * 111320;
    let count = 0;
    for (let gx = Math.floor((mx0 - R) / cell); gx <= Math.floor((mx0 + R) / cell); gx++) {
      for (let gy = Math.floor((my0 - R) / cell); gy <= Math.floor((my0 + R) / cell); gy++) {
        if (((gx + 0.5) * cell - mx0) ** 2 + ((gy + 0.5) * cell - my0) ** 2 > (R + cell) ** 2) continue;
        const pr = this.propAt(gx, gy);
        if (!pr) continue;
        const mx = pr.lon * 111320 * COS35;
        const my = pr.lat * 111320;
        if ((mx - mx0) ** 2 + (my - my0) ** 2 > R * R) continue;
        this.props.add({
          position: Cartesian3.fromDegrees(pr.lon, pr.lat, pr.base),
          image: pr.image,
          width: pr.width,
          height: pr.height,
          sizeInMeters: true,
          verticalOrigin: VerticalOrigin.BOTTOM,
          color: Color.WHITE,
        });
        count++;
        if (count > 2500 + 2500 * this.detail) return;
      }
    }
  }

  /**
   * The tree or house in grid cell (gx, gy), if any. One place decides what grows where, so
   * what is drawn and what you can bump into always match.
   */
  private propAt(gx: number, gy: number): { lat: number; lon: number; base: number; width: number; height: number; image: string } | null {
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
      // Never inside (or touching) a real building.
      if (this.blocked(lat, lon, width * 0.55 + 3)) return null;
      return { lat, lon, base: h - 1, width, height: tall, image: this.houses[Math.floor(hash(k, 6) * this.houses.length)] };
    }
    const f = valueNoise(mx, my, 1800, 7) * 0.7 + valueNoise(mx, my, 500, 8) * 0.3;
    const thresh = Math.min(0.66, Math.max(0.2, 0.66 - h / 3600));
    const inForest = f > thresh;
    if (!inForest && hash(k, 8) > 0.04) return null; // a few lone trees in fields
    const size = 0.8 + hash(k, 9) * 0.6;
    if (this.blocked(lat, lon, 11 * size * 0.55 + 2)) return null;
    const pine = h > 700 ? hash(k, 10) < 0.7 : hash(k, 10) < 0.3;
    const img = this.trees[(pine ? 2 : 0) + (hash(k, 11) < 0.5 ? 0 : 1)];
    return { lat, lon, base: h - 1.5, width: 11 * size, height: (pine ? 19 : 16) * size, image: img };
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
