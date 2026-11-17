// Gulfstream G650ER, measured from a side-on photo (left side; lengths scaled by its published
// 30.41 m, heights by its 7.82 m tail): a wide cabin (2.49 m wide, 1.95 m tall) with the
// famous large oval windows, eight a side; the entry door behind the cockpit on the left; a
// 36-degree swept wing with canted winglets; Rolls-Royce BR725 engines on the tailcone; a
// swept T-tail; twin-wheel gear; side-sticks in the cockpit.
export const G650ER = {
  fus: [
    [14.9, 0.03, 2.45, 2.33, 2.0], [14.8, 0.2, 2.62, 2.18, 2.0], [14.5, 0.48, 2.82, 2.05, 2.0], [13.8, 0.88, 3.0, 1.95, 2.05],
    [13.1, 1.1, 3.55, 1.85, 2.1], [12.4, 1.25, 3.95, 1.8, 2.15], [11.7, 1.31, 4.17, 1.8, 2.2], [11.0, 1.32, 4.2, 1.8, 2.2],
    [-2.0, 1.32, 4.2, 1.8, 2.2], [-3.5, 1.22, 4.2, 2.1, 2.2], [-5.0, 1.05, 4.18, 2.5, 2.15], [-6.5, 0.8, 4.12, 2.9, 2.1],
    [-7.8, 0.5, 4.05, 3.25, 2.05], [-8.6, 0.25, 3.98, 3.5, 2.0], [-8.95, 0.06, 3.88, 3.65, 2.0],
  ],
  floor: 2.19,
  aisleDrop: 0,
  windows: { w: 0.66, h: 0.52, yc: 3.21, r: 0.26, left: [9.11, 7.82, 6.53, 5.27, 3.97, 2.71, 1.44, 0.18], right: [9.11, 7.82, 6.53, 5.27, 3.97, 2.71, 1.44, 0.18] },
  cockpitWindows: [{ z0: 11.25, z1: 11.9, y0: 3.25, y1: 3.8, r: 0.09 }],
  windshield: { z1: 13.15, lower: [[11.95, 3.42], [12.25, 3.33], [12.55, 3.28], [12.85, 3.25], [13.05, 3.24]] },
  lining: { z0: 11.9, z1: -1.6 },
  cockpit: { bulkheadZ: 10.3, panelZ: 11.85, seatX: 0.58, sidestick: true, extraScreens: true, floorDrop: -0.12 },
  cabin: {
    lavZ: -1.0, rows: [{ z: 9.0, facing: "aft" }, { z: 7.8 }, { z: 5.6, facing: "aft" }, { z: 4.5 }, { z: 1.2 }],
    tables: [8.4, 5.05], divan: { z0: 1.9, z1: 3.6, side: 1 }, galleyZ: 9.75, windowSeat: 7.9, aisleHalf: 0.5, seatWidth: 0.56,
  },
  door: { z0: 10.15, z1: 11.0, y0: 1.92, y1: 3.94 },
  wing: { dihedral: 3, sweep: 36, span: 14.2, y0: 1.75, rootChord: 6.2, tipChord: 1.35, le0: 6.2, flap: [1.8, 8.6], aileron: [8.9, 12.8], thickness: 0.11, winglet: { out: 0.6, height: 1.6, back: 1.6, tipChord: 0.5 } },
  // Belly fairing checked from below: it starts well ahead of the wing and its tail end follows the
  // fuselage's upswept belly into the tail cone (it used to hang below it).
  fairing: { top: 1.95, e: 2.3, keys: [[8.8, 0.02, 1.81], [8.0, 0.6, 1.55], [6.8, 1.0, 1.32], [5.2, 1.25, 1.18], [3.2, 1.35, 1.11], [1.2, 1.35, 1.11], [-0.4, 1.2, 1.15], [-1.8, 0.95, 1.3, 2.0], [-3.0, 0.6, 1.72, 2.3], [-4.0, 0.25, 2.18, 2.55], [-4.6, 0.02, 2.36, 2.7]] },
  fin: { rootLE: [4.15, -6.1], tipLE: [7.4, -7.95], rootChord: 3.6, tipChord: 1.8 },
  dorsal: { z0: -4.6, z1: -6.1, ze: -6.6, width: 0.22 },
  tailplane: { y: 7.55, rootLE: -7.9, root: 2.7, tipX: 5.1, tipLE: -14.0, tip: 1.5 },
  engines: [{ x: 2.0, y: 3.66, zi: -2.45, len: 4.6, r: 0.78 }],
  registration: { on: "nacelle", h: 0.38 },
  stripe: { y: 2.6, riseFrom: 0.0, rise: 0.06, z0: 13.5, z1: -7.0, width: 0.08 },
  antennas: [[9.5, 0.28], [4.0, 0.22], [-2.5, 0.2]],
  pitot: [13.6, 2.4],
  gear: { mainX: 2.2, pivotY: 1.65, mainR: 0.5, mainW: 0.3, mainDual: true, legR: 0.09, noseZ: 12.76, noseR: 0.3, noseW: 0.18, noseDual: true, nosePivotY: 1.9 },
};
