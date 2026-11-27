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
import { ALL_AIRPORTS } from "../data/airports.ts";

export interface WorldMeta {
  bounds: { south: number; north: number; west: number; east: number };
  grid: { step: number; width: number; height: number; west: number; north: number };
  baseZoom: [number, number];
  patches: { z: number; x0: number; x1: number; y0: number; y1: number; code: string }[];
  attribution: string;
}

export const LAND = { land: 0, water: 1, town: 2, airport: 3 } as const;

/**
 * Ground under a runway, made flat. The terrain grid is ~300 m apart, so between a runway's
 * two ends it can bulge a metre or two above the straight runway surface and poke through
 * it. Inside the runway (plus shoulders and overruns) the ground follows the runway's own
 * slope exactly, blending smoothly back into the hills around it.
 */
interface RunwayPad {
  lat0: number;
  lon0: number;
  /** Metres per degree of longitude here. */
  kx: number;
  ux: number;
  uy: number;
  length: number;
  half: number;
  h0: number;
  h1: number;
  box: { s: number; n: number; w: number; e: number };
}
const PAD_SIDE = 70; // beyond the runway edge (shoulders, taxiing)
const PAD_END = 150; // beyond each end (the drawn overrun is 40 m)
const PAD_BLEND = 450; // distance over which the flat pad blends back into the terrain

export class CartoonData {
  private pads: RunwayPad[] = [];

  constructor(
    readonly meta: WorldMeta,
    private dem: Int16Array,
    private land: Uint8Array,
  ) {
    for (const a of ALL_AIRPORTS) {
      if (!this.inside(a.lat, a.lon)) continue;
      const [e0, e1] = a.runway.ends;
      const kx = 111320 * Math.cos((e0.lat * Math.PI) / 180);
      const dx = (e1.lon - e0.lon) * kx;
      const dy = (e1.lat - e0.lat) * 111320;
      const length = Math.hypot(dx, dy);
      const half = (a.runway.widthFt * 0.3048) / 2;
      const reach = Math.max(half + PAD_SIDE, PAD_END) + PAD_BLEND;
      this.pads.push({
        lat0: e0.lat,
        lon0: e0.lon,
        kx,
        ux: dx / length,
        uy: dy / length,
        length,
        half,
        h0: this.terrainHeight(e0.lat, e0.lon),
        h1: this.terrainHeight(e1.lat, e1.lon),
        box: {
          s: Math.min(e0.lat, e1.lat) - reach / 111320,
          n: Math.max(e0.lat, e1.lat) + reach / 111320,
          w: Math.min(e0.lon, e1.lon) - reach / kx,
          e: Math.max(e0.lon, e1.lon) + reach / kx,
        },
      });
    }
  }

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

  /** Ground height (meters above sea level): the terrain, flattened under runways. */
  height(lat: number, lon: number): number {
    const natural = this.terrainHeight(lat, lon);
    for (const p of this.pads) {
      const b = p.box;
      if (lat < b.s || lat > b.n || lon < b.w || lon > b.e) continue;
      const x = (lon - p.lon0) * p.kx;
      const y = (lat - p.lat0) * 111320;
      const along = x * p.ux + y * p.uy;
      const across = Math.abs(-x * p.uy + y * p.ux);
      const outEnd = Math.max(0, -along - PAD_END, along - p.length - PAD_END);
      const outSide = Math.max(0, across - p.half - PAD_SIDE);
      const out = Math.hypot(outEnd, outSide);
      if (out >= PAD_BLEND) continue;
      const f = Math.max(0, Math.min(1, along / p.length));
      const flat = p.h0 + (p.h1 - p.h0) * f;
      const t = 1 - out / PAD_BLEND;
      const w = t * t * (3 - 2 * t);
      return natural + (flat - natural) * w;
    }
    return natural;
  }

  /** Raw terrain height from the grid (meters above sea level), bilinear. 0 outside the region. */
  terrainHeight(lat: number, lon: number): number {
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

  private tileRanges: Map<number, { x0: number; x1: number; y0: number; y1: number }> | null = null;

  /** Is there a map tile for (x, y) at zoom z? (Full coverage up to the base zoom, patches above.) */
  tileAvailable(x: number, y: number, z: number): boolean {
    const m = this.meta;
    const [zMin, zMax] = m.baseZoom;
    if (!this.tileRanges) {
      this.tileRanges = new Map();
      for (let k = zMin; k <= zMax; k++) {
        const n = 2 ** k;
        const ty = (lat: number) => {
          const r = (lat * Math.PI) / 180;
          return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
        };
        this.tileRanges.set(k, { x0: Math.floor(((m.bounds.west + 180) / 360) * n), x1: Math.floor(((m.bounds.east + 180) / 360) * n), y0: ty(m.bounds.north), y1: ty(m.bounds.south) });
      }
    }
    if (z < zMin) return false;
    if (z <= zMax) {
      const r = this.tileRanges.get(z);
      return !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    }
    return m.patches.some((p) => p.z === z && x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);
  }

  imageryProvider(base = "./world/"): UrlTemplateImageryProvider {
    const m = this.meta;
    const [zMin] = m.baseZoom;
    const available = (x: number, y: number, z: number) => this.tileAvailable(x, y, z);
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
      credit: `${m.attribution} Airport buildings: © OpenStreetMap contributors, via Overture Maps.`,
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
