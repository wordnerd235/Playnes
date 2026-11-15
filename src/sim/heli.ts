// Helicopter flight model (the Chinook), made for small hands:
//   lever ("collective")  : above the middle = go up, below = go down, middle = hover
//   stick forward / back  : speed up / slow down (let go and it keeps its speed; pull back to hover)
//   stick left / right    : turn (on the spot when hovering, a banked turn when flying fast)
// It lifts straight up, hovers, and lands anywhere flat. Near the ground the co-pilot cushions
// the descent (unless crashes are on), so touchdowns are gentle.

import type { FlightState } from "./physics.ts";
import { clamp } from "./geo.ts";

const DEG = Math.PI / 180;
const G = 9.81;

export interface HeliInput {
  /** Lever 0..1 (0.5 = hover). */
  collective: number;
  /** Stick: +1 = full forward (speed up), -1 = full back (slow down). */
  fwd: number;
  /** Stick: +1 = full right. */
  turn: number;
}

export interface HeliPerf {
  /** Top speed, m/s. */
  maxSpeed: number;
  /** Fastest climb (and a bit faster descent), m/s. */
  climb: number;
  /** Speeding up / slowing down at full stick, m/s². */
  accel: number;
  brake: number;
  /** Turning on the spot at full stick, degrees per second. */
  hoverYawRate: number;
  /** Steepest bank in a fast turn, degrees. */
  maxBank: number;
  /** Highest it will climb, metres (ellipsoid). */
  ceiling: number;
}

export interface HeliEnv {
  groundHeight: number;
  /** Co-pilot softens the last few metres of a descent. */
  cushion: boolean;
}

export type HeliEvent = { type: "liftoff" } | { type: "touchdown"; sinkFpm: number; speedKt: number };

/** Below this distance from the middle of the lever, it holds height. */
const HOVER_BAND = 0.06;

export function heliTargetVs(collective: number, perf: HeliPerf): number {
  const d = collective - 0.5;
  if (Math.abs(d) < HOVER_BAND) return 0;
  const k = (Math.abs(d) - HOVER_BAND) / (0.5 - HOVER_BAND);
  return Math.sign(d) * k * perf.climb * (d < 0 ? 1.2 : 1);
}

export function stepHeli(s: FlightState, inp: HeliInput, perf: HeliPerf, env: HeliEnv, dt: number): HeliEvent[] {
  const events: HeliEvent[] = [];
  const fwd = clamp(inp.fwd, -1, 1);
  const turn = clamp(inp.turn, -1, 1);
  let wantVs = heliTargetVs(inp.collective, perf);
  if (s.alt > perf.ceiling) wantVs = Math.min(wantVs, (perf.ceiling - s.alt) * 0.2);

  if (s.onGround) {
    // Sitting on the wheels: speed drains away; lever up lifts off.
    s.speed = Math.max(0, s.speed - 6 * dt);
    s.heading = (s.heading + turn * perf.hoverYawRate * 0.5 * dt + 360) % 360;
    s.bank = 0;
    s.pitch += (0 - s.pitch) * Math.min(1, dt * 4);
    s.vs = 0;
    s.alt = env.groundHeight;
    if (wantVs > 0.3) {
      s.onGround = false;
      s.vs = 0.5;
      events.push({ type: "liftoff" });
    }
  } else {
    // Speed: the stick speeds up or slows down; centred, it keeps the speed (a little drag).
    const v = s.speed;
    let a = fwd > 0 ? fwd * perf.accel * (1 - v / perf.maxSpeed) : fwd * perf.brake;
    if (Math.abs(fwd) < 0.05) a = -v * 0.004;
    s.speed = clamp(v + a * dt, 0, perf.maxSpeed);

    // Turning: on the spot when slow, a coordinated banked turn when fast.
    const fast = clamp((s.speed - 6) / 16, 0, 1);
    const wantBank = turn * (8 + (perf.maxBank - 8) * fast);
    s.bank += (wantBank - s.bank) * Math.min(1, dt * 3);
    const bankedRate = s.speed > 1 ? (G * Math.tan(s.bank * DEG)) / s.speed / DEG : 0;
    const yawRate = turn * perf.hoverYawRate * (1 - fast) + bankedRate * fast;
    s.heading = (s.heading + yawRate * dt + 360) % 360;

    // Up and down follow the lever; near the ground the co-pilot cushions the descent.
    const agl = s.alt - env.groundHeight;
    if (env.cushion && wantVs < 0 && agl < 25) wantVs = Math.max(wantVs, -0.6 - agl * 0.12);
    s.vs += clamp(wantVs - s.vs, -3.5 * dt, 3.5 * dt);
    s.alt += s.vs * dt;

    // Nose dips to speed up, lifts to slow down, and stays a little down at speed.
    const wantPitch = -fwd * 9 - (s.speed / perf.maxSpeed) * 5;
    s.pitch += (wantPitch - s.pitch) * Math.min(1, dt * 2.5);

    if (s.alt <= env.groundHeight) {
      const sinkFpm = Math.max(0, -s.vs) * 196.85;
      events.push({ type: "touchdown", sinkFpm, speedKt: s.speed / 0.514444 });
      s.alt = env.groundHeight;
      s.vs = 0;
      s.onGround = true;
      s.bank = 0;
    }
  }
  // Move over the ground.
  const d = s.speed * dt;
  const h = s.heading * DEG;
  s.lat += (Math.cos(h) * d) / 111320;
  s.lon += (Math.sin(h) * d) / (111320 * Math.cos(s.lat * DEG));
  s.gamma = s.speed > 1 ? Math.atan2(s.vs, s.speed) / DEG : 0;
  s.throttle = inp.collective;
  return events;
}
