// Game airports. Runway threshold coordinates come from OurAirports (public domain).
// Heights used in flight are re-sampled from the live 3D world at load time, so the
// MSL elevations here are only used for the altimeter and the key-free basic globe.
//
// VERIFY each airport against the current FAA airport diagram before relying on
// runway names: crowd-sourced data had inconsistent CLT runway names (see docs/GAME_PLAN.md §15).

import type { LatLon } from "../sim/geo.ts";
import US_AIRPORTS from "./usAirports.json";

export interface RunwayEnd extends LatLon {
  /** Runway designator at this end, e.g. "23". */
  id: string;
  /** How the tower says it, e.g. "two three". */
  spoken: string;
  elevFt: number;
}

export interface Runway {
  ends: [RunwayEnd, RunwayEnd];
  lengthFt: number;
  widthFt: number;
  /** Preferred end id for ties (prevailing wind). */
  preferred: string;
}

export interface Airport extends LatLon {
  code: string;
  icao: string;
  name: string;
  /** Spoken short name, e.g. "Charlotte". */
  spoken: string;
  /** Tower/ground call name, e.g. "Charlotte Tower". */
  towerName: string;
  city: string;
  elevFt: number;
  runway: Runway;
  home: boolean;
  /** Short kid-facing description for the charter card. */
  blurb: string;
  icon: string;
  verify?: string;
  /** State (two letters), for the airport picker. The hand-made airports leave it out. */
  state?: string;
  /** Imported airports: "large" (big airline hubs) or "medium" (airline service). */
  size?: "large" | "medium";
}

/** The hand-made airports (home region, recorded voice lines). */
export const CORE_AIRPORTS: Airport[] = [
  {
    code: "TRI",
    icao: "KTRI",
    name: "Tri-Cities Airport",
    spoken: "Tri-Cities",
    towerName: "Tri-Cities Tower",
    city: "Blountville, Tennessee",
    lat: 36.475201,
    lon: -82.407401,
    elevFt: 1519,
    home: true,
    blurb: "Home base in the mountains",
    icon: "⛰️",
    runway: {
      lengthFt: 8000,
      widthFt: 150,
      preferred: "23",
      ends: [
        { id: "5", spoken: "five", lat: 36.46530151, lon: -82.4190979, elevFt: 1488 },
        { id: "23", spoken: "two three", lat: 36.48149872, lon: -82.40070343, elevFt: 1518 },
      ],
    },
  },
  {
    code: "CLT",
    icao: "KCLT",
    name: "Charlotte Douglas International Airport",
    spoken: "Charlotte",
    towerName: "Charlotte Tower",
    city: "Charlotte, North Carolina",
    lat: 35.214,
    lon: -80.9431,
    elevFt: 748,
    home: true,
    blurb: "Big busy airport and a city skyline",
    icon: "🏙️",
    verify: "Center parallel runway. Confirm current designators (18C/36C) on the FAA diagram.",
    runway: {
      lengthFt: 10000,
      widthFt: 150,
      preferred: "18C",
      ends: [
        { id: "18C", spoken: "one eight center", lat: 35.2271, lon: -80.953102, elevFt: 742 },
        { id: "36C", spoken: "three six center", lat: 35.200298, lon: -80.950798, elevFt: 692 },
      ],
    },
  },
  {
    code: "AVL",
    icao: "KAVL",
    name: "Asheville Regional Airport",
    spoken: "Asheville",
    towerName: "Asheville Tower",
    city: "Asheville, North Carolina",
    lat: 35.435488,
    lon: -82.541853,
    elevFt: 2165,
    home: false,
    blurb: "Blue Ridge Mountains",
    icon: "🌲",
    runway: {
      lengthFt: 8002,
      widthFt: 150,
      preferred: "35",
      ends: [
        { id: "17", spoken: "one seven", lat: 35.44649887, lon: -82.54640198, elevFt: 2165 },
        { id: "35", spoken: "three five", lat: 35.42589951, lon: -82.53720093, elevFt: 2111 },
      ],
    },
  },
  {
    code: "MYR",
    icao: "KMYR",
    name: "Myrtle Beach International Airport",
    spoken: "Myrtle Beach",
    towerName: "Myrtle Beach Tower",
    city: "Myrtle Beach, South Carolina",
    lat: 33.679699,
    lon: -78.928299,
    elevFt: 25,
    home: false,
    blurb: "The beach and the ocean!",
    icon: "🏖️",
    runway: {
      lengthFt: 9503,
      widthFt: 150,
      preferred: "36",
      ends: [
        { id: "18", spoken: "one eight", lat: 33.692501068115234, lon: -78.93150329589844, elevFt: 22 },
        { id: "36", spoken: "three six", lat: 33.66699981689453, lon: -78.92510223388672, elevFt: 21 },
      ],
    },
  },
  {
    code: "ATL", icao: "KATL", name: "Hartsfield-Jackson Atlanta International Airport", spoken: "Atlanta", towerName: "Atlanta Tower",
    city: "Atlanta, Georgia", lat: 33.6367, lon: -84.428101, elevFt: 1026, home: false, blurb: "The busiest airport in the world!", icon: "🏙️",
    verify: "One of five parallel runways; confirm designators on the FAA diagram.",
    runway: { lengthFt: 12390, widthFt: 150, preferred: "27R", ends: [
      { id: "9L", spoken: "niner left", lat: 33.63470078, lon: -84.44799805, elevFt: 1019 },
      { id: "27R", spoken: "two seven right", lat: 33.63470078, lon: -84.4088974, elevFt: 978 },
    ] },
  },
  {
    code: "TYS", icao: "KTYS", name: "McGhee Tyson Airport", spoken: "Knoxville", towerName: "Knoxville Tower",
    city: "Knoxville, Tennessee", lat: 35.811001, lon: -83.994003, elevFt: 981, home: false, blurb: "Gateway to the Smoky Mountains", icon: "🏔️",
    runway: { lengthFt: 9000, widthFt: 150, preferred: "23R", ends: [
      { id: "5L", spoken: "five left", lat: 35.8042984, lon: -84.00550079, elevFt: 923 },
      { id: "23R", spoken: "two three right", lat: 35.82189941, lon: -83.98410034, elevFt: 976 },
    ] },
  },
  {
    code: "CHA", icao: "KCHA", name: "Chattanooga Metropolitan Airport", spoken: "Chattanooga", towerName: "Chattanooga Tower",
    city: "Chattanooga, Tennessee", lat: 35.035301, lon: -85.203796, elevFt: 683, home: false, blurb: "The Choo Choo city by the river", icon: "🚂",
    runway: { lengthFt: 7400, widthFt: 150, preferred: "20", ends: [
      { id: "2", spoken: "two", lat: 35.022701263427734, lon: -85.2074966430664, elevFt: 681 },
      { id: "20", spoken: "two zero", lat: 35.04209899902344, lon: -85.20040130615234, elevFt: 667 },
    ] },
  },
  {
    code: "GSP", icao: "KGSP", name: "Greenville-Spartanburg International Airport", spoken: "Greenville Spartanburg", towerName: "Greer Tower",
    city: "Greer, South Carolina", lat: 34.895699, lon: -82.218903, elevFt: 964, home: false, blurb: "Cars are built right next door!", icon: "🚗",
    runway: { lengthFt: 11001, widthFt: 150, preferred: "22", ends: [
      { id: "4", spoken: "four", lat: 34.88290024, lon: -82.22859955, elevFt: 964 },
      { id: "22", spoken: "two two", lat: 34.90850067, lon: -82.20909882, elevFt: 964 },
    ] },
  },
  {
    code: "CAE", icao: "KCAE", name: "Columbia Metropolitan Airport", spoken: "Columbia", towerName: "Columbia Tower",
    city: "Columbia, South Carolina", lat: 33.938172, lon: -81.123022, elevFt: 236, home: false, blurb: "South Carolina's capital city", icon: "🏛️",
    runway: { lengthFt: 8601, widthFt: 150, preferred: "29", ends: [
      { id: "11", spoken: "one one", lat: 33.94409942626953, lon: -81.13780212402344, elevFt: 229 },
      { id: "29", spoken: "two niner", lat: 33.938201904296875, lon: -81.11029815673828, elevFt: 210 },
    ] },
  },
  {
    code: "GSO", icao: "KGSO", name: "Piedmont Triad International Airport", spoken: "Greensboro", towerName: "Greensboro Tower",
    city: "Greensboro, North Carolina", lat: 36.09937, lon: -79.937262, elevFt: 925, home: false, blurb: "Three cities close together", icon: "🌳",
    runway: { lengthFt: 10001, widthFt: 150, preferred: "23L", ends: [
      { id: "5R", spoken: "five right", lat: 36.091099, lon: -79.944702, elevFt: 900 },
      { id: "23L", spoken: "two three left", lat: 36.1101, lon: -79.920303, elevFt: 886 },
    ] },
  },
  {
    code: "RDU", icao: "KRDU", name: "Raleigh-Durham International Airport", spoken: "Raleigh Durham", towerName: "Raleigh Durham Tower",
    city: "Raleigh, North Carolina", lat: 35.878659, lon: -78.7873, elevFt: 435, home: false, blurb: "Near North Carolina's capital", icon: "🏛️",
    runway: { lengthFt: 10000, widthFt: 150, preferred: "23R", ends: [
      { id: "5L", spoken: "five left", lat: 35.8745002746582, lon: -78.802001953125, elevFt: 367 },
      { id: "23R", spoken: "two three right", lat: 35.893798828125, lon: -78.77799987792969, elevFt: 409 },
    ] },
  },
  {
    code: "ROA", icao: "KROA", name: "Roanoke-Blacksburg Regional Airport", spoken: "Roanoke", towerName: "Roanoke Tower",
    city: "Roanoke, Virginia", lat: 37.3255, lon: -79.975403, elevFt: 1175, home: false, blurb: "A giant star shines on a mountain here", icon: "⭐",
    runway: { lengthFt: 6800, widthFt: 150, preferred: "24", ends: [
      { id: "6", spoken: "six", lat: 37.322201, lon: -79.984001, elevFt: 1152 },
      { id: "24", spoken: "two four", lat: 37.334301, lon: -79.966202, elevFt: 1155 },
    ] },
  },
];

export interface Landmark extends LatLon {
  id: string;
  /** Spoken in "Look down! That's ___!" */
  spoken: string;
  fact: string;
}

export const LANDMARKS: Landmark[] = [
  { id: "grandfather", spoken: "Grandfather Mountain", lat: 36.0967, lon: -81.8317, fact: "It has a swinging bridge way up high!" },
  { id: "norman", spoken: "Lake Norman", lat: 35.5506, lon: -80.9442, fact: "People made this giant lake by building a dam!" },
  { id: "mitchell", spoken: "Mount Mitchell", lat: 35.7648, lon: -82.2652, fact: "It's the tallest mountain east of the Mississippi River." },
  { id: "charlotte", spoken: "the city of Charlotte", lat: 35.2271, lon: -80.8431, fact: "Look at all the tall buildings!" },
  { id: "boone", spoken: "Boone Lake", lat: 36.4433, lon: -82.4386, fact: "Boats love this lake near home." },
  { id: "pee-dee", spoken: "the Pee Dee River", lat: 34.27, lon: -79.69, fact: "This river flows all the way to the ocean." },
  { id: "clingmans", spoken: "Clingmans Dome", lat: 35.5628, lon: -83.4985, fact: "It's the tallest mountain in the Great Smoky Mountains." },
  { id: "smokies", spoken: "the Great Smoky Mountains", lat: 35.65, lon: -83.55, fact: "The trees make a blue mist, so the mountains look smoky!" },
  { id: "biltmore", spoken: "the Biltmore House", lat: 35.5408, lon: -82.5523, fact: "It's the biggest house in America!" },
  { id: "chimney", spoken: "Chimney Rock", lat: 35.4392, lon: -82.2468, fact: "It's a giant rock tower on the side of a mountain." },
  { id: "rogers", spoken: "Mount Rogers", lat: 36.6597, lon: -81.5446, fact: "It's the tallest mountain in Virginia, and wild ponies live nearby!" },
  { id: "pilot", spoken: "Pilot Mountain", lat: 36.3401, lon: -80.4745, fact: "Long ago, travelers used it to find their way, just like a pilot!" },
  { id: "linville", spoken: "Linville Gorge", lat: 35.95, lon: -81.93, fact: "People call it the Grand Canyon of the East." },
  { id: "stone", spoken: "Stone Mountain", lat: 33.8053, lon: -84.1455, fact: "The whole mountain is one giant rock!" },
  { id: "atlanta", spoken: "the city of Atlanta", lat: 33.749, lon: -84.388, fact: "Look at all the skyscrapers!" },
  { id: "lanier", spoken: "Lake Lanier", lat: 34.2, lon: -83.95, fact: "People made this giant lake by building a dam!" },
  { id: "murray", spoken: "Lake Murray", lat: 34.06, lon: -81.27, fact: "People made this giant lake by building a dam!" },
  { id: "roanokestar", spoken: "the Roanoke Star", lat: 37.2508, lon: -79.9353, fact: "It's a giant star that lights up the mountain at night!" },
  { id: "atlantic", spoken: "the Atlantic Ocean", lat: 33.68, lon: -78.75, fact: "If you kept going, you'd fly all the way to Africa!" },
];

const CORE_STATE: Record<string, string> = { TRI: "TN", CLT: "NC", AVL: "NC", MYR: "SC", ATL: "GA", TYS: "TN", CHA: "TN", GSP: "SC", CAE: "SC", GSO: "NC", RDU: "NC", ROA: "VA" };
for (const a of CORE_AIRPORTS) a.state ??= CORE_STATE[a.code];

/**
 * Every airport in the game: the hand-made ones plus all airline airports in the lower 48
 * states (src/data/usAirports.json, built by scripts/world/build-airports.mjs from OurAirports).
 */
export const ALL_AIRPORTS: Airport[] = [...CORE_AIRPORTS, ...(US_AIRPORTS as Airport[]).filter((a) => !CORE_AIRPORTS.some((c) => c.code === a.code))];

/**
 * The airports you can fly to in the current map: all of them where the map covers the whole
 * country (Google, Cesium ion), only those inside the offline map's area otherwise. Updated in
 * place by setPlayableArea, so code that imported it sees the change.
 */
export const AIRPORTS: Airport[] = [...CORE_AIRPORTS];

/** Where the current map can be flown: null = everywhere, else a lat/lon box. */
export let playableBounds: { south: number; north: number; west: number; east: number } | null = { south: 33, north: 37.5, west: -85.5, east: -78 };

export function setPlayableArea(bounds: { south: number; north: number; west: number; east: number } | null): void {
  playableBounds = bounds;
  const m = 0.15; // keep clear of the map's edge
  const inside = (a: Airport) => !bounds || (a.lat > bounds.south + m && a.lat < bounds.north - m && a.lon > bounds.west + m && a.lon < bounds.east - m);
  AIRPORTS.length = 0;
  AIRPORTS.push(...ALL_AIRPORTS.filter((a) => CORE_AIRPORTS.includes(a) || inside(a)));
}
setPlayableArea(playableBounds);

export function airportByCode(code: string): Airport {
  const a = AIRPORTS.find((x) => x.code === code) ?? ALL_AIRPORTS.find((x) => x.code === code);
  if (!a) throw new Error(`Unknown airport ${code}`);
  return a;
}

/** True if this airport can be flown to in the current map. */
export function isPlayable(code: string): boolean {
  return AIRPORTS.some((a) => a.code === code);
}
