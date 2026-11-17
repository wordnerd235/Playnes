import { describe, expect, it } from "vitest";
import { AIRCRAFT, CHINOOK_PERF } from "../src/data/aircraft.ts";
import { createState, densityRatio, perfFor, step, type Commands, type StepEnv } from "../src/sim/physics.ts";
import { heliVelocity, stepHeli } from "../src/sim/heli.ts";

const DT = 1 / 60;
const KT = 0.514444;
const perf = (id: string) => perfFor(AIRCRAFT.find((a) => a.id === id)!);
const cmd = (o: Partial<Commands> = {}): Commands => ({ targetBank: 0, targetVs: 0, throttle: 0.6, brake: 0, rotate: false, groundHeading: null, ...o });

/** "Realistic details": the grown-up setting's extras. */
describe("realistic details", () => {
  it("ground effect: coming in fast, it floats along just above the runway", () => {
    const run = (realism: boolean) => {
      const p = perf("c172");
      const s = createState({ lat: 36, lon: -82, alt: 4, heading: 0, onGround: false, speed: p.vapp * 1.25, gearDown: true, flaps: 3, gamma: -2 });
      let t = 0;
      while (!s.onGround && t < 60) {
        step(s, cmd({ targetVs: -1, throttle: 0 }), p, { groundHeight: 0, realism }, DT);
        t += DT;
      }
      return t;
    };
    expect(run(true)).toBeGreaterThan(run(false) * 1.5);
  });

  it("a hard arrival bounces back into the air; a gentle one doesn't", () => {
    const land = (vs: number) => {
      const p = perf("c172");
      const s = createState({ lat: 36, lon: -82, alt: 0.2, heading: 0, onGround: false, speed: p.vapp, gearDown: true, flaps: 3, gamma: (Math.asin(vs / p.vapp) * 180) / Math.PI });
      s.vs = vs;
      const events: string[] = [];
      for (let i = 0; i < 30 && !s.onGround; i++) for (const e of step(s, cmd({ targetVs: vs, throttle: 0 }), p, { groundHeight: 0, realism: true }, DT)) events.push(e.type);
      return events;
    };
    expect(land(-4)).toContain("bounce");
    expect(land(-1)).not.toContain("bounce");
    expect(land(-1)).toContain("touchdown");
  });

  it("a propeller pulls left at full power on the takeoff run (the PC-12 hardest); jets don't", () => {
    const drift = (id: string, realism: boolean) => {
      const p = perf(id);
      const s = createState({ lat: 36, lon: -82, alt: 0, heading: 90, onGround: true, speed: 0, gearDown: true, flaps: 1 });
      for (let t = 0; t < 6; t += DT) step(s, cmd({ throttle: 1 }), p, { groundHeight: 0, realism }, DT);
      return ((s.heading - 90 + 540) % 360) - 180;
    };
    expect(drift("pc12", true)).toBeLessThan(-3);
    expect(drift("pc12", true)).toBeLessThan(drift("c172", true));
    expect(drift("c172", false)).toBeCloseTo(0, 3);
    expect(drift("g700", true)).toBeCloseTo(0, 3);
  });

  it("right rudder holds the swing", () => {
    const p = perf("pc12");
    const s = createState({ lat: 36, lon: -82, alt: 0, heading: 90, onGround: true, speed: 0, gearDown: true, flaps: 1 });
    for (let t = 0; t < 6; t += DT) step(s, cmd({ throttle: 1, rudder: 0.3 }), p, { groundHeight: 0, realism: true }, DT);
    expect(Math.abs(((s.heading - 90 + 540) % 360) - 180)).toBeLessThan(8);
  });

  it("rudder in the air yaws the nose, and rolls it a little the same way", () => {
    const p = perf("c172");
    const s = createState({ lat: 36, lon: -82, alt: 1000, heading: 0, onGround: false, speed: p.vclimb * 1.3, gearDown: true, flaps: 0 });
    const env: StepEnv = { groundHeight: 0, realism: true };
    for (let t = 0; t < 2; t += DT) step(s, { ...cmd({ rudder: 1 }), targetBank: s.bank }, p, env, DT);
    expect(s.heading).toBeGreaterThan(5);
    expect(s.bank).toBeGreaterThan(3);
  });

  it("F-16: holding the nose up after touchdown slows it faster than lowering it", () => {
    const roll = (aerobrake: boolean) => {
      const p = perf("f16");
      const s = createState({ lat: 36, lon: -82, alt: 0, heading: 0, onGround: true, speed: p.vapp * 0.95, gearDown: true, flaps: 3 });
      for (let t = 0; t < 6; t += DT) step(s, cmd({ throttle: 0, aerobrake }), p, { groundHeight: 0, realism: true }, DT);
      return { speed: s.speed, pitch: s.pitch, onGround: s.onGround };
    };
    const nose = roll(true), flat = roll(false);
    expect(nose.onGround).toBe(true);
    expect(nose.pitch).toBeGreaterThan(10);
    expect(nose.speed).toBeLessThan(flat.speed - 3);
  });

  it("F-16 rolls at its full 240 degrees a second", () => {
    const p = perf("f16");
    const spd = 300 * KT / Math.sqrt(densityRatio(3000));
    const s = createState({ lat: 36, lon: -82, alt: 3000, heading: 0, onGround: false, speed: spd, gearDown: false, flaps: 0 });
    step(s, cmd({ targetBank: 80 }), p, { groundHeight: 0, realism: true }, 0.25);
    expect(s.bank).toBeGreaterThan(55);
  });

  it("PC-12: with real stalls, the stick pusher stops the stall", () => {
    const p = perf("pc12");
    const s = createState({ lat: 36, lon: -82, alt: 1500, heading: 0, onGround: false, speed: p.vclimb, gearDown: false, flaps: 0 });
    const events: string[] = [];
    for (let t = 0; t < 40; t += DT) for (const e of step(s, cmd({ targetVs: 2, throttle: 0 }), p, { groundHeight: 0, realStall: true }, DT)) events.push(e.type);
    expect(events).toContain("stick-pusher");
    expect(events).not.toContain("stall");
  });

  it("the Chinook taxis on its wheels with the stick forward", () => {
    const s = createState({ lat: 36, lon: -82, alt: 0, heading: 0, onGround: true, speed: 0, gearDown: true, flaps: 0 });
    const lat0 = s.lat;
    for (let t = 0; t < 8; t += DT) stepHeli(s, { collective: 0, fwd: 1, turn: 0, slide: 0 }, CHINOOK_PERF, { groundHeight: 0, cushion: true, taxi: true }, DT);
    expect(s.onGround).toBe(true);
    expect(heliVelocity(s).fwd).toBeGreaterThan(5);
    expect((s.lat - lat0) * 111320).toBeGreaterThan(20);
    // Without the setting it stays put.
    const s2 = createState({ lat: 36, lon: -82, alt: 0, heading: 0, onGround: true, speed: 0, gearDown: true, flaps: 0 });
    for (let t = 0; t < 4; t += DT) stepHeli(s2, { collective: 0, fwd: 1, turn: 0, slide: 0 }, CHINOOK_PERF, { groundHeight: 0, cushion: true }, DT);
    expect(heliVelocity(s2).fwd).toBe(0);
  });
});
