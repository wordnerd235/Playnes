// Bombardier Global 8000 (the Global 7500 airframe), measured from Bombardier's side-view
// drawing scaled to its 33.8 m length (the 8.2 m tail height then matches the published figure):
// a very long cabin 2.44 m wide and 1.88 m tall with fourteen large windows a side, the
// entry door behind the cockpit on the left, a 35-degree swept wing with tall winglets, GE
// Passport engines on the tailcone, a tall swept T-tail, twin-wheel main gear.
export const GLOBAL8000 = {
  fus: [
    [19.72, 0.03, 2.74, 2.6, 2.0], [19.62, 0.22, 2.94, 2.42, 2.0], [19.3, 0.55, 3.2, 2.2, 2.0], [18.67, 0.92, 3.47, 2.0, 2.05],
    [17.9, 1.15, 3.85, 1.92, 2.1], [17.3, 1.27, 4.25, 1.9, 2.15], [16.6, 1.33, 4.6, 1.89, 2.2], [15.8, 1.36, 4.85, 1.89, 2.2],
    [15.0, 1.37, 4.96, 1.89, 2.2], [-2.0, 1.37, 4.96, 1.89, 2.2], [-4.0, 1.3, 4.96, 2.15, 2.2], [-6.0, 1.15, 4.96, 2.5, 2.15],
    [-8.0, 0.95, 4.85, 2.85, 2.1], [-10.0, 0.72, 4.7, 3.15, 2.05], [-12.0, 0.48, 4.55, 3.35, 2.0], [-13.4, 0.25, 4.42, 3.5, 2.0],
    [-14.05, 0.06, 4.2, 3.6, 2.0],
  ],
  floor: 2.98,
  aisleDrop: 0,
  windows: {
    w: 0.4, h: 0.5, yc: 3.81, r: 0.17,
    left: [12.87, 11.81, 10.79, 9.77, 8.71, 7.69, 6.64, 5.61, 4.59, 3.53, 2.51, 1.46, 0.43, -0.62],
    right: [12.87, 11.81, 10.79, 9.77, 8.71, 7.69, 6.64, 5.61, 4.59, 3.53, 2.51, 1.46, 0.43, -0.62],
  },
  cockpitWindows: [{ z0: 15.0, z1: 15.85, y0: 3.75, y1: 4.35, r: 0.09 }],
  windshield: { z1: 17.6, lower: [[15.95, 3.95], [16.35, 3.86], [16.75, 3.8], [17.15, 3.77], [17.5, 3.75]] },
  lining: { z0: 15.9, z1: -2.2 },
  cockpit: { bulkheadZ: 14.3, panelZ: 15.7, seatX: 0.6, floorDrop: 0.13, extraScreens: true },
  cabin: {
    lavZ: -1.5, rows: [{ z: 12.3, facing: "aft" }, { z: 11.0 }, { z: 8.7, facing: "aft" }, { z: 7.6 }, { z: 5.0, facing: "aft" }, { z: 3.9 }, { z: 0.9 }],
    tables: [11.65, 8.15, 4.45], divan: { z0: 1.6, z1: 3.2, side: 1 }, galleyZ: 13.6, windowSeat: 11.05, aisleHalf: 0.5, seatWidth: 0.56,
  },
  door: { z0: 13.86, z1: 14.9, y0: 2.26, y1: 4.62 },
  wing: { dihedral: 4, sweep: 34, span: 15.35, y0: 1.75, rootChord: 6.8, tipChord: 1.4, le0: 6.8, flap: [1.8, 9.0], aileron: [9.3, 13.5], thickness: 0.11, winglet: { out: 0.5, height: 1.7, back: 1.6, tipChord: 0.55 } },
  // Belly fairing checked from below: it starts well ahead of the wing and its tail end follows the
  // fuselage's upswept belly into the tail cone (it used to hang below it).
  fairing: { top: 2.1, e: 2.3, keys: [[9.4, 0.02, 1.9], [8.6, 0.6, 1.5], [7.2, 1.2, 1.25], [5.0, 1.5, 1.15], [2.0, 1.6, 1.15], [-0.5, 1.45, 1.2], [-2.0, 0.9, 1.45, 2.3], [-3.2, 0.5, 1.85, 2.45], [-4.2, 0.15, 2.12, 2.55], [-4.6, 0.02, 2.2, 2.6]] },
  fin: { rootLE: [5.0, -6.9], tipLE: [8.1, -11.6], rootChord: 5.4, tipChord: 2.6 },
  dorsal: { z0: -5.2, z1: -6.9, ze: -7.5, width: 0.25 },
  tailplane: { y: 8.15, rootLE: -11.4, root: 3.0, tipX: 5.3, tipLE: -17.0, tip: 1.5, bullet: { r: 0.26, fwd: 0.9, len: 4.0 } },
  engines: [{ x: 2.35, y: 4.03, zi: -5.0, len: 5.0, r: 0.85 }],
  registration: { on: "nacelle", h: 0.4 },
  stripe: { y: 2.9, riseFrom: -2.0, rise: 0.05, z0: 19.0, z1: -12.0, width: 0.1 },
  antennas: [[13.0, 0.3], [6.0, 0.25], [-3.0, 0.22]],
  pitot: [18.8, 2.7],
  slats: { from: 0.18, to: 0.95 }, // leading-edge slats
  gear: { mainX: 2.6, pivotY: 1.75, mainR: 0.5, mainW: 0.32, mainDual: true, legR: 0.1, noseZ: 16.74, noseR: 0.33, noseW: 0.2, noseDual: true, nosePivotY: 2.0 },
  // Corrections from fitting the model to eleven photos (below, beside, behind; see docs/HANDOFF.md):
  // the nose and the tail were too long (overall 38.5 m against the published 33.8 m), the
  // tailplane too swept, the engines a little small and too far back, the wing too flat.
  photoFit: [["@nose", "+", -1.125], ["@tail", "+", -1.25], ["fin.rootLE.1", "+", 0.3], ["tailplane.tipX", "+", 0.25], ["tailplane.tipLE", "+", 0.5],
    ["wing.dihedral", "+", 1], ["engines.0.r", "*", 1.12], ["engines.0.zi", "+", 0.625], ["fus.*.2", "+", -0.06]],
};
