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
    } else if (slow / n < 0.05 && pauses === 0) {
      // Smooth for a few windows in a row: sharpen gently (slower than easing off, so it
      // doesn't bounce back into the slow zone).
      if (++this.calm >= 2) {
        this.scale = Math.max(this.o.min, this.scale / 1.08);
        this.calm = 0;
      }
    } else this.calm = 0;
    return this.scale !== before ? this.scale : null;
  }
}
