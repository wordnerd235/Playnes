// Dassault Falcon 8X, measured from a side-on photo (left side) scaled to its published
// 24.46 m length (26.29 m span): a long cabin 2.34 m wide and 1.88 m tall with sixteen small
// windows a side, the airstair door behind the cockpit on the left, a 34-degree swept wing with
// blended winglets, three P&WC PW307D engines (two on pylons, the third in the tail fed by an
// S-duct intake on top of the fuselage, which makes the rear fuselage deep), a cruciform tail
// sitting on that engine fairing, side-sticks in the cockpit.
export const FALCON8X = {
  fus: [
    [12.57, 0.03, 2, 1.74, 2], [12.514, 0.18, 2.12, 1.6, 2], [12.275, 0.45, 2.29, 1.4, 2], [11.797, 0.78, 2.45, 1.24, 2.05],
    [11.319, 1, 2.6, 1.15, 2.1], [11, 1.1, 2.8, 1.12, 2.15], [10.6, 1.18, 3.1, 1.1, 2.2], [10.1, 1.24, 3.39, 1.09, 2.2],
    [9.5, 1.27, 3.48, 1.08, 2.2], [-1.6, 1.27, 3.5, 1.08, 2.2], [-2.2, 1.2, 3.87, 1.22, 2.15], [-3, 1.08, 4.34, 1.42, 2.1],
    [-4, 0.92, 4.42, 1.62, 2.05], [-5.2, 0.75, 4.42, 1.72, 2.05], [-6.6, 0.58, 4.24, 1.8, 2], [-7.8, 0.42, 3.97, 2.05, 2],
    [-8.6, 0.42, 3.74, 2.45, 2], [-9.1, 0.36, 3.57, 2.75, 2],
  ],
  floor: 1.435,
  aisleDrop: 0,
  windows: {
    w: 0.29, h: 0.37, yc: 2.5, r: 0.14,
    left: [7.25, 6.73, 6.22, 5.7, 5.18, 4.67, 4.15, 3.63, 3.12, 2.6, 2.08, 1.57, 1.05, 0.53, 0.02, -0.5],
    right: [7.25, 6.73, 6.22, 5.7, 5.18, 4.67, 4.15, 3.63, 3.12, 2.6, 2.08, 1.57, 1.05, 0.53, 0.02, -0.5],
  },
  cockpitWindows: [{ z0: 9.78, z1: 10.32, y0: 2.45, y1: 2.9, r: 0.08 }],
  windshield: { z1: 11.175, lower: [[10.42, 2.52], [10.62, 2.45], [10.82, 2.41], [11.016, 2.39], [11.128, 2.38]] },
  lining: { z0: 10.38, z1: -1.6 },
  cockpit: { bulkheadZ: 9.35, panelZ: 10.3, seatX: 0.55, sidestick: true, extraScreens: true },
  cabin: {
    lavZ: -0.9, rows: [{ z: 7.6, facing: "aft" }, { z: 6.37 }, { z: 4.9, facing: "aft" }, { z: 3.78 }, { z: 0.17 }],
    tables: [7.0, 4.35], divan: { z0: 1.1, z1: 2.9, side: 1 }, galleyZ: 9.2, windowSeat: 6.22, aisleHalf: 0.48, seatWidth: 0.52,
  },
  door: { z0: 8.7, z1: 9.54, y0: 1.3, y1: 3.07 },
  wing: { dihedral: 3.5, sweep: 34, span: 12.82, y0: 1.05, rootChord: 6.2, tipChord: 1.4, le0: 5.0, flap: [1.6, 7.2], aileron: [7.4, 11.0], thickness: 0.11, winglet: { out: 0.3, height: 1.3, back: 1.1, tipChord: 0.5 } },
  // Belly fairing checked from below: it starts well ahead of the wing and its tail end follows the
  // fuselage's upswept belly into the tail cone (it used to hang below it).
  fairing: { top: 1.3, e: 2.3, keys: [[8.0, 0.02, 1.09], [7.0, 0.45, 0.98], [5.6, 0.8, 0.86], [4.0, 1.0, 0.79], [2.2, 1.1, 0.75], [0.4, 1.08, 0.76], [-1.2, 0.95, 0.82], [-2.4, 0.7, 1.0, 1.45], [-3.3, 0.4, 1.3, 1.65], [-4.2, 0.12, 1.58, 1.82], [-4.6, 0.02, 1.66, 1.9]] },
  fin: { rootLE: [4.25, -5.0], tipLE: [7.15, -7.8], rootChord: 3.4, tipChord: 1.55 },
  tailplane: { y: 4.3, rootX: 0.35, rootLE: -5.7, root: 2.6, tipX: 4.1, tipLE: -10.85, tip: 0.9, tipDy: 0.15 },
  engines: [{ x: 1.7, y: 2.73, zi: -2.65, len: 3.3, r: 0.58 }],
  centreEngine: { z0: -1.85, z1: -3.1, w: 0.6, top: 4.3, nozzle: 0.3 },
  registration: { on: "nacelle", h: 0.3 },
  stripe: { y: 2.0, riseFrom: -1.0, rise: 0.03, z0: 12.116, z1: -8.0, width: 0.06 },
  antennas: [[8.0, 0.24], [3.0, 0.2]],
  pitot: [11.956, 1.95],
  slats: { from: 0.3, to: 0.95 }, // leading-edge slats
  gear: { mainX: 2.35, mainZ: 0.3, pivotY: 1.3, mainR: 0.43, mainW: 0.26, mainDual: true, legR: 0.08, noseZ: 10.13, noseR: 0.28, noseW: 0.17, noseDual: true, nosePivotY: 1.6 },
  // Corrections from fitting the model to Dassault's dimensioned three-view (press pack, Sept 2020):
  // the wing and engines further aft, a smaller outer wing chord, flatter wing, bigger engines, a
  // higher tailplane, a deeper fuselage and a slightly longer nose (tools/photofit, drawtune.py).
  photoFit: [["wing.le0", "+", -0.3], ["wing.tipChord", "*", 0.7], ["wing.dihedral", "+", -1.0], ["wing.y0", "+", 0.2], ["fin.rootLE.1", "+", -0.3], ["tailplane.rootLE|tailplane.tipLE", "+", 0.3], ["tailplane.y", "+", 0.45], ["engines.0.zi", "+", -0.6], ["engines.0.len", "*", 1.08], ["engines.0.r", "*", 1.24], ["fus.*.1", "*", 1.03], ["fus.*.2", "+", 0.18], ["fus.*.3", "+", -0.06], ["@nose", "+", 0.75], ["wing.rootChord", "*", 0.97], ["fin.tipLE.1", "+", -0.15], ["engines.0.y", "+", 0.25]],
};
