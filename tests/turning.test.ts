import { describe, expect, it } from "vitest";
import { AIRCRAFT } from "../src/data/aircraft.ts";
import { computeCommands, createMemory, type Guidance } from "../src/sim/assist.ts";
import { hoopGuidance, sTurnCourse } from "../src/sim/course.ts";
import { angleDiff, bearing, DEG, distance } from "../src/sim/geo.ts";
import { createState, densityRatio, indicated, perfFor, step } from "../src/sim/physics.ts";

const DT = 1 / 60;

/**
 * Fly the flight-school S-turn course like a 5-year-old: hold the stick toward the next hoop
 * when it is off to one side, let go when it is ahead, reacting a little late.
 */
function flyCourse(id: string, slammer = false) {
  const ac = AIRCRAFT.find((a) => a.id === id)!;
  const p = perfFor(ac);
  const alt = 750;
  // As the game flies it: 1.2 x approach speed (indicated), flaps 1, held by the co-pilot.
  const ias = p.vapp * 1.2;
  const speed = ias / Math.sqrt(densityRatio(alt));
  const s = createState({ lat: 36, lon: -82, alt, heading: 40, onGround: false, speed, gearDown: true, flaps: 1 });
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
      // Steer harder the further off the hoop is; let go when it's ahead.
      if (slammer) roll = Math.abs(err) > 8 ? Math.sign(err) : 0;
      else roll = Math.abs(err) > 4 ? Math.max(-1, Math.min(1, err / 15)) : 0;
      decideIn = slammer ? 0.3 : 0.2;
    }
    const hg = hoopGuidance(s, s.speed, h, idx > 0 ? hoops[idx - 1] : { pos: start, heading: 40 });
    const g: Guidance = {
      targetHeading: hg.heading, targetVs: 0, targetSpeed: ias, agl: alt, runwayAgl: null, landing: false,
      autoFlare: false, groundHeading: null, wantRotate: false, autoRotate: false, courseBank: hg.bank, maxBank: 30,
    };
    step(s, computeCommands(1, { roll, pitch: 0, throttle: null, brake: 0 }, g, s, p, mem, DT), p, { groundHeight: 0 }, DT);
    const d = distance(h.pos, s);
    const along = d * Math.cos((bearing(h.pos, s) - h.heading) * DEG);
    if (along >= 0) {
      if (Math.hypot(d, s.alt - alt) < radius * 1.2) passed++;
      idx++;
    }
  }
  return { passed, total: hoops.length, iasEnd: indicated(s.speed, s.alt), ias };
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
      // The co-pilot holds the lesson speed (no creeping faster and faster).
      expect(Math.abs(r.iasEnd - r.ias) / r.ias, ac.id).toBeLessThan(0.08);
    }
    console.log(rows.join("  "));
  });

  it("even slamming the stick side to side gets most of the hoops", () => {
    const rows: string[] = [];
    for (const ac of AIRCRAFT) {
      const r = flyCourse(ac.id, true);
      rows.push(`${ac.id} ${r.passed}`);
      expect(r.passed, ac.id).toBeGreaterThanOrEqual(10);
    }
    console.log("slammer:", rows.join("  "));
  });
});
