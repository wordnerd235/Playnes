import { describe, expect, it } from "vitest";
import { AIRCRAFT, aircraftById } from "../src/data/aircraft.ts";
import { computeCommands, createMemory, type Guidance, type StickInput } from "../src/sim/assist.ts";
import { KT } from "../src/sim/geo.ts";
import { createState, indicated, perfFor, step, type FlightEvent } from "../src/sim/physics.ts";

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
    // Full stick = 45 degrees of bank: at ~100 kt that is about 11 deg/s, so ~95 deg in 10 s after roll-in.
    expect(s.heading).toBeGreaterThan(80);
    expect(s.heading).toBeLessThan(115);
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

describe("real-world performance", () => {
  const KT_ = 0.514444;
  const FPM = 0.3048 / 60;
  const freeFlight = (over: Partial<Guidance> = {}): Guidance => baseGuidance({ landing: true, groundHeading: null, wantRotate: false, agl: 9000, ...over });

  function hold(id: string, altFt: number, throttle: number, seconds: number, startKt: number, pitch = 0) {
    const ac = aircraftById(id);
    const p = perfFor(ac);
    const s = createState({ lat: 35, lon: -81, alt: altFt * 0.3048, heading: 0, onGround: false, speed: startKt * KT_, gearDown: false, flaps: 0 });
    s.throttle = throttle;
    const mem = createMemory();
    for (let i = 0; i < seconds / DT; i++) {
      const cmd = computeCommands(2, { roll: 0, pitch, throttle, brake: 0 }, freeFlight(), s, p, mem, DT);
      step(s, cmd, p, { groundHeight: -1e5 }, DT);
    }
    return { s, p };
  }

  it("cruises at book true airspeed at cruise altitude (92% power)", () => {
    for (const ac of AIRCRAFT) {
      const { s } = hold(ac.id, ac.cruiseAltFt, 0.92, 2400, ac.cruiseKt * 0.85);
      expect(Math.abs(s.speed / KT_ - ac.cruiseKt), ac.id).toBeLessThan(6);
    }
  });

  it("never goes past its maximum operating speed", () => {
    for (const ac of AIRCRAFT) {
      const { s } = hold(ac.id, 1000, 1, 400, ac.vclimb);
      expect(indicated(s.speed, s.alt) / KT_, ac.id).toBeLessThan(ac.vmo * 1.05);
    }
  });

  it("with the throttle at idle the plane slows and then glides down", () => {
    for (const id of ["c172", "phenom100", "g700"]) {
      const { s, p } = hold(id, 10000, 0, 300, aircraftById(id).cruiseKt * 0.5);
      expect(s.vs / FPM, id).toBeLessThan(-300);
      expect(indicated(s.speed, s.alt), id).toBeGreaterThan(p.vstall);
    }
  });

  it("thin air: the same jet is much faster high up than down low", () => {
    const low = hold("phenom100", 5000, 0.92, 1500, 250).s.speed;
    const high = hold("phenom100", 30000, 0.92, 1500, 300).s.speed;
    expect(high / low).toBeGreaterThan(1.15);
  });

  it("a Phenom 100 flies Charlotte to Tri-Cities (104 nm) in about 20-25 minutes", () => {
    const ac = aircraftById("phenom100");
    const p = perfFor(ac);
    const s = createState({ lat: 35, lon: -81, alt: 230, heading: 0, onGround: false, speed: 130 * KT_, gearDown: false, flaps: 0 });
    const mem = createMemory();
    let dist = 0;
    let t = 0;
    const total = 104 * 1852;
    while (dist < total && t < 3600) {
      const remaining = total - dist;
      const descending = remaining < (s.alt / 0.3048 / 1000) * 3 * 1852; // 3 nm per 1,000 ft
      const climb = !descending && s.alt < 25000 * 0.3048;
      const cmd = computeCommands(2, { roll: 0, pitch: climb ? 0.7 : descending ? -0.6 : 0, throttle: descending ? 0.15 : 1, brake: 0 }, freeFlight(), s, p, mem, DT);
      step(s, cmd, p, { groundHeight: -1e5 }, DT);
      dist += s.speed * Math.cos(s.gamma * Math.PI / 180) * DT;
      t += DT;
    }
    expect(t / 60).toBeGreaterThan(17);
    expect(t / 60).toBeLessThan(28);
  });

  /** Free Flight as the game flies it: real throttle, stick input, power-off glide on. */
  function free(id: string, o: { altFt: number; kt: number; throttle: number; pitch: number; seconds: number; flaps?: number; gear?: boolean }) {
    const ac = aircraftById(id);
    const p = perfFor(ac);
    const s = createState({ lat: 35, lon: -81, alt: o.altFt * 0.3048, heading: 0, onGround: false, speed: o.kt * KT_, gearDown: o.gear ?? false, flaps: o.flaps ?? 0 });
    s.throttle = o.throttle;
    const mem = createMemory();
    const g = baseGuidance({ landing: false, groundHeading: null, wantRotate: false, agl: 9000, powerGlide: true });
    let maxVs = -Infinity;
    let minVs = Infinity;
    let maxIas = 0;
    const start = { alt: s.alt, speed: s.speed };
    for (let i = 0; i < o.seconds / DT; i++) {
      const cmd = computeCommands(2, { roll: 0, pitch: o.pitch, throttle: o.throttle, brake: 0 }, g, s, p, mem, DT);
      step(s, cmd, p, { groundHeight: -1e5 }, DT);
      if (i * DT > 8) {
        maxVs = Math.max(maxVs, s.vs);
        minVs = Math.min(minVs, s.vs);
      }
      maxIas = Math.max(maxIas, indicated(s.speed, s.alt));
    }
    return { s, p, ac, start, maxVs: maxVs / FPM, minVs: minVs / FPM, maxIasKt: maxIas / KT_ };
  }

  it("full power with the stick centred holds altitude (no runaway altimeter at max speed)", () => {
    for (const ac of AIRCRAFT) {
      const r = free(ac.id, { altFt: 3000, kt: ac.vclimb, throttle: 1, pitch: 0, seconds: 300 });
      expect(Math.abs(r.s.alt - r.start.alt) / 0.3048, ac.id).toBeLessThan(60);
      expect(r.maxIasKt, ac.id).toBeLessThan(ac.vmo * 1.05);
    }
  });

  it("throttle off with the stick centred: the playne starts down right away and keeps its speed", () => {
    for (const ac of AIRCRAFT) {
      const kt = ac.kind === "piston" ? 100 : 230;
      const r = free(ac.id, { altFt: 8000, kt, throttle: 0, pitch: 0, seconds: 30 });
      const fpm = r.s.vs / FPM;
      expect(fpm, ac.id).toBeLessThan(ac.kind === "piston" ? -500 : -1200);
      expect(Math.abs(r.s.speed - r.start.speed) / r.start.speed, ac.id).toBeLessThan(0.15);
    }
  });

  it("dives fast with the stick pushed (speedbrakes hold the speed limit)", () => {
    const rows: string[] = [];
    for (const ac of AIRCRAFT) {
      const r = free(ac.id, { altFt: 20000, kt: ac.kind === "piston" ? 110 : 250, throttle: 0, pitch: -1, seconds: 90 });
      rows.push(`${ac.id} dive ${Math.round(-r.minVs)} fpm, max ${Math.round(r.maxIasKt)} kt`);
      expect(-r.minVs, ac.id).toBeGreaterThan(ac.kind === "piston" ? 1300 : ac.kind === "turboprop" ? 3200 : 4500);
      expect(r.maxIasKt, ac.id).toBeLessThan(ac.vmo * 1.06);
    }
    console.log(rows.join("\n"));
  });

  it("climbs near the book rate at full power and full pull", () => {
    const rows: string[] = [];
    for (const ac of AIRCRAFT) {
      const r = free(ac.id, { altFt: 2000, kt: ac.vclimb, throttle: 1, pitch: 1, seconds: 40 });
      const avg = ((r.s.alt - r.start.alt) / 0.3048 / 40) * 60;
      rows.push(`${ac.id} climb avg ${Math.round(avg)} fpm (book ${ac.climbFpm}), peak ${Math.round(r.maxVs)}`);
      expect(avg, ac.id).toBeGreaterThan(ac.climbFpm * 0.75);
    }
    console.log(rows.join("\n"));
  });

  it("zoom climb: pulling up from high speed climbs faster than the book rate at first", () => {
    for (const id of ["phenom100", "g700"]) {
      const ac = aircraftById(id);
      const r = free(id, { altFt: 3000, kt: 260, throttle: 1, pitch: 1, seconds: 14 });
      expect(r.maxVs, id).toBeGreaterThan(ac.climbFpm * 1.2);
    }
  });

  it("landing roll: autobrakes, spoilers and reversers stop every playne well within a runway", () => {
    const rows: string[] = [];
    for (const ac of AIRCRAFT) {
      const p = perfFor(ac);
      const s = createState({ lat: 35, lon: -81, alt: 0, heading: 0, onGround: true, speed: p.vapp, gearDown: true, flaps: 3 });
      let dist = 0;
      for (let i = 0; i < 120 / DT && s.speed > 0.5; i++) {
        const before = s.speed;
        step(s, { targetBank: 0, targetVs: 0, throttle: 0, brake: 0.6, rotate: false, groundHeading: 0, spoilers: 1, reverse: s.speed > 40 * KT_ }, p, { groundHeight: 0 }, DT);
        dist += ((before + s.speed) / 2) * DT;
      }
      rows.push(`${ac.id} ${Math.round(dist)} m`);
      // Shortest runway in the game is about 1,800 m; touchdown is ~300 m in.
      expect(dist, ac.id).toBeLessThan(1100);
    }
    console.log(rows.join("  "));
  });
});
