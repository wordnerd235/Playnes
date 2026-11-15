import { describe, expect, it } from "vitest";
import { createState } from "../src/sim/physics.ts";
import { heliTargetVs, heliVelocity, stepHeli, type HeliPerf } from "../src/sim/heli.ts";

const P: HeliPerf = { maxSpeed: 82, climb: 7.6, accel: 2.6, brake: 4, hoverYawRate: 32, maxBank: 30, ceiling: 4600 };
const KT = 0.514444;

function fly(s: ReturnType<typeof createState>, inp: { collective: number; fwd: number; turn: number; slide?: number }, seconds: number, ground = 0, cushion = true) {
  const ev: string[] = [];
  for (let t = 0; t < seconds; t += 0.02) for (const e of stepHeli(s, inp, P, { groundHeight: ground, cushion }, 0.02)) ev.push(e.type);
  return ev;
}

describe("Chinook flight model", () => {
  it("lever in the middle hovers; up climbs; down descends", () => {
    expect(heliTargetVs(0.5, P)).toBe(0);
    expect(heliTargetVs(1, P)).toBeCloseTo(7.6);
    expect(heliTargetVs(0, P)).toBeLessThan(-7.6);
  });

  it("lifts straight off, hovers in place, and stays put with hands off", () => {
    const s = createState({ lat: 36.47, lon: -82.41, alt: 0, heading: 50 });
    expect(fly(s, { collective: 0.9, fwd: 0, turn: 0 }, 6)).toContain("liftoff");
    expect(s.alt).toBeGreaterThan(15);
    const lat = s.lat;
    const alt = s.alt;
    fly(s, { collective: 0.5, fwd: 0, turn: 0 }, 10);
    expect(Math.abs(s.alt - alt)).toBeLessThan(6); // settles into the hover
    expect(Math.abs(s.lat - lat)).toBeLessThan(1e-6);
    expect(s.speed).toBe(0);
  });

  it("stick forward speeds up to about 160 knots; centred it keeps the speed; back slows to a hover", () => {
    const s = createState({ lat: 36.47, lon: -82.41, alt: 500, heading: 0, onGround: false });
    fly(s, { collective: 0.5, fwd: 1, turn: 0 }, 90, 0);
    expect(s.speed / KT).toBeGreaterThan(145);
    expect(s.speed / KT).toBeLessThanOrEqual(160);
    const v = s.speed;
    fly(s, { collective: 0.5, fwd: 0, turn: 0 }, 10, 0);
    expect(s.speed).toBeGreaterThan(v * 0.9);
    // Pull back briefly to stop (a short pull stops without backing up much).
    fly(s, { collective: 0.5, fwd: -1, turn: 0 }, 22, 0);
    expect(heliVelocity(s).fwd).toBeLessThan(2);
    expect(s.pitch).toBeGreaterThan(-12);
  });

  it("keep pulling back from a hover and it flies backward (about 35 knots), then settles when let go", () => {
    const s = createState({ lat: 36.47, lon: -82.41, alt: 500, heading: 0, onGround: false });
    const lat0 = s.lat;
    fly(s, { collective: 0.5, fwd: -1, turn: 0 }, 20, 0);
    expect(heliVelocity(s).fwd / KT).toBeLessThan(-30);
    expect(heliVelocity(s).fwd / KT).toBeGreaterThan(-36);
    expect(s.lat).toBeLessThan(lat0); // heading north, moving south
    expect(s.heading).toBeCloseTo(0, 5);
    expect(s.pitch).toBeGreaterThan(0); // nose up
    fly(s, { collective: 0.5, fwd: 0, turn: 0 }, 15, 0);
    expect(Math.abs(heliVelocity(s).fwd)).toBeLessThan(0.3);
  });

  it("slides sideways with the slide buttons when slow, not when fast", () => {
    const s = createState({ lat: 36.47, lon: -82.41, alt: 500, heading: 0, onGround: false });
    const lon0 = s.lon;
    fly(s, { collective: 0.5, fwd: 0, turn: 0, slide: 1 }, 10, 0);
    expect(heliVelocity(s).side / KT).toBeGreaterThan(30);
    expect(s.lon).toBeGreaterThan(lon0); // heading north, sliding right = east
    expect(s.heading).toBeCloseTo(0, 5);
    expect(s.bank).toBeGreaterThan(3); // leans into the slide
    fly(s, { collective: 0.5, fwd: 0, turn: 0 }, 10, 0);
    expect(Math.abs(heliVelocity(s).side)).toBeLessThan(0.1);
    const f = createState({ lat: 36.47, lon: -82.41, alt: 500, heading: 0, onGround: false });
    heliVelocity(f).fwd = 70;
    fly(f, { collective: 0.5, fwd: 0, turn: 0, slide: 1 }, 5, 0);
    expect(Math.abs(heliVelocity(f).side)).toBeLessThan(0.1);
  });

  it("turns on the spot when hovering and banks into turns when fast", () => {
    const s = createState({ lat: 36.47, lon: -82.41, alt: 500, heading: 0, onGround: false });
    fly(s, { collective: 0.5, fwd: 0, turn: 1 }, 2, 0);
    expect(s.heading).toBeGreaterThan(40);
    expect(Math.abs(s.bank)).toBeLessThan(10);
    heliVelocity(s).fwd = 70;
    fly(s, { collective: 0.5, fwd: 0, turn: 1 }, 3, 0);
    expect(s.bank).toBeGreaterThan(25);
  });

  it("with the co-pilot cushioning, even full-down lands gently", () => {
    const s = createState({ lat: 36.47, lon: -82.41, alt: 300, heading: 0, onGround: false });
    let sink = 0;
    for (let t = 0; t < 120 && !s.onGround; t += 0.02) {
      for (const e of stepHeli(s, { collective: 0, fwd: 0, turn: 0 }, P, { groundHeight: 100, cushion: true }, 0.02)) if (e.type === "touchdown") sink = e.sinkFpm;
    }
    expect(s.onGround).toBe(true);
    expect(sink).toBeLessThan(300);
  });

  it("without the cushion, diving into the ground is a hard landing", () => {
    const s = createState({ lat: 36.47, lon: -82.41, alt: 300, heading: 0, onGround: false });
    let sink = 0;
    for (let t = 0; t < 120 && !s.onGround; t += 0.02) {
      for (const e of stepHeli(s, { collective: 0, fwd: 0, turn: 0 }, P, { groundHeight: 100, cushion: false }, 0.02)) if (e.type === "touchdown") sink = e.sinkFpm;
    }
    expect(sink).toBeGreaterThan(1200);
  });

  it("won't climb past its ceiling", () => {
    const s = createState({ lat: 36.47, lon: -82.41, alt: 4500, heading: 0, onGround: false });
    fly(s, { collective: 1, fwd: 0, turn: 0 }, 60, 0);
    expect(s.alt).toBeLessThan(4700);
  });
});
