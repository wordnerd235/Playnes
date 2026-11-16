// Automatic detail governor: keeps flying smooth by trading a little distant detail for frame
// rate when the device is struggling (dense cities in Google 3D, many tiles arriving at once),
// and sharpening back up when there's headroom. It works on a single "detail scale": 1 = the
// normal level, above 1 = coarser (fewer tiles), below 1 = a bit sharper than normal.

export interface GovernorOptions {
  /** Coarsest and sharpest the scale may go. */
  max: number;
  min: number;
  /** Seconds per decision. */
  window: number;
}

export class DetailGovernor {
  scale = 1;
  private frames: number[] = [];
  private windowStart = -1;
  private calm = 0;
  /** When it last eased off (ms): it waits a while before sharpening again. */
  private easedAt = -1e9;

  constructor(private o: GovernorOptions = { max: 2.6, min: 0.85, window: 1.5 }) {}

  /**
   * Feed one frame (`now` in ms). Returns the new scale when it changed, otherwise null.
   * A frame over ~24 ms is "slow" (below ~42 fps); over 60 ms is a visible pause.
   */
  frame(now: number, dtMs: number): number | null {
    if (this.windowStart < 0) this.windowStart = now;
    // Ignore huge gaps (tab hidden, game paused on a menu, debugger): not the GPU's fault.
    if (dtMs > 0 && dtMs < 1000) this.frames.push(dtMs);
    if (now - this.windowStart < this.o.window * 1000 || this.frames.length < 10) return null;
    const n = this.frames.length;
    let slow = 0;
    let pauses = 0;
    for (const f of this.frames) {
      if (f > 24) slow++;
      if (f > 60) pauses++;
    }
    this.frames.length = 0;
    this.windowStart = now;
    const before = this.scale;
    if (slow / n > 0.2 || pauses >= 2) {
      // Struggling: ease off quickly.
      this.scale = Math.min(this.o.max, this.scale * (pauses >= 4 ? 1.35 : 1.2));
      this.calm = 0;
      this.easedAt = now;
    } else if (slow / n < 0.05 && pauses === 0) {
      // Smooth for a few windows in a row, and a while since it last eased off: sharpen
      // gently (slower than easing off, so it doesn't bounce back into the slow zone; every
      // change of detail swaps distant tiles, which shows as a flicker on far hills).
      if (++this.calm >= 3 && now - this.easedAt > 10_000) {
        this.scale = Math.max(this.o.min, this.scale / 1.08);
        this.calm = 0;
      }
    } else this.calm = 0;
    return this.scale !== before ? this.scale : null;
  }
}

/**
 * Keep a Google 3D tileset's level of detail steady, so distant hills don't flicker between a
 * coarse and a fine shape.
 *
 * Memory: Cesium coarsens detail 2% a frame while the tile cache is over its limit and
 * sharpens it 2% a frame as soon as it's under, so near the limit (a dense city on an iPad)
 * detail bounced every few frames. Coarsening still happens at once; sharpening back is slow
 * while the cache is nearly full and quicker once there's real room (under 85%).
 *
 * Distance falloff: Cesium recomputes how fast detail falls off with distance every frame
 * from where the camera points (more falloff looking at the horizon), so banking and
 * pitching in a turn swapped far tiles back and forth. Ease it gently instead.
 */
export interface SteadyTileset {
  totalMemoryUsageInBytes: number;
  cacheBytes: number;
}
export function steadyTileDetail(tileset: SteadyTileset): void {
  const t = tileset as unknown as {
    _memoryAdjustedScreenSpaceError: number;
    _dynamicScreenSpaceErrorComputedDensity?: number;
    prePassesUpdate: (fs: unknown) => void;
  };
  const original = t.prePassesUpdate;
  if (typeof original !== "function") return;
  let density: number | null = null;
  t.prePassesUpdate = function (frameState: unknown) {
    const before = t._memoryAdjustedScreenSpaceError;
    original.call(this, frameState);
    const after = t._memoryAdjustedScreenSpaceError;
    if (after < before) {
      const used = tileset.totalMemoryUsageInBytes / tileset.cacheBytes;
      t._memoryAdjustedScreenSpaceError = Math.max(after, before / (used < 0.85 ? 1.0015 : 1.0004));
    }
    const raw = t._dynamicScreenSpaceErrorComputedDensity;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      density = density === null ? raw : density + (raw - density) * 0.01;
      t._dynamicScreenSpaceErrorComputedDensity = density;
    }
  };
}

const SPEED_STEPS = [1, 1.5, 2.2, 3];
/** Next speed-detail step: up once `want` reaches the next step, down once 20% below this one. */
export function speedStep(current: number, want: number): number {
  let i = Math.max(0, SPEED_STEPS.indexOf(current));
  while (i < SPEED_STEPS.length - 1 && want >= SPEED_STEPS[i + 1]) i++;
  while (i > 0 && want < SPEED_STEPS[i] * 0.8) i--;
  return SPEED_STEPS[i];
}

/**
 * Cesium copies a tileset's statistics a few times every frame (and on every ground-height
 * reading), and each copy duplicated a table with one entry per loaded map texture. With a lot
 * of map loaded (a long, fast flight in Google 3D), that churned out hundreds of megabytes of
 * throwaway memory a minute, so the game got slower the longer it flew and the browser kept
 * pausing to clean up. The copies are only ever read, so let them share the table instead.
 * `stats` is any tileset's statistics object (Cesium doesn't export its class).
 */
export function shareTextureCounts(stats: object): void {
  const Stats = stats.constructor as unknown as { clone?: (s: Record<string, unknown>, r: Record<string, unknown>) => void; __playnesShared?: boolean };
  if (!Stats || typeof Stats.clone !== "function" || Stats.__playnesShared) return;
  const clone = Stats.clone;
  const empty = {};
  Stats.clone = (s, r) => {
    const table = s.texturesReferenceCounterById;
    s.texturesReferenceCounterById = empty;
    try {
      clone(s, r);
    } finally {
      s.texturesReferenceCounterById = table;
    }
    r.texturesReferenceCounterById = table;
  };
  Stats.__playnesShared = true;
}
