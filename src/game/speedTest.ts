// Speed test (grown-up settings, Google mode): flies a fixed loop over downtown Charlotte and
// measures how smoothly this device draws Google's 3D map with a few different settings, so the
// detail budgets can be tuned from real numbers instead of guesses. About 4-5 minutes. The
// results card is meant to be screenshotted and sent to whoever tunes the game.

import type { BenchSettings, World } from "../world/world.ts";
import { deviceClass, detailBudget } from "../world/device.ts";

export interface SpeedTestHost {
  world: World;
  /** Starts the Free Flight for the test; resolves once the playne is flying. */
  startFlight(start: { lat: number; lon: number; alt: number; heading: number; speed: number }): Promise<boolean>;
  /** Puts the playne exactly here, flying level. */
  setPose(p: { lat: number; lon: number; alt: number; heading: number; speed: number }): void;
  /** Called every frame while the test runs (dt in seconds); return false to stop. */
  onFrame(fn: ((dt: number) => void) | null): void;
  /** True while the test's flight is still the one running (the player didn't leave). */
  stillFlying(): boolean;
  quality: "high" | "medium" | "low";
}

interface Phase {
  name: string;
  set: BenchSettings;
  clouds: boolean;
  /** Run once the tile memory has filled up. */
  full?: boolean;
}

export interface PhaseResult {
  name: string;
  fps: number;
  low: number;
  hitches: number;
  frameMs: number;
  cpuMs: number;
  tiles: number;
  tileMB: number;
}

const CENTER = { lat: 35.2271, lon: -80.8431 };
const RADIUS = 4000; // m
const SPEED = 65; // m/s (about 125 kt)
const ALT = 230 + 600; // m: about 2,000 ft above the city

function poseAt(t: number): { lat: number; lon: number; alt: number; heading: number; speed: number } {
  const ang = (SPEED * t) / RADIUS; // radians around the loop, clockwise from north
  const dn = Math.cos(ang) * RADIUS, de = Math.sin(ang) * RADIUS;
  const lat = CENTER.lat + dn / 111_320;
  const lon = CENTER.lon + de / (111_320 * Math.cos((CENTER.lat * Math.PI) / 180));
  // Flying clockwise: the heading is 90 degrees on from the bearing out of the centre.
  const heading = ((ang * 180) / Math.PI + 90) % 360;
  return { lat, lon, alt: ALT, heading, speed: SPEED };
}

export async function runSpeedTest(host: SpeedTestHost, progress: (msg: string) => void): Promise<{ results: PhaseResult[]; info: string } | null> {
  const w = host.world;
  if (w.kind !== "google" || !w.benchmark) return null;
  const base = detailBudget(host.quality).tilesSse;
  const normal: BenchSettings = { sse: base, res: 1, fxaa: host.quality !== "high" };
  // Version 2 (after the first iPad results: smooth until the tile memory filled up, then
  // slower whatever the setting): two tests with memory still free, then fill it, then compare
  // settings with memory full, including the old behaviour (pre-loading neighbours on).
  // Version 3 (after the second iPad results: frame rate follows the number of tiles on screen,
  // ~60 fps up to ~210): the game's automatic detail with the new tile limit, against fixed
  // detail, with the tile memory full (a long flight).
  const auto: BenchSettings = { ...normal, sse: 0 };
  // Version 4: also the old level-of-detail skipping, to compare flicker by eye.
  const phases: Phase[] = [
    { name: "Normal (fixed)", set: normal, clouds: true },
    { name: "Automatic", set: auto, clouds: true },
    { name: "FULL: automatic (watch for flicker)", set: auto, clouds: true, full: true },
    { name: "FULL: OLD skipping (watch for flicker)", set: { ...auto, skipLod: true }, clouds: true, full: true },
    { name: "FULL: fixed detail", set: normal, clouds: true, full: true },
    { name: "FULL: automatic again", set: auto, clouds: true, full: true },
  ];
  progress("Getting to Charlotte...");
  let t = 0;
  if (!(await host.startFlight(poseAt(0)))) return null;
  const scene = w.widget.scene;
  // Frame times and processor time per frame.
  let frames: number[] = [];
  let cpu: number[] = [];
  let cpuStart = 0;
  let lastFrame = performance.now();
  const offPre = scene.preUpdate.addEventListener(() => {
    cpuStart = performance.now();
  });
  const offPost = scene.postRender.addEventListener(() => {
    const now = performance.now();
    frames.push(now - lastFrame);
    lastFrame = now;
    cpu.push(now - cpuStart);
  });
  host.onFrame((dt) => {
    t += dt;
    host.setPose(poseAt(t));
  });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const results: PhaseResult[] = [];
  try {
    // Let the city load first (up to 40 s), flying the loop.
    progress("Loading the city...");
    w.benchmark(normal);
    const t0 = performance.now();
    while (!w.groundReady() && performance.now() - t0 < 40_000) await wait(500);
    await wait(4000);
    for (let i = 0; i < phases.length; i++) {
      if (!host.stillFlying()) return null;
      const ph = phases[i];
      if (ph.full && !phases[i - 1]?.full) {
        // Keep flying the loop until the tile memory is (nearly) full, up to 3 minutes.
        w.benchmark(normal);
        const t1 = performance.now();
        const used = () => {
          const m = w.perfStats?.().match(/tiles (\d+)\/(\d+)/);
          return m ? Number(m[1]) / Number(m[2]) : 0;
        };
        while (used() < 0.95 && performance.now() - t1 < 180_000) {
          if (!host.stillFlying()) return null;
          progress(`Filling the map memory... ${Math.round(used() * 100)}%`);
          await wait(1000);
        }
      }
      progress(`Test ${i + 1} of ${phases.length}: ${ph.name}`);
      w.benchmark(ph.set);
      w.setClouds(ph.clouds);
      await wait(4000); // settle (new detail level loading)
      frames = [];
      cpu = [];
      await wait(16_000);
      const f = frames.filter((x) => x < 1000).sort((a, b) => a - b);
      const c = cpu.slice().sort((a, b) => a - b);
      const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
      const p95 = f.length ? f[Math.floor(f.length * 0.95)] : 0;
      const stats = w.perfStats?.() ?? "";
      results.push({
        name: ph.name,
        fps: avg ? 1000 / avg : 0,
        low: p95 ? 1000 / p95 : 0,
        hitches: f.filter((x) => x > 50).length,
        frameMs: avg,
        cpuMs: c.length ? c[Math.floor(c.length / 2)] : 0,
        tiles: Number(stats.match(/drawn (\d+) tiles/)?.[1] ?? 0),
        tileMB: Number(stats.match(/tiles (\d+)\//)?.[1] ?? 0),
      });
    }
  } finally {
    offPre();
    offPost();
    host.onFrame(null);
    w.benchmark(null);
  }
  const gl = (scene as unknown as { context: { drawingBufferWidth: number; drawingBufferHeight: number } }).context;
  const info = `${deviceClass()} · screen ${screen.width}x${screen.height} @${window.devicePixelRatio || 1}x · drawing ${gl.drawingBufferWidth}x${gl.drawingBufferHeight} · detail ${base} · ${navigator.userAgent.match(/(iPad|iPhone|Mac OS X [\d_]+|Windows NT [\d.]+|Android [\d.]+|CrOS)/)?.[0] ?? ""}`;
  return { results, info };
}
