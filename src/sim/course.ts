// Flight school S-turn hoop course, laid along a path the plane can really fly.

import { bearing, clamp, DEG, destination, distance, type LatLon } from "./geo.ts";

export interface CoursePoint {
  pos: LatLon;
  heading: number;
}

/**
 * Hoops along a gentle 20-degree-bank S-turn path (right, left, right), rolling at half the
 * plane's roll rate. Full stick gives 45 degrees, so there is plenty of room to catch up.
 */
export function sTurnCourse(start: LatLon, heading: number, speed: number, rollRate: number): CoursePoint[] {
  const plan = [0, 0, 1, 1, 1, 0, -1, -1, -1, -1, -1, 0, 1, 1, 1, 0];
  const out: CoursePoint[] = [];
  let hdg = heading;
  let pos = { ...start };
  let bank = 0;
  const rollStep = rollRate * 0.5 * 0.1;
  for (let i = 0; i < plan.length; i++) {
    for (let k = 0; k < 55; k++) {
      bank = clamp(plan[i] * 20, bank - rollStep, bank + rollStep);
      hdg += ((9.81 * Math.tan(bank * DEG)) / speed / DEG) * 0.1;
      pos = destination(pos, hdg, speed * 0.1);
    }
    if (i >= 1) out.push({ pos, heading: hdg });
  }
  return out;
}

/**
 * Hoop helper guidance: follow the line through the next hoop (in the hoop's direction), with
 * the bank the curve between hoops needs. `prev` is the hoop before (or the start).
 */
export function hoopGuidance(from: LatLon, speed: number, hoop: CoursePoint, prev: CoursePoint | null): { heading: number; bank: number } {
  const d = distance(from, hoop.pos);
  const rel = (bearing(hoop.pos, from) - hoop.heading) * DEG;
  const cross = d * Math.sin(rel); // + = right of the hoop line
  const look = Math.max(speed * 3, 150);
  const want = hoop.heading - Math.atan2(cross, look) / DEG;
  let bank = 0;
  if (prev) {
    const seg = Math.max(distance(prev.pos, hoop.pos), 50);
    const turn = ((((hoop.heading - prev.heading) % 360) + 540) % 360) - 180;
    const rate = (turn * DEG) / (seg / speed);
    bank = Math.atan2(speed * rate, 9.81) / DEG;
  }
  return { heading: want, bank };
}
