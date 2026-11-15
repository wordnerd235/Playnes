// Extra map detail (test): real satellite photos laid over the cartoon map in a patch around
// Tri-Cities. Free Copernicus Sentinel-2 imagery, cut into tiles by
// scripts/world/satellite_patch.py and bundled with the game, so it works offline too.
// The patch edges fade out, so the photo blends into the cartoon map around it.

import { Credit, ImageryLayer, Rectangle, UrlTemplateImageryProvider, type Request, type Scene } from "cesium";

export interface SatMeta {
  patches: { code: string; south: number; north: number; west: number; east: number; date: string }[];
  zooms: [number, number];
  tiles: { z: number; tiles: string[] }[];
  credit: string;
}

let metaCache: Promise<SatMeta | null> | null = null;
export function loadSatMeta(base = "./world/sat/"): Promise<SatMeta | null> {
  metaCache ??= fetch(`${base}sat.json`)
    .then((r) => (r.ok ? (r.json() as Promise<SatMeta>) : null))
    .catch(() => null);
  return metaCache;
}

/** Every tile URL in the patch (for "Save for offline play"). */
export function satTileUrls(meta: SatMeta, base = "./world/sat/"): string[] {
  return [`${base}sat.json`, ...meta.tiles.flatMap((l) => l.tiles.map((t) => `${base}${l.z}/${t}.webp`))];
}

/** Adds the photo layer on top of the cartoon map; returns a show/hide switch. */
export async function addSatelliteLayer(scene: Scene, show: boolean, base = "./world/sat/"): Promise<ImageryLayer | null> {
  const meta = await loadSatMeta(base);
  if (!meta || !meta.patches.length || scene.isDestroyed()) return null;
  const have = new Set(meta.tiles.flatMap((l) => l.tiles.map((t) => `${l.z}/${t}`)));
  const p = meta.patches[0];
  class PatchImagery extends UrlTemplateImageryProvider {
    override requestImage(x: number, y: number, level: number, request?: Request) {
      if (!have.has(`${level}/${x}/${y}`)) return Promise.reject(new Error("no tile"));
      return super.requestImage(x, y, level, request);
    }
  }
  const provider = new PatchImagery({
    url: `${base}{z}/{x}/{y}.webp`,
    rectangle: Rectangle.fromDegrees(p.west, p.south, p.east, p.north),
    minimumLevel: meta.zooms[0],
    maximumLevel: meta.zooms[1],
    credit: new Credit(meta.credit),
  });
  const layer = scene.imageryLayers.addImageryProvider(provider);
  layer.show = show;
  return layer;
}
