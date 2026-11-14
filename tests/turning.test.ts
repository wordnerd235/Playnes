import { describe, expect, it } from "vitest";
import { AIRCRAFT } from "../src/data/aircraft.ts";
import { computeCommands, createMemory, type Guidance } from "../src/sim/assist.ts";
import { hoopGuidance, sTurnCourse } from "../src/sim/course.ts";
import { angleDiff, bearing, DEG, distance } from "../src/sim/geo.ts";
import { createState, indicated, perfFor, step } from "../src/sim/physics.ts";

const DT = 1 / 60;

/** Fly the flight-school S-turn course like a 5-year-old: full stick toward the next hoop. */
function flyCourse(id: string, steerAssist: boolean) {
  const ac = AIRCRAFT.find((a) => a.id === id)!;
  const p = perfFor(ac);
  const speed = Math.min(p.vclimb, p.speedLimit) * 0.9;
  const alt = 750;
  const s = createState({ lat: 36, lon: -82, alt, heading: 40, onGround: false, speed, gearDown: true, flaps: 0 });
  const ias = indicated(speed, alt);
  const start = { lat: s.lat, lon: s.lon };
  const hoops = sTurnCourse(start, s.heading, speed, p.rollRate);
  const radius = Math.min(60, Math.max(30, ac.shape.span * 2.4));
  const mem = createMemory();
  let idx = 0;
  let passed = 0;
  for (let t = 0; t < 400 && idx < hoops.length; t += DT) {
    const h = hoops[idx];
    const hg = hoopGuidance(s, s.speed, h, idx > 0 ? hoops[idx - 1] : { pos: start, heading: 40 });
    const aim = steerAssist ? hg.heading : bearing(s, h.pos);
    const err = angleDiff(aim, s.heading);
    const roll = Math.sign(err) || 1;
    const g: Guidance = {
      targetHeading: aim, targetVs: 0, targetSpeed: ias, agl: alt, runwayAgl: null, landing: false,
      autoFlare: false, groundHeading: null, wantRotate: false, autoRotate: false, steerAssist, courseBank: hg.bank,
    };
    step(s, computeCommands(1, { roll, pitch: 0, throttle: null, brake: 0 }, g, s, p, mem, DT), p, { groundHeight: 0 }, DT);
    // Passed the hoop's plane?
    const d = distance(h.pos, s);
    const along = d * Math.cos((bearing(h.pos, s) - h.heading) * DEG);
    if (along >= 0) {
      const miss = Math.hypot(d, s.alt - alt);
      if (miss < radius * 1.2) passed++;
      idx++;
    }
  }
  return { passed, total: hoops.length };
}

describe("flight school turning course", () => {
  it("every playne can fly through all the hoops by steering toward them", () => {
    for (const ac of AIRCRAFT) {
      const r = flyCourse(ac.id, true);
      expect(r.passed, ac.id).toBe(r.total);
    }
  });
});
