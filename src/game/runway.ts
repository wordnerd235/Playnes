// Runway geometry helpers: positions along/across a runway, heights, end selection.

import type { Airport, RunwayEnd } from "../data/airports.ts";
import { angleDiff, bearing, crossTrack, alongTrack, destination, distance, type LatLon } from "../sim/geo.ts";

export interface RunwayInUse {
  airport: Airport;
  /** Threshold we land on / take off from. */
  end: RunwayEnd;
  other: RunwayEnd;
  heading: number;
  length: number;
  /** Ellipsoid heights at `end` and `other` (sampled from the world). */
  hEnd: number;
  hOther: number;
  /** MSL meters minus ellipsoid height here (for the altimeter). */
  mslOffset: number;
}

/** Pick the runway direction closest to the wanted heading (ties -> preferred end). */
export function pickEnd(airport: Airport, wantHeading: number): { end: RunwayEnd; other: RunwayEnd } {
  const [a, b] = airport.runway.ends;
  const ha = bearing(a, b);
  const hb = bearing(b, a);
  const da = Math.abs(angleDiff(wantHeading, ha));
  const db = Math.abs(angleDiff(wantHeading, hb));
  if (Math.abs(da - db) < 10) {
    return airport.runway.preferred === a.id ? { end: a, other: b } : { end: b, other: a };
  }
  return da < db ? { end: a, other: b } : { end: b, other: a };
}

export function makeRunway(airport: Airport, end: RunwayEnd, other: RunwayEnd, hEnd: number, hOther: number): RunwayInUse {
  const msl = (end.elevFt * 0.3048 + other.elevFt * 0.3048) / 2;
  return {
    airport,
    end,
    other,
    heading: bearing(end, other),
    length: distance(end, other),
    hEnd,
    hOther,
    mslOffset: msl - (hEnd + hOther) / 2,
  };
}

/** Point `s` meters down the runway from the threshold, `x` meters right of centerline. */
export function runwayPoint(r: RunwayInUse, s: number, x = 0): LatLon {
  const p = destination(r.end, r.heading, s);
  return x === 0 ? p : destination(p, r.heading + 90, x);
}

/** Runway surface height at distance s from the threshold (extrapolated beyond the ends). */
export function runwayHeight(r: RunwayInUse, s: number): number {
  const f = Math.max(0, Math.min(1, s / Math.max(1, r.length)));
  return r.hEnd + (r.hOther - r.hEnd) * f;
}

/** Along-runway (from threshold) and cross-runway (right positive) coordinates of p. */
export function runwayCoords(r: RunwayInUse, p: LatLon): { s: number; x: number } {
  return { s: alongTrack(r.end, r.other, p), x: crossTrack(r.end, r.other, p) };
}

export function onRunwayArea(r: RunwayInUse, p: LatLon): boolean {
  const { s, x } = runwayCoords(r, p);
  return s > -400 && s < r.length + 400 && Math.abs(x) < 120;
}
