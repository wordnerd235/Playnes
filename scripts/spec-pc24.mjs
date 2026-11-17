// Pilatus PC-24, measured from a side-on photo scaled to its published 16.85 m length (17.0 m
// span, 5.4 m tall): rear-mounted Williams FJ44 engines high on the tailcone, T-tail, a straight
// lightly swept wing with no winglets, trailing-link gear for rough strips, a flat-floored
// cabin 1.69 m wide with seven windows a side, the airstair door behind the cockpit on the left
// and an emergency exit over the wing. The cockpit floor sits a step below the cabin's.
export const PC24 = {
  fus: [
    [8.8, 0.03, 1.24, 1.12, 2.0], [8.72, 0.14, 1.33, 1.0, 2.0], [8.45, 0.36, 1.5, 0.9, 2.0], [7.9, 0.6, 1.72, 0.85, 2.05],
    [7.36, 0.76, 1.88, 0.84, 2.1], [6.9, 0.86, 2.15, 0.84, 2.15], [6.4, 0.92, 2.52, 0.84, 2.2], [5.9, 0.95, 2.8, 0.85, 2.2],
    [5.5, 0.95, 2.9, 0.85, 2.2], [-1.8, 0.95, 2.92, 0.85, 2.2], [-2.6, 0.9, 2.94, 1.12, 2.2], [-3.4, 0.78, 2.95, 1.42, 2.15],
    [-4.4, 0.6, 2.92, 1.6, 2.1], [-5.3, 0.45, 2.9, 1.74, 2.05], [-6.0, 0.33, 2.86, 1.78, 2.0], [-6.45, 0.2, 2.8, 1.86, 2.0], [-6.6, 0.05, 2.62, 2.0, 2.0],
  ],
  floor: 1.29,
  aisleDrop: 0,
  windows: { w: 0.29, h: 0.46, yc: 2.23, r: 0.13, left: [3.62, 2.86, 2.12, 1.31, 0.65, -0.02, -0.66], right: [3.62, 2.86, 2.12, 1.31, 0.65, -0.02, -0.66] },
  cockpitWindows: [{ z0: 5.55, z1: 6.2, y0: 2.05, y1: 2.45, r: 0.08 }],
  windshield: { z1: 7.05, lower: [[6.3, 2.12], [6.5, 2.0], [6.7, 1.93], [6.88, 1.88], [7.0, 1.86]] },
  lining: { z0: 6.25, z1: -2.0 },
  cockpit: { bulkheadZ: 4.8, panelZ: 6.18, seatX: 0.41, floorDrop: 0.16 },
  cabin: { lavZ: -1.3, rows: [{ z: 3.45, facing: "aft" }, { z: 2.25 }, { z: 0.8 }, { z: -0.5 }], tables: [2.85], galleyZ: 4.35, windowSeat: 2.1, aisleHalf: 0.36 },
  door: { z0: 3.95, z1: 4.68, y0: 1.25, y1: 2.78 },
  exits: [{ side: 1, z0: 1.07, z1: 1.55, y0: 1.95, y1: 2.55 }],
  wing: { dihedral: 3, sweep: 12, span: 8.45, y0: 0.95, rootChord: 3.0, tipChord: 1.1, le0: 2.5, flap: [1.0, 5.4], aileron: [5.6, 7.9], thickness: 0.13, winglet: null },
  fairing: { top: 1.2, keys: [[3.3, 0.02, 0.95], [3.1, 0.15, 0.9], [2.8, 0.4, 0.8], [2.3, 0.55, 0.74], [1.5, 0.62, 0.71], [0.5, 0.62, 0.71], [-0.3, 0.58, 0.74], [-0.9, 0.45, 0.8], [-1.4, 0.25, 0.88], [-1.7, 0.02, 0.95]] },
  fin: { rootLE: [2.9, -3.45], tipLE: [5.2, -5.45], rootChord: 3.05, tipChord: 1.3 },
  dorsal: { z0: -2.4, z1: -3.6, ze: -4.0, width: 0.15 },
  tailplane: { y: 5.22, rootLE: -5.65, root: 1.45, tipX: 3.1, tipLE: -7.35, tip: 0.72 },
  engines: [{ x: 1.45, y: 2.55, zi: -1.73, len: 2.9, r: 0.5 }],
  registration: { on: "nacelle", h: 0.22 },
  stripe: { y: 1.68, riseFrom: 3.0, rise: 0.075, z0: 7.9, z1: -4.0, width: 0.07 },
  antennas: [[4.5, 0.2], [0.5, 0.16], [-2.4, 0.15]],
  pitot: [8.2, 1.3],
  gear: { mainX: 1.55, pivotY: 1.05, mainR: 0.3, mainW: 0.19, noseZ: 7.12, noseR: 0.22, noseW: 0.14, nosePivotY: 1.05 },
};
