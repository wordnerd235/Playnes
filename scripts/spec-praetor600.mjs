// Embraer Praetor 600, measured from a side-on photo (left side) scaled to its published
// 20.74 m length (21.5 m span over the winglets, 6.43 m tall): long cabin 2.08 m wide and
// 1.83 m tall with a flat floor and seven windows a side, the airstair door behind the cockpit
// on the left, a deep wing-to-body fairing, swept wing with tall winglets, Honeywell HTF7500E
// engines on the tailcone, a tall swept T-tail, side-sticks in the cockpit.
export const PRAETOR600 = {
  fus: [
    [10.79, 0.03, 1.58, 1.46, 2.0], [10.7, 0.16, 1.72, 1.33, 2.0], [10.4, 0.4, 1.95, 1.2, 2.0], [9.8, 0.7, 2.2, 1.14, 2.05],
    [9.0, 0.9, 2.44, 1.12, 2.1], [8.5, 1.0, 2.8, 1.15, 2.15], [8.0, 1.06, 3.12, 1.18, 2.2], [7.4, 1.1, 3.38, 1.2, 2.2],
    [6.8, 1.1, 3.42, 1.21, 2.2], [-1.0, 1.1, 3.43, 1.21, 2.2], [-2.0, 1.04, 3.45, 1.65, 2.2], [-2.7, 0.96, 3.46, 1.92, 2.2],
    [-3.8, 0.8, 3.45, 2.17, 2.15], [-5.0, 0.6, 3.4, 2.36, 2.1], [-6.3, 0.4, 3.3, 2.5, 2.05], [-7.2, 0.2, 3.18, 2.56, 2.0],
    [-7.47, 0.05, 3.0, 2.72, 2.0],
  ],
  floor: 1.53,
  aisleDrop: 0,
  windows: { w: 0.28, h: 0.33, yc: 2.55, r: 0.13, left: [5.08, 4.3, 3.53, 2.77, 2.0, 1.25, 0.22], right: [5.08, 4.3, 3.53, 2.77, 2.0, 1.25, 0.22] },
  cockpitWindows: [{ z0: 7.32, z1: 7.98, y0: 2.5, y1: 2.92, r: 0.08 }],
  windshield: { z1: 9.02, lower: [[8.08, 2.49], [8.3, 2.45], [8.55, 2.42], [8.8, 2.4], [8.96, 2.39]] },
  lining: { z0: 8.05, z1: -1.75 },
  cockpit: { bulkheadZ: 6.6, panelZ: 7.96, seatX: 0.48, sidestick: true, extraScreens: true },
  cabin: { lavZ: -0.9, rows: [{ z: 4.88, facing: "aft" }, { z: 3.68 }, { z: 2.3, facing: "aft" }, { z: 1.4 }], tables: [4.28, 1.85], galleyZ: 6.0, windowSeat: 3.53, aisleHalf: 0.42, seatWidth: 0.5 },
  door: { z0: 5.62, z1: 6.44, y0: 1.43, y1: 3.13 },
  wing: { dihedral: 3, sweep: 22, span: 10.35, y0: 1.05, rootChord: 4.6, tipChord: 1.15, le0: 3.2, flap: [1.2, 6.2], aileron: [6.4, 9.6], thickness: 0.12, winglet: { out: 0.25, height: 1.35, back: 1.0, tipChord: 0.45 } },
  // Belly fairing checked from below: it starts well ahead of the wing and its tail end follows the
  // fuselage's upswept belly into the tail cone (it used to hang below it).
  fairing: { top: 1.5, e: 2.3, keys: [[6.0, 0.02, 1.22], [5.2, 0.4, 1.06], [4.2, 0.62, 0.92], [3.0, 0.8, 0.82], [1.6, 0.88, 0.78], [0.2, 0.86, 0.79], [-1.0, 0.74, 0.88, 1.5], [-1.9, 0.5, 1.2, 1.8], [-2.6, 0.24, 1.6, 2.05], [-3.1, 0.02, 1.88, 2.2]] },
  fin: { rootLE: [3.42, -3.6], tipLE: [6.1, -5.75], rootChord: 3.6, tipChord: 1.6 },
  dorsal: { z0: -2.2, z1: -3.8, ze: -4.3, width: 0.2 },
  tailplane: { y: 6.15, rootLE: -6.4, root: 2.0, tipX: 3.6, tipLE: -8.9, tip: 0.95 },
  engines: [{ x: 1.55, y: 2.93, zi: -1.93, len: 3.2, r: 0.47 }],
  registration: { on: "nacelle", h: 0.24 },
  stripe: { y: 1.9, riseFrom: 1.0, rise: 0.11, z0: 10.2, z1: -6.5, width: 0.09 },
  antennas: [[6.0, 0.22], [1.5, 0.18], [-3.0, 0.16]],
  pitot: [10.0, 1.65],
  gear: { mainX: 2.05, pivotY: 1.25, mainR: 0.38, mainW: 0.25, legR: 0.065, noseZ: 8.74, noseR: 0.24, noseW: 0.15, noseDual: true, nosePivotY: 1.5 },
  fov: 80,
};
