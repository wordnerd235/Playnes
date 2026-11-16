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
  /** Load factor ("g"): 1 in level flight, 2 in a 60-degree banked turn, more when pulling up. */
  load?: number;
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
  /** 0..1 speedbrakes in the air / ground spoilers on the runway (playnes that have them). */
  spoilers?: number;
  /** Thrust reversers (on the ground, playnes that have them). */
  reverse?: boolean;
}

export type FlightEvent =
  | { type: "liftoff" }
  | { type: "touchdown"; sinkFpm: number }
  | { type: "stall-protect" };

export interface StepEnv {
  /** Ellipsoid height of the ground under the aircraft, meters. */
  groundHeight: number;
  /** What the wheels roll on (grass slows you down more). Default runway. */
  surface?: "runway" | "grass";
}

/** Derived per-aircraft constants. Speeds are m/s; vr/vapp/vclimb/vstall/vmo are indicated airspeeds. */
export interface Perf {
  vr: number;
  vapp: number;
  vclimb: number;
  vstall: number;
  /** Maximum operating indicated airspeed. */
  vmo: number;
  mmo: number;
  /** Cruise true airspeed at cruise altitude. */
  cruiseTas: number;
  /** Highest auto-throttle target (250 kt below 10,000 ft rule, or Vmo if lower). */
  speedLimit: number;
  /** Sea-level static thrust as an acceleration (m/s^2). */
  accel: number;
  /** Thrust falls with air density^lapse (jets ~0.7, turboprops ~0.8, pistons ~1). */
  lapse: number;
  /** Parasite drag: dragK * sigma * V^2 (V true airspeed). */
  dragK: number;
  /** Induced drag (from making lift): inducedK / (sigma * V^2). Only in the air. */
  inducedK: number;
  /** Best glide ratio used for calibration. */
  glideRatio: number;
  fixedGear: boolean;
  rollRate: number;
  /** Steepest flight path (sine of the angle) the playne will fly. */
  maxPathSin: number;
  /** Has speedbrakes / ground spoilers. */
  speedbrakes: boolean;
  /** Fighter: forward stick sets a dive angle (full forward = nearly straight down). */
  diveByAngle: boolean;
  /** Has thrust reversers (or reverse pitch props). */
  reversers: boolean;
  climbMax: number;
  descentMax: number;
  gammaRate: number;
  /** Most g the airframe (or its fly-by-wire) allows, pulling and pushing. */
  gLimit: number;
  gNeg: number;
}

// ----- International Standard Atmosphere -----

/** Air density ratio (sigma = rho / rho0) at a height in meters. */
export function densityRatio(h: number): number {
  const z = Math.max(-500, h);
  if (z < 11000) return (1 - 2.25577e-5 * z) ** 4.2559;
  return 0.29707 * Math.exp(-(z - 11000) / 6341.6);
}

/** Speed of sound (m/s) at a height in meters. */
export function speedOfSound(h: number): number {
  const t = h < 11000 ? 288.15 - 0.0065 * Math.max(-500, h) : 216.65;
  return 20.0468 * Math.sqrt(t);
}

/** Indicated airspeed (m/s) from true airspeed at height h (low-speed approximation, EAS). */
export function indicated(tas: number, h: number): number {
  return tas * Math.sqrt(densityRatio(h));
}

/** Thrust speed lapse: thrust falls by this fraction at cruise speed. */
const SPEED_LAPSE = 0.25;
/** Power setting that gives book cruise speed at cruise altitude. */
const CRUISE_POWER = 0.92;

/**
 * Calibrated so that each aircraft
 *   1. climbs at its book climb rate at its climb speed at sea level (clean, full power), and
 *   2. cruises at its book true airspeed at its cruise altitude at 92% power.
 * Thrust falls with altitude and speed; drag grows with density x speed^2.
 */
export function perfFor(ac: AircraftDef): Perf {
  const vclimb = ac.vclimb * KT;
  const climbMax = ac.climbFpm * FT_PER_MIN;
  const vc = ac.cruiseKt * KT;
  const lapse = ac.kind === "piston" ? 1.0 : ac.kind === "turboprop" ? 0.8 : ac.kind === "fighter" ? 0.55 : 0.7;
  const sigC = densityRatio(ac.cruiseAltFt * 0.3048);
  // Best glide ratio (lift / drag): about 9 for a Cessna, 13 for a turboprop, 14-18 for jets.
  const glideRatio = ac.kind === "piston" ? 9 : ac.kind === "turboprop" ? 13 : ac.kind === "fighter" ? 8 : 14 + clamp((ac.shape.length - 12) / 22, 0, 1) * 4;
  // Drag = Kp*EAS^2 + Ki/EAS^2 has its minimum 2*sqrt(Kp*Ki) = g / glideRatio.
  const kiFor = (kp: number) => (G / glideRatio) ** 2 / (4 * kp);
  // Cruise balance gives thrust for a given Kp; then find Kp so the sea-level climb matches the book.
  const accelFor = (kp: number) => {
    const easC2 = sigC * vc * vc;
    return (kp * easC2 + kiFor(kp) / easC2) / (CRUISE_POWER * (1 - SPEED_LAPSE) * sigC ** lapse);
  };
  const climbResidual = (kp: number) =>
    accelFor(kp) * (1 - SPEED_LAPSE * (vclimb / vc)) - kp * vclimb * vclimb - kiFor(kp) / (vclimb * vclimb) - (G * climbMax) / vclimb;
  // Find where the climb residual changes sign (scan Kp in log space, keep the largest-Kp
  // crossing: parasite drag dominates at cruise, as on real aircraft), then bisect.
  let lo = 0;
  let hi = 0;
  let prev = climbResidual(1e-8);
  for (let e = -7.98; e <= -1; e += 0.02) {
    const k = 10 ** e;
    const r = climbResidual(k);
    if (Math.sign(r) !== Math.sign(prev)) {
      lo = 10 ** (e - 0.02);
      hi = k;
    }
    prev = r;
  }
  if (lo === 0) throw new Error(`cannot calibrate ${ac.id}: book climb not reachable with glide ratio ${glideRatio}`);
  const loSign = Math.sign(climbResidual(lo));
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (Math.sign(climbResidual(mid)) === loSign) lo = mid;
    else hi = mid;
  }
  const dragK = Math.sqrt(lo * hi);
  return {
    vr: ac.vr * KT,
    vapp: ac.vapp * KT,
    vclimb,
    vstall: ac.vstall * KT,
    vmo: ac.vmo * KT,
    mmo: ac.mmo,
    cruiseTas: vc,
    speedLimit: Math.min(250 * KT, ac.vmo * KT * 0.97),
    accel: accelFor(dragK),
    lapse,
    dragK,
    inducedK: kiFor(dragK),
    glideRatio,
    fixedGear: ac.shape.fixedGear,
    rollRate: ac.rollRate,
    speedbrakes: ac.kind === "jet" || ac.kind === "fighter",
    diveByAngle: ac.kind === "fighter",
    reversers: ac.kind === "jet" || ac.kind === "turboprop",
    climbMax,
    // Fast descents (jets use their speedbrakes for these).
    descentMax: ({ piston: 2000, turboprop: 4000, jet: 6000, fighter: 80000, helicopter: 1800 } as const)[ac.kind] * FT_PER_MIN,
    // How quickly the nose comes up or down (deg/s) and the steepest climb/dive path (sine).
    gammaRate: ({ piston: 7, turboprop: 6, jet: 5, fighter: 20, helicopter: 6 } as const)[ac.kind],
    // Fighter: up to 85 degrees (a dive-bomb), short of vertical so the view never flips.
    maxPathSin: ({ piston: 0.4, turboprop: 0.45, jet: 0.5, fighter: 0.996, helicopter: 0.4 } as const)[ac.kind],
    // Certified limits: 3.8 g for a light playne, about 3.3 for the turboprop, 2.5 for jets
    // that carry passengers; the F-16's fly-by-wire holds it to 9.
    gLimit: ({ piston: 3.8, turboprop: 3.3, jet: 2.5, fighter: 9, helicopter: 2.5 } as const)[ac.kind],
    gNeg: ({ piston: 1.5, turboprop: 1.3, jet: 1, fighter: 3, helicopter: 0.5 } as const)[ac.kind],
  };
}

/** Engine thrust (as acceleration) at a speed, height and lever setting. */
export function thrustAccel(p: Perf, throttle: number, tas: number, h: number): number {
  return p.accel * throttle * densityRatio(h) ** p.lapse * Math.max(0, 1 - SPEED_LAPSE * (tas / p.cruiseTas));
}

/** How far past Vmo/Mmo (0 = at or under, 1 = well over). */
function overspeed(p: Perf, ias: number, mach: number): number {
  return clamp(Math.max((ias - p.vmo) / (0.04 * p.vmo), p.mmo < 1 ? (mach - p.mmo) / 0.015 : -1), 0, 1);
}

/** Deceleration from fully extended speedbrakes, m/s². */
const SPEEDBRAKE_DECEL = 0.16 * G;
/** Deceleration from thrust reversers on the landing roll, m/s². */
const REVERSER_DECEL = 0.12 * G;

/**
 * Aerodynamic drag as a deceleration (parasite + induced), m/s². `n` is the g being pulled:
 * the drag from making lift grows with its square (a 60-degree banked turn, 2 g, has four
 * times as much), which is why steep turns cost speed or height.
 */
function dragAccel(s: FlightState, p: Perf, n = 1): number {
  const sigma = densityRatio(s.alt);
  const eas2 = Math.max(sigma * s.speed * s.speed, (p.vstall * 0.8) ** 2);
  return p.dragK * sigma * s.speed * s.speed * dragFactor(s, p) + (s.onGround ? 0 : (p.inducedK * n * n) / eas2);
}

/** The g of a steady level turn at the current bank. */
function turnLoad(s: FlightState): number {
  return s.onGround ? 1 : 1 / Math.cos(clamp(s.bank, -85, 85) * DEG);
}

/**
 * Thrust minus drag (m/s²) at the current speed and height for a throttle setting. Negative
 * means the playne can only keep its speed by descending: vs = V * excess / g.
 */
export function excessAccel(s: FlightState, p: Perf, throttle: number): number {
  const ias = s.speed * Math.sqrt(densityRatio(s.alt));
  const over = overspeed(p, ias, s.speed / speedOfSound(s.alt));
  // (The steady turn's g, not the passing g of a pull-up: this feeds the co-pilot's guidance.)
  return thrustAccel(p, throttle, s.speed, s.alt) * (1 - over) - dragAccel(s, p, turnLoad(s)) - over * SPEEDBRAKE_DECEL;
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

/** Extra parasite drag from flaps (per notch) and lowered gear. Fixed gear is already in the calibration. */
const FLAP_DRAG = [0, 0.15, 0.4, 0.85];
function dragFactor(s: FlightState, p: Perf): number {
  return 1 + (FLAP_DRAG[s.flaps] ?? 0) + (s.gearDown && !p.fixedGear ? 0.35 : 0);
}

/** Advance the flight state by dt seconds. Returns events that happened during the step. */
export function step(s: FlightState, cmd: Commands, p: Perf, env: StepEnv, dt: number): FlightEvent[] {
  const events: FlightEvent[] = [];
  s.throttle = approach(s.throttle, clamp(cmd.throttle, 0, 1), dt * 1.6);

  // Thrust falls with altitude and speed; drag grows with air density and speed squared.
  const sigma = densityRatio(s.alt);
  const ias = s.speed * Math.sqrt(sigma);
  const mach = s.speed / speedOfSound(s.alt);
  // Overspeed protection (like fly-by-wire): at Vmo/Mmo the engines pull back to idle and the
  // speedbrakes come out. It never climbs on its own (that would look like a runaway altimeter).
  const over = overspeed(p, ias, mach);
  const thrust = thrustAccel(p, s.throttle, s.speed, s.alt) * (1 - over);
  const spoilers = p.speedbrakes ? clamp(cmd.spoilers ?? 0, 0, 1) : 0;
  // Speedbrakes bite harder the faster you go (they work on the air rushing past).
  const brakesOut = Math.max(over, spoilers * clamp((ias / p.vclimb) ** 2, 0.35, 1.2));
  const drag = dragAccel(s, p, s.onGround ? 1 : (s.load ?? 1)) + brakesOut * SPEEDBRAKE_DECEL;

  if (s.onGround) {
    // Ground spoilers dump the lift so the wheel brakes grip; reversers push the air forward.
    const rolling = (env.surface === "grass" ? 0.05 : 0.015) * G + cmd.brake * (0.3 + 0.15 * spoilers) * G;
    const reverser = cmd.reverse && p.reversers && s.speed > 12 ? REVERSER_DECEL : 0;
    const a = thrust * GROUND_ACCEL_BOOST - drag - (s.speed > 0.1 ? rolling + reverser : 0);
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
    // No steeper than the g limit allows in a level turn (g = 1 / cos(bank)).
    const bankMax = Math.min(85, Math.acos(1 / p.gLimit) / DEG);
    s.bank = approach(s.bank, clamp(cmd.targetBank, -bankMax, bankMax), p.rollRate * dt);
    const nTurn = 1 / Math.cos(s.bank * DEG);

    // Envelope protection: never let the wing stall. Short of airspeed, the nose comes down
    // and the plane glides (trading height for speed), just like a real wing.
    let targetVs = clamp(cmd.targetVs, -p.descentMax, p.climbMax * 1.8);
    // Flaps lower the stall speed (about 6% per notch, ~18% at full flaps).
    const vsEff = p.vstall * (1 - 0.06 * s.flaps);
    // ...and turning raises it: a wing pulling n g stalls at sqrt(n) times the speed.
    const vsTurn = vsEff * Math.sqrt(nTurn);
    const lowSpeed = clamp((vsTurn * 1.2 - ias) / (vsEff * 0.12), 0, 1);
    if (lowSpeed > 0) {
      targetVs = Math.min(targetVs, -lowSpeed * 7);
      if (lowSpeed > 0.9) events.push({ type: "stall-protect" });
    }
    // Still too fast with the speedbrakes out: make the dive shallower (never a climb).
    if (over > 0.6 && targetVs < 0) targetVs *= 1 - (over - 0.6) / 0.4;
    const vsAvail = Math.max(s.speed, 1);
    const targetGamma = Math.asin(clamp(targetVs / vsAvail, -p.maxPathSin, p.maxPathSin)) / DEG;
    // How fast the nose can come up or go down is limited by g: pulling harder than the limit
    // isn't possible (g = turn part + speed x pitch rate / 9.81), and it tightens with speed.
    const vRef = Math.max(s.speed, 20);
    const upRate = Math.min(p.gammaRate, (Math.max(0.3, p.gLimit - nTurn) * G) / vRef / DEG);
    // Pushing over is limited by negative g. (The fighter's dive is flown the way pilots do
    // it, rolling in and pulling, so it gets its positive-g rate both ways.)
    const downRate = p.diveByAngle ? upRate : Math.min(p.gammaRate, ((1 + p.gNeg) * G) / vRef / DEG);
    const gammaBefore = s.gamma;
    s.gamma = approach(s.gamma, targetGamma, (targetGamma > s.gamma ? upRate : downRate) * dt);
    const pull = dt > 0 ? (vRef * (s.gamma - gammaBefore) * DEG) / dt / G : 0;
    const nNow = clamp(nTurn * Math.cos(s.gamma * DEG) + (p.diveByAngle ? Math.abs(pull) : pull), -p.gNeg, p.gLimit);
    // Eased over about a quarter of a second (g builds as the nose moves; it doesn't jump).
    s.load = (s.load ?? 1) + (nNow - (s.load ?? 1)) * Math.min(1, dt * 4);

    const a = thrust - drag - G * Math.sin(s.gamma * DEG);
    s.speed = Math.max((vsEff * 0.8) / Math.sqrt(sigma), s.speed + a * dt);
    s.vs = s.speed * Math.sin(s.gamma * DEG);
    s.alt += s.vs * dt;

    // Coordinated turn.
    const turnRate = (G * Math.tan(s.bank * DEG)) / Math.max(s.speed, 20) / DEG;
    s.heading = wrap360(s.heading + turnRate * dt);

    // Nose attitude = flight path + angle of attack (more at low speed, less with flaps).
    const alpha = clamp(5 * (p.vapp / Math.max(ias, 1)) ** 2 - s.flaps * 0.8, -1, 14);
    s.pitch = s.gamma + alpha;

    if (s.alt <= env.groundHeight) {
      const sinkFpm = Math.max(0, -s.vs) / FT_PER_MIN;
      s.alt = env.groundHeight;
      s.onGround = true;
      s.vs = 0;
      s.gamma = 0;
      s.load = 1;
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
