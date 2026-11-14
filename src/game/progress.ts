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
  currentAirport: string;
  flights: number;
  butterLandings: number;
  unlockAll: boolean;
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
    currentAirport: "TRI",
    flights: 0,
    butterLandings: 0,
    unlockAll: false,
  };
}

function sanitize(p: Partial<Progress>): Progress {
  const base = newProgress();
  const out: Progress = { ...base, ...p, v: 1 };
  out.wings = Math.max(0, Math.floor(Number(out.wings) || 0));
  out.planes = Array.from(new Set(["c172", ...(out.planes || [])])).filter((id) => AIRCRAFT.some((a) => a.id === id));
  if (!out.planes.includes(out.selectedPlane)) out.selectedPlane = "c172";
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

/** Landing stars pay 5 Wings each; a butter-smooth touchdown earns a bonus. */
export function landingRewards(stars: number, butter: boolean): Reward[] {
  const r: Reward[] = [];
  if (stars > 0) r.push({ label: `${stars} landing star${stars > 1 ? "s" : ""}`, wings: stars * 5 });
  if (butter) r.push({ label: "Butter landing bonus", wings: 5 });
  return r;
}

export function charterRewards(distanceNm: number, stars: number, firstVisit: boolean, butter = false): Reward[] {
  const r: Reward[] = [{ label: "Charter flight", wings: 10 + Math.min(30, Math.floor(distanceNm / 50)) }];
  r.push(...landingRewards(stars, butter));
  if (firstVisit) r.push({ label: "New passport stamp", wings: 15 });
  return r;
}

/** The playne to fly a charter in: the chosen one, unless it has no passenger seats (fighter). */
export function charterPlaneId(p: Progress): string {
  const chosen = AIRCRAFT.find((a) => a.id === p.selectedPlane);
  if (chosen && carriesPassengers(chosen)) return chosen.id;
  const owned = AIRCRAFT.filter((a) => p.planes.includes(a.id) && carriesPassengers(a));
  return (owned[owned.length - 1] ?? AIRCRAFT[0]).id;
}
