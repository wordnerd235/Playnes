// The co-pilot: turns the player's stick input plus the current guidance into flight commands.
// Assist levels (see docs/GAME_PLAN.md §4.2):
//   1 "You steer"  - player banks; co-pilot flies pitch, power and flare, and nudges toward the hoops
//   2 "Up & down"  - player also commands climb/descent (release = level flight)
//   3+ (later)     - player also flies power, flare, brakes

import type { Commands, FlightState, Perf } from "./physics.ts";
import { angleDiff, clamp, lerp } from "./geo.ts";

export interface StickInput {
  /** -1 (left) .. 1 (right) */
  roll: number;
  /** -1 (push / nose down) .. 1 (pull back / nose up) */
  pitch: number;
  /** Absolute throttle from a lever, or null when the co-pilot manages power. */
  throttle: number | null;
  brake: number;
}

export interface Guidance {
  /** Heading the co-pilot nudges toward when the player lets go. */
  targetHeading: number | null;
  /** Vertical speed the co-pilot flies (level 1), m/s. */
  targetVs: number;
  /** Airspeed the auto-throttle holds, m/s. Null = player/lesson controls power. */
  targetSpeed: number | null;
  /** Height above the ground below, meters. */
  agl: number;
  /** Height above the destination runway, meters (landing only). */
  runwayAgl: number | null;
  landing: boolean;
  autoFlare: boolean;
  /** Ground roll: hold this heading (centerline). */
  groundHeading: number | null;
  /** Lesson wants the player to pull back for rotation. */
  wantRotate: boolean;
  /** Co-pilot rotates if the player hasn't. */
  autoRotate: boolean;
}

export interface AssistMemory {
  neutralTime: number;
  throttleI: number;
  terrainWarning: boolean;
}

export function createMemory(): AssistMemory {
  return { neutralTime: 0, throttleI: 0, terrainWarning: false };
}

export const MAX_BANK_ASSISTED = 30;

export function computeCommands(
  level: number,
  input: StickInput,
  g: Guidance,
  s: FlightState,
  p: Perf,
  mem: AssistMemory,
  dt: number,
): Commands {
  // ----- Lateral -----
  const kidBank = input.roll * MAX_BANK_ASSISTED;
  const neutral = Math.abs(input.roll) < 0.08;
  mem.neutralTime = neutral ? mem.neutralTime + dt : 0;
  let targetBank = kidBank;
  if (g.targetHeading !== null && !s.onGround) {
    const err = angleDiff(g.targetHeading, s.heading);
    const helperBank = clamp(err * 1.1, -22, 22);
    // Blend the helper in after the player lets go for a moment.
    const blend = clamp((mem.neutralTime - 0.8) / 1.0, 0, 1);
    targetBank = lerp(kidBank, helperBank, blend);
  }

  // ----- Vertical -----
  let targetVs: number;
  if (level <= 1) {
    targetVs = g.targetVs;
  } else {
    targetVs = input.pitch >= 0 ? input.pitch * p.climbMax : input.pitch * p.descentMax;
    // Release-to-level, except on approach where letting go follows the glide path.
    if (Math.abs(input.pitch) < 0.08 && g.landing) targetVs = g.targetVs;
  }

  // Speed protection: if the climb is bleeding off too much speed, climb less steeply.
  if (!s.onGround && targetVs > 0) {
    const lo = p.vstall * 1.2;
    const hi = Math.max(lo + 1, p.vclimb * 0.85);
    targetVs *= clamp((s.speed - lo) / (hi - lo), 0, 1);
  }

  // Flare: below ~30 ft the co-pilot eases the descent for a soft touchdown.
  if (g.autoFlare && g.runwayAgl !== null && g.runwayAgl < 12) {
    const flareVs = -(0.55 + Math.max(0, g.runwayAgl) * 0.11);
    targetVs = Math.max(targetVs, flareVs);
  }

  // Ground Buddy: gentle automatic pull-up when getting close to terrain (not while landing).
  mem.terrainWarning = false;
  if (!s.onGround && !g.landing) {
    if (g.agl < 120 && s.vs < 0.5) {
      targetVs = Math.max(targetVs, g.agl < 40 ? 6 : 3);
      mem.terrainWarning = true;
    }
  }

  // ----- Power -----
  let throttle: number;
  if (g.targetSpeed !== null && !s.onGround) {
    const err = g.targetSpeed - s.speed;
    mem.throttleI = clamp(mem.throttleI + err * dt * 0.02, -0.4, 0.4);
    const base = 0.55 + (targetVs > 0 ? 0.25 : targetVs < -2 ? -0.35 : 0);
    throttle = clamp(base + err * 0.06 + mem.throttleI, 0, 1);
  } else {
    throttle = input.throttle ?? s.throttle;
  }

  // ----- Ground -----
  const rotate = g.wantRotate && (input.pitch > 0.3 || g.autoRotate);

  return {
    targetBank,
    targetVs,
    throttle,
    brake: input.brake,
    rotate,
    groundHeading: g.groundHeading,
  };
}
