// Bombardier Challenger 3500 (the Challenger 300/350 airframe), measured from a side-on photo
// (left side; lengths scaled by its published 20.92 m, heights by the fuselage depth because
// the wide-angle shot stretches lengthways): a wide flat-floored cabin 2.19 m wide and 1.86 m
// tall with six windows a side, the airstair door behind the cockpit on the left, a high,
// rounded nose, swept wing with canted winglets, HTF7350 engines on the tailcone and a very
// swept T-tail.
export const CHALLENGER3500 = {
  fus: [
    [10.07, 0.03, 1.88, 1.74, 2.0], [9.98, 0.17, 2.02, 1.6, 2.0], [9.7, 0.42, 2.25, 1.48, 2.0], [9.2, 0.72, 2.52, 1.38, 2.05],
    [8.8, 0.95, 2.86, 1.33, 2.1], [8.3, 1.1, 3.42, 1.3, 2.15], [7.8, 1.2, 3.63, 1.29, 2.2], [7.3, 1.24, 3.71, 1.29, 2.2],
    [6.8, 1.25, 3.73, 1.29, 2.2], [-0.8, 1.25, 3.74, 1.29, 2.2], [-1.8, 1.2, 3.76, 1.75, 2.2], [-2.8, 1.08, 3.78, 2.15, 2.2],
    [-4.0, 0.88, 3.78, 2.5, 2.15], [-5.3, 0.64, 3.72, 2.8, 2.1], [-6.5, 0.4, 3.62, 3.0, 2.05], [-7.25, 0.2, 3.52, 3.12, 2.0],
    [-7.5, 0.05, 3.36, 3.25, 2.0],
  ],
  floor: 1.815,
  aisleDrop: 0,
  windows: { w: 0.28, h: 0.44, yc: 2.85, r: 0.14, left: [5.17, 4.36, 3.56, 2.76, 1.93, 1.11], right: [5.17, 4.36, 3.56, 2.76, 1.93, 1.11] },
  cockpitWindows: [{ z0: 7.55, z1: 8.25, y0: 3.0, y1: 3.36, r: 0.08 }],
  windshield: { z1: 8.8, lower: [[8.35, 2.98], [8.48, 2.92], [8.6, 2.86], [8.7, 2.81], [8.76, 2.79]] },
  lining: { z0: 8.3, z1: -1.3 },
  cockpit: { bulkheadZ: 7.1, panelZ: 8.22, seatX: 0.52, extraScreens: true },
  cabin: { lavZ: -0.6, rows: [{ z: 5.5, facing: "aft" }, { z: 4.51 }, { z: 3.25, facing: "aft" }, { z: 2.08 }], tables: [5.0, 2.66], galleyZ: 6.5, windowSeat: 4.36, aisleHalf: 0.45, seatWidth: 0.52 },
  door: { z0: 6.03, z1: 6.93, y0: 1.44, y1: 3.5 },
  wing: { dihedral: 2.5, sweep: 26, span: 9.9, y0: 1.2, rootChord: 5.0, tipChord: 1.25, le0: 3.6, flap: [1.4, 6.0], aileron: [6.2, 9.2], thickness: 0.12, winglet: { out: 0.35, height: 1.25, back: 1.05, tipChord: 0.45 } },
  fairing: { top: 1.55, keys: [[4.6, 0.02, 1.32], [4.2, 0.35, 1.1], [3.4, 0.7, 0.98], [2.2, 0.92, 0.92], [0.6, 1.0, 0.9], [-1.0, 0.95, 0.92], [-2.2, 0.7, 1.02], [-3.0, 0.35, 1.2], [-3.5, 0.02, 1.4]] },
  fin: { rootLE: [3.78, -3.62], tipLE: [5.9, -5.65], rootChord: 3.65, tipChord: 1.85 },
  dorsal: { z0: -2.4, z1: -3.8, ze: -4.3, width: 0.2 },
  tailplane: { y: 5.92, rootLE: -6.0, root: 2.2, tipX: 3.55, tipLE: -9.0, tip: 0.85 },
  engines: [{ x: 1.75, y: 3.07, zi: -1.59, len: 3.5, r: 0.56 }],
  registration: { on: "nacelle", h: 0.26 },
  stripe: { y: 2.25, riseFrom: 1.5, rise: 0.1, z0: 9.6, z1: -6.0, width: 0.09 },
  antennas: [[6.5, 0.22], [2.0, 0.18], [-3.0, 0.16]],
  pitot: [9.4, 1.95],
  gear: { mainX: 1.65, pivotY: 1.4, mainR: 0.42, mainW: 0.27, legR: 0.07, noseZ: 7.91, noseR: 0.26, noseW: 0.16, noseDual: true, nosePivotY: 1.6 },
};
