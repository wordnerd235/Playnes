// Free Flight route to a destination: a smooth curve from where the playne is (leaving along
// its current heading) that swings onto the runway's extended centreline a few km out, then
// a straight final approach to the runway, the way real pilots line up for landing.

import type { Airport, RunwayEnd } from "../data/airports.ts";
import { alongTrack, angleDiff, bearing, clamp, crossTrack, destination, distance, type LatLon } from "./geo.ts";

/** Length of the straight final approach, metres (~3.2 nm). */
export const FINAL_M = 6000;

export interface RoutePlan {
  /** The path, from the playne to the runway threshold. */
  points: LatLon[];
  /** Index of the start of the straight final (the "final approach fix"). */
  finalIndex: number;
  /** Landing threshold and the far end of the runway (null for a helicopter's direct route). */
  end: RunwayEnd | null;
  other: RunwayEnd | null;
  /** Landing direction, degrees (null for a direct route). */
  heading: number | null;
}

/** Which runway end to land on, coming from `pos`: the one needing the least turning (prevailing-wind end on ties). */
export function landingEnd(pos: LatLon, ap: Airport): { end: RunwayEnd; other: RunwayEnd } {
  const [a, b] = ap.runway.ends;
  const course = bearing(pos, ap);
  const da = Math.abs(angleDiff(course, bearing(a, b)));
  const db = Math.abs(angleDiff(course, bearing(b, a)));
  if (Math.abs(da - db) < 25) return ap.runway.preferred === a.id ? { end: a, other: b } : { end: b, other: a };
  return da < db ? { end: a, other: b } : { end: b, other: a };
}

export function planRoute(pos: LatLon, heading: number, ap: Airport, opts: { direct?: boolean } = {}): RoutePlan {
  if (opts.direct) return { points: [pos, { lat: ap.lat, lon: ap.lon }], finalIndex: 1, end: null, other: null, heading: null };
  const { end, other } = landingEnd(pos, ap);
  const H = bearing(end, other);
  const T: LatLon = { lat: end.lat, lon: end.lon };
  const faf = destination(T, H + 180, FINAL_M);

  // Already on (or close to) the final approach and pointing the right way: straight in.
  const along = alongTrack(end, other, pos);
  const cross = crossTrack(end, other, pos);
  if (along < 0 && -along < FINAL_M + 2000 && Math.abs(cross) < 700 && Math.abs(angleDiff(heading, H)) < 35) {
    return { points: [pos, T], finalIndex: 0, end, other, heading: H };
  }

  // Facing well away from it: first a real turning arc (like a pilot's turn, ~1.5 km radius)
  // until pointing roughly toward the final fix.
  const R = 1500;
  const arc: LatLon[] = [];
  let start = pos;
  let hdg = heading;
  const dir = Math.sign(angleDiff(bearing(pos, faf), heading)) || 1;
  for (let k = 0; k < 36 && Math.abs(angleDiff(bearing(start, faf), hdg)) > 40; k++) {
    start = destination(start, hdg + dir * 5, 2 * R * Math.sin((5 * Math.PI) / 180));
    hdg += dir * 10;
    arc.push(start);
  }

  // Then a smooth curve (cubic Bezier) from there (tangent = heading) to the final fix
  // (tangent = runway heading).
  const d = distance(start, faf);
  const c = clamp(d * 0.45, 1500, 9000);
  const off = Math.abs(angleDiff(hdg, bearing(start, faf))) * (Math.PI / 180);
  const p1 = destination(start, hdg, c * Math.max(0.3, (1 + Math.cos(off)) / 2));
  const p2 = destination(faf, H + 180, c);
  const curve: LatLon[] = [pos, ...arc];
  const N = 48;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    curve.push({
      lat: w0 * start.lat + w1 * p1.lat + w2 * p2.lat + w3 * faf.lat,
      lon: w0 * start.lon + w1 * p1.lon + w2 * p2.lon + w3 * faf.lon,
    });
  }
  const final: LatLon[] = [];
  for (let i = 1; i <= 12; i++) final.push(destination(faf, H, (FINAL_M * i) / 12));
  return { points: [...curve, ...final], finalIndex: curve.length - 1, end, other, heading: H };
}

/**
 * Index of the route point nearest `p`, searching forward from `from` (the playne only moves
 * on) but only `window` points ahead, so a route that loops back near itself (turning around)
 * isn't skipped.
 */
export function nearestIndex(route: LatLon[], p: LatLon, from = 0, window = Infinity): { index: number; dist: number } {
  let best = Math.max(0, Math.min(from, route.length - 1));
  let bestD = distance(route[best], p);
  const last = Math.min(route.length - 1, best + window);
  for (let i = best + 1; i <= last; i++) {
    const d = distance(route[i], p);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return { index: best, dist: bestD };
}
