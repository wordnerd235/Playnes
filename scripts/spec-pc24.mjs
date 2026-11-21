// Pilatus PC-24, measured from a side-on photo scaled to its published 16.85 m length (17.0 m
// span, 5.4 m tall): rear-mounted Williams FJ44 engines high on the tailcone, T-tail, a straight
// lightly swept wing with no winglets, trailing-link gear for rough strips, a flat-floored
// cabin 1.69 m wide with seven windows a side, the airstair door behind the cockpit on the left
// and an emergency exit over the wing. The cockpit floor sits a step below the cabin's.
export const PC24 = {
  fus: [
    [8.8, 0.03, 1.27, 1.12, 2], [8.72, 0.14, 1.36, 1, 2], [8.45, 0.36, 1.53, 0.9, 2], [7.9, 0.6, 1.75, 0.85, 2.05],
    [7.36, 0.76, 1.91, 0.84, 2.1], [6.9, 0.86, 2.18, 0.84, 2.15], [6.4, 0.92, 2.55, 0.84, 2.2], [5.9, 0.95, 2.83, 0.85, 2.2],
    [5.5, 0.95, 2.93, 0.85, 2.2], [-1.8, 0.95, 2.95, 0.85, 2.2], [-2.6, 0.9, 2.97, 1.12, 2.2], [-3.4, 0.78, 2.98, 1.42, 2.15],
    [-4.4, 0.6, 2.95, 1.6, 2.1], [-5.3, 0.45, 2.93, 1.74, 2.05], [-6.1, 0.33, 2.89, 1.8, 2], [-6.6, 0.2, 2.83, 2.1, 2], [-6.75, 0.05, 2.72, 2.35, 2],
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
  exits: [{ side: -1, z0: 1.07, z1: 1.55, y0: 1.95, y1: 2.55 }], // over the right wing
  wing: { dihedral: 4.5, sweep: 12, span: 8.0, y0: 0.95, rootChord: 3.0, tipChord: 1.1, le0: 2.5, flap: [1.0, 5.4], aileron: [5.6, 7.9], thickness: 0.13, winglet: null, tip: { out: 0.55, back: 0.78, chord: 0.36, up: 0.05 } }, // raked, slightly upturned tips (no winglets)
  // A long keel fairing (checked from below against photos), not a pod under the wing.
  fairing: { top: 1.2, e: 2.3, keys: [[6.7, 0.02, 0.86], [6.0, 0.3, 0.82], [4.8, 0.45, 0.78], [3.4, 0.56, 0.74], [2.2, 0.62, 0.71], [0.8, 0.64, 0.7], [-0.4, 0.6, 0.72], [-1.4, 0.48, 0.8], [-2.4, 0.3, 1.05, 1.4], [-3.2, 0.12, 1.36, 1.6], [-3.6, 0.02, 1.5, 1.7]] },
  // Tail close-ups: the trailing edge stands nearly upright over the end of the tail cone.
  fin: { rootLE: [2.9, -3.35], tipLE: [5.4, -5.5], rootChord: 3.25, tipChord: 1.55 },
  dorsal: { z0: -2.4, z1: -3.6, ze: -4.0, width: 0.15 },
  tailplane: { y: 5.22, rootLE: -5.65, root: 1.45, tipX: 2.85, tipLE: -7.1, tip: 0.72, bullet: { r: 0.14, fwd: 0.45 } },
  engines: [{ x: 1.45, y: 2.55, zi: -1.73, len: 2.9, r: 0.5 }],
  registration: { on: "nacelle", h: 0.22 },
  stripe: { y: 1.68, riseFrom: 3.0, rise: 0.075, z0: 7.9, z1: -4.0, width: 0.07 },
  antennas: [[4.5, 0.2], [0.5, 0.16], [-2.4, 0.15]],
  pitot: [8.2, 1.3],
  gear: { mainX: 1.55, pivotY: 1.05, mainR: 0.3, mainW: 0.19, noseZ: 7.12, noseR: 0.22, noseW: 0.14, nosePivotY: 1.05 },
  // Corrections from fitting the model to Pilatus's exterior-view drawing (PC-24 Just The Facts):
  // fin and tailplane slightly lower and the fin tip further back, engines higher, slimmer belly.
  photoFit: [["@nose", "+", 0.3], ["fin.tipLE.1", "+", -0.6], ["engines.0.y", "+", 0.2], ["fus.*.2", "+", -0.06], ["fin.rootLE.1", "+", 0.15], ["fin.tipLE.0", "+", -0.2], ["tailplane.y", "+", -0.225], ["engines.0.zi", "+", -0.15]],
};
