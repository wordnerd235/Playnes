// The player's progress: Wings, planes, lessons, passport stamps. Saved on this device,
// with a backup code parents can copy out and paste back (docs/GAME_PLAN.md §11).

import { AIRCRAFT, carriesPassengers, type AircraftDef } from "../data/aircraft.ts";

export interface Progress {
  v: 1;
  wings: number;
  planes: string[];
  selectedPlane: string;
  lessonsDone: string[];
  graduated: boolean;
  airportsVisited: string[];
  /** Airports the player has taken off from (one-time takeoff bonus). */
  airportsDeparted: string[];
  currentAirport: string;
  flights: number;
  butterLandings: number;
  unlockAll: boolean;
  /** The interface tour has been shown once. */
  tourDone: boolean;
}

const KEY = "playnes.progress.v1";

export function newProgress(): Progress {
  return {
    v: 1,
    wings: 0,
    planes: ["c172"],
    selectedPlane: "c172",
    lessonsDone: [],
    graduated: false,
    airportsVisited: ["TRI"],
    airportsDeparted: [],
    currentAirport: "TRI",
    flights: 0,
    butterLandings: 0,
    unlockAll: false,
    tourDone: false,
  };
}

function sanitize(p: Partial<Progress>): Progress {
  const base = newProgress();
  const out: Progress = { ...base, ...p, v: 1 };
  out.wings = Math.max(0, Math.floor(Number(out.wings) || 0));
  out.planes = Array.from(new Set(["c172", ...(out.planes || [])])).filter((id) => AIRCRAFT.some((a) => a.id === id));
  if (!out.planes.includes(out.selectedPlane)) out.selectedPlane = "c172";
  out.airportsDeparted = Array.isArray(out.airportsDeparted) ? out.airportsDeparted : [];
  return out;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch {
    /* storage unavailable */
  }
  return newProgress();
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

/** Ask the browser not to clear our storage (helps on iPad Safari). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* unsupported */
  }
  return false;
}

export function owns(p: Progress, ac: AircraftDef): boolean {
  return p.unlockAll || p.planes.includes(ac.id);
}

export function canBuy(p: Progress, ac: AircraftDef): boolean {
  return ac.unlock.type === "wings" && !owns(p, ac) && p.wings >= ac.unlock.price;
}

export function buy(p: Progress, ac: AircraftDef): boolean {
  if (!canBuy(p, ac) || ac.unlock.type !== "wings") return false;
  p.wings -= ac.unlock.price;
  p.planes.push(ac.id);
  return true;
}

// ----- Backup codes -----

function checksum(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return (h % 1679616).toString(36).padStart(4, "0");
}

export function exportCode(p: Progress): string {
  const json = JSON.stringify(p);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `PLAYNES-${checksum(b64)}-${b64}`;
}

export function importCode(code: string): Progress | null {
  const m = code.trim().match(/^PLAYNES-([0-9a-z]{4})-([A-Za-z0-9+/=]+)$/);
  if (!m || checksum(m[2]) !== m[1]) return null;
  try {
    return sanitize(JSON.parse(decodeURIComponent(escape(atob(m[2])))));
  } catch {
    return null;
  }
}

// ----- Wings -----

export interface Reward {
  label: string;
  wings: number;
}

/** All the reward numbers in one place. */
export const REWARDS = {
  /** Every completed charter. */
  charterBase: 10,
  /** Charter pay per nautical mile, plus a bit more per seat (more passengers = more fares). */
  charterPerNm: 0.1,
  charterPerNmPerSeat: 0.025,
  /** Free Flight trips (no passengers): per nautical mile between the two airports. */
  freePerNm: 0.08,
  /** Free Flight landing back where you took off (practice). */
  freePractice: 2,
  /** Landing quality. Free Flight pays less, so quick circuits don't beat real trips. */
  star: 5,
  butter: 5,
  freeStar: 2,
  freeButter: 3,
  /** One-time bonuses per airport. */
  newLanding: 20,
  newTakeoff: 10,
  /** Flight School hoops: per hoop flown through, and a bonus for getting every one. */
  ring: 1,
  allRings: 5,
} as const;

/** Wings for hoops flown through in a lesson. */
export function ringRewards(passed: number, totalRings: number): Reward[] {
  if (totalRings <= 0) return [];
  const r: Reward[] = [{ label: `Rings: ${passed} of ${totalRings}`, wings: passed * REWARDS.ring }];
  if (passed === totalRings) r.push({ label: "Every ring!", wings: REWARDS.allRings });
  return r;
}

/** Landing stars and a butter-smooth touchdown bonus. */
export function landingRewards(stars: number, butter: boolean, free = false): Reward[] {
  const r: Reward[] = [];
  if (stars > 0) r.push({ label: `${stars} landing star${stars > 1 ? "s" : ""}`, wings: stars * (free ? REWARDS.freeStar : REWARDS.star) });
  if (butter) r.push({ label: "Butter landing bonus", wings: free ? REWARDS.freeButter : REWARDS.butter });
  return r;
}

export interface CharterOutcome {
  from: string;
  to: string;
  distanceNm: number;
  seats: number;
  stars: number;
  butter: boolean;
  /** First landing ever at the destination. */
  newLanding: boolean;
}

/** Pay for a charter that ended with a landing: longer trips and bigger playnes pay more. */
export function charterRewards(o: CharterOutcome): Reward[] {
  const nm = Math.round(o.distanceNm);
  const fare = REWARDS.charterBase + Math.round(o.distanceNm * (REWARDS.charterPerNm + REWARDS.charterPerNmPerSeat * o.seats));
  const r: Reward[] = [{ label: `Charter ${o.from} → ${o.to}: ${nm} nm, ${o.seats} seats`, wings: fare }];
  r.push(...landingRewards(o.stars, o.butter));
  if (o.newLanding) r.push({ label: `First landing at ${o.to}`, wings: REWARDS.newLanding });
  return r;
}

export interface FreeLandingOutcome {
  /** Airport we took off from (null after an off-airport landing or a fresh start in the air). */
  from: string | null;
  to: string;
  distanceNm: number;
  stars: number;
  butter: boolean;
  newLanding: boolean;
}

/** Free Flight: a landing at an airport pays for the trip from where you took off. */
export function freeLandingRewards(o: FreeLandingOutcome): Reward[] {
  const r: Reward[] = [];
  if (o.from && o.from !== o.to) r.push({ label: `Trip ${o.from} → ${o.to}: ${Math.round(o.distanceNm)} nm`, wings: Math.max(2, Math.round(o.distanceNm * REWARDS.freePerNm)) });
  else r.push({ label: "Landing practice", wings: REWARDS.freePractice });
  r.push(...landingRewards(o.stars, o.butter, true));
  if (o.newLanding) r.push({ label: `First landing at ${o.to}`, wings: REWARDS.newLanding });
  return r;
}

/** First takeoff from an airport: a one-time bonus (and remembers it). Returns the Wings earned. */
export function takeoffBonus(p: Progress, code: string): number {
  if (p.airportsDeparted.includes(code)) return 0;
  p.airportsDeparted.push(code);
  p.wings += REWARDS.newTakeoff;
  return REWARDS.newTakeoff;
}

export const total = (r: Reward[]): number => r.reduce((a, b) => a + b.wings, 0);

/** The playne to fly a charter in: the chosen one, unless it has no passenger seats (fighter). */
export function charterPlaneId(p: Progress): string {
  const chosen = AIRCRAFT.find((a) => a.id === p.selectedPlane);
  if (chosen && carriesPassengers(chosen)) return chosen.id;
  const owned = AIRCRAFT.filter((a) => p.planes.includes(a.id) && carriesPassengers(a));
  return (owned[owned.length - 1] ?? AIRCRAFT[0]).id;
}
