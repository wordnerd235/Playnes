// Pilatus PC-12 NGX, measured from a near side-on photo (lengths scaled by its published 14.4 m
// to the tailplane tip, heights by its 4.26 m): a PT6 turboprop with a five-blade propeller in
// a long nose, a big windshield, a flat-floored cabin 1.52 m wide and 1.47 m tall, the large
// cargo door with airstair at the rear on the left, a straight wing with winglets, trailing-
// link gear, a T-tail and two small strakes under the tail.
export const PC12 = {
  fus: [
    [4.8, 0.27, 2.16, 1.64, 2.0], [4.6, 0.42, 2.26, 1.5, 2.0], [4.2, 0.55, 2.33, 1.33, 2.05], [3.6, 0.63, 2.37, 1.18, 2.1],
    [3.0, 0.69, 2.41, 1.09, 2.15], [2.6, 0.73, 2.5, 1.04, 2.2], [2.2, 0.77, 2.68, 1.0, 2.2], [1.8, 0.79, 2.82, 0.97, 2.2],
    [1.4, 0.8, 2.88, 0.95, 2.2], [-1.5, 0.8, 2.88, 0.92, 2.2], [-2.5, 0.76, 2.86, 1.05, 2.2], [-3.5, 0.66, 2.82, 1.25, 2.15],
    [-4.6, 0.52, 2.75, 1.45, 2.1], [-5.8, 0.36, 2.62, 1.62, 2.05], [-6.9, 0.22, 2.48, 1.74, 2.0], [-7.7, 0.08, 2.3, 1.85, 2.0],
  ],
  floor: 1.32,
  aisleDrop: 0,
  windows: { w: 0.3, h: 0.36, yc: 2.23, r: 0.15, left: [0.55, -0.15, -0.85, -1.75], right: [0.55, -0.15, -0.85, -1.75, -2.6] },
  cockpitWindows: [{ z0: 0.95, z1: 1.5, y0: 2.1, y1: 2.6, r: 0.08 }],
  windshield: { z1: 2.6, lower: [[1.55, 2.32], [1.85, 2.28], [2.1, 2.27], [2.35, 2.26], [2.55, 2.26]] },
  lining: { z0: 1.55, z1: -3.6 },
  cockpit: { bulkheadZ: 0.45, panelZ: 1.45, seatX: 0.33, seatWidth: 0.46, floorDrop: 0.05 },
  cabin: { lavZ: -3.5, rows: [{ z: 0.05, facing: "aft" }, { z: -1.15 }, { z: -2.25 }], tables: [-0.55], galleyZ: -2.95, windowSeat: -0.85, aisleHalf: 0.32, seatWidth: 0.46, backLen: 0.58 },
  door: { z0: -3.35, z1: -2.55, y0: 1.0, y1: 2.7 },
  wing: { dihedral: 5, sweep: 2, span: 7.6, y0: 0.9, rootChord: 2.6, tipChord: 1.15, le0: 1.6, flap: [0.9, 4.8], aileron: [5.0, 7.2], thickness: 0.14, winglet: { out: 0.15, height: 0.75, back: 0.6, tipChord: 0.4 } },
  fairing: { top: 1.1, keys: [[1.8, 0.02, 0.95], [1.5, 0.3, 0.82], [1.0, 0.55, 0.75], [0.0, 0.62, 0.73], [-0.8, 0.5, 0.78], [-1.3, 0.25, 0.86], [-1.6, 0.02, 0.95]] },
  fin: { rootLE: [3.05, -5.45], tipLE: [4.12, -6.8], rootChord: 2.35, tipChord: 1.5 },
  dorsal: { z0: -4.6, z1: -5.45, ze: -5.85, width: 0.14 },
  strakes: { z0: -6.2, z1: -7.0 },
  tailplane: { y: 4.15, rootLE: -6.65, root: 1.5, tipX: 2.6, tipLE: -8.3, tip: 0.8 },
  prop: { r: 1.33, blades: 5, spinner: 0.27, spinnerLen: 0.55, y: 1.9, z: 4.78, exhaustZ: 4.25 },
  registration: { on: "fuselage", y: 2.3, z: -4.6, h: 0.2 },
  stripe: { y: 1.85, riseFrom: -1.0, rise: 0.06, z0: 4.2, z1: -6.5, width: 0.07 },
  antennas: [[0.0, 0.15], [-3.0, 0.13]],
  pitot: [3.4, 1.4],
  gear: { mainX: 2.25, pivotY: 0.85, mainR: 0.3, mainW: 0.18, noseZ: 2.91, noseR: 0.18, noseW: 0.12, nosePivotY: 1.0 },
};
