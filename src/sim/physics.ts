// "Arcade-realistic" flight model. Simple underneath, honest on the outside:
// - turn rate comes from real coordinated-turn physics: rate = g * tan(bank) / speed
// - speed follows an energy balance: thrust - drag - weight component along the climb path
// - fly-by-wire style protections: no stalls, limited bank, release-to-level
// Position is kept as lat/lon (degrees) + ellipsoid height (meters).

import type { AircraftDef } from "../data/aircraft.ts";
import { DEG, KT, approach, clamp, metersPerDegree, wrap360 } from "./geo.ts";

export const G = 9.80665;

export interface FlightState {
  lat: number;
  lon: number;
  /** Ellipsoid height of the wheels (model origin), meters. */
  alt: number;
  /** True heading, degrees. */
  heading: number;
  /** Nose attitude, degrees (positive = nose up). */
  pitch: number;
  /** Bank, degrees (positive = right wing down). */
  bank: number;
  /** Flight path angle, degrees. */
  gamma: number;
  /** True airspeed, m/s (no wind in this version, so also ground speed). */
  speed: number;
  /** Vertical speed, m/s. */
  vs: number;
  throttle: number;
  /** 0 = up, 1, 2, 3 = full. */
  flaps: number;
  gearDown: boolean;
  onGround: boolean;
}

export interface Commands {
  /** Wanted bank angle, degrees. */
  targetBank: number;
  /** Wanted vertical speed, m/s (air only). */
  targetVs: number;
  throttle: number;
  /** 0..1 wheel brakes (ground only). */
  brake: number;
  /** Pilot is pulling back: rotates on the ground once fast enough. */
  rotate: boolean;
  /** Ground steering: hold this heading (centerline assist). Null = steer with bank input. */
  groundHeading: number | null;
}

export type FlightEvent =
  | { type: "liftoff" }
  | { type: "touchdown"; sinkFpm: number }
  | { type: "stall-protect" };

export interface StepEnv {
  /** Ellipsoid height of the ground under the aircraft, meters. */
  groundHeight: number;
}

/** Derived per-aircraft constants. */
export interface Perf {
  vr: number;
  vapp: number;
  vclimb: number;
  vstall: number;
  vmax: number;
  speedLimit: number;
  accel: number;
  dragK: number;
  rollRate: number;
  climbMax: number;
  descentMax: number;
  gammaRate: number;
}

export function perfFor(ac: AircraftDef): Perf {
  const vclimb = ac.vclimb * KT;
  const climbMax = ac.climbFpm * FT_PER_MIN;
  // Speed where full power balances drag in level flight (low altitude).
  const vmaxDrag = Math.max(vclimb * 1.6, Math.min(ac.cruiseKt, 300) * KT);
  // Static thrust (as acceleration) chosen so that, clean and at full power, the aircraft
  // climbs at its book climb rate at its climb speed.
  const x = vclimb / vmaxDrag;
  const accel = (G * climbMax) / vclimb / (1 - 0.3 * x - 0.7 * x * x);
  const dragK = (accel * 0.7) / (vmaxDrag * vmaxDrag);
  return {
    vr: ac.vr * KT,
    vapp: ac.vapp * KT,
    vclimb,
    vstall: ac.vstall * KT,
    vmax: vmaxDrag,
    speedLimit: Math.min(ac.cruiseKt, 250) * KT, // 250 knots below 10,000 ft
    accel,
    dragK,
    rollRate: ac.rollRate,
    climbMax,
    descentMax: (ac.kind === "piston" ? 1000 : 2500) * FT_PER_MIN,
    gammaRate: ac.kind === "piston" ? 5 : 3.5,
  };
}

/** Extra push on the takeoff roll so a 5-year-old isn't waiting 40 seconds for rotation. */
export const GROUND_ACCEL_BOOST = 1.3;

const FT_PER_MIN = 0.3048 / 60;

export function createState(init: Partial<FlightState> & Pick<FlightState, "lat" | "lon" | "alt" | "heading">): FlightState {
  return {
    pitch: 0,
    bank: 0,
    gamma: 0,
    speed: 0,
    vs: 0,
    throttle: 0,
    flaps: 1,
    gearDown: true,
    onGround: true,
    ...init,
  };
}

function dragFactor(s: FlightState): number {
  return 1 + s.flaps * 0.45 + (s.gearDown ? 0.6 : 0);
}

/** Advance the flight state by dt seconds. Returns events that happened during the step. */
export function step(s: FlightState, cmd: Commands, p: Perf, env: StepEnv, dt: number): FlightEvent[] {
  const events: FlightEvent[] = [];
  s.throttle = approach(s.throttle, clamp(cmd.throttle, 0, 1), dt * 0.8);

  // Thrust falls off a little with speed; drag grows with speed squared.
  const thrust = p.accel * s.throttle * (1 - 0.3 * clamp(s.speed / p.vmax, 0, 1.5));
  const drag = p.dragK * s.speed * s.speed * dragFactor(s);

  if (s.onGround) {
    const rolling = 0.015 * G + cmd.brake * 0.35 * G;
    const a = thrust * GROUND_ACCEL_BOOST - drag - (s.speed > 0.1 ? rolling : 0);
    s.speed = Math.max(0, s.speed + a * dt);
    s.bank = approach(s.bank, 0, 20 * dt);
    s.gamma = 0;
    s.vs = 0;
    s.alt = env.groundHeight;

    if (cmd.groundHeading !== null) {
      const d = ((cmd.groundHeading - s.heading + 540) % 360) - 180;
      s.heading = wrap360(s.heading + clamp(d, -10 * dt, 10 * dt));
    } else {
      const rate = (cmd.targetBank / 30) * 8 * clamp(s.speed / 8, 0, 1);
      s.heading = wrap360(s.heading + rate * dt);
    }

    // Rotation: pulling back once near rotation speed raises the nose; enough nose-up + speed = liftoff.
    if (cmd.rotate && s.speed >= p.vr * 0.95) {
      s.pitch = approach(s.pitch, 9, 3.5 * dt);
    } else {
      s.pitch = approach(s.pitch, 0, 3 * dt);
    }
    if (s.pitch >= 6 && s.speed >= p.vr) {
      s.onGround = false;
      s.gamma = 2;
      events.push({ type: "liftoff" });
    }
  } else {
    // Roll toward the commanded bank at the aircraft's roll rate.
    s.bank = approach(s.bank, clamp(cmd.targetBank, -45, 45), p.rollRate * dt);

    // Envelope protection: never let the wing stall.
    let targetVs = clamp(cmd.targetVs, -p.descentMax, p.climbMax * 1.2);
    if (s.speed < p.vstall * 1.15) {
      targetVs = Math.min(targetVs, -1.5);
      events.push({ type: "stall-protect" });
    }
    const vsAvail = Math.max(s.speed, 1);
    const targetGamma = Math.asin(clamp(targetVs / vsAvail, -0.3, 0.3)) / DEG;
    s.gamma = approach(s.gamma, targetGamma, p.gammaRate * dt);

    const a = thrust - drag - G * Math.sin(s.gamma * DEG);
    s.speed = Math.max(p.vstall * 0.8, s.speed + a * dt);
    s.vs = s.speed * Math.sin(s.gamma * DEG);
    s.alt += s.vs * dt;

    // Coordinated turn.
    const turnRate = (G * Math.tan(s.bank * DEG)) / Math.max(s.speed, 20) / DEG;
    s.heading = wrap360(s.heading + turnRate * dt);

    // Nose attitude = flight path + angle of attack (more at low speed, less with flaps).
    const alpha = clamp(5 * (p.vapp / Math.max(s.speed, 1)) ** 2 - s.flaps * 0.8, -1, 14);
    s.pitch = s.gamma + alpha;

    if (s.alt <= env.groundHeight) {
      const sinkFpm = Math.max(0, -s.vs) / FT_PER_MIN;
      s.alt = env.groundHeight;
      s.onGround = true;
      s.vs = 0;
      s.gamma = 0;
      events.push({ type: "touchdown", sinkFpm });
    }
  }

  // Move over the ground.
  const ground = s.speed * Math.cos(s.gamma * DEG) * dt;
  const m = metersPerDegree(s.lat);
  s.lat += (ground * Math.cos(s.heading * DEG)) / m.lat;
  s.lon += (ground * Math.sin(s.heading * DEG)) / m.lon;
  return events;
}

export const UNITS = { FT_PER_MIN };
