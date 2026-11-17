// Embraer Phenom 100, measured from a side-on photo (right side; lengths scaled by its
// published 12.82 m, heights by its 4.35 m tail): a small cabin 1.55 m wide and 1.50 m tall
// with a dropped aisle and four seats in a club, the airstair door behind the cockpit on the
// left and an emergency exit on the right, P&WC PW617 engines on the tailcone, a straight wing
// with no winglets, a swept T-tail and ventral strakes like the Phenom 300.
export const PHENOM100 = {
  fus: [
    [6.17, 0.03, 1.24, 1.1, 2.0], [6.1, 0.12, 1.32, 1.0, 2.0], [5.9, 0.28, 1.45, 0.94, 2.0], [5.4, 0.48, 1.65, 0.9, 2.05],
    [4.8, 0.64, 1.86, 0.88, 2.1], [4.3, 0.73, 2.14, 0.86, 2.15], [3.8, 0.78, 2.42, 0.85, 2.2], [3.3, 0.8, 2.66, 0.85, 2.2],
    [2.9, 0.8, 2.71, 0.87, 2.2], [-0.3, 0.8, 2.71, 0.91, 2.2], [-0.9, 0.76, 2.71, 1.05, 2.2], [-1.6, 0.68, 2.7, 1.3, 2.2],
    [-2.4, 0.55, 2.68, 1.55, 2.15], [-3.2, 0.4, 2.64, 1.72, 2.1], [-3.8, 0.26, 2.6, 1.8, 2.05], [-4.1, 0.08, 2.5, 1.95, 2.0],
  ],
  floor: 1.16,
  windows: { w: 0.31, h: 0.39, yc: 2.19, r: 0.15, left: [1.46, 0.92, 0.26], right: [2.02, 1.46, 0.92, 0.26] },
  cockpitWindows: [{ z0: 3.18, z1: 3.72, y0: 2.14, y1: 2.44, r: 0.07 }],
  windshield: { z1: 4.27, lower: [[3.81, 2.15], [3.95, 2.11], [4.08, 2.08], [4.18, 2.06], [4.24, 2.05]] },
  lining: { z0: 3.78, z1: -0.8 },
  cockpit: { bulkheadZ: 2.75, panelZ: 3.7, seatX: 0.34, seatWidth: 0.44, floorDrop: 0.04 },
  cabin: { lavZ: -0.35, rows: [{ z: 1.6, facing: "aft" }, { z: 0.41 }], tables: [1.0], galleyZ: 2.35, windowSeat: 0.26, aisleHalf: 0.36 },
  door: { z0: 2.0, z1: 2.62, y0: 0.98, y1: 2.5 },
  exits: [{ side: -1, z0: 0.7, z1: 1.14, y0: 1.83, y1: 2.52 }],
  wing: { dihedral: 5, sweep: 10, span: 6.0, y0: 0.72, rootChord: 2.25, tipChord: 0.9, le0: 1.05, flap: [0.5, 3.3], aileron: [3.45, 5.3], thickness: 0.13, winglet: null },
  fairing: { top: 0.95, keys: [[1.55, 0.02, 0.78], [1.35, 0.2, 0.7], [1.0, 0.42, 0.62], [0.3, 0.5, 0.6], [-0.5, 0.48, 0.62], [-1.0, 0.32, 0.7], [-1.35, 0.02, 0.8]] },
  fin: { rootLE: [2.72, -1.66], tipLE: [4.3, -3.66], rootChord: 2.45, tipChord: 0.96 },
  dorsal: { z0: -0.9, z1: -1.9, ze: -2.3, width: 0.14 },
  strakes: { z0: -3.0, z1: -3.6 },
  tailplane: { y: 4.33, rootLE: -3.62, root: 1.05, tipX: 2.5, tipLE: -6.0, tip: 0.55 },
  engines: [{ x: 1.08, y: 2.39, zi: -0.55, len: 1.85, r: 0.4 }],
  registration: { on: "nacelle", h: 0.15 },
  stripe: { y: 1.62, riseFrom: 0.5, rise: 0.1, z0: 5.8, z1: -3.3, width: 0.06 },
  antennas: [[2.4, 0.16], [-0.5, 0.14]],
  pitot: [5.6, 1.2],
  gear: { mainX: 1.3, pivotY: 0.8, mainR: 0.26, mainW: 0.17, noseZ: 4.58, noseR: 0.19, noseW: 0.12, nosePivotY: 0.95 },
};
