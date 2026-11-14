// "Save for offline play": fetches every map tile, plane model and voice line once so the
// service worker keeps them. Afterwards the cartoon world works with no internet at all.

import { AIRCRAFT } from "../data/aircraft.ts";
import type { WorldMeta } from "../world/cartoon.ts";

function tileUrls(meta: WorldMeta): string[] {
  const urls: string[] = [];
  const [z0, z1] = meta.baseZoom;
  const b = meta.bounds;
  for (let z = z0; z <= z1; z++) {
    const n = 2 ** z;
    const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
    const ty = (lat: number) => {
      const r = (lat * Math.PI) / 180;
      return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    };
    for (let x = tx(b.west); x <= tx(b.east); x++) for (let y = ty(b.north); y <= ty(b.south); y++) urls.push(`./world/tiles/${z}/${x}/${y}.webp`);
  }
  for (const p of meta.patches) for (let x = p.x0; x <= p.x1; x++) for (let y = p.y0; y <= p.y1; y++) urls.push(`./world/tiles/${p.z}/${x}/${y}.webp`);
  return Array.from(new Set(urls));
}

export async function saveForOffline(onProgress: (done: number, total: number) => void): Promise<{ ok: number; failed: number }> {
  const meta = (await (await fetch("./world/world.json")).json()) as WorldMeta;
  const manifest = (await (await fetch("./audio/voice/manifest.json")).json()) as Record<string, string>;
  const urls = [
    "./",
    "./world/world.json",
    "./world/dem.bin.gz",
    "./world/landcover.bin.gz",
    ...tileUrls(meta),
    ...AIRCRAFT.map((a) => `./models/${a.id}.glb`),
    "./models/ring.glb",
    "./models/shadow.glb",
    ...Object.values(manifest).map((f) => `./audio/voice/${f}`),
  ];
  let done = 0;
  let ok = 0;
  let failed = 0;
  const queue = [...urls];
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      try {
        const r = await fetch(u, { cache: "no-cache" });
        if (r.ok) ok++;
        else failed++;
        await r.arrayBuffer();
      } catch {
        failed++;
      }
      onProgress(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { ok, failed };
}
