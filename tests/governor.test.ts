import { describe, expect, it } from "vitest";
import { DetailGovernor, steadyMemoryRelief } from "../src/world/governor.ts";

/** Feed `seconds` of frames at a steady interval (with an optional pause every `pauseEvery` frames). */
function run(g: DetailGovernor, t0: number, seconds: number, dt: number, pauseEvery = 0): number {
  let t = t0;
  for (let i = 0; t - t0 < seconds * 1000; i++) {
    const d = pauseEvery && i % pauseEvery === pauseEvery - 1 ? 120 : dt;
    t += d;
    g.frame(t, d);
  }
  return t;
}

describe("detail governor", () => {
  it("eases detail when frames drop and stays within its limits", () => {
    const g = new DetailGovernor();
    run(g, 0, 20, 33); // 30 fps
    expect(g.scale).toBeGreaterThan(1.5);
    expect(g.scale).toBeLessThanOrEqual(2.6);
  });

  it("reacts to repeated pauses even when most frames are fine", () => {
    const g = new DetailGovernor();
    run(g, 0, 6, 16.7, 20); // a 120 ms hitch three times a second
    expect(g.scale).toBeGreaterThan(1);
  });

  it("sharpens back up gently when smooth again", () => {
    const g = new DetailGovernor();
    let t = run(g, 0, 10, 33);
    const coarse = g.scale;
    t = run(g, t, 30, 16.7);
    expect(g.scale).toBeLessThan(coarse);
    run(g, t, 120, 16.7);
    expect(g.scale).toBeCloseTo(0.85, 2);
  });

  it("leaves a steady 60 fps alone apart from slow sharpening", () => {
    const g = new DetailGovernor();
    run(g, 0, 3, 16.7);
    expect(g.scale).toBeLessThanOrEqual(1);
    expect(g.scale).toBeGreaterThan(0.85);
  });

  it("ignores long gaps like a hidden tab", () => {
    const g = new DetailGovernor();
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += i % 50 === 0 ? 5000 : 16.7;
      g.frame(t, i % 50 === 0 ? 5000 : 16.7);
    }
    expect(g.scale).toBeLessThanOrEqual(1);
  });

  it("waits a while after easing off before sharpening again (no see-saw)", () => {
    const g = new DetailGovernor();
    let t = run(g, 0, 4, 33); // a few slow windows: eases off
    t = run(g, t, 2, 16.7); // smooth again (the window straddling the change may ease once more)
    const coarse = g.scale;
    expect(coarse).toBeGreaterThan(1);
    run(g, t, 6, 16.7); // still within 10 s of the last easing: holds
    expect(g.scale).toBe(coarse);
  });
});

describe("steady memory relief", () => {
  /** A stand-in for Cesium's tileset: its own easing moves detail 2% a frame either way. */
  function fakeTileset(mem: { bytes: number }) {
    const ts = {
      cacheBytes: 100,
      get totalMemoryUsageInBytes() {
        return mem.bytes;
      },
      maximumScreenSpaceError: 16,
      _memoryAdjustedScreenSpaceError: 16,
      prePassesUpdate(_fs: unknown) {
        if (mem.bytes < 100) this._memoryAdjustedScreenSpaceError = Math.max(this._memoryAdjustedScreenSpaceError / 1.02, this.maximumScreenSpaceError);
        else if (mem.bytes > 130) this._memoryAdjustedScreenSpaceError *= 1.02;
      },
    };
    return ts;
  }

  it("coarsens at once when memory runs out but doesn't sharpen straight back near the limit", () => {
    const mem = { bytes: 140 };
    const ts = fakeTileset(mem);
    steadyMemoryRelief(ts);
    for (let i = 0; i < 20; i++) ts.prePassesUpdate(null);
    const eased = ts._memoryAdjustedScreenSpaceError;
    expect(eased).toBeGreaterThan(20);
    mem.bytes = 95; // just under the budget: Cesium would sharpen 2% a frame here
    for (let i = 0; i < 60; i++) ts.prePassesUpdate(null);
    expect(ts._memoryAdjustedScreenSpaceError).toBe(eased);
  });

  it("sharpens back slowly once there's real room", () => {
    const mem = { bytes: 140 };
    const ts = fakeTileset(mem);
    steadyMemoryRelief(ts);
    for (let i = 0; i < 20; i++) ts.prePassesUpdate(null);
    const eased = ts._memoryAdjustedScreenSpaceError;
    mem.bytes = 50;
    ts.prePassesUpdate(null);
    expect(ts._memoryAdjustedScreenSpaceError).toBeGreaterThan(eased / 1.002);
    for (let i = 0; i < 2000; i++) ts.prePassesUpdate(null);
    expect(ts._memoryAdjustedScreenSpaceError).toBeCloseTo(16, 5);
  });
});
