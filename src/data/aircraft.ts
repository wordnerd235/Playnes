// Aircraft catalogue: real models with approximate public figures.
// Stats are used for the plane cards, range gating and the flight model.
// Shape values (meters) drive the procedural "toy-real" 3D models built by scripts/build-models.mjs.
// This file must stay free of DOM/browser imports: Node scripts import it too.

export type EngineLayout = "prop-nose" | "rear-twin" | "over-wing" | "rear-tri";
export type TailType = "conventional" | "t-tail" | "cruciform";

export interface AircraftShape {
  length: number;
  span: number;
  fuselageDiameter: number;
  wing: "high" | "low";
  sweepDeg: number;
  tail: TailType;
  engines: EngineLayout;
  winglets: boolean;
  /** Fixed landing gear (cannot retract). */
  fixedGear: boolean;
}

export interface Livery {
  body: string;
  stripe: string;
  accent: string;
}

export interface AircraftDef {
  id: string;
  maker: string;
  model: string;
  /** How the co-pilot says it. */
  spoken: string;
  kind: "piston" | "turboprop" | "jet";
  category: string;
  seats: number;
  rangeNm: number;
  cruiseKt: number;
  /** Wings needed, or how it is unlocked. */
  unlock: { type: "start" } | { type: "graduation" } | { type: "wings"; price: number } | { type: "captain" };
  /** Kid "wow" fact, read aloud on the plane card. */
  wow: string;
  // Flight model (knots, feet per minute, degrees per second)
  vr: number;
  vapp: number;
  vclimb: number;
  vstall: number;
  /** Maximum operating speed, knots indicated (Vmo; Vne for the Cessna). */
  vmo: number;
  /** Maximum operating Mach number (jets); 1 = no Mach limit. */
  mmo: number;
  climbFpm: number;
  rollRate: number;
  cruiseAltFt: number;
  shape: AircraftShape;
  livery: Livery;
}

export const AIRCRAFT: AircraftDef[] = [
  {
    id: "c172",
    maker: "Cessna",
    model: "172 Skyhawk",
    spoken: "Cessna Skyhawk",
    kind: "piston",
    category: "Trainer",
    seats: 4,
    rangeNm: 640,
    cruiseKt: 124,
    unlock: { type: "start" },
    wow: "Almost every pilot learns to fly in a Cessna Skyhawk!",
    vr: 55, vapp: 65, vclimb: 75, vstall: 48, vmo: 163, mmo: 1, climbFpm: 730, rollRate: 35, cruiseAltFt: 7500,
    shape: { length: 8.3, span: 11.0, fuselageDiameter: 1.25, wing: "high", sweepDeg: 0, tail: "conventional", engines: "prop-nose", winglets: false, fixedGear: true },
    livery: { body: "#f7f7f2", stripe: "#c8262e", accent: "#1d3f8f" },
  },
  {
    id: "phenom100",
    maker: "Embraer",
    model: "Phenom 100EX",
    spoken: "Embraer Phenom one hundred",
    kind: "jet",
    category: "Light jet",
    seats: 6,
    rangeNm: 1180,
    cruiseKt: 406,
    unlock: { type: "graduation" },
    wow: "This is your very first jet! It flies more than three times faster than the Skyhawk.",
    vr: 100, vapp: 105, vclimb: 160, vstall: 82, vmo: 275, mmo: 0.7, climbFpm: 3000, rollRate: 30, cruiseAltFt: 30000,
    shape: { length: 12.8, span: 12.3, fuselageDiameter: 1.7, wing: "low", sweepDeg: 10, tail: "t-tail", engines: "rear-twin", winglets: false, fixedGear: false },
    livery: { body: "#fbfbfb", stripe: "#1c2f5e", accent: "#8aa6c8" },
  },
  {
    id: "pc12",
    maker: "Pilatus",
    model: "PC-12 NGX",
    spoken: "Pilatus P C twelve",
    kind: "turboprop",
    category: "Turboprop",
    seats: 10,
    rangeNm: 1800,
    cruiseKt: 290,
    unlock: { type: "wings", price: 75 },
    wow: "The P C twelve has one big propeller and can land on short runways.",
    vr: 85, vapp: 95, vclimb: 120, vstall: 67, vmo: 236, mmo: 1, climbFpm: 1900, rollRate: 32, cruiseAltFt: 25000,
    shape: { length: 14.4, span: 16.3, fuselageDiameter: 1.7, wing: "low", sweepDeg: 0, tail: "t-tail", engines: "prop-nose", winglets: true, fixedGear: false },
    livery: { body: "#f9f9f6", stripe: "#0d7c7c", accent: "#c7a43a" },
  },
  {
    id: "hondajet",
    maker: "Honda",
    model: "HondaJet Elite II",
    spoken: "Honda Jet",
    kind: "jet",
    category: "Very light jet",
    seats: 6,
    rangeNm: 1550,
    cruiseKt: 422,
    unlock: { type: "wings", price: 125 },
    wow: "The Honda Jet's engines sit on top of the wings!",
    vr: 105, vapp: 110, vclimb: 170, vstall: 85, vmo: 270, mmo: 0.72, climbFpm: 3900, rollRate: 32, cruiseAltFt: 30000,
    shape: { length: 13.0, span: 12.1, fuselageDiameter: 1.6, wing: "low", sweepDeg: 6, tail: "conventional", engines: "over-wing", winglets: true, fixedGear: false },
    livery: { body: "#f4f6fa", stripe: "#2b6cb0", accent: "#9fb4cc" },
  },
  {
    id: "phenom300",
    maker: "Embraer",
    model: "Phenom 300E",
    spoken: "Embraer Phenom three hundred",
    kind: "jet",
    category: "Light jet",
    seats: 10,
    rangeNm: 2000,
    cruiseKt: 464,
    unlock: { type: "wings", price: 175 },
    wow: "The Phenom three hundred is the best-selling light jet in the whole world.",
    vr: 105, vapp: 110, vclimb: 180, vstall: 88, vmo: 320, mmo: 0.8, climbFpm: 3900, rollRate: 30, cruiseAltFt: 33000,
    shape: { length: 15.6, span: 16.2, fuselageDiameter: 1.8, wing: "low", sweepDeg: 22, tail: "t-tail", engines: "rear-twin", winglets: true, fixedGear: false },
    livery: { body: "#fcfcfa", stripe: "#a9822e", accent: "#3a3a3a" },
  },
  {
    id: "pc24",
    maker: "Pilatus",
    model: "PC-24",
    spoken: "Pilatus P C twenty-four",
    kind: "jet",
    category: "Light jet",
    seats: 10,
    rangeNm: 2000,
    cruiseKt: 440,
    unlock: { type: "wings", price: 225 },
    wow: "The P C twenty-four is a jet that can land on grass and dirt runways!",
    vr: 100, vapp: 105, vclimb: 175, vstall: 85, vmo: 290, mmo: 0.76, climbFpm: 3700, rollRate: 30, cruiseAltFt: 30000,
    shape: { length: 16.9, span: 17.0, fuselageDiameter: 1.9, wing: "low", sweepDeg: 12, tail: "t-tail", engines: "rear-twin", winglets: false, fixedGear: false },
    livery: { body: "#fafafa", stripe: "#c41e3a", accent: "#2d2d2d" },
  },
  {
    id: "latitude",
    maker: "Cessna",
    model: "Citation Latitude",
    spoken: "Cessna Citation Latitude",
    kind: "jet",
    category: "Midsize jet",
    seats: 9,
    rangeNm: 2700,
    cruiseKt: 446,
    unlock: { type: "wings", price: 275 },
    wow: "The Citation Latitude is so tall inside that grown-ups can stand up!",
    vr: 110, vapp: 115, vclimb: 180, vstall: 90, vmo: 305, mmo: 0.8, climbFpm: 3900, rollRate: 28, cruiseAltFt: 43000,
    shape: { length: 19.0, span: 22.0, fuselageDiameter: 2.2, wing: "low", sweepDeg: 16, tail: "t-tail", engines: "rear-twin", winglets: true, fixedGear: false },
    livery: { body: "#fbfbfb", stripe: "#22426b", accent: "#b9c3cf" },
  },
  {
    id: "praetor600",
    maker: "Embraer",
    model: "Praetor 600",
    spoken: "Embraer Praetor six hundred",
    kind: "jet",
    category: "Super-midsize jet",
    seats: 12,
    rangeNm: 4000,
    cruiseKt: 466,
    unlock: { type: "wings", price: 325 },
    wow: "The Praetor six hundred has smart computer controls that smooth out bumpy air.",
    vr: 115, vapp: 120, vclimb: 190, vstall: 92, vmo: 320, mmo: 0.83, climbFpm: 3900, rollRate: 28, cruiseAltFt: 43000,
    shape: { length: 20.7, span: 21.5, fuselageDiameter: 2.2, wing: "low", sweepDeg: 22, tail: "t-tail", engines: "rear-twin", winglets: true, fixedGear: false },
    livery: { body: "#fdfdfd", stripe: "#13294b", accent: "#d0d6de" },
  },
  {
    id: "challenger3500",
    maker: "Bombardier",
    model: "Challenger 3500",
    spoken: "Bombardier Challenger thirty-five hundred",
    kind: "jet",
    category: "Super-midsize jet",
    seats: 10,
    rangeNm: 3400,
    cruiseKt: 470,
    unlock: { type: "wings", price: 375 },
    wow: "The Challenger has a super wide cabin, like a flying living room.",
    vr: 120, vapp: 125, vclimb: 190, vstall: 95, vmo: 320, mmo: 0.85, climbFpm: 3900, rollRate: 27, cruiseAltFt: 43000,
    shape: { length: 20.9, span: 21.0, fuselageDiameter: 2.4, wing: "low", sweepDeg: 26, tail: "t-tail", engines: "rear-twin", winglets: true, fixedGear: false },
    livery: { body: "#fafafa", stripe: "#5b6470", accent: "#9b1c24" },
  },
  {
    id: "falcon8x",
    maker: "Dassault",
    model: "Falcon 8X",
    spoken: "Dassault Falcon eight X",
    kind: "jet",
    category: "Large-cabin jet",
    seats: 16,
    rangeNm: 6450,
    cruiseKt: 460,
    unlock: { type: "wings", price: 450 },
    wow: "The Falcon eight X has three engines! Can you count them?",
    vr: 120, vapp: 110, vclimb: 190, vstall: 90, vmo: 370, mmo: 0.9, climbFpm: 3800, rollRate: 26, cruiseAltFt: 43000,
    shape: { length: 24.5, span: 26.3, fuselageDiameter: 2.5, wing: "low", sweepDeg: 30, tail: "cruciform", engines: "rear-tri", winglets: true, fixedGear: false },
    livery: { body: "#fbfbfb", stripe: "#111111", accent: "#b8963e" },
  },
  {
    id: "g650er",
    maker: "Gulfstream",
    model: "G650ER",
    spoken: "Gulfstream G six fifty",
    kind: "jet",
    category: "Ultra-long-range jet",
    seats: 19,
    rangeNm: 7500,
    cruiseKt: 488,
    unlock: { type: "wings", price: 550 },
    wow: "Gulfstream jets have giant oval windows, so everyone gets a great view.",
    vr: 130, vapp: 125, vclimb: 200, vstall: 100, vmo: 340, mmo: 0.925, climbFpm: 4000, rollRate: 25, cruiseAltFt: 45000,
    shape: { length: 30.4, span: 30.4, fuselageDiameter: 2.9, wing: "low", sweepDeg: 33, tail: "t-tail", engines: "rear-twin", winglets: true, fixedGear: false },
    livery: { body: "#fbfbfb", stripe: "#6b1f2a", accent: "#c9b27c" },
  },
  {
    id: "g700",
    maker: "Gulfstream",
    model: "G700",
    spoken: "Gulfstream G seven hundred",
    kind: "jet",
    category: "Ultra-long-range jet",
    seats: 19,
    rangeNm: 7750,
    cruiseKt: 488,
    unlock: { type: "wings", price: 650 },
    wow: "The G seven hundred can fly from here all the way to Japan without stopping!",
    vr: 135, vapp: 130, vclimb: 200, vstall: 102, vmo: 340, mmo: 0.935, climbFpm: 4000, rollRate: 25, cruiseAltFt: 45000,
    shape: { length: 33.5, span: 31.4, fuselageDiameter: 3.0, wing: "low", sweepDeg: 34, tail: "t-tail", engines: "rear-twin", winglets: true, fixedGear: false },
    livery: { body: "#fcfcfc", stripe: "#0f2a4a", accent: "#7d8ea3" },
  },
  {
    id: "global8000",
    maker: "Bombardier",
    model: "Global 8000",
    spoken: "Bombardier Global eight thousand",
    kind: "jet",
    category: "Ultra-long-range jet",
    seats: 19,
    rangeNm: 8000,
    cruiseKt: 490,
    unlock: { type: "wings", price: 750 },
    wow: "The Global eight thousand is the fastest business jet in the world!",
    vr: 135, vapp: 128, vclimb: 200, vstall: 102, vmo: 340, mmo: 0.94, climbFpm: 4000, rollRate: 25, cruiseAltFt: 45000,
    shape: { length: 33.8, span: 32.4, fuselageDiameter: 3.0, wing: "low", sweepDeg: 35, tail: "t-tail", engines: "rear-twin", winglets: true, fixedGear: false },
    livery: { body: "#fafafa", stripe: "#a8102a", accent: "#2f2f2f" },
  },
];

export function aircraftById(id: string): AircraftDef {
  const a = AIRCRAFT.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown aircraft ${id}`);
  return a;
}
