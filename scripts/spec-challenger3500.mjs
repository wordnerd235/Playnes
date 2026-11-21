// Bombardier Challenger 3500 (the Challenger 300/350 airframe), measured from a side-on photo
// (left side; lengths scaled by its published 20.92 m, heights by the fuselage depth because
// the wide-angle shot stretches lengthways): a wide flat-floored cabin 2.19 m wide and 1.86 m
// tall with six windows a side, the airstair door behind the cockpit on the left, a high,
// rounded nose, swept wing with canted winglets, HTF7350 engines on the tailcone and a very
// swept T-tail.
export const CHALLENGER3500 = {
  fus: [
    [10.37, 0.03, 1.82, 1.62, 2], [10.28, 0.17, 1.96, 1.48, 2], [10, 0.42, 2.19, 1.36, 2], [9.2, 0.72, 2.46, 1.26, 2.05],
    [8.8, 0.95, 2.8, 1.21, 2.1], [8.3, 1.1, 3.36, 1.18, 2.15], [7.8, 1.2, 3.57, 1.17, 2.2], [7.3, 1.24, 3.65, 1.17, 2.2],
    [6.8, 1.25, 3.67, 1.17, 2.2], [-0.8, 1.25, 3.68, 1.17, 2.2], [-1.8, 1.2, 3.7, 1.63, 2.2], [-2.8, 1.08, 3.72, 2.03, 2.2],
    [-4, 0.88, 3.72, 2.38, 2.15], [-5.3, 0.64, 3.66, 2.68, 2.1], [-6.4, 0.4, 3.56, 2.92, 2.05], [-7.0, 0.2, 3.46, 3.06, 2],
    [-7.2, 0.05, 3.32, 3.18, 2],
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
  wing: { dihedral: 3.5, sweep: 26, span: 10.05, y0: 1.2, rootChord: 5.0, tipChord: 1.25, le0: 3.6, flap: [1.4, 6.0], aileron: [6.2, 9.2], thickness: 0.12, winglet: { out: 0.35, height: 1.25, back: 1.05, tipChord: 0.45 } },
  // Belly fairing checked from below: it starts well ahead of the wing and its tail end follows the
  // fuselage's upswept belly into the tail cone (it used to hang below it).
  fairing: { top: 1.55, e: 2.3, keys: [[6.6, 0.02, 1.3], [5.6, 0.45, 1.12], [4.4, 0.72, 0.99], [3.0, 0.9, 0.93], [1.4, 0.98, 0.9], [-0.2, 0.96, 0.91], [-1.3, 0.82, 1.0, 1.7], [-2.2, 0.58, 1.38, 2.05], [-3.0, 0.3, 1.86, 2.3], [-3.6, 0.02, 2.2, 2.45]] },
  fin: { rootLE: [3.78, -3.47], tipLE: [5.8, -6.35], rootChord: 3.65, tipChord: 2.2 },
  dorsal: { z0: -2.4, z1: -3.8, ze: -4.3, width: 0.2 },
  tailplane: { y: 5.82, rootLE: -6.4, root: 2.2, tipX: 3.95, tipLE: -9.125, tip: 0.85, bullet: { r: 0.3, fwd: 1.1, len: 2.7, dy: 0.2 } },
  engines: [{ x: 1.75, y: 3.07, zi: -1.59, len: 3.5, r: 0.56 }],
  registration: { on: "nacelle", h: 0.26 },
  stripe: { y: 2.25, riseFrom: 1.5, rise: 0.1, z0: 9.6, z1: -6.0, width: 0.09 },
  antennas: [[6.5, 0.22], [2.0, 0.18], [-3.0, 0.16]],
  pitot: [9.4, 1.95],
  gear: { mainX: 1.65, mainZ: 0.3, pivotY: 1.4, mainR: 0.42, mainW: 0.27, legR: 0.07, noseZ: 8.21, noseR: 0.26, noseW: 0.16, noseDual: true, nosePivotY: 1.6 },
};
