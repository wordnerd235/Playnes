// HondaJet HA-420 (Elite II), from its published dimensions (12.99 m long, 12.12 m span,
// 4.54 m tall; cabin 1.52 m wide, 1.46 m tall) with the layout taken from photos: a long
// pointed natural-laminar-flow nose, a big wrap-around windshield, the door behind the cockpit
// on the left, three windows a side behind it (four on the right), GE Honda HF120 engines on
// pylons over the wings, a straight wing with small winglets, and a swept T-tail.
export const HONDAJET = {
  fus: [
    [6.8, 0.03, 1.3, 1.18, 2.0], [6.72, 0.12, 1.38, 1.08, 2.0], [6.45, 0.3, 1.5, 0.92, 2.0], [5.9, 0.52, 1.66, 0.78, 2.05],
    [5.3, 0.68, 1.82, 0.7, 2.1], [4.8, 0.77, 1.96, 0.68, 2.15], [4.4, 0.82, 2.14, 0.68, 2.2], [4.0, 0.84, 2.3, 0.68, 2.2],
    [3.6, 0.84, 2.35, 0.68, 2.2], [-1.2, 0.84, 2.35, 0.68, 2.2], [-2.0, 0.78, 2.33, 0.82, 2.2], [-3.0, 0.64, 2.3, 1.08, 2.15],
    [-4.0, 0.48, 2.26, 1.35, 2.1], [-5.0, 0.32, 2.22, 1.6, 2.05], [-5.8, 0.17, 2.18, 1.8, 2.0], [-6.19, 0.05, 2.1, 1.95, 2.0],
  ],
  floor: 0.98,
  aisleDrop: 0.06,
  windows: { w: 0.3, h: 0.36, yc: 1.72, r: 0.14, left: [1.95, 1.2, 0.45], right: [2.65, 1.95, 1.2, 0.45] },
  cockpitWindows: [{ z0: 3.12, z1: 3.76, y0: 1.75, y1: 2.15, r: 0.08 }],
  windshield: { z1: 4.62, lower: [[3.85, 1.93], [4.05, 1.86], [4.25, 1.81], [4.45, 1.77], [4.58, 1.75]] },
  lining: { z0: 3.82, z1: -1.1 },
  cockpit: { bulkheadZ: 2.9, panelZ: 3.8, seatX: 0.35, seatWidth: 0.46, backLen: 0.52 },
  cabin: { lavZ: -0.75, rows: [{ z: 2.05, facing: "aft" }, { z: 0.85 }], tables: [1.45], galleyZ: 2.75, windowSeat: 1.2, aisleHalf: 0.34, backLen: 0.5 }, // low cabin: shorter seat backs
  door: { z0: 2.4, z1: 3.02, y0: 0.82, y1: 2.2 },
  wing: { dihedral: 4, sweep: 6, span: 6.06, y0: 0.62, rootChord: 2.2, tipChord: 0.85, le0: 1.75, flap: [0.85, 3.6], aileron: [3.75, 5.5], thickness: 0.13, winglet: { out: 0.12, height: 0.6, back: 0.5, tipChord: 0.35 } },
  // A long keel fairing (checked from below against photos), not a pod under the wing.
  fairing: { top: 0.85, e: 2.3, keys: [[4.6, 0.02, 0.7], [4.0, 0.25, 0.66], [3.0, 0.38, 0.62], [2.0, 0.48, 0.56], [1.0, 0.52, 0.53], [0.0, 0.5, 0.55], [-0.8, 0.4, 0.64, 0.9], [-1.6, 0.26, 0.82, 1.0], [-2.4, 0.1, 0.98, 1.12], [-2.8, 0.02, 1.08, 1.2]] },
  fin: { rootLE: [2.3, -3.3], tipLE: [4.3, -5.0], rootChord: 2.3, tipChord: 1.1 },
  dorsal: { z0: -2.2, z1: -3.3, ze: -3.7, width: 0.14 },
  tailplane: { y: 4.33, rootLE: -5.05, root: 1.15, tipX: 2.4, tipLE: -5.95, tip: 0.6 },
  engines: [{ x: 1.6, y: 1.88, zi: 0.25, len: 2.0, r: 0.37, mount: "wing" }],
  registration: { on: "fuselage", y: 1.78, z: -2.9, h: 0.17 },
  stripe: { y: 1.32, riseFrom: 0.0, rise: 0.06, z0: 6.4, z1: -4.5, width: 0.06 },
  antennas: [[2.2, 0.15], [-1.0, 0.13]],
  pitot: [6.0, 1.25],
  speedbrake: "tail", // petals on the tail cone
  gear: { mainX: 1.35, pivotY: 0.72, mainR: 0.25, mainW: 0.16, noseZ: 5.2, noseR: 0.19, noseW: 0.12, nosePivotY: 0.9 },
};
