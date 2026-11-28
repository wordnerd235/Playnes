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
  /** A frame slower than this (ms) counts as slow (default 24, below ~42 fps). */
  slowMs?: number;
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
    const slowMs = this.o.slowMs ?? 24;
    for (const f of this.frames) {
      if (f > slowMs) slow++;
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
      // (From the coarsest back to normal in about half a minute; it took over a minute.)
      if (++this.calm >= 2 && now - this.easedAt > 8_000) {
        this.scale = Math.max(this.o.min, this.scale / 1.1);
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
 * detail bounced every few frames. Coarsening still happens at once. Sharpening back waits
 * until memory has been calm (no coarsening) for ~5 seconds of frames, then goes at a steady
 * ~4% a second (fully sharp again within ~25 s). It used to depend on how full the cache was,
 * but the cache is meant to be full (it keeps tiles for coming back to): on any long flight it
 * stayed over 85%, so lost detail took over a minute to come back, or never did.
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
  let calm = 0;
  t.prePassesUpdate = function (frameState: unknown) {
    const before = t._memoryAdjustedScreenSpaceError;
    original.call(this, frameState);
    const after = t._memoryAdjustedScreenSpaceError;
    if (after > before) calm = 0;
    else calm++;
    if (after < before) t._memoryAdjustedScreenSpaceError = Math.max(after, before / (calm > 150 ? 1.0015 : 1.0002));
    const raw = t._dynamicScreenSpaceErrorComputedDensity;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      density = density === null ? raw : density + (raw - density) * 0.01;
      t._dynamicScreenSpaceErrorComputedDensity = density;
    }
  };
}

/**
 * Tile limit (iPads and phones): keeps the number of map tiles on screen near a budget by easing
 * detail a step when there are too many and sharpening back when there's room. Measured on an
 * iPad with the speed test: ~60 fps up to about 210 tiles, then slower in step with the count
 * (46 fps at 270, 41 at 309) - frames of 20-25 ms that the frame-rate governor (which waits for
 * 24 ms+) let pass. `budget` 0 = off. Feed it every frame; returns the new scale when it changes.
 */
export class TileLimiter {
  scale = 1;
  private sum = 0;
  private n = 0;
  private windowStart = -1;
  private over = 0;
  private calm = 0;

  // Changes are slow and small on purpose: every change of detail swaps tiles on screen for
  // coarser or sharper ones, which shows as flicker (the first version, adjusting every second
  // and fighting the frame-rate governor, overshot to a third of the budget and back).
  // Up to 2 the scale eases only the far tiles (cheap to look at), so it steps faster there;
  // beyond 2 it also eases detail everywhere (see world.ts), in small steps.
  constructor(private budget: number, private max = 3) {}

  frame(now: number, tilesDrawn: number): number | null {
    if (this.budget <= 0) return null;
    if (this.windowStart < 0) this.windowStart = now;
    this.sum += tilesDrawn;
    this.n++;
    if (now - this.windowStart < 2000) return null;
    const avg = this.sum / this.n;
    this.sum = this.n = 0;
    this.windowStart = now;
    const before = this.scale;
    if (avg > this.budget * 1.1) {
      // Too many for two windows in a row (4 s): ease a small step.
      this.calm = 0;
      if (++this.over >= 2) {
        this.scale = Math.min(this.max, this.scale < 2 ? Math.min(2, this.scale * 1.15) : this.scale * 1.06);
        this.over = 0;
      }
    } else if (avg < this.budget * 0.75) {
      // Room for more for five windows in a row (10 s): sharpen a small step.
      this.over = 0;
      if (++this.calm >= 5) {
        this.scale = Math.max(1, this.scale / 1.04);
        this.calm = 0;
      }
    } else this.over = this.calm = 0;
    return this.scale !== before ? this.scale : null;
  }
}

const SPEED_STEPS = [1, 1.5, 2.2, 3, 4];
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
