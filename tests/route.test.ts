import { describe, expect, it } from "vitest";
import { airportByCode } from "../src/data/airports.ts";
import { angleDiff, bearing, destination, distance } from "../src/sim/geo.ts";
import { FINAL_M, nearestIndex, planRoute } from "../src/sim/route.ts";

const CLT = airportByCode("CLT");

describe("Free Flight route", () => {
  it("starts at the playne along its heading and ends lined up with the runway", () => {
    const pos = destination(CLT, 0, 60000); // 60 km north, flying east
    const r = planRoute(pos, 90, CLT);
    const pts = r.points;
    expect(distance(pts[0], pos)).toBeLessThan(1);
    expect(Math.abs(angleDiff(bearing(pts[0], pts[1]), 90))).toBeLessThan(20);
    const last = pts[pts.length - 1];
    expect(distance(last, r.end!)).toBeLessThan(5);
    // The last 6 km are a straight line along the runway heading.
    const faf = pts[r.finalIndex];
    expect(Math.abs(distance(faf, last) - FINAL_M)).toBeLessThan(20);
    expect(Math.abs(angleDiff(bearing(faf, last), r.heading!))).toBeLessThan(1);
    expect(Math.abs(angleDiff(bearing(pts[r.finalIndex - 2], faf), r.heading!))).toBeLessThan(10);
  });

  it("picks the runway end facing the way you're coming from", () => {
    const fromNorth = planRoute(destination(CLT, 0, 50000), 180, CLT);
    expect(Math.abs(angleDiff(fromNorth.heading!, 180))).toBeLessThan(30);
    const fromSouth = planRoute(destination(CLT, 180, 50000), 0, CLT);
    expect(Math.abs(angleDiff(fromSouth.heading!, 0))).toBeLessThan(30);
  });

  it("is straight in when already lined up on final", () => {
    const first = planRoute(destination(CLT, 0, 50000), 180, CLT);
    const onFinal = destination(first.end!, first.heading! + 180, 4000);
    const r = planRoute(onFinal, first.heading!, CLT);
    expect(r.points.length).toBe(2);
  });

  it("a helicopter flies direct", () => {
    expect(planRoute(destination(CLT, 45, 30000), 0, CLT, { direct: true }).points.length).toBe(2);
  });

  it("turns back soon when the destination is behind", () => {
    const pos = destination(CLT, 0, 60000);
    const r = planRoute(pos, 0, CLT).points; // flying away from it
    const farthest = Math.max(...r.map((p) => distance(p, CLT)));
    expect(farthest - 60000).toBeLessThan(3500);
  });

  it("progress along a looping route doesn't jump across the loop", () => {
    const pos = destination(CLT, 0, 60000);
    const r = planRoute(pos, 0, CLT).points;
    expect(nearestIndex(r, pos, 0, 6).index).toBeLessThanOrEqual(6);
  });

  it("nearestIndex only moves forward", () => {
    const r = planRoute(destination(CLT, 0, 60000), 90, CLT).points;
    const mid = r[30];
    expect(nearestIndex(r, mid).index).toBe(30);
    expect(nearestIndex(r, r[5], 30).index).toBeGreaterThanOrEqual(30);
  });
});
