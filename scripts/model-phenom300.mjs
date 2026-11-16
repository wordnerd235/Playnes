// The Embraer Phenom 300E, built from its published dimensions (metres): 15.6 m long, 15.9 m
// span over the winglets, 5.1 m tall at the T-tail; a cabin 5.24 m long, 1.55 m wide and
// 1.50 m tall with a dropped aisle; low swept wing with dihedral and blended winglets; two
// Pratt & Whitney PW535E1 engines on the rear fuselage; trailing-link main gear that folds
// inward into the wing root, nose gear that folds forward. Cabin as the common "club four":
// four seats facing in pairs with fold-out tables, two forward-facing seats behind, an aft
// lavatory, a refreshment centre opposite the airstair door. The windows are real openings in
// the skin (with frames, reveals and glass), so the cabin is seen from outside and the world
// from inside.
//
// glTF conventions (same as build-models.mjs): +Y up, nose toward +Z, left wing toward +X,
// origin on the ground between the main wheels.
//
// Nodes the game animates (src/game/planeView.ts):
//   flapL flapR ailL ailR    hinge about local X (negative = trailing edge down)
//   elevL elevR rudder       hinges
//   gearL gearR gearN        legs: rotate about their local X to retract (angles in the rig)
//   wheelL wheelR wheelN     spin about local X (children of the legs)
//   gearDoors                nose-wheel doors, shown while the gear is out
//   beacon strobe            blink
//   pilot canopy             hidden when the camera is inside (rig.eye, rig.windowEye)

import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function buildPhenom300(ac, kit) {
  const { THREE, V, C, T, RX, RY, RZ, lerp, MAT, MATERIALS, loft, smooth, surface, controlSurface, lathe, cylinderBetween, registration, REGISTRATION, part, curve, asNode } = kit;

  const X0 = MATERIALS.length;
  const XMAT = { glass: X0, fabric: X0 + 1, display: X0 + 2, skin: X0 + 3, leather: X0 + 4, wood: X0 + 5 };
  const extraMaterials = [
    { name: "cabinGlass", pbrMetallicRoughness: { baseColorFactor: [0.3, 0.38, 0.46, 0.4], metallicFactor: 0.85, roughnessFactor: 0.04 }, alphaMode: "BLEND", doubleSided: true },
    { name: "fabric", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 }, doubleSided: true },
    { name: "display", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }, emissiveFactor: [0.32, 0.32, 0.32] },
    // The skin is two-sided: from the cockpit you see the inside of the frame around the windshield.
    { name: "skin", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.3 }, doubleSided: true },
    { name: "leather", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.55 }, doubleSided: true },
    { name: "wood", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.05, roughnessFactor: 0.22 }, doubleSided: true },
  ];

  const nodes = {};
  const add = (node, pt) => (nodes[node] ??= { parts: [] }).parts.push(pt);
  const rig = { retractDeg: {}, wheelRadius: {} };
  const INSIDE = { aoStrength: 0.4 };

  // ---- colours: white with a gold cheatline and a thin dark line under it
  const cWhite = C(ac.livery.body), cGold = C(ac.livery.stripe), cDark = C(ac.livery.accent);
  const cWing = C("#eceef0"), cMetal = C("#a3a8ae"), cBlack = C("#151719"), cTyre = C("#1c1d1f"), cSeam = C("#8d939a");
  const cHead = C("#efeae0"), cSide = C("#e4dccb"), cDado = C("#6a5746"), cCarpet = C("#5d564f"), cCock = C("#4d5156");
  const cLeather = C("#d8cbb2"), cLeatherDk = C("#a9977a"), cPilotSeat = C("#5b5e62"), cWood = C("#7a4f2e"), cWoodLt = C("#c9b48f");

  /** Cheatline: gold band under the windows, rising gently along the tailcone, dark line below. */
  const stripeAt = (p) => {
    const y0 = 1.3 + Math.max(0, -p.z - 1.2) * 0.07;
    if (p.y > y0 && p.y < y0 + 0.075) return cGold;
    if (p.y > y0 - 0.045 && p.y < y0 - 0.02) return cDark;
    return null;
  };
  const skinColor = cWhite; // the cheatline is its own thin ribbon on the skin (see below), so its edges are clean

  // ---------------------------------------------------------------- fuselage
  // Cross-sections: [z, half width, top, bottom, squareness]. The cabin section is 1.70 m wide
  // and 1.78 m tall outside; the nose drops to the radome; the windshield rises steeply; the
  // tailcone's belly sweeps up toward the tail.
  const FUS = curve([
    [8.0, 0.03, 1.0, 0.9, 2.0],
    [7.93, 0.13, 1.07, 0.8, 2.0],
    [7.7, 0.33, 1.2, 0.69, 2.0],
    [7.15, 0.56, 1.42, 0.6, 2.05],
    [6.6, 0.7, 1.62, 0.565, 2.1],
    [6.2, 0.78, 1.79, 0.553, 2.15],
    [5.9, 0.825, 2.08, 0.55, 2.2],
    [5.68, 0.845, 2.27, 0.55, 2.2],
    [5.3, 0.85, 2.33, 0.55, 2.2],
    [-1.6, 0.85, 2.33, 0.55, 2.2],
    [-2.6, 0.8, 2.31, 0.69, 2.2],
    [-3.6, 0.65, 2.27, 0.96, 2.15],
    [-4.5, 0.47, 2.22, 1.28, 2.1],
    [-5.3, 0.3, 2.18, 1.62, 2.05],
    [-5.85, 0.15, 2.15, 1.9, 2.0],
    [-6.15, 0.05, 2.13, 2.03, 2.0],
  ]);
  const Z_NOSE = 8.0, Z_TAIL = -6.15;
  // The real jet sits this much higher on its gear than the cabin numbers below assume: the
  // whole model is lifted at the end (the gear legs are drawn long enough to reach the ground).
  const LIFT = 0.34;
  /** A point on the fuselage at station z and angle th (0 = left side, pi/2 = top), `inset` inside the skin. */
  const ringPt = (z, th, inset = 0) => {
    const [hw, top, bot, e] = FUS(z);
    const yc = (top + bot) / 2, hh = (top - bot) / 2 - inset, w = hw - inset;
    const c = Math.cos(th), s = Math.sin(th);
    return V(Math.sign(c) * Math.abs(c) ** (2 / e) * w, yc + Math.sign(s) * Math.abs(s) ** (2 / e) * hh, z);
  };
  const centreY = (z) => { const f = FUS(z); return (f[1] + f[2]) / 2; };
  /** The angle at which the side (left +1, right -1) of the skin reaches height y. */
  const thForY = (z, y, side = 1) => {
    const [, top, bot, e] = FUS(z);
    const yc = (top + bot) / 2, hh = (top - bot) / 2;
    const t = Math.max(-1, Math.min(1, (y - yc) / hh));
    const th = Math.asin(Math.sign(t) * Math.abs(t) ** (e / 2));
    return side > 0 ? th : Math.PI - th;
  };
  /** Half the fuselage's width at station z and height y (for lettering and seams). */
  const halfW = (z, y) => {
    const [hw, top, bot, e] = FUS(z);
    const yc = (top + bot) / 2, hh = (top - bot) / 2;
    const t = Math.min(1, Math.abs((y - yc) / hh));
    return hw * Math.max(0, 1 - t ** e) ** (1 / e);
  };
  const radial = (p) => V(p.x, p.y - centreY(p.z), 0).normalize();

  // ---- openings: windshield, cockpit side windows, cabin windows (and the door's little window)
  const RV = 0.89; // metres per radian, to draw the openings' rounded corners in true size
  const M = 0.04; // the skin's rectangular cut-out is this much bigger than the window all round
  const WIN = [];
  const addWin = (z0, z1, t0, t1, r, kind) => WIN.push({ z0, z1, t0: Math.min(t0, t1), t1: Math.max(t0, t1), r, kind });
  const cabinWin = (zc, side, w = 0.32, h = 0.36, yc = 1.855, r = 0.14) => addWin(zc - w / 2, zc + w / 2, thForY(zc, yc - h / 2, side), thForY(zc, yc + h / 2, side), r, "cabin");
  const LEFT_WINDOWS = [3.11, 2.46, 1.83, 1.11, 0.07], RIGHT_WINDOWS = [3.76, 3.11, 2.46, 1.83, 1.11, 0.07];
  for (const z of LEFT_WINDOWS) cabinWin(z, 1);
  for (const z of RIGHT_WINDOWS) cabinWin(z, -1);
  // Cockpit side windows and the two big windshield panes either side of a centre post.
  for (const side of [1, -1]) addWin(4.95, 5.66, thForY(5.3, 1.72, side), thForY(5.3, 2.13, side), 0.08, "cockpit");
  // The windshield: two big panes either side of a centre post, steep (about 40 degrees), their
  // lower edge nearly level just above the glareshield and sweeping up at the sides. They are
  // drawn as outlines inside one cut-out over the top of the nose.
  {
    const D = Math.PI / 180;
    const pane = (side) => {
      const c = side > 0 ? 87.5 * D : 92.5 * D;
      const lower = [[5.74, 1.95], [5.85, 1.87], [5.97, 1.815], [6.08, 1.78], [6.16, 1.765]].map(([z, y]) => [z, thForY(z, y, side)]);
      return [[6.205, c], [5.74, c], ...lower];
    };
    WIN.push({ z0: 5.74, z1: 6.21, t0: 18 * D, t1: 162 * D, r: 0, kind: "windshield", polys: [pane(1), pane(-1)] });
  }
  const MT = M / RV;
  const inCut = (z, th) => WIN.some((w) => z > w.z0 - M && z < w.z1 + M && th > w.t0 - MT && th < w.t1 + MT);

  // Lattice rows (stations) and columns (angles), with every cut-out's edges on them.
  const zRows = (() => {
    const s = [8.0, 7.98, 7.95, 7.9, 7.84, 7.76, 7.66, 7.55, 7.42, 7.28, 7.12, 6.95, 6.78];
    for (let z = 6.62; z > Z_TAIL; z -= z > -1.6 && z < 5.7 ? 0.14 : 0.11) s.push(z);
    s.push(Z_TAIL);
    // Window edges must be rows; drop any regular row within 6 cm of one (thin slivers shade badly).
    const edges = WIN.flatMap((w) => [w.z0 - M, w.z1 + M]);
    const keep = s.filter((z) => z >= 6.62 || z <= Z_TAIL || !edges.some((e) => Math.abs(e - z) < 0.06));
    return [...new Set([...keep, ...edges].map((z) => +z.toFixed(4)))].sort((a, b) => b - a);
  })();
  const thCols = (() => {
    const s = [];
    for (let i = 0; i < 88; i++) s.push(-Math.PI / 2 + (i / 88) * Math.PI * 2);
    const edges = WIN.flatMap((w) => [w.t0 - MT, w.t1 + MT]);
    const keep = s.filter((t) => !edges.some((e) => Math.abs(e - t) < 0.035));
    return [...new Set([...keep, ...edges].map((t) => +t.toFixed(5)))].sort((a, b) => a - b);
  })();

  /** Flip any triangle whose face doesn't point along want(centroid). */
  const orient = (g, want) => {
    const pos = g.attributes.position, idx = g.index.array;
    const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0);
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      const m = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      if (n.dot(want(m)) < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  };
  /** The fuselage surface between two stations, `inset` inside the skin, with the cut-outs open. */
  const lattice = (inset, zFrom, zTo, inward, caps = false) => {
    const rows = zRows.filter((z) => z <= zFrom + 1e-6 && z >= zTo - 1e-6);
    const n = thCols.length, pos = [], idx = [];
    for (const z of rows) for (const th of thCols) { const p = ringPt(z, th, inset); pos.push(p.x, p.y, p.z); }
    for (let i = 0; i < rows.length - 1; i++) {
      const zc = (rows[i] + rows[i + 1]) / 2;
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        const tc = j1 ? (thCols[j] + thCols[j1]) / 2 : (thCols[j] + thCols[0] + Math.PI * 2) / 2;
        if (inCut(zc, tc)) continue;
        const a = i * n + j, b = i * n + j1, c = (i + 1) * n + j, d = (i + 1) * n + j1;
        idx.push(a, c, b, b, c, d);
      }
    }
    if (caps) {
      for (const [ri, z] of [[0, rows[0] + 0.03], [rows.length - 1, rows[rows.length - 1] - 0.03]]) {
        const tip = pos.length / 3;
        pos.push(0, centreY(z), z);
        for (let j = 0; j < n; j++) idx.push(tip, ri * n + j, ri * n + ((j + 1) % n));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return orient(g, (m) => {
      if (m.z > Z_NOSE - 0.01) return V(0, 0, 1);
      if (m.z < Z_TAIL + 0.01) return V(0, 0, -1);
      const r = radial(m);
      return inward ? r.negate() : r;
    });
  };
  // Outlines in (z, v = angle x RV) coordinates.
  const roundRect = (z0, z1, v0, v1, r, seg = 7) => {
    const pts = [];
    const corners = [[z1 - r, v1 - r, 0], [z0 + r, v1 - r, 0.5], [z0 + r, v0 + r, 1], [z1 - r, v0 + r, 1.5]];
    for (const [cz, cv, a0] of corners) for (let k = 0; k <= seg; k++) {
      const a = (a0 + (k / seg) * 0.5) * Math.PI;
      pts.push(new THREE.Vector2(cz + Math.cos(a) * r, cv + Math.sin(a) * r));
    }
    return pts;
  };
  const densRect = (z0, z1, v0, v1, step = 0.035) => {
    const pts = [];
    const edge = (a, b) => { const n = Math.max(1, Math.ceil(a.distanceTo(b) / step)); for (let k = 0; k < n; k++) pts.push(a.clone().lerp(b, k / n)); };
    const A = new THREE.Vector2(z0, v0), B = new THREE.Vector2(z1, v0), Cc = new THREE.Vector2(z1, v1), D = new THREE.Vector2(z0, v1);
    edge(A, B); edge(B, Cc); edge(Cc, D); edge(D, A);
    return pts;
  };
  /** A flat (z, v) shape laid onto the fuselage `inset` inside the skin. */
  /**
   * Split long triangle edges (in the flat z, v layout) until none is longer than maxLen, so a
   * shape laid onto the curved skin follows it instead of cutting under it. Every triangle
   * sharing a split edge is split the same way, so no cracks open.
   */
  const refine = (g, maxLen) => {
    const pos = [...g.attributes.position.array];
    let idx = [...g.index.array];
    for (let pass = 0; pass < 10; pass++) {
      const mids = new Map();
      const key = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
      const len = (a, b) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1]);
      const mid = (a, b) => {
        const k = key(a, b);
        if (!mids.has(k)) { mids.set(k, pos.length / 3); pos.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, 0); }
        return mids.get(k);
      };
      const longE = new Set();
      for (let i = 0; i < idx.length; i += 3) for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) if (len(a, b) > maxLen) longE.add(key(a, b));
      if (!longE.size) break;
      const next = [];
      for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
        const sab = longE.has(key(a, b)), sbc = longE.has(key(b, c)), sca = longE.has(key(c, a));
        const n = +sab + +sbc + +sca;
        if (n === 0) next.push(a, b, c);
        else if (n === 3) { const x = mid(a, b), y = mid(b, c), z = mid(c, a); next.push(a, x, z, x, b, y, z, y, c, x, y, z); }
        else if (n === 1) {
          if (sab) { const x = mid(a, b); next.push(a, x, c, x, b, c); }
          else if (sbc) { const y = mid(b, c); next.push(a, b, y, a, y, c); }
          else { const z = mid(c, a); next.push(a, b, z, z, b, c); }
        } else {
          if (!sca) { const x = mid(a, b), y = mid(b, c); next.push(x, b, y, a, x, y, a, y, c); }
          else if (!sab) { const y = mid(b, c), z = mid(c, a); next.push(z, y, c, a, b, y, a, y, z); }
          else { const x = mid(a, b), z = mid(c, a); next.push(a, x, z, x, b, c, x, c, z); }
        }
      }
      idx = next;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setIndex(idx);
    return out;
  };
  /** A polygon [[z, th], ...] as (z, v) points, with extra points along its edges. */
  const polyPts = (poly, step = 0.02) => {
    const pts = [];
    for (let i = 0; i < poly.length; i++) {
      const a = new THREE.Vector2(poly[i][0], poly[i][1] * RV), b = new THREE.Vector2(poly[(i + 1) % poly.length][0], poly[(i + 1) % poly.length][1] * RV);
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
      for (let k = 0; k < n; k++) pts.push(a.clone().lerp(b, k / n));
    }
    return pts;
  };
  const onSkin = (shape, inset, want, maxLen = 0.13) => {
    const g = refine(new THREE.ShapeGeometry(shape, 8), maxLen);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const p = ringPt(pos.getX(i), pos.getY(i) / RV, inset); pos.setXYZ(i, p.x, p.y, p.z); }
    g.deleteAttribute("uv");
    return orient(g, want);
  };
  const LIN = 0.065; // the cabin lining sits this far inside the skin
  const out = (m) => radial(m), inn = (m) => radial(m).negate();

  // The skin, cut open at the windows.
  add("body", part(lattice(0, Z_NOSE, Z_TAIL, false, true), XMAT.skin, skinColor));
  for (const w of WIN) {
    const v0 = w.t0 * RV, v1 = w.t1 * RV;
    const frame = new THREE.Shape(densRect(w.z0 - M, w.z1 + M, v0 - M, v1 + M));
    if (w.polys) {
      for (const poly of w.polys) frame.holes.push(new THREE.Path(polyPts(poly)));
      add("body", part(onSkin(frame, 0, out, 0.07), XMAT.skin, skinColor));
      // Grey trim inside the windshield frame and over the nose ahead of the glareshield.
      add("body", part(onSkin(frame, 0.03, inn, 0.07), XMAT.fabric, cCock, INSIDE));
      for (const poly of w.polys) {
        add("canopy", part(onSkin(new THREE.Shape(polyPts(poly)), 0.01, out, 0.09), XMAT.glass, C("#ffffff"), { noAO: true, noOcclude: true }));
        const P3 = polyPts(poly, 0.05).map((q) => ringPt(q.x, q.y / RV, -0.004));
        for (let i = 0; i < P3.length; i++) add("body", part(cylinderBetween(P3[i], P3[(i + 1) % P3.length], 0.012, 6), MAT.dark, cBlack, { noAO: true, noOcclude: true }));
      }
      continue;
    }
    frame.holes.push(new THREE.Path(roundRect(w.z0, w.z1, v0, v1, w.r)));
    add("body", part(onSkin(frame, 0, out), XMAT.skin, skinColor));
    // Glass: a little inside the skin, in the "canopy" node (hidden when looking out from inside).
    add("canopy", part(onSkin(new THREE.Shape(roundRect(w.z0, w.z1, v0, v1, w.r)), 0.012, out), XMAT.glass, C("#ffffff"), { noAO: true, noOcclude: true }));
    // Cockpit windows have a dark rubber surround; every opening has a reveal through to the lining.
    if (w.kind !== "cabin") {
      const ring = new THREE.Shape(roundRect(w.z0 - 0.018, w.z1 + 0.018, v0 - 0.018, v1 + 0.018, w.r + 0.018));
      ring.holes.push(new THREE.Path(roundRect(w.z0, w.z1, v0, v1, w.r)));
      add("body", part(onSkin(ring, -0.002, out), MAT.dark, cBlack, { noAO: true }));
    }
  }

  // ---- the cabin lining (headliner, sidewalls, dado), with enlarged window surrounds and reveals
  const Z_LIN0 = 5.7, Z_LIN1 = -1.04;
  const liningColor = (p) => {
    if (p.z > 4.22) return cCock;
    if (p.y > 2.0) return cHead;
    if (p.y > 1.28) return cSide;
    return cDado;
  };
  add("body", part(lattice(LIN, Z_LIN0, Z_LIN1, true), XMAT.fabric, liningColor, INSIDE));
  add("body", part(lattice(0.03, 6.5, Z_LIN0, true), XMAT.fabric, cCock, INSIDE));
  add("body", part(loft([thCols.map((t) => ringPt(Z_LIN0, t, LIN)), thCols.map((t) => ringPt(Z_LIN0, t, 0.03))], { capStart: false, capEnd: false }), XMAT.fabric, cCock, INSIDE));
  for (const w of WIN) {
    if (w.z1 > Z_LIN0) continue; // the windshield sits ahead of the lining
    const v0 = w.t0 * RV, v1 = w.t1 * RV, zc = (w.z0 + w.z1) / 2, vc = (v0 + v1) / 2;
    // The lining's opening is a little bigger than the window (never past the cut-out's margin).
    const grow = (half) => half + Math.min(half * 0.12, M - 0.012);
    const hz = grow((w.z1 - w.z0) / 2), hv = grow((v1 - v0) / 2);
    const big = roundRect(zc - hz, zc + hz, vc - hv, vc + hv, w.r + (hz - (w.z1 - w.z0) / 2));
    const surround = new THREE.Shape(densRect(w.z0 - M, w.z1 + M, v0 - M, v1 + M));
    surround.holes.push(new THREE.Path(big));
    add("body", part(onSkin(surround, LIN, inn), XMAT.fabric, w.kind === "cabin" ? cSide : cCock, INSIDE));
    // Reveal: from the window's edge in the skin to the bigger opening in the lining.
    const small = roundRect(w.z0, w.z1, v0, v1, w.r);
    const ringAt = (pts, inset) => pts.map((q) => ringPt(q.x, q.y / RV, inset));
    const rev = loft([ringAt(small, 0.004), ringAt(big, LIN)], { capStart: false, capEnd: false });
    add("body", part(rev, XMAT.fabric, w.kind === "cabin" ? C("#f1ede5") : cCock, INSIDE));
  }
  // Aft pressure bulkhead (behind the lavatory) and the lavatory's front wall with its door.
  const crossSection = (z, inset, yMin) => {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const p = ringPt(z, -Math.PI / 2 + (i / 64) * Math.PI * 2, inset);
      pts.push(new THREE.Vector2(p.x, Math.max(p.y, yMin)));
    }
    return new THREE.Shape(pts);
  };
  const flatAt = (shape, z) => new THREE.ShapeGeometry(shape, 4).applyMatrix4(T(0, 0, z));
  add("body", part(flatAt(crossSection(Z_LIN1, LIN - 0.01, 0.7), Z_LIN1), XMAT.fabric, cSide, INSIDE));
  {
    const zL = -0.42;
    add("body", part(flatAt(crossSection(zL, LIN - 0.01, 0.78), zL), XMAT.wood, (p) => (Math.abs(p.x) < 0.3 && p.y < 2.05 ? cWood : cSide), INSIDE));
    add("body", part(new THREE.BoxGeometry(0.6, 1.27, 0.02).applyMatrix4(T(0, 0.78 + 0.635, zL + 0.012)), XMAT.wood, cWood, INSIDE));
    for (const x of [0.3, -0.3]) add("body", part(new THREE.BoxGeometry(0.012, 1.27, 0.012).applyMatrix4(T(x, 0.78 + 0.635, zL + 0.024)), MAT.metal, cMetal, INSIDE));
    add("body", part(new THREE.BoxGeometry(0.6, 0.012, 0.012).applyMatrix4(T(0, 2.05, zL + 0.024)), MAT.metal, cMetal, INSIDE));
    add("body", part(new THREE.BoxGeometry(0.03, 0.12, 0.03).applyMatrix4(T(-0.22, 1.5, zL + 0.035)), MAT.metal, cMetal, INSIDE));
  }

  // ---------------------------------------------------------------- wings
  const DIH = (5 * Math.PI) / 180, SWEEP = (23 * Math.PI) / 180;
  const XT = 7.75; // wing tip (the winglet rises from here)
  const wingY = (x) => 0.42 + Math.abs(x) * Math.tan(DIH); // root low enough that the wing box stays under the cabin floor
  const chordAt = (x) => lerp(2.85, 0.95, Math.abs(x) / XT);
  const leAt = (x) => 2.81 - Math.abs(x) * Math.tan(SWEEP);
  const FLAP = [0.58, 4.5], AIL = [4.65, 7.05], FCUT = 0.72, ACUT = 0.74; // flaps run from the body fairing
  for (const side of [1, -1]) {
    const up = V(-side * Math.sin(DIH), Math.cos(DIH), 0);
    const LE = (x) => V(side * x, wingY(x), leAt(x));
    const st = (x0, x1, cuts) => cuts.map(([x, cut]) => ({ t: (x - x0) / (x1 - x0), cut }));
    add("body", part(surface({ rootLE: LE(0), tipLE: LE(XT), rootChord: chordAt(0), tipChord: chordAt(XT), thickness: 0.12, camber: 0.02, up,
      stations: st(0, XT, [[0, 1], [FLAP[0], 1], [FLAP[0], FCUT], [FLAP[1], FCUT], [FLAP[1], 1], [AIL[0], 1], [AIL[0], ACUT], [AIL[1], ACUT], [AIL[1], 1], [XT, 1]]) }), MAT.paint, cWing));
    const hinge = (x, cut) => V(side * x, wingY(x) - 0.012, leAt(x) - cut * chordAt(x));
    const mk = (range, cut, name) => {
      const [x0, x1] = side > 0 ? range : [range[1], range[0]];
      const cs = controlSurface(hinge(x0, cut), hinge(x1, cut), (1 - cut) * chordAt(x0), (1 - cut) * chordAt(x1), 0.06);
      nodes[name] = { parts: [part(cs.geo, MAT.paint, cWing)], translation: cs.translation, rotation: cs.rotation };
    };
    mk(FLAP, FCUT, side > 0 ? "flapL" : "flapR");
    mk(AIL, ACUT, side > 0 ? "ailL" : "ailR");
    // Blended winglet, swept and leaning out a little.
    const wr = LE(XT).add(V(0, -0.01, -0.02)), wt = V(side * (XT + 0.18), wingY(XT) + 0.82, leAt(XT) - 0.8);
    add("body", part(surface({ rootLE: wr, tipLE: wt, rootChord: chordAt(XT) * 0.98, tipChord: 0.36, thickness: 0.1, camber: 0, up: V(side, 0, 0), stations: [{ t: 0 }, { t: 1 }] }), MAT.paint, cWhite));
    add("body", part(new THREE.SphereGeometry(1, 14, 8).applyMatrix4(new THREE.Matrix4().makeScale(0.07, 0.07, chordAt(XT) * 0.45)).applyMatrix4(T(side * XT, wingY(XT) + 0.02, leAt(XT) - chordAt(XT) * 0.47)), MAT.paint, cWhite));
    // Lights at the winglet roots.
    add("body", part(new THREE.SphereGeometry(0.04, 10, 8).applyMatrix4(T(side * (XT + 0.05), wingY(XT) + 0.05, leAt(XT) - 0.05)), side > 0 ? MAT.navRed : MAT.navGreen, C("#ffffff"), { noAO: true }));
    add("strobe", part(new THREE.SphereGeometry(0.035, 10, 8).applyMatrix4(T(side * (XT + 0.06), wingY(XT) + 0.12, leAt(XT) - 0.75)), MAT.white, C("#ffffff"), { noAO: true }));
  }
  // Wing-to-body fairing under the cabin.
  {
    const superRing = (z, hw, top, bot, e, n = 56) => {
      const yc = (top + bot) / 2, hh = (top - bot) / 2, r = [];
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        r.push(V(Math.sign(c) * Math.abs(c) ** (2 / e) * hw, yc + Math.sign(s) * Math.abs(s) ** (2 / e) * hh, z));
      }
      return r;
    };
    const keys = [[3.72, 0.015, 0.62], [3.6, 0.1, 0.57], [3.35, 0.3, 0.48], [3.0, 0.46, 0.39], [2.5, 0.56, 0.33], [1.8, 0.6, 0.3], [1.0, 0.6, 0.29], [0.3, 0.58, 0.3], [-0.2, 0.52, 0.33], [-0.65, 0.42, 0.38], [-1.05, 0.28, 0.45], [-1.4, 0.1, 0.55], [-1.52, 0.015, 0.62]];
    add("body", part(smooth(loft(keys.map(([z, hw, bot]) => superRing(z, hw, 0.66, bot, 2.0)))), XMAT.skin, cWhite));
  }

  // ---------------------------------------------------------------- tail
  const fin = { rootLE: V(0, 2.12, -3.95), tipLE: V(0, 4.5, -6.27), rootChord: 2.1, tipChord: 1.18 };
  const RF = 0.3;
  add("body", part(surface({ rootLE: fin.rootLE, tipLE: fin.tipLE, rootChord: fin.rootChord, tipChord: fin.tipChord, thickness: 0.11, camber: 0, up: V(1, 0, 0), stations: [{ t: 0, cut: 1 - RF }, { t: 1, cut: 1 - RF }] }), MAT.paint, (p) => (p.y > 3.35 && p.y < 3.45 ? cGold : cWhite)));
  {
    const a = fin.rootLE.clone().add(V(0, 0.1, -(1 - RF) * fin.rootChord)), b = fin.tipLE.clone().add(V(0, -0.04, -(1 - RF) * fin.tipChord));
    const cs = controlSurface(a, b, RF * fin.rootChord, RF * fin.tipChord, 0.07);
    nodes.rudder = { parts: [part(cs.geo, MAT.paint, (p) => (p.y > 3.35 && p.y < 3.45 ? cGold : cWhite))], translation: cs.translation, rotation: cs.rotation };
  }
  // Dorsal fillet blending the tailcone into the fin.
  {
    const finLE = (z) => fin.rootLE.y + ((fin.rootLE.z - z) / (fin.rootLE.z - fin.tipLE.z)) * (fin.tipLE.y - fin.rootLE.y);
    const Z0 = -2.7, Z1 = -4.25, ZE = -4.75, rings = [];
    for (let i = 0; i <= 14; i++) {
      const z = lerp(Z0, ZE, i / 14);
      const s = Math.min(1, (Z0 - z) / (Z0 - Z1));
      const top = FUS(z)[1];
      let apex = top + 0.01 + s ** 1.6 * (finLE(Z1) - FUS(Z1)[1]);
      if (z < Z1) apex = finLE(z) - 0.08;
      let wb = 0.05 + 0.2 * Math.sqrt(s);
      if (z < Z1) wb = lerp(wb, 0.04, (Z1 - z) / (Z1 - ZE));
      const ring = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; ring.push(V(wb * (1 - t) ** 2.2, lerp(top - 0.04, apex, t), z)); }
      for (let k = 7; k >= 0; k--) ring.push(V(-ring[k].x, ring[k].y, z));
      ring.push(V(0, top - 0.12, z));
      rings.push(ring);
    }
    add("body", part(smooth(loft(rings)), MAT.paint, cWhite));
  }
  // Two small ventral strakes under the tailcone, splayed outward.
  for (const side of [1, -1]) {
    const z0 = -4.55, z1 = -5.35, y0 = (z) => FUS(z)[2] + 0.03;
    const rootLE = V(side * 0.06, y0(z0), z0), tipLE = V(side * 0.3, y0(z0) - 0.22, z0 - 0.45);
    add("body", part(surface({ rootLE, tipLE, rootChord: z0 - z1, tipChord: 0.42, thickness: 0.06, camber: 0, up: V(Math.cos(0.5), side * Math.sin(0.5), 0).multiplyScalar(side), stations: [{ t: 0 }, { t: 1 }] }), MAT.paint, cWhite));
  }
  // T-tail: tailplane on top of the fin, with elevators, and a bullet fairing at the joint.
  const HT = { y: 4.52, rootLE: -6.27, root: 1.27, tipX: 2.75, tipLE: -6.95, tip: 0.66 };
  const EF = 0.34;
  for (const side of [1, -1]) {
    const rootLE = V(side * 0.05, HT.y, HT.rootLE), tipLE = V(side * HT.tipX, HT.y - 0.04, HT.tipLE);
    add("body", part(surface({ rootLE, tipLE, rootChord: HT.root, tipChord: HT.tip, thickness: 0.1, camber: 0, stations: [{ t: 0, cut: 1 - EF }, { t: 1, cut: 1 - EF }] }), MAT.paint, cWhite));
    const a0 = rootLE.clone().add(V(0, 0, -(1 - EF) * HT.root)), b0 = tipLE.clone().add(V(0, 0, -(1 - EF) * HT.tip));
    const [a, b, ca, cb] = side > 0 ? [a0, b0, EF * HT.root, EF * HT.tip] : [b0, a0, EF * HT.tip, EF * HT.root];
    const cs = controlSurface(a, b, ca, cb, 0.05);
    nodes[side > 0 ? "elevL" : "elevR"] = { parts: [part(cs.geo, MAT.paint, cWhite)], translation: cs.translation, rotation: cs.rotation };
  }
  add("body", part(lathe([[0.001, 0], [0.06, 0.12], [0.1, 0.4], [0.11, 1.0], [0.09, 1.5], [0.04, 1.8], [0.001, 1.9]], 18, T(0, HT.y + 0.02, -7.7)), MAT.paint, cWhite));
  nodes.beacon = { parts: [part(new THREE.SphereGeometry(0.045, 10, 8), MAT.navRed, C("#ffffff"), { noAO: true })], translation: [0, HT.y + 0.14, -6.6] };
  add("beacon", part(new THREE.SphereGeometry(0.04, 10, 8).applyMatrix4(T(0, 0.32 - (HT.y + 0.14), 0.6 + 6.6)), MAT.navRed, C("#ffffff"), { noAO: true }));
  add("body", part(new THREE.SphereGeometry(0.035, 8, 6).applyMatrix4(T(0, 2.0, -6.86)), MAT.white, C("#ffffff"), { noAO: true }));

  // ---------------------------------------------------------------- engines
  for (const side of [1, -1]) {
    const EX = side * 1.32, EY = 1.95, ZI = -0.55, LEN = 2.75;
    const nacelle = [[0.25, 0], [0.27, 0.055], [0.33, 0.44], [0.375, 1.1], [0.39, 1.87], [0.385, 2.37], [0.36, 2.64], [0.33, 2.72], [0.305, 2.75]];
    add("body", part(lathe(nacelle, 36, T(EX, EY, ZI - LEN)), XMAT.skin, (p) => (p.z > ZI - 0.12 ? C("#c8ccd1") : cWhite)));
    // Inlet duct, fan and spinner; exhaust cone.
    add("body", part(lathe([[0.29, 2.45], [0.3, 2.75]], 32, T(EX, EY, ZI - LEN)), XMAT.skin, C("#b8bcc2")));
    add("body", part(new THREE.CircleGeometry(0.29, 32).applyMatrix4(T(EX, EY, ZI - 0.28)), MAT.dark, C("#2a2c2f"), { noAO: true }));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      add("body", part(new THREE.BoxGeometry(0.035, 0.2, 0.01).applyMatrix4(RZ(a)).applyMatrix4(T(EX + Math.sin(-a) * 0.17, EY + Math.cos(a) * 0.17, ZI - 0.27)).applyMatrix4(new THREE.Matrix4()), MAT.metal, C("#8e949a"), { noAO: true }));
    }
    add("body", part(lathe([[0.001, 0.22], [0.05, 0.16], [0.085, 0.06], [0.09, 0]], 16, T(EX, EY, ZI - 0.29)), MAT.metal, C("#d8dbdf")));
    add("body", part(lathe([[0.24, 0], [0.2, 0.12], [0.12, 0.3], [0.001, 0.42]], 20, new THREE.Matrix4().makeRotationY(Math.PI).premultiply(T(EX, EY, ZI - LEN + 0.3))), MAT.dark, C("#3a3c3f")));
    // Pylon from the fuselage side to the nacelle.
    const yP = EY - 0.02;
    add("body", part(surface({ rootLE: V(side * (halfW(ZI - 1.3, yP) - 0.08), yP, ZI - 0.8), tipLE: V(side * (Math.abs(EX) - 0.3), yP, ZI - 0.88), rootChord: 1.5, tipChord: 1.35, thickness: 0.11, camber: 0, stations: [{ t: 0 }, { t: 1 }] }), MAT.paint, cWhite));
  }

  // ---------------------------------------------------------------- registration and seams
  for (const side of [1, -1]) {
    // On the outboard side of each engine nacelle, as real Phenoms carry it.
    const EX = 1.32, EY = 1.95, ZI = -0.55, LEN = 2.75;
    const prof = [[0.25, 0], [0.27, 0.055], [0.33, 0.44], [0.375, 1.1], [0.39, 1.87], [0.385, 2.37], [0.36, 2.64], [0.33, 2.72], [0.305, 2.75]];
    const nacR = (z) => {
      const u = z - (ZI - LEN);
      for (let i = 1; i < prof.length; i++) if (u <= prof[i][1]) return lerp(prof[i - 1][0], prof[i][0], (u - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1]));
      return prof[prof.length - 1][0];
    };
    const onNacelle = (z, y) => EX + Math.sqrt(Math.max(0, nacR(z) ** 2 - (y - EY) ** 2));
    for (const b of registration(REGISTRATION, side, onNacelle, EY, ZI - 1.45, 0.19)) add("body", part(b, MAT.paint, C("#22262b"), { noAO: true, noOcclude: true }));
  }
  // Cheatline: a gold band with a dark line under it, laid on the skin as thin ribbons so the
  // edges are clean. It starts in a point under the cockpit and rises gently along the tailcone.
  const ribbon = (side, zFrom, zTo, lo, hi, colour) => {
    const pos = [], idx = [];
    const n = Math.ceil((zFrom - zTo) / 0.08);
    for (let i = 0; i <= n; i++) {
      const z = lerp(zFrom, zTo, i / n);
      for (const y of [lo(z), hi(z)]) { const p = ringPt(z, thForY(z, y, side), -0.0025); pos.push(p.x, p.y, p.z); }
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    add("body", part(orient(g, out), XMAT.skin, colour, { noOcclude: true }));
  };
  {
    const base = (z) => 1.3 + Math.max(0, -z - 1.2) * 0.05;
    const taper = (z) => Math.min(1, Math.max(0, (6.05 - z) / 0.7)); // pointed front end
    for (const side of [1, -1]) {
      ribbon(side, 6.05, -5.3, base, (z) => base(z) + 0.075 * taper(z), cGold);
      ribbon(side, 5.95, -5.3, (z) => base(z) - 0.045 * taper(z + 0.1), (z) => base(z) - 0.02 * taper(z + 0.1), cDark);
    }
  }
  /** A thin seam line on the skin through points [z, y] on one side. */
  const seam = (side, pts) => {
    const P3 = pts.map(([z, y]) => ringPt(z, thForY(z, y, side), -0.003));
    for (let i = 0; i < P3.length - 1; i++) add("body", part(cylinderBetween(P3[i], P3[i + 1], 0.004, 5), MAT.dark, cSeam, { noAO: true, noOcclude: true }));
  };
  const rectSeam = (side, z0, z1, y0, y1) => {
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push([z0, lerp(y0, y1, k / 6)]);
    for (let k = 1; k <= 3; k++) pts.push([lerp(z0, z1, k / 3), y1]);
    for (let k = 1; k <= 6; k++) pts.push([z1, lerp(y1, y0, k / 6)]);
    for (let k = 1; k <= 3; k++) pts.push([lerp(z1, z0, k / 3), y0]);
    seam(side, pts);
  };
  rectSeam(1, 3.52, 4.15, 0.88, 2.14); // airstair door, right behind the cockpit
  rectSeam(-1, 0.88, 1.34, 1.6, 2.13); // emergency exit over the right wing
  add("body", part(new THREE.BoxGeometry(0.02, 0.03, 0.14).applyMatrix4(T(halfW(3.6, 1.45) + 0.008, 1.45, 3.62)), MAT.metal, cMetal)); // door handle
  // Antennas and the pitot probes.
  for (const [z, h] of [[3.6, 0.2], [0.2, 0.16], [-2.4, 0.14]]) add("body", part(new THREE.BoxGeometry(0.012, h, 0.12).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.35)).applyMatrix4(T(0, FUS(z)[1] + h / 2 - 0.02, z)), MAT.dark, C("#2b2d30")));
  for (const side of [1, -1]) add("body", part(cylinderBetween(V(side * halfW(6.9, 1.3), 1.3, 6.9), V(side * (halfW(6.9, 1.3) + 0.09), 1.3, 7.02), 0.01, 6), MAT.metal, cMetal));

  // ---------------------------------------------------------------- landing gear
  const tyre = (R, w) => {
    const prof = [[R * 0.55, -w / 2], [R * 0.86, -w / 2], [R * 0.97, -w * 0.36], [R, -w * 0.15], [R, w * 0.15], [R * 0.97, w * 0.36], [R * 0.86, w / 2], [R * 0.55, w / 2]];
    return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28).applyMatrix4(RZ(-Math.PI / 2));
  };
  const wheelParts = (R, w) => {
    const parts = [part(tyre(R, w), MAT.rubber, cTyre), part(new THREE.CylinderGeometry(R * 0.56, R * 0.56, w * 0.86, 22).applyMatrix4(RZ(-Math.PI / 2)), MAT.metal, C("#c5c9ce"))];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const sx of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(R * 0.08, R * 0.08, 0.02, 8).applyMatrix4(RZ(-Math.PI / 2)).applyMatrix4(T(sx * w * 0.44, Math.cos(a) * R * 0.33, Math.sin(a) * R * 0.33)), MAT.dark, cBlack));
    }
    return parts;
  };
  const worldOf = (n) => new THREE.Matrix4().compose(V(...n.translation), new THREE.Quaternion(...n.rotation), V(1, 1, 1));
  const adopt = (parentName, child) => {
    const m = worldOf(nodes[parentName]).invert().multiply(worldOf(child));
    const t = V(0, 0, 0), q = new THREE.Quaternion(), s = V(1, 1, 1);
    m.decompose(t, q, s);
    return { ...child, translation: [t.x, t.y, t.z], rotation: [q.x, q.y, q.z, q.w], parent: parentName, moving: true };
  };
  // Main legs: trailing-link, folding inward so the wheel lies flat in the wing root.
  const MR = 0.27, MW = 0.17;
  for (const side of [1, -1]) {
    const name = side > 0 ? "gearL" : "gearR";
    const P = V(side * 1.32, 0.58, 0.12), K = V(side * 1.32, MR - LIFT + 0.13, 0.13), A = V(side * 1.32, MR - LIFT, 0), W = V(side * 1.46, MR - LIFT, 0);
    const u = W.clone().sub(P).normalize();
    const w = V(-side, 0.06, 0).normalize();
    const axis = u.clone().cross(w).normalize();
    rig.retractDeg[name] = +((Math.acos(u.dot(w)) * 180) / Math.PI).toFixed(1);
    const parts = [
      part(cylinderBetween(P, K, 0.05, 12), MAT.metal, C("#c9cdd2")),
      part(cylinderBetween(P.clone().lerp(K, 0.55), K, 0.036, 12), MAT.metal, C("#eef0f2")),
      part(cylinderBetween(K, A, 0.034, 10), MAT.metal, cMetal),
      part(cylinderBetween(A.clone().add(V(-side * 0.02, 0, 0)), W, 0.025, 8), MAT.metal, cMetal),
      // Leg door, outboard of the strut; it closes flush under the wing when the leg folds.
      part(new THREE.BoxGeometry(0.02, 0.42, 0.3).applyMatrix4(T(side * 1.39, 0.33, 0.13)), XMAT.skin, cWing),
    ];
    nodes[name] = asNode(parts, P, axis, u.clone().negate(), { moving: true });
    const wn = side > 0 ? "wheelL" : "wheelR";
    nodes[wn] = adopt(name, { parts: wheelParts(MR, MW), translation: [W.x, W.y, W.z], rotation: [0, 0, 0, 1] });
    rig.wheelRadius[wn] = MR;
  }
  // Nose leg: folds forward into the nose.
  {
    const NR = 0.2, NW = 0.13;
    const P = V(0, 0.8, 6.05), W = V(0, NR - LIFT, 5.98), F = NR - LIFT + 0.16; // F: top of the fork
    const parts = [
      part(cylinderBetween(P, V(0, F + 0.06, 6.02), 0.045, 12), MAT.metal, C("#c9cdd2")),
      part(cylinderBetween(V(0, F + 0.2, 6.02), V(0, F - 0.03, 6.0), 0.032, 12), MAT.metal, C("#eef0f2")),
      part(cylinderBetween(V(0.1, F, 6.0), V(0.1, W.y, W.z), 0.022, 8), MAT.metal, cMetal),
      part(cylinderBetween(V(-0.1, F, 6.0), V(-0.1, W.y, W.z), 0.022, 8), MAT.metal, cMetal),
      part(new THREE.BoxGeometry(0.22, 0.04, 0.07).applyMatrix4(T(0, F, 6.0)), MAT.metal, cMetal),
      part(cylinderBetween(V(0, 0.76, 5.6), V(0, F + 0.25, 6.0), 0.02, 8), MAT.metal, cMetal),
      part(new THREE.SphereGeometry(0.045, 10, 8).applyMatrix4(T(0, F + 0.3, 6.09)), MAT.white, C("#ffffff"), { noAO: true }),
    ];
    nodes.gearN = asNode(parts, P, V(-1, 0, 0), V(0, 1, 0), { moving: true });
    rig.retractDeg.gearN = 95;
    nodes.wheelN = adopt("gearN", { parts: wheelParts(NR, NW), translation: [W.x, W.y, W.z], rotation: [0, 0, 0, 1] });
    rig.wheelRadius.wheelN = NR;
  }
  {
    const parts = [];
    for (const side of [1, -1]) parts.push(part(new THREE.BoxGeometry(0.015, 0.3, 0.72).applyMatrix4(new THREE.Matrix4().compose(V(side * 0.15, 0.45, 6.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.12)), V(1, 1, 1))), XMAT.skin, cWhite));
    nodes.gearDoors = { parts, moving: true };
  }

  // ---------------------------------------------------------------- inside
  const box = (w, h, d, x, y, z, rx = 0, ry = 0) => new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), V(1, 1, 1)));
  const pad = (w, h, d, m, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)).applyMatrix4(m);
  const at = (x, y, z, rx = 0, ry = 0) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, "YXZ")), V(1, 1, 1));

  // Floors: cockpit, the dropped aisle, and the raised side ledges the seats stand on.
  const AISLE = 0.71, LEDGE = 0.78;
  add("body", part(box(0.9, 0.04, 1.45, 0, 0.73, 4.95), XMAT.fabric, cCarpet, INSIDE));
  add("body", part(box(0.76, 0.04, 5.3, 0, AISLE - 0.02, 1.58), XMAT.fabric, cCarpet, INSIDE));
  for (const side of [1, -1]) {
    add("body", part(box(0.085, LEDGE - 0.7, 5.3, side * 0.4275, (LEDGE + 0.7) / 2, 1.58), XMAT.fabric, C("#4e4842"), INSIDE));
    add("body", part(box(0.012, 0.012, 5.3, side * 0.385, LEDGE - 0.005, 1.58), MAT.metal, cMetal, INSIDE));
  }

  /**
   * A seat drawn from its side profile and extruded across its width with rounded edges.
   * Built facing +z at the local origin (floor level, cushion centre), then placed by `m`.
   */
  const slab = (width, outline, bev = 0.02) => {
    const s = new THREE.Shape();
    s.moveTo(-outline[0][0], outline[0][1]);
    for (const [z, y] of outline.slice(1)) s.lineTo(-z, y);
    s.closePath();
    const depth = width - 2 * bev;
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 }).applyMatrix4(RY(Math.PI / 2)).applyMatrix4(T(-depth / 2, 0, 0));
  };
  const seat = (m, { width = 0.52, cushionY = 0.43, rec = 0.22, backLen = 0.66, colour = cLeather, trim = cLeatherDk, arms = [-1, 1], base = true } = {}) => {
    const H = [-0.2, cushionY + 0.02], dir = [-Math.sin(rec), Math.cos(rec)], fwd = [Math.cos(rec), Math.sin(rec)];
    const P = (u, v) => [H[0] + dir[0] * u + fwd[0] * v, H[1] + dir[1] * u + fwd[1] * v];
    const b = 0.02, parts = [];
    const back = [[0.02, -b], [0.15, 0.035 - b], [0.3, 0.04 - b], [0.45, 0.022 - b], [0.6, 0.006 - b], [backLen, -b], [backLen, -0.12 + b], [0.3, -0.13 + b], [0.02, -0.14 + b]];
    parts.push(part(slab(width, back.map(([u, v]) => P(u, v))), XMAT.leather, colour));
    const head = [[backLen - 0.05, 0.012 - b], [backLen + 0.08, 0.03 - b], [backLen + 0.2, 0.012 - b], [backLen + 0.2, -0.1 + b], [backLen - 0.05, -0.11 + b]];
    parts.push(part(slab(width * 0.66, head.map(([u, v]) => P(u, v)), 0.03), XMAT.leather, colour));
    parts.push(part(pad(width, 0.13, 0.52, at(0, cushionY - 0.045, 0.06, -0.06), 0.04), XMAT.leather, colour));
    parts.push(part(pad(width * 0.86, 0.025, 0.44, at(0, cushionY + 0.02, 0.06, -0.06), 0.012), XMAT.leather, trim));
    for (const sx of arms) {
      parts.push(part(pad(0.075, 0.07, 0.46, at(sx * (width / 2 + 0.03), cushionY + 0.2, 0.0), 0.03), XMAT.leather, trim));
      parts.push(part(box(0.05, 0.2, 0.08, sx * (width / 2 + 0.03), cushionY + 0.07, -0.12), MAT.dark, C("#3b3732")));
    }
    if (base) parts.push(part(box(0.36, cushionY - 0.11, 0.42, 0, (cushionY - 0.11) / 2, 0.02), MAT.dark, C("#38342f")));
    for (const pt of parts) { pt.geo.applyMatrix4(m); Object.assign(pt, INSIDE); add("body", pt); }
  };
  // Cabin: the "club four" with tables between, then two forward-facing seats.
  // The cabin seats have one armrest, on the aisle side; the side shelf is the other.
  const SX = 0.43, SW = 0.46;
  for (const side of [1, -1]) {
    const x = side * SX;
    seat(at(x, LEDGE, 2.55, 0, Math.PI), { width: SW, arms: [side] }); // facing aft
    seat(at(x, LEDGE, 1.15), { width: SW, arms: [-side] }); // facing forward
    seat(at(x, LEDGE, 0.14), { width: SW, arms: [-side] }); // forward-facing, aft pair
    // Fold-out table from the sidewall between the club seats: veneer top on a chrome leg.
    add("body", part(pad(0.4, 0.03, 0.56, at(side * 0.5, LEDGE + 0.67, 1.85), 0.012), XMAT.wood, cWood, INSIDE));
    add("body", part(cylinderBetween(V(side * 0.42, LEDGE, 1.85), V(side * 0.42, LEDGE + 0.66, 1.85), 0.018, 10), MAT.metal, cMetal, INSIDE));
    // Side shelf under the windows (polished dark wood, the outboard armrest), full cabin length.
    const z0 = -0.36, z1 = side > 0 ? 3.42 : 3.47, wallX = halfW(1, 1.42) - LIN;
    add("body", part(pad(0.13, 0.045, z1 - z0, at(side * (wallX - 0.05), 1.425, (z0 + z1) / 2), 0.015), XMAT.wood, cWood, INSIDE));
    add("body", part(box(0.01, 0.06, z1 - z0 - 0.02, side * (wallX - 0.115), 1.38, (z0 + z1) / 2), XMAT.wood, C("#4a2e1a"), INSIDE));
  }
  // Ceiling: a centre console strip and two lines of cove lighting along it.
  {
    const zc = 1.85, len = 4.3, yTop = FUS(1)[1] - LIN;
    add("body", part(pad(0.42, 0.05, len, at(0, yTop - 0.03, zc), 0.02), XMAT.fabric, C("#d9d3c6"), INSIDE));
    for (const sx of [-1, 1]) add("body", part(box(0.012, 0.008, len - 0.1, sx * 0.23, yTop - 0.045, zc), MAT.white, C("#ffffff"), { noAO: true, noOcclude: true }));
    for (const z of [3.11, 2.46, 1.83, 1.11, 0.07]) for (const sx of [-1, 1]) add("body", part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 14).applyMatrix4(T(sx * 0.15, yTop - 0.058, z)), MAT.metal, cMetal, INSIDE));
  }
  // Refreshment centre opposite the airstair door.
  add("body", part(box(0.34, 0.84, 0.6, -0.43, LEDGE + 0.42, 3.85), XMAT.wood, cWood, INSIDE));
  add("body", part(box(0.38, 0.03, 0.62, -0.45, LEDGE + 0.855, 3.85), XMAT.wood, C("#e8e2d4"), INSIDE));
  for (const y of [1.12, 1.34]) add("body", part(box(0.012, 0.012, 0.52, -0.255, y, 3.85), MAT.metal, cMetal, INSIDE));
  // Bulkhead posts either side of the open cockpit entrance.
  for (const side of [1, -1]) add("body", part(box(0.16, 1.0, 0.06, side * 0.53, 1.45, 4.22), XMAT.fabric, cSide, INSIDE));

  // Cockpit: two pilot seats, the Prodigy Touch panel (three big screens), glareshield,
  // centre pedestal with thrust levers and touch controllers, control wheels, rudder pedals.
  const PZ = 5.62; // panel face
  for (const side of [1, -1]) seat(at(side * 0.36, 0.75, 4.9), { width: 0.5, colour: cPilotSeat, trim: C("#3f4246"), rec: 0.2, backLen: 0.68 });
  add("body", part(box(1.5, 0.54, 0.08, 0, 1.4, PZ + 0.04), MAT.dark, C("#2a2d31"), INSIDE));
  add("body", part(box(1.4, 0.05, 0.28, 0, 1.69, PZ + 0.1), MAT.dark, cBlack, INSIDE));
  const screen = (x, kind) => {
    const z = PZ - 0.004, cy = 1.49, w = 0.3, h = 0.2;
    add("body", part(box(w + 0.03, h + 0.03, 0.01, x, cy, z + 0.002), MAT.dark, C("#101215"), { noAO: true }));
    if (kind === "pfd") {
      add("body", part(box(w * 0.62, h * 0.5, 0.004, x, cy + h * 0.25, z - 0.004), XMAT.display, C("#1f6fd6"), { noAO: true }));
      add("body", part(box(w * 0.62, h * 0.5, 0.004, x, cy - h * 0.25, z - 0.004), XMAT.display, C("#8a4f1c"), { noAO: true }));
      add("body", part(box(w * 0.62, 0.004, 0.004, x, cy, z - 0.007), XMAT.display, C("#ffffff"), { noAO: true }));
      for (const sx of [-1, 1]) add("body", part(box(w * 0.14, h * 0.86, 0.004, x + sx * w * 0.4, cy, z - 0.006), XMAT.display, C("#30343a"), { noAO: true }));
      add("body", part(box(0.06, 0.006, 0.004, x, cy - 0.006, z - 0.009), XMAT.display, C("#f2c230"), { noAO: true }));
    } else {
      add("body", part(box(w, h, 0.004, x, cy, z - 0.004), XMAT.display, C("#0a1a33"), { noAO: true }));
      add("body", part(box(w * 0.5, h * 0.4, 0.004, x - 0.04, cy + 0.02, z - 0.006), XMAT.display, C("#2f8f3c"), { noAO: true }));
      add("body", part(box(w * 0.28, h * 0.25, 0.004, x + 0.06, cy - 0.05, z - 0.007), XMAT.display, C("#3a8fc0"), { noAO: true }));
      add("body", part(box(w * 0.6, 0.005, 0.004, x, cy + 0.01, z - 0.009, 0, 0).applyMatrix4(new THREE.Matrix4()), XMAT.display, C("#d63bd0"), { noAO: true }));
    }
  };
  screen(0.38, "pfd");
  screen(0, "mfd");
  screen(-0.38, "pfd");
  // Pedestal with two thrust levers and the two touch controllers.
  add("body", part(box(0.18, 0.42, 0.55, 0, 0.96, 5.33), MAT.dark, C("#2a2d31"), INSIDE));
  for (const x of [0.03, -0.03]) {
    add("body", part(cylinderBetween(V(x, 1.17, 5.36), V(x, 1.29, 5.3), 0.008, 6), MAT.metal, cMetal, INSIDE));
    add("body", part(box(0.04, 0.03, 0.05, x, 1.3, 5.3), MAT.dark, C("#1c1e21"), INSIDE));
  }
  for (const x of [0.07, -0.07]) add("body", part(box(0.09, 0.006, 0.13, x, 1.172, 5.08, -0.35), XMAT.display, C("#1f3a5a"), { noAO: true }));
  for (const side of [1, -1]) {
    const x = side * 0.38;
    add("body", part(cylinderBetween(V(x, 1.16, PZ), V(x, 1.2, PZ - 0.32), 0.02, 10), MAT.dark, C("#2a2c2f"), INSIDE));
    add("body", part(box(0.08, 0.07, 0.05, x, 1.21, PZ - 0.33), MAT.dark, cBlack, INSIDE));
    add("body", part(cylinderBetween(V(x - 0.13, 1.21, PZ - 0.34), V(x + 0.13, 1.21, PZ - 0.34), 0.016, 10), MAT.dark, cBlack, INSIDE));
    for (const s of [-1, 1]) add("body", part(cylinderBetween(V(x + s * 0.13, 1.21, PZ - 0.34), V(x + s * 0.15, 1.33, PZ - 0.34), 0.02, 10), MAT.dark, cBlack, INSIDE));
    for (const s of [-1, 1]) add("body", part(box(0.08, 0.14, 0.02, x + s * 0.09, 0.84, PZ - 0.04, -0.5), MAT.metal, C("#5c6066"), INSIDE));
  }

  // The pilot, in the left seat, sitting back with a headset on and hands on the wheel.
  {
    const pp = [];
    const cShirt = C("#f2f2f0"), cTrousers = C("#25303f"), cSkin = C("#d9a77f"), cHair = C("#3b2a1e"), cHeadset = C("#24262a");
    const limb = (a, b, r, c) => pp.push(part(cylinderBetween(a, b, r, 10), XMAT.fabric, c, INSIDE));
    const ball = (p, r, c, mat = XMAT.fabric) => pp.push(part(new THREE.SphereGeometry(r, 14, 10).applyMatrix4(T(p.x, p.y, p.z)), mat, c, INSIDE));
    const x = 0.36, fy = 0.75, fz = 4.9;
    pp.push(part(new THREE.SphereGeometry(1, 16, 12).applyMatrix4(new THREE.Matrix4().compose(V(x, fy + 0.72, fz - 0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22, 0, 0)), V(0.19, 0.27, 0.12))), XMAT.fabric, cShirt, INSIDE));
    const head = V(x, fy + 1.12, fz - 0.15);
    limb(V(x, fy + 0.9, fz - 0.1), head.clone().add(V(0, -0.06, 0.01)), 0.045, cSkin);
    ball(head, 0.1, cSkin);
    pp.push(part(new THREE.SphereGeometry(0.104, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45).applyMatrix4(new THREE.Matrix4().compose(head.clone().add(V(0, 0.005, -0.012)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), V(1, 1, 1))), XMAT.fabric, cHair, INSIDE));
    for (const s of [-1, 1]) ball(head.clone().add(V(s * 0.1, -0.01, 0)), 0.04, cHeadset, MAT.dark);
    pp.push(part(new THREE.TorusGeometry(0.105, 0.012, 6, 16, Math.PI).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)).applyMatrix4(T(head.x, head.y + 0.005, head.z)), MAT.dark, cHeadset, INSIDE));
    pp.push(part(cylinderBetween(head.clone().add(V(0.1, -0.03, 0.02)), head.clone().add(V(0.03, -0.07, 0.1)), 0.006, 6), MAT.dark, cHeadset, INSIDE));
    for (const s of [-1, 1]) {
      const sh = V(x + s * 0.18, fy + 0.88, fz - 0.08), el = V(x + s * 0.21, fy + 0.62, fz + 0.2), hand = V(x + s * 0.14, 1.27, PZ - 0.34);
      limb(sh, el, 0.042, cShirt);
      limb(el, hand, 0.036, cSkin);
      ball(hand, 0.035, cSkin);
      const hip = V(x + s * 0.09, fy + 0.5, fz - 0.03), knee = V(x + s * 0.11, fy + 0.55, fz + 0.38), foot = V(x + s * 0.1, 0.84, PZ - 0.08);
      limb(hip, knee, 0.065, cTrousers);
      ball(knee, 0.063, cTrousers);
      limb(knee, foot, 0.05, cTrousers);
      pp.push(part(new THREE.BoxGeometry(0.09, 0.07, 0.2).applyMatrix4(T(foot.x, foot.y - 0.02, foot.z - 0.04)), MAT.dark, C("#1b1b1d"), INSIDE));
    }
    nodes.pilot = { parts: pp };
  }

  // Eyes: the pilot sitting back in the left seat, and a passenger in the forward-facing club
  // seat on the left, beside a window. A person's wide view from both.
  rig.eye = [0.36, 1.91, 4.83];
  rig.windowEye = [0.42, 1.92, 1.0];
  rig.fov = 80;
  rig.eyePitch = 9; // a glance down takes in the screens, as a seated pilot's natural view does
  // Quality check: nothing inside the cabin may poke out through the skin. Every interior part's
  // corners are tested against the fuselage cross-section at their station; offenders are listed.
  {
    const bad = [];
    for (const [name, node] of Object.entries(nodes)) {
      if (name !== "body" && name !== "pilot") continue;
      node.parts.forEach((pt, i) => {
        if (pt.aoStrength === undefined) return;
        const pos = pt.geo.attributes.position;
        let worst = 0, at = null;
        for (let k = 0; k < pos.count; k++) {
          const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
          if (z > Z_NOSE || z < Z_TAIL) continue;
          const [, top, bot] = FUS(z);
          const over = y > top || y < bot ? 0.05 : Math.abs(x) - halfW(z, y);
          if (over > worst) { worst = over; at = [x, y, z]; }
        }
        if (worst > 0.002) bad.push(`${name}#${i} sticks out ${(worst * 100).toFixed(1)} cm at (${at.map((v) => v.toFixed(2)).join(", ")})`);
      });
    }
    if (bad.length) console.warn("phenom300: interior parts outside the skin:\n  " + bad.join("\n  "));
  }
  // Up onto the real ride height: every top-level node moves up; children follow their parents.
  for (const node of Object.values(nodes)) {
    if (node.parent) continue;
    if (node.translation) node.translation = [node.translation[0], node.translation[1] + LIFT, node.translation[2]];
    else for (const pt of node.parts) pt.geo.applyMatrix4(T(0, LIFT, 0));
  }
  rig.eye[1] += LIFT;
  rig.windowEye[1] += LIFT;
  return { nodes, extraMaterials, rig };
}
