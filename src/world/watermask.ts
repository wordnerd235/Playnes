// Where the offline cartoon map shows water, read from the very map tiles on screen (the
// sharpest one available at each spot). The coarse land grid (~370 m cells) has lakes and the
// ocean but no rivers, so trees and houses used to stand in rivers and along lake shores.

import type { CartoonData } from "./cartoon.ts";

/** Water colours painted by scripts/world/build_world.py (fill and shoreline). */
const WATER: [number, number, number][] = [
  [72, 156, 222],
  [150, 205, 240],
];
const MAX_TILES = 32;

interface Tile {
  /** One byte per pixel: 1 = water. */
  water: Uint8Array | null;
  used: number;
}

export function isWaterColour(r: number, g: number, b: number): boolean {
  for (const [wr, wg, wb] of WATER) {
    const d = Math.abs(r - wr) + Math.abs(g - wg) + Math.abs(b - wb);
    if (d < 54) return true;
  }
  return false;
}

export class WaterMask {
  private tiles = new Map<string, Tile>();
  private clock = 0;
  /** Called when a tile that was asked about has arrived (so props can be placed again). */
  onTileLoaded: () => void = () => {};

  constructor(private data: CartoonData, private base = "./world/") {}

  /**
   * Is (lat, lon) water on the map? `true`/`false`, or `null` while that map tile is still
   * loading (it starts loading now).
   */
  isWater(lat: number, lon: number): boolean | null {
    const [, zMax] = this.data.meta.baseZoom;
    // The sharpest tile drawn here: an airport patch (up to z15) or the base map.
    for (let z = 15; z >= 6; z--) {
      const n = 2 ** z;
      const fx = ((lon + 180) / 360) * n;
      const r = (lat * Math.PI) / 180;
      const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      if (z > zMax && !this.data.tileAvailable(x, y, z)) continue;
      if (!this.data.tileAvailable(x, y, z)) return false;
      const t = this.tile(z, x, y);
      if (!t.water) return null;
      const px = Math.min(255, Math.floor((fx - x) * 256));
      const py = Math.min(255, Math.floor((fy - y) * 256));
      return t.water[py * 256 + px] === 1;
    }
    return false;
  }

  private tile(z: number, x: number, y: number): Tile {
    const key = `${z}/${x}/${y}`;
    let t = this.tiles.get(key);
    if (t) {
      t.used = ++this.clock;
      return t;
    }
    t = { water: null, used: ++this.clock };
    this.tiles.set(key, t);
    this.evict();
    void this.load(key, t);
    return t;
  }

  private async load(key: string, t: Tile): Promise<void> {
    try {
      const res = await fetch(`${this.base}tiles/${key}.webp`);
      if (!res.ok) throw new Error(String(res.status));
      const bmp = await createImageBitmap(await res.blob());
      const cv = document.createElement("canvas");
      cv.width = 256;
      cv.height = 256;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, 256, 256);
      bmp.close?.();
      const px = ctx.getImageData(0, 0, 256, 256).data;
      const water = new Uint8Array(256 * 256);
      for (let i = 0; i < water.length; i++) water[i] = isWaterColour(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) ? 1 : 0;
      t.water = water;
    } catch {
      // No picture: treat it as land (as before).
      t.water = new Uint8Array(256 * 256);
    }
    this.onTileLoaded();
  }

  private evict(): void {
    if (this.tiles.size <= MAX_TILES) return;
    let oldest: string | null = null;
    let used = Infinity;
    for (const [k, t] of this.tiles) {
      if (t.water && t.used < used) {
        used = t.used;
        oldest = k;
      }
    }
    if (oldest) this.tiles.delete(oldest);
  }
}
