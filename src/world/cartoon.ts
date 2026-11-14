// Offline "cartoon world" data: bundled terrain heights, land cover and map tiles for the
// playable region (built by scripts/world/build_world.py). Works with no internet.

import {
  CustomHeightmapTerrainProvider,
  GeographicTilingScheme,
  Rectangle,
  UrlTemplateImageryProvider,
  Math as CMath,
  type Request,
} from "cesium";

export interface WorldMeta {
  bounds: { south: number; north: number; west: number; east: number };
  grid: { step: number; width: number; height: number; west: number; north: number };
  baseZoom: [number, number];
  patches: { z: number; x0: number; x1: number; y0: number; y1: number; code: string }[];
  attribution: string;
}

export const LAND = { land: 0, water: 1, town: 2, airport: 3 } as const;

export class CartoonData {
  constructor(
    readonly meta: WorldMeta,
    private dem: Int16Array,
    private land: Uint8Array,
  ) {}

  static async load(base = "./world/"): Promise<CartoonData> {
    const meta = (await (await fetch(`${base}world.json`)).json()) as WorldMeta;
    const [demBuf, landBuf] = await Promise.all([gunzip(`${base}dem.bin.gz`), gunzip(`${base}landcover.bin.gz`)]);
    const { width: W, height: H } = meta.grid;
    const delta = new Int16Array(demBuf);
    const dem = new Int16Array(W * H);
    for (let r = 0; r < H; r++) {
      let v = 0;
      for (let c = 0; c < W; c++) {
        v = c === 0 ? delta[r * W] : v + delta[r * W + c];
        dem[r * W + c] = v;
      }
    }
    return new CartoonData(meta, dem, new Uint8Array(landBuf));
  }

  inside(lat: number, lon: number): boolean {
    const b = this.meta.bounds;
    return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
  }

  /** Terrain height (meters above sea level), bilinear. 0 outside the region. */
  height(lat: number, lon: number): number {
    const g = this.meta.grid;
    const x = (lon - g.west) / g.step;
    const y = (g.north - lat) / g.step;
    if (x < 0 || y < 0 || x > g.width - 1 || y > g.height - 1) return 0;
    const x0 = Math.min(Math.floor(x), g.width - 2);
    const y0 = Math.min(Math.floor(y), g.height - 2);
    const fx = x - x0;
    const fy = y - y0;
    const d = this.dem;
    const i = y0 * g.width + x0;
    return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + g.width] * (1 - fx) + d[i + g.width + 1] * fx) * fy;
  }

  landAt(lat: number, lon: number): number {
    const g = this.meta.grid;
    const x = Math.round((lon - g.west) / g.step);
    const y = Math.round((g.north - lat) / g.step);
    if (x < 0 || y < 0 || x >= g.width || y >= g.height) return LAND.water;
    return this.land[y * g.width + x];
  }

  terrainProvider(): CustomHeightmapTerrainProvider {
    const tiling = new GeographicTilingScheme();
    const size = 32;
    return new CustomHeightmapTerrainProvider({
      width: size,
      height: size,
      tilingScheme: tiling,
      callback: (x: number, y: number, level: number) => {
        const r = tiling.tileXYToRectangle(x, y, level);
        const out = new Float32Array(size * size);
        const west = CMath.toDegrees(r.west);
        const east = CMath.toDegrees(r.east);
        const north = CMath.toDegrees(r.north);
        const south = CMath.toDegrees(r.south);
        const b = this.meta.bounds;
        if (east < b.west || west > b.east || north < b.south || south > b.north) return out;
        for (let j = 0; j < size; j++) {
          const lat = north + ((south - north) * j) / (size - 1);
          for (let i = 0; i < size; i++) {
            const lon = west + ((east - west) * i) / (size - 1);
            out[j * size + i] = this.height(lat, lon);
          }
        }
        return out;
      },
    });
  }

  imageryProvider(base = "./world/"): UrlTemplateImageryProvider {
    const m = this.meta;
    const [zMin, zMax] = m.baseZoom;
    const baseRange = (z: number) => {
      const n = 2 ** z;
      const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
      const ty = (lat: number) => {
        const r = (lat * Math.PI) / 180;
        return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
      };
      return { x0: tx(m.bounds.west), x1: tx(m.bounds.east), y0: ty(m.bounds.north), y1: ty(m.bounds.south) };
    };
    const ranges = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
    for (let z = zMin; z <= zMax; z++) ranges.set(z, baseRange(z));
    const patches = m.patches;
    const available = (x: number, y: number, z: number) => {
      if (z <= zMax) {
        const r = ranges.get(z);
        return !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
      }
      return patches.some((p) => p.z === z && x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
    };
    class CartoonImagery extends UrlTemplateImageryProvider {
      override requestImage(x: number, y: number, level: number, request?: Request) {
        if (!available(x, y, level)) return Promise.reject(new Error("no tile"));
        return super.requestImage(x, y, level, request);
      }
    }
    const provider = new CartoonImagery({
      url: `${base}tiles/{z}/{x}/{y}.webp`,
      rectangle: Rectangle.fromDegrees(m.bounds.west, m.bounds.south, m.bounds.east, m.bounds.north),
      minimumLevel: zMin,
      maximumLevel: 15,
      credit: m.attribution,
    });
    provider.errorEvent.addEventListener(() => {
      /* missing detail tiles fall back to the coarser ones */
    });
    return provider;
  }
}

async function gunzip(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  // Some servers decompress .gz transparently; check the gzip magic number.
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}
