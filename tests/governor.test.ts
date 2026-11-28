import { describe, expect, it } from "vitest";
import { DetailGovernor, speedStep, steadyTileDetail, TileLimiter } from "../src/world/governor.ts";

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

describe("steady tile detail", () => {
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

  it("coarsens at once when memory runs out but sharpens back only slowly near the limit", () => {
    const mem = { bytes: 140 };
    const ts = fakeTileset(mem);
    steadyTileDetail(ts);
    for (let i = 0; i < 20; i++) ts.prePassesUpdate(null);
    const eased = ts._memoryAdjustedScreenSpaceError;
    expect(eased).toBeGreaterThan(20);
    mem.bytes = 95; // just under the budget: Cesium would sharpen 2% a frame (~70% a second)
    for (let i = 0; i < 60; i++) ts.prePassesUpdate(null);
    expect(ts._memoryAdjustedScreenSpaceError).toBeGreaterThan(eased * 0.97);
    expect(ts._memoryAdjustedScreenSpaceError).toBeLessThan(eased);
  });

  it("sharpens back steadily once memory has been calm for a while, even with the cache nearly full", () => {
    const mem = { bytes: 140 };
    const ts = fakeTileset(mem);
    steadyTileDetail(ts);
    for (let i = 0; i < 20; i++) ts.prePassesUpdate(null);
    mem.bytes = 97; // a full cache is normal on a long flight
    for (let i = 0; i < 150; i++) ts.prePassesUpdate(null);
    // Still mostly coarse while waiting for calm (no bouncing near the limit)...
    expect(ts._memoryAdjustedScreenSpaceError).toBeGreaterThan(23);
    // ...then fully sharp again within ~10 s at 30 fps (it took minutes before).
    for (let i = 0; i < 300; i++) ts.prePassesUpdate(null);
    expect(ts._memoryAdjustedScreenSpaceError).toBeCloseTo(16, 5);
  });

  it("eases the distance falloff instead of jumping with every camera tilt", () => {
    const mem = { bytes: 50 };
    const ts = fakeTileset(mem) as ReturnType<typeof fakeTileset> & { _dynamicScreenSpaceErrorComputedDensity: number };
    let raw = 2e-4;
    const update = ts.prePassesUpdate;
    ts.prePassesUpdate = function (fs: unknown) {
      update.call(this, fs);
      this._dynamicScreenSpaceErrorComputedDensity = raw;
    };
    steadyTileDetail(ts);
    ts.prePassesUpdate(null);
    expect(ts._dynamicScreenSpaceErrorComputedDensity).toBeCloseTo(2e-4, 9);
    raw = 1e-4; // the camera tilted
    ts.prePassesUpdate(null);
    expect(ts._dynamicScreenSpaceErrorComputedDensity).toBeGreaterThan(1.95e-4);
    for (let i = 0; i < 600; i++) ts.prePassesUpdate(null);
    expect(ts._dynamicScreenSpaceErrorComputedDensity).toBeCloseTo(1e-4, 6);
  });

  it("sharpens back slowly once there's real room", () => {
    const mem = { bytes: 140 };
    const ts = fakeTileset(mem);
    steadyTileDetail(ts);
    for (let i = 0; i < 20; i++) ts.prePassesUpdate(null);
    const eased = ts._memoryAdjustedScreenSpaceError;
    mem.bytes = 50;
    ts.prePassesUpdate(null);
    expect(ts._memoryAdjustedScreenSpaceError).toBeGreaterThan(eased / 1.002);
    for (let i = 0; i < 2000; i++) ts.prePassesUpdate(null);
    expect(ts._memoryAdjustedScreenSpaceError).toBeCloseTo(16, 5);
  });
});

describe("speed detail steps", () => {
  it("steps up with speed and only steps down well below a step (no flapping in turns)", () => {
    let k = 1;
    k = speedStep(k, 1.2);
    expect(k).toBe(1);
    k = speedStep(k, 1.6);
    expect(k).toBe(1.5);
    k = speedStep(k, 2.3);
    expect(k).toBe(2.2);
    // Speed bled off in a turn: small dips keep the step.
    k = speedStep(k, 2.0);
    expect(k).toBe(2.2);
    k = speedStep(k, 1.8);
    expect(k).toBe(2.2);
    k = speedStep(k, 1.7);
    expect(k).toBe(1.5);
    k = speedStep(k, 0.5);
    expect(k).toBe(1);
  });
});

describe("shared texture counts in tileset statistics", () => {
  it("copies statistics without duplicating the per-texture table", async () => {
    const { shareTextureCounts } = await import("../src/world/governor.ts");
    class Stats {
      selected = 0;
      texturesReferenceCounterById: Record<string, number> = {};
      static clone(s: Stats, r: Stats) {
        r.selected = s.selected;
        r.texturesReferenceCounterById = { ...s.texturesReferenceCounterById };
      }
    }
    const main = new Stats();
    for (let i = 0; i < 1000; i++) main.texturesReferenceCounterById[`t${i}`] = 1;
    main.selected = 7;
    shareTextureCounts(main);
    shareTextureCounts(main); // patching twice is harmless
    const copy = new Stats();
    Stats.clone(main, copy);
    expect(copy.selected).toBe(7);
    expect(copy.texturesReferenceCounterById).toBe(main.texturesReferenceCounterById);
    expect(Object.keys(main.texturesReferenceCounterById).length).toBe(1000);
  });
});

describe("top speed step", () => {
  it("reaches the coarsest step at jet speed (~750 kt = 386 m/s)", () => {
    let k = 1;
    for (const want of [1.2, 1.6, 2.3, 3.1, 4.06]) k = speedStep(k, want);
    expect(k).toBe(4);
  });
});

describe("tile limit", () => {
  const feed = (l: TileLimiter, t0: number, secs: number, tiles: number) => {
    let t = t0;
    for (let i = 0; i < secs * 60; i++) l.frame((t += 1000 / 60), tiles);
    return t;
  };
  it("eases detail in small steps only after a few seconds over budget", () => {
    const l = new TileLimiter(200);
    let t = feed(l, 0, 3, 300);
    expect(l.scale).toBe(1); // one window over: waits
    t = feed(l, t, 3, 300);
    expect(l.scale).toBeCloseTo(1.15, 5); // far tiles: bigger steps
    t = feed(l, t, 16, 400);
    expect(l.scale).toBe(2); // far relief at its most within ~20 s
    t = feed(l, t, 4, 400);
    expect(l.scale).toBeCloseTo(2.12, 5); // then the whole view, in small steps
    feed(l, t, 300, 400);
    expect(l.scale).toBeLessThanOrEqual(3);
  });
  it("holds inside the band and sharpens back slowly with room", () => {
    const l = new TileLimiter(200);
    let t = feed(l, 0, 20, 300);
    t = feed(l, t, 2, 180); // (the window straddling the change)
    const eased = l.scale;
    expect(eased).toBeGreaterThan(1);
    t = feed(l, t, 20, 180); // inside the band: holds
    expect(l.scale).toBe(eased);
    t = feed(l, t, 8, 100);
    expect(l.scale).toBe(eased); // not before 10 s of room
    feed(l, t, 200, 100);
    expect(l.scale).toBe(1);
  });
  it("does nothing with no budget (computers)", () => {
    const l = new TileLimiter(0);
    feed(l, 0, 5, 900);
    expect(l.scale).toBe(1);
  });
});
