// Gulfstream G700: a stretched G650 (published 33.48 m long, 31.39 m span, 7.75 m tall; cabin
// 3.1 m longer at 17.35 m, 1.91 m tall) with ten of the big oval windows a side, a larger
// wing with canted winglets and Rolls-Royce Pearl 700 engines. Built from the G650ER spec
// (measured from a photo) by lengthening the cabin ahead of the wing.
import { G650ER } from "./spec-g650er.mjs";

const D = 3.07; // the stretch, added ahead of station 11 (the front of the constant cabin)
const fwd = (z) => (z >= 11.0 ? z + D : z);
const G = structuredClone(G650ER);
G.fus = G650ER.fus.map(([z, ...r]) => [fwd(z), ...r]);
G.fus.splice(G.fus.findIndex((k) => k[0] === -2.0), 0); // the cabin section simply runs longer
G.windows = { ...G650ER.windows, left: [], right: [] };
for (let k = 0; k < 10; k++) { const z = +(0.18 + k * 1.29).toFixed(2); G.windows.left.push(z); G.windows.right.push(z); }
G.cockpitWindows = G650ER.cockpitWindows.map((w) => ({ ...w, z0: w.z0 + D, z1: w.z1 + D }));
G.windshield = { z1: G650ER.windshield.z1 + D, lower: G650ER.windshield.lower.map(([z, y]) => [z + D, y]) };
G.lining = { z0: G650ER.lining.z0 + D, z1: -1.6 };
G.cockpit = { ...G650ER.cockpit, bulkheadZ: G650ER.cockpit.bulkheadZ + D, panelZ: G650ER.cockpit.panelZ + D };
G.cabin = {
  ...G650ER.cabin,
  rows: [{ z: 12.07, facing: "aft" }, { z: 10.87 }, { z: 8.6, facing: "aft" }, { z: 7.5 }, { z: 4.3, facing: "aft" }, { z: 3.2 }, { z: 0.6 }],
  tables: [11.47, 8.05, 3.75], divan: { z0: 4.9, z1: 6.6, side: -1 }, galleyZ: G650ER.cabin.galleyZ + D, windowSeat: 10.6,
};
G.door = { ...G650ER.door, z0: G650ER.door.z0 + D, z1: G650ER.door.z1 + D };
G.wing = { ...G650ER.wing, span: 14.9, rootChord: 6.6, le0: 6.5, flap: [1.8, 9.0], aileron: [9.3, 13.4] };
// Its bigger wing root has a longer belly fairing (it runs further forward).
G.fairing = { ...G650ER.fairing, keys: [[9.1, 0.02, 1.81], [8.3, 0.6, 1.55], [7.1, 1.0, 1.32], [5.5, 1.25, 1.18], [3.4, 1.35, 1.11], [1.3, 1.35, 1.11], [-0.4, 1.2, 1.15], [-1.8, 0.95, 1.3, 2.0], [-3.0, 0.6, 1.72, 2.3], [-4.0, 0.25, 2.18, 2.55], [-4.6, 0.02, 2.36, 2.7]] };
G.tailplane = { ...G650ER.tailplane, y: 7.48 };
G.fin = { ...G650ER.fin, tipLE: [7.33, -7.95] };
G.engines = [{ ...G650ER.engines[0], r: 0.82, len: 4.8, x: 2.05 }];
G.stripe = { ...G650ER.stripe, z0: G650ER.stripe.z0 + D };
G.antennas = [[12.5, 0.28], [5.0, 0.22], [-2.5, 0.2]];
G.pitot = [G650ER.pitot[0] + D, G650ER.pitot[1]];
G.gear = { ...G650ER.gear, noseZ: G650ER.gear.noseZ + D };
export const G700 = G;
