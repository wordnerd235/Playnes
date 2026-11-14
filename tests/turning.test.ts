import { describe, expect, it } from "vitest";
import { AIRCRAFT } from "../src/data/aircraft.ts";
import { computeCommands, createMemory, type Guidance } from "../src/sim/assist.ts";
import { hoopGuidance, sTurnCourse } from "../src/sim/course.ts";
import { angleDiff, bearing, DEG, distance } from "../src/sim/geo.ts";
import { createState, indicated, perfFor, step } from "../src/sim/physics.ts";

const DT = 1 / 60;

/**
 * Fly the flight-school S-turn course like a 5-year-old: hold the stick toward the next hoop
 * when it is off to one side, let go when it is ahead, reacting a little late.
 */
function flyCourse(id: string) {
  const ac = AIRCRAFT.find((a) => a.id === id)!;
  const p = perfFor(ac);
  const speed = Math.min(p.vclimb, p.speedLimit) * 0.9;
  const alt = 750;
  const s = createState({ lat: 36, lon: -82, alt, heading: 40, onGround: false, speed, gearDown: true, flaps: 0 });
  const ias = indicated(speed, alt);
  const start = { lat: s.lat, lon: s.lon };
  const hoops = sTurnCourse(start, s.heading, speed, p.rollRate);
  const radius = Math.min(70, Math.max(40, ac.shape.span * 3));
  const mem = createMemory();
  let idx = 0;
  let passed = 0;
  let roll = 0;
  let decideIn = 0;
  for (let t = 0; t < 600 && idx < hoops.length; t += DT) {
    const h = hoops[idx];
    const err = angleDiff(bearing(s, h.pos), s.heading);
    decideIn -= DT;
    if (decideIn <= 0) {
      roll = Math.abs(err) > 8 ? Math.sign(err) : 0;
      decideIn = 0.3;
    }
    const hg = hoopGuidance(s, s.speed, h, idx > 0 ? hoops[idx - 1] : { pos: start, heading: 40 });
    const g: Guidance = {
      targetHeading: hg.heading, targetVs: 0, targetSpeed: ias, agl: alt, runwayAgl: null, landing: false,
      autoFlare: false, groundHeading: null, wantRotate: false, autoRotate: false, courseBank: hg.bank, maxBank: 35,
    };
    step(s, computeCommands(1, { roll, pitch: 0, throttle: null, brake: 0 }, g, s, p, mem, DT), p, { groundHeight: 0 }, DT);
    const d = distance(h.pos, s);
    const along = d * Math.cos((bearing(h.pos, s) - h.heading) * DEG);
    if (along >= 0) {
      if (Math.hypot(d, s.alt - alt) < radius * 1.2) passed++;
      idx++;
    }
  }
  return { passed, total: hoops.length };
}

describe("flight school turning course", () => {
  it("a kid steering toward the hoops gets nearly all of them in every playne", () => {
    const rows: string[] = [];
    for (const ac of AIRCRAFT) {
      const r = flyCourse(ac.id);
      rows.push(`${ac.id} ${r.passed}/${r.total}`);
    }
    console.log(rows.join("  "));
    for (const ac of AIRCRAFT) { const r = flyCourse(ac.id);
      expect(r.passed, ac.id).toBeGreaterThanOrEqual(r.total - 2);
    }
    console.log(rows.join("  "));
  });
});
