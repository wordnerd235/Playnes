// Helicopter flight model (the Chinook), made for small hands:
//   lever ("collective")  : above the middle = go up, below = go down, middle = hover
//   stick forward / back  : speed up / slow down (let go and it keeps its speed; pull back to
//                           hover, keep pulling to fly backward, up to ~35 kt, like the real one)
//   stick left / right    : turn (on the spot when hovering, a banked turn when flying fast)
//   slide buttons         : slide sideways (~35 kt), when slow; let go and it settles to a hover
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
  /** Slide buttons: -1 = slide left, +1 = slide right. */
  slide?: number;
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
  /** Fastest backward and sideways flight, m/s (real Chinook: roughly 35 kt each way). */
  backSpeed?: number;
  sideSpeed?: number;
}

/** Forward (negative = backward) and rightward speed over the ground, kept per flight state. */
export interface HeliVelocity {
  fwd: number;
  side: number;
}
const velocities = new WeakMap<FlightState, HeliVelocity>();
export function heliVelocity(s: FlightState): HeliVelocity {
  let v = velocities.get(s);
  if (!v) {
    v = { fwd: s.onGround ? 0 : s.speed, side: 0 };
    velocities.set(s, v);
  }
  return v;
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
  const slide = clamp(inp.slide ?? 0, -1, 1);
  const back = perf.backSpeed ?? 18;
  const sideMax = perf.sideSpeed ?? 18;
  const vel = heliVelocity(s);
  let wantVs = heliTargetVs(inp.collective, perf);
  if (s.alt > perf.ceiling) wantVs = Math.min(wantVs, (perf.ceiling - s.alt) * 0.2);

  if (s.onGround) {
    // Sitting on the wheels: speed drains away; lever up lifts off.
    vel.fwd = Math.sign(vel.fwd) * Math.max(0, Math.abs(vel.fwd) - 6 * dt);
    vel.side = Math.sign(vel.side) * Math.max(0, Math.abs(vel.side) - 6 * dt);
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
    // Forward/backward: stick forward speeds up; back slows down, then flies backward. Let go
    // and it keeps cruising forward, but backing up settles to a hover.
    const v = vel.fwd;
    let a: number;
    if (fwd > 0.05) a = v < 0 ? perf.brake : fwd * perf.accel * (1 - v / perf.maxSpeed);
    else if (fwd < -0.05) a = v > 0.5 ? fwd * perf.brake : (fwd * back - v) * 0.8;
    else a = v > 0 ? -v * 0.004 : Math.min(2.5, -v * 1.2);
    vel.fwd = clamp(v + a * dt, -back, perf.maxSpeed);
    // Sideways: the slide buttons, only when slow; let go and it stops sliding.
    const slowEnough = Math.abs(vel.fwd) < 20;
    const wantSide = slowEnough ? slide * sideMax : 0;
    vel.side += clamp(wantSide - vel.side, -3 * dt, 3 * dt);

    // Turning: on the spot when slow, a coordinated banked turn when fast.
    const ahead = Math.max(0, vel.fwd);
    const fast = clamp((ahead - 6) / 16, 0, 1);
    const wantBank = turn * (8 + (perf.maxBank - 8) * fast) + (vel.side / sideMax) * 10 * (1 - fast);
    s.bank += (wantBank - s.bank) * Math.min(1, dt * 3);
    const bankedRate = ahead > 1 ? (G * Math.tan(clamp(s.bank, -60, 60) * DEG)) / ahead / DEG : 0;
    const yawRate = turn * perf.hoverYawRate * (1 - fast) + bankedRate * fast;
    s.heading = (s.heading + yawRate * dt + 360) % 360;

    // Up and down follow the lever; near the ground the co-pilot cushions the descent.
    const agl = s.alt - env.groundHeight;
    if (env.cushion && wantVs < 0 && agl < 25) wantVs = Math.max(wantVs, -0.6 - agl * 0.12);
    s.vs += clamp(wantVs - s.vs, -3.5 * dt, 3.5 * dt);
    s.alt += s.vs * dt;

    // Nose dips to speed up, lifts to slow down or back up, stays a little down at speed.
    const wantPitch = -fwd * 9 - (ahead / perf.maxSpeed) * 5 + (vel.fwd < 0 ? (-vel.fwd / back) * 5 : 0);
    s.pitch += (wantPitch - s.pitch) * Math.min(1, dt * 2.5);

    if (s.alt <= env.groundHeight) {
      const sinkFpm = Math.max(0, -s.vs) * 196.85;
      events.push({ type: "touchdown", sinkFpm, speedKt: Math.hypot(vel.fwd, vel.side) / 0.514444 });
      s.alt = env.groundHeight;
      s.vs = 0;
      s.onGround = true;
      s.bank = 0;
    }
  }
  // Move over the ground (forward/backward along the nose, sideways to the right).
  const h = s.heading * DEG;
  const north = Math.cos(h) * vel.fwd - Math.sin(h) * vel.side;
  const east = Math.sin(h) * vel.fwd + Math.cos(h) * vel.side;
  s.lat += (north * dt) / 111320;
  s.lon += (east * dt) / (111320 * Math.cos(s.lat * DEG));
  // Other parts of the game read `speed` as how fast it's moving (gauges, landings).
  s.speed = Math.hypot(vel.fwd, vel.side);
  s.gamma = s.speed > 1 ? Math.atan2(s.vs, s.speed) / DEG : 0;
  s.throttle = inp.collective;
  return events;
}
