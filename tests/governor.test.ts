import { describe, expect, it } from "vitest";
import { DetailGovernor } from "../src/world/governor.ts";

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
});
