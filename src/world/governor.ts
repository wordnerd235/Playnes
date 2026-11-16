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
 * Stop Cesium's memory easing from see-sawing. Cesium coarsens detail 2% a frame while the
 * tile cache is over its limit and sharpens it 2% a frame as soon as it's under, so near the
 * limit (a dense city on an iPad) detail bounced every few frames and distant hills flickered
 * between a coarse and a fine shape. Coarsening still happens at once; sharpening back now
 * waits for real headroom (under 85% of the budget) and then goes slowly.
 */
export interface MemoryEasedTileset {
  totalMemoryUsageInBytes: number;
  cacheBytes: number;
}
export function steadyMemoryRelief(tileset: MemoryEasedTileset): void {
  const t = tileset as unknown as { _memoryAdjustedScreenSpaceError: number; prePassesUpdate: (fs: unknown) => void };
  const original = t.prePassesUpdate;
  if (typeof original !== "function") return;
  t.prePassesUpdate = function (frameState: unknown) {
    const before = t._memoryAdjustedScreenSpaceError;
    original.call(this, frameState);
    const after = t._memoryAdjustedScreenSpaceError;
    if (after >= before) return;
    const roomy = tileset.totalMemoryUsageInBytes < tileset.cacheBytes * 0.85;
    t._memoryAdjustedScreenSpaceError = roomy ? Math.max(after, before / 1.0015) : before;
  };
}
