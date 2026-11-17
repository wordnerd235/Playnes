// Wind for Free Flight (a grown-up setting): a steady wind that carries the playne over the
// ground, with gusts in strong wind. The flight model itself works in the air (airspeed,
// heading); the wind only moves that air over the ground, as in real life.

import { DEG, clamp } from "./geo.ts";

export type WindSetting = "off" | "light" | "strong";

export interface Wind {
  /** Where it blows FROM, degrees true (as pilots and weather reports say it). */
  fromDeg: number;
  /** Speed, m/s. */
  speed: number;
  /** Gusts and bumps, 0 (smooth) .. 1 (strong). */
  gustiness: number;
}

const KT = 0.514444;

/**
 * A wind for one flight. Mostly westerly (the usual weather here), light 6 to 11 kt or strong
 * 14 to 22 kt. `rand` is a 0..1 random source (Math.random in the game; fixed in tests).
 */
export function pickWind(setting: WindSetting, rand: () => number = Math.random): Wind | null {
  if (setting === "off") return null;
  const fromDeg = Math.round(200 + rand() * 110) % 360;
  const kt = setting === "light" ? 6 + rand() * 5 : 14 + rand() * 8;
  return { fromDeg, speed: kt * KT, gustiness: setting === "light" ? 0.25 : 1 };
}

/** The air's movement over the ground, m/s toward north and east. */
export function windVector(w: Wind): { north: number; east: number } {
  const to = (w.fromDeg + 180) * DEG;
  return { north: Math.cos(to) * w.speed, east: Math.sin(to) * w.speed };
}

/** Ground speed and track (degrees) of a playne flying `heading` at `airspeed` (m/s, horizontal). */
export function groundVelocity(heading: number, airspeed: number, w: Wind | null): { speed: number; track: number } {
  const h = heading * DEG;
  let n = Math.cos(h) * airspeed, e = Math.sin(h) * airspeed;
  if (w) {
    const v = windVector(w);
    n += v.north;
    e += v.east;
  }
  return { speed: Math.hypot(n, e), track: ((Math.atan2(e, n) / DEG) + 360) % 360 };
}

/**
 * Crosswind and headwind parts for a runway (or any direction) `heading`: crosswind positive
 * from the right, headwind positive on the nose.
 */
export function windComponents(w: Wind | null, heading: number): { cross: number; head: number } {
  if (!w) return { cross: 0, head: 0 };
  const a = (w.fromDeg - heading) * DEG;
  return { cross: Math.sin(a) * w.speed, head: Math.cos(a) * w.speed };
}

/**
 * How far to point into the wind (degrees, added to the wanted track) to fly straight along it
 * ("crabbing"). Wind from the right: point right.
 */
export function windCorrection(w: Wind | null, track: number, airspeed: number): number {
  const { cross } = windComponents(w, track);
  return Math.asin(clamp(cross / Math.max(airspeed, 1), -0.6, 0.6)) / DEG;
}

/**
 * Bumps in gusty air at time t (s): a small up/down push (m/s) and a roll nudge (degrees), from
 * a few slow overlapping waves so it feels random but stays smooth.
 */
export function gust(w: Wind | null, t: number): { vs: number; roll: number } {
  if (!w || w.gustiness <= 0) return { vs: 0, roll: 0 };
  const k = w.gustiness * clamp(w.speed / (18 * KT), 0.4, 1.2);
  const vs = (Math.sin(t * 0.9) * 0.55 + Math.sin(t * 2.3 + 1.7) * 0.3 + Math.sin(t * 5.1 + 0.4) * 0.15) * 1.2 * k;
  const roll = (Math.sin(t * 0.7 + 2.1) * 0.6 + Math.sin(t * 1.9 + 0.3) * 0.4) * 2.5 * k;
  return { vs, roll };
}
