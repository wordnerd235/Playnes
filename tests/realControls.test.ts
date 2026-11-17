import { describe, expect, it } from "vitest";
import { AIRCRAFT } from "../src/data/aircraft.ts";
import { computeCommands, createMemory, REAL_CONTROLS, type Guidance, type StickInput } from "../src/sim/assist.ts";
import { createState, densityRatio, perfFor, step } from "../src/sim/physics.ts";

const DT = 1 / 60;

/** Free Flight with the grown-up "Real controls" setting: the stick sets rates, not angles. */
function setup(id = "c172") {
  const ac = AIRCRAFT.find((a) => a.id === id)!;
  const p = perfFor(ac);
  const alt = 1500;
  const speed = (p.vclimb * 1.3) / Math.sqrt(densityRatio(alt));
  const s = createState({ lat: 36, lon: -82, alt, heading: 0, onGround: false, speed, gearDown: true, flaps: 0 });
  const mem = createMemory();
  const g: Guidance = {
    targetHeading: null, targetVs: 0, targetSpeed: null, agl: alt, runwayAgl: null, landing: false,
    autoFlare: false, groundHeading: null, wantRotate: true, autoRotate: false, maxBank: 60,
  };
  const fly = (seconds: number, input: Partial<StickInput>) => {
    for (let t = 0; t < seconds; t += DT) {
      const cmd = computeCommands(REAL_CONTROLS, { roll: 0, pitch: 0, throttle: 0.75, brake: 0, ...input }, g, s, p, mem, DT);
      step(s, cmd, p, { groundHeight: 0 }, DT);
    }
  };
  return { s, p, mem, fly };
}

describe("real controls", () => {
  it("stays banked when the stick is let go", () => {
    const { s, fly } = setup();
    fly(1, { roll: 1 });
    const bank = s.bank;
    expect(bank).toBeGreaterThan(20);
    fly(4, {});
    // Still in the turn (a little nose drop is fine, but the wings don't level by themselves).
    expect(s.bank).toBeGreaterThan(bank - 2);
    fly(1.2, { roll: -1 });
    expect(Math.abs(s.bank)).toBeLessThan(8);
  });

  it("a small nudge rolls a little, a big one rolls a lot", () => {
    const a = setup();
    a.fly(0.5, { roll: 0.25 });
    const b = setup();
    b.fly(0.5, { roll: 1 });
    expect(a.s.bank).toBeGreaterThan(1);
    expect(b.s.bank).toBeGreaterThan(a.s.bank * 2.5);
  });

  it("keeps the climb it was set to when the stick is let go", () => {
    const { s, fly } = setup();
    fly(1.2, { pitch: 1 });
    const gamma = s.gamma;
    expect(gamma).toBeGreaterThan(2.5);
    fly(3, {});
    expect(s.gamma).toBeGreaterThan(gamma * 0.7);
    // Push back down and it settles into a descent, and stays there.
    fly(2.5, { pitch: -1 });
    expect(s.gamma).toBeLessThan(-2);
    const down = s.gamma;
    fly(2, {});
    expect(s.gamma).toBeLessThan(down * 0.6);
  });

  it("a steep bank with no back pressure lets the nose drop", () => {
    const { s, fly } = setup();
    fly(1.5, { roll: 1 });
    expect(s.bank).toBeGreaterThan(45);
    fly(6, {});
    expect(s.gamma).toBeLessThan(-1);
  });

  it("the jets get there too, and the F-16 rolls fast", () => {
    for (const id of ["phenom300", "g700"]) {
      const { s, fly } = setup(id);
      fly(1, { roll: 1 });
      expect(s.bank).toBeGreaterThan(18);
    }
    const f = setup("f16");
    f.fly(0.5, { roll: 1 });
    expect(f.s.bank).toBeGreaterThan(40);
  });
});
