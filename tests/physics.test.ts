import { describe, expect, it } from "vitest";
import { AIRCRAFT, aircraftById } from "../src/data/aircraft.ts";
import { computeCommands, createMemory, type Guidance, type StickInput } from "../src/sim/assist.ts";
import { KT } from "../src/sim/geo.ts";
import { createState, perfFor, step, type FlightEvent } from "../src/sim/physics.ts";

const DT = 1 / 60;
const noInput: StickInput = { roll: 0, pitch: 0, throttle: null, brake: 0 };

function baseGuidance(over: Partial<Guidance> = {}): Guidance {
  return {
    targetHeading: null,
    targetVs: 0,
    targetSpeed: null,
    agl: 500,
    runwayAgl: null,
    landing: false,
    autoFlare: false,
    groundHeading: 90,
    wantRotate: true,
    autoRotate: false,
    ...over,
  };
}

function takeoff(id: string) {
  const ac = aircraftById(id);
  const p = perfFor(ac);
  const s = createState({ lat: 36, lon: -82, alt: 0, heading: 90 });
  const mem = createMemory();
  let t = 0;
  let liftoffAt = -1;
  let rollDist = 0;
  while (t < 120) {
    const input = { ...noInput, throttle: 1, pitch: s.speed > p.vr ? 1 : 0 };
    const cmd = computeCommands(1, input, baseGuidance({ targetVs: 8, targetSpeed: s.onGround ? null : p.vclimb }), s, p, mem, DT);
    const before = s.speed;
    const ev = step(s, cmd, p, { groundHeight: 0 }, DT);
    if (s.onGround) rollDist += ((before + s.speed) / 2) * DT;
    t += DT;
    if (ev.some((e) => e.type === "liftoff")) liftoffAt = t;
    if (liftoffAt > 0 && t > liftoffAt + 30) break;
  }
  return { s, liftoffAt, rollDist, p };
}

describe("flight model", () => {
  it("every aircraft takes off in a believable distance and climbs", () => {
    for (const ac of AIRCRAFT) {
      const r = takeoff(ac.id);
      expect(r.liftoffAt, ac.id).toBeGreaterThan(5);
      expect(r.liftoffAt, ac.id).toBeLessThan(60);
      expect(r.rollDist, ac.id).toBeGreaterThan(200);
      expect(r.rollDist, ac.id).toBeLessThan(2400);
      expect(r.s.alt, ac.id).toBeGreaterThan(60);
      expect(r.s.onGround).toBe(false);
    }
  });

  it("stays on the ground until the pilot rotates", () => {
    const ac = aircraftById("phenom100");
    const p = perfFor(ac);
    const s = createState({ lat: 36, lon: -82, alt: 0, heading: 90 });
    const mem = createMemory();
    for (let i = 0; i < 60 * 40; i++) {
      const cmd = computeCommands(1, { ...noInput, throttle: 1 }, baseGuidance(), s, p, mem, DT);
      step(s, cmd, p, { groundHeight: 0 }, DT);
    }
    expect(s.onGround).toBe(true);
    expect(s.speed).toBeGreaterThan(p.vr);
  });

  it("turn rate follows bank angle and speed", () => {
    const ac = aircraftById("c172");
    const p = perfFor(ac);
    const s = createState({ lat: 36, lon: -82, alt: 1000, heading: 0, onGround: false, speed: 100 * KT, gearDown: true, flaps: 0 });
    const mem = createMemory();
    for (let i = 0; i < 60 * 10; i++) {
      const cmd = computeCommands(1, { ...noInput, roll: 1 }, baseGuidance({ targetSpeed: 100 * KT, groundHeading: null }), s, p, mem, DT);
      step(s, cmd, p, { groundHeight: 0 }, DT);
    }
    // 30 degrees of bank at ~100 kt is roughly 6 deg/s, so ~50 deg in 10 s after roll-in.
    expect(s.heading).toBeGreaterThan(35);
    expect(s.heading).toBeLessThan(75);
    expect(Math.abs(s.alt - 1000)).toBeLessThan(30);
  });

  it("auto-flare gives a soft touchdown on a 3 degree glide path", () => {
    for (const id of ["c172", "phenom100", "g700"]) {
      const ac = aircraftById(id);
      const p = perfFor(ac);
      const glideVs = -p.vapp * Math.tan((3 * Math.PI) / 180);
      const s = createState({ lat: 36, lon: -82, alt: 150, heading: 0, onGround: false, speed: p.vapp, gearDown: true, flaps: 3 });
      s.gamma = -3;
      s.vs = glideVs;
      const mem = createMemory();
      let touchdown: FlightEvent | undefined;
      for (let i = 0; i < 60 * 120 && !touchdown; i++) {
        const g = baseGuidance({ targetVs: glideVs, targetSpeed: p.vapp, landing: true, autoFlare: true, runwayAgl: s.alt, agl: s.alt, groundHeading: null, wantRotate: false });
        const cmd = computeCommands(1, noInput, g, s, p, mem, DT);
        touchdown = step(s, cmd, p, { groundHeight: 0 }, DT).find((e) => e.type === "touchdown");
      }
      expect(touchdown, id).toBeDefined();
      const sink = (touchdown as { sinkFpm: number }).sinkFpm;
      expect(sink, id).toBeLessThan(200);
      expect(sink, id).toBeGreaterThan(40);
    }
  });

  it("ground buddy pulls up near terrain when not landing", () => {
    const ac = aircraftById("phenom100");
    const p = perfFor(ac);
    const s = createState({ lat: 36, lon: -82, alt: 200, heading: 0, onGround: false, speed: 150 * KT, gearDown: false, flaps: 0 });
    const mem = createMemory();
    let minAlt = Infinity;
    for (let i = 0; i < 60 * 30; i++) {
      const cmd = computeCommands(2, { ...noInput, pitch: -1 }, baseGuidance({ agl: s.alt, targetSpeed: 150 * KT, groundHeading: null }), s, p, mem, DT);
      step(s, cmd, p, { groundHeight: 0 }, DT);
      minAlt = Math.min(minAlt, s.alt);
    }
    expect(minAlt).toBeGreaterThan(5);
    expect(s.onGround).toBe(false);
  });
});
