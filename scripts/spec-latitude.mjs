// Cessna Citation Latitude, measured from a near side-on photo (right side) scaled by its
// published 6.38 m height, which also matches its 18.97 m length (22.05 m span): a tall
// flat-floored cabin 1.96 m wide and 1.83 m tall, the airstair door forward on the left and
// an emergency exit on the right, P&WC PW306D1 engines on the tailcone, a strongly swept fin
// with the tailplane part-way up it (cruciform), small winglets, Garmin G5000 cockpit.
export const LATITUDE = {
  fus: [
    [9.7, 0.03, 1.38, 1.26, 2.0], [9.62, 0.16, 1.5, 1.13, 2.0], [9.35, 0.4, 1.72, 1.06, 2.0], [8.8, 0.66, 1.95, 1.03, 2.05],
    [8.2, 0.86, 2.1, 1.03, 2.1], [7.6, 0.98, 2.38, 1.04, 2.15], [7.0, 1.04, 2.72, 1.05, 2.2], [6.4, 1.07, 3.02, 1.05, 2.2],
    [5.6, 1.08, 3.25, 1.05, 2.2], [-0.8, 1.08, 3.27, 1.05, 2.2], [-1.8, 1.03, 3.28, 1.32, 2.2], [-2.8, 0.92, 3.3, 1.65, 2.2],
    [-3.9, 0.76, 3.3, 1.95, 2.15], [-5.0, 0.57, 3.26, 2.17, 2.1], [-6.2, 0.37, 3.15, 2.4, 2.05], [-6.95, 0.2, 3.02, 2.55, 2.0],
    [-7.27, 0.05, 2.85, 2.7, 2.0],
  ],
  floor: 1.375,
  aisleDrop: 0,
  windows: { w: 0.32, h: 0.47, yc: 2.37, r: 0.16, left: [3.53, 2.92, 2.33, 1.74, 1.14], right: [3.53, 2.92, 2.33, 1.74, 1.14, 0.32] },
  cockpitWindows: [{ z0: 5.95, z1: 6.6, y0: 2.33, y1: 2.75, r: 0.08 }],
  windshield: { z1: 7.6, lower: [[6.7, 2.33], [6.95, 2.31], [7.2, 2.29], [7.45, 2.27], [7.56, 2.26]] },
  lining: { z0: 6.66, z1: -1.4 },
  cockpit: { bulkheadZ: 5.3, panelZ: 6.58, seatX: 0.46, floorDrop: 0.07 },
  cabin: { lavZ: -0.6, rows: [{ z: 3.6, facing: "aft" }, { z: 2.48 }, { z: 1.29 }, { z: 0.1 }], tables: [3.04], galleyZ: 4.8, windowSeat: 2.33, aisleHalf: 0.4, seatWidth: 0.5 },
  door: { z0: 4.35, z1: 5.2, y0: 1.35, y1: 3.0 },
  exits: [{ side: -1, z0: 0.11, z1: 0.53, y0: 1.9, y1: 2.75 }],
  wing: { dihedral: 3, sweep: 16, span: 10.7, y0: 1.0, rootChord: 4.0, tipChord: 1.2, le0: 1.9, flap: [1.15, 6.3], aileron: [6.5, 9.9], thickness: 0.12, winglet: { out: 0.12, height: 0.55, back: 0.55, tipChord: 0.4 } },
  // A long keel fairing, checked from below and from both sides: it starts just behind the nose
  // wheel, deepens gently under the cabin, is widest and deepest under the wing, and tapers
  // into the tail cone's upswept belly (not a pod under the wing root).
  fairing: { top: 1.35, e: 2.3, keys: [[7.3, 0.02, 1.07], [6.7, 0.32, 1.0], [5.4, 0.48, 0.95], [3.8, 0.6, 0.9], [2.4, 0.76, 0.84], [1.2, 0.86, 0.8], [0.0, 0.88, 0.79], [-1.1, 0.82, 0.84, 1.45], [-2.2, 0.6, 1.08, 1.75], [-3.0, 0.38, 1.48, 1.98], [-3.8, 0.14, 1.86, 2.15], [-4.2, 0.02, 1.98, 2.22]] },
  fin: { rootLE: [3.27, -3.37], tipLE: [6.33, -6.48], rootChord: 3.75, tipChord: 1.38 },
  dorsal: { z0: -2.2, z1: -3.6, ze: -4.1, width: 0.18 },
  tailplane: { y: 3.95, rootLE: -5.25, root: 1.95, tipX: 3.65, tipLE: -8.2, tip: 0.95 },
  engines: [{ x: 1.55, y: 2.48, zi: -1.58, len: 3.4, r: 0.53 }],
  registration: { on: "nacelle", h: 0.24 },
  stripe: { y: 1.85, riseFrom: 2.0, rise: 0.07, z0: 9.0, z1: -6.0, width: 0.08 },
  antennas: [[4.8, 0.2], [1.0, 0.18], [-2.6, 0.16]],
  pitot: [8.9, 1.5],
  // Track 3.05 m and wheelbase 8.23 m (Textron).
  gear: { mainX: 1.52, mainZ: -0.43, pivotY: 1.25, mainR: 0.33, mainW: 0.22, legR: 0.06, noseZ: 7.8, noseR: 0.23, noseW: 0.15, noseDual: true, nosePivotY: 1.3 },
};
