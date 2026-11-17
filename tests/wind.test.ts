import { describe, expect, it } from "vitest";
import { groundVelocity, gust, pickWind, windComponents, windCorrection, windVector } from "../src/sim/wind.ts";

const KT = 0.514444;

describe("wind", () => {
  it("off means no wind", () => {
    expect(pickWind("off")).toBeNull();
  });

  it("light and strong winds are in their ranges, mostly from the west", () => {
    for (let i = 0; i < 50; i++) {
      const l = pickWind("light")!, s = pickWind("strong")!;
      expect(l.speed / KT).toBeGreaterThanOrEqual(6);
      expect(l.speed / KT).toBeLessThanOrEqual(11);
      expect(s.speed / KT).toBeGreaterThanOrEqual(14);
      expect(s.speed / KT).toBeLessThanOrEqual(22);
      expect(l.fromDeg >= 200 || l.fromDeg <= 310).toBe(true);
    }
  });

  it("a west wind blows toward the east", () => {
    const v = windVector({ fromDeg: 270, speed: 10, gustiness: 0 });
    expect(v.east).toBeCloseTo(10);
    expect(v.north).toBeCloseTo(0);
  });

  it("a headwind slows you over the ground, a tailwind speeds you up", () => {
    const w = { fromDeg: 270, speed: 10, gustiness: 0 };
    expect(groundVelocity(270, 60, w).speed).toBeCloseTo(50);
    expect(groundVelocity(90, 60, w).speed).toBeCloseTo(70);
  });

  it("crosswind from the right: crab right and you track straight", () => {
    const w = { fromDeg: 360, speed: 10, gustiness: 0 }; // from the north
    expect(windComponents(w, 270).cross).toBeCloseTo(10); // flying west: wind on the right
    const wca = windCorrection(w, 270, 60);
    expect(wca).toBeGreaterThan(5);
    const g = groundVelocity(270 + wca, 60, w);
    expect(g.track).toBeCloseTo(270, 1);
  });

  it("gusts are small and smooth", () => {
    const w = { fromDeg: 270, speed: 20 * KT, gustiness: 1 };
    let max = 0, jump = 0, prev = gust(w, 0).vs;
    for (let t = 0; t < 120; t += 1 / 60) {
      const g = gust(w, t);
      max = Math.max(max, Math.abs(g.vs));
      jump = Math.max(jump, Math.abs(g.vs - prev));
      prev = g.vs;
    }
    expect(max).toBeLessThan(2);
    expect(jump).toBeLessThan(0.05);
  });
});
