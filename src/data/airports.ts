// Game airports. Runway threshold coordinates come from OurAirports (public domain).
// Heights used in flight are re-sampled from the live 3D world at load time, so the
// MSL elevations here are only used for the altimeter and the key-free basic globe.
//
// VERIFY each airport against the current FAA airport diagram before relying on
// runway names: crowd-sourced data had inconsistent CLT runway names (see docs/GAME_PLAN.md §15).

import type { LatLon } from "../sim/geo.ts";

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
}

export const AIRPORTS: Airport[] = [
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
];

export function airportByCode(code: string): Airport {
  const a = AIRPORTS.find((x) => x.code === code);
  if (!a) throw new Error(`Unknown airport ${code}`);
  return a;
}
