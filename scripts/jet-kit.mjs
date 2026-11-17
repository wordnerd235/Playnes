// Shared builder for the business jets (and the PC-12), grown out of the Phenom 300E model.
// Each aircraft is a measured spec (scripts/model-<id>.mjs); this file turns it into the
// model: a fuselage grid with the windows as real openings (frame, glass, reveal, cabin lining
// with matching openings), a free-form windshield, wings with flaps, ailerons and winglets, a
// T-tail / cruciform / low tail, engines on the rear fuselage, over the wing, in the tail or a
// propeller in the nose, retracting gear, and a cabin and cockpit to sit in.
//
// glTF conventions (same as build-models.mjs): +Y up, nose toward +Z, left wing toward +X,
// origin on the ground between the main wheels. A spec is written in "body" heights and the
// whole model is lifted by S.lift at the end (the gear legs reach the ground either way).
//
// Nodes the game animates (src/game/planeView.ts):
//   flapL flapR ailL ailR    hinge about local X (negative = trailing edge down)
//   elevL elevR rudder       hinges
//   gearL gearR gearN        legs: rotate about their local X to retract (angles in the rig)
//   wheelL wheelR wheelN     spin about local X (children of the legs)
//   gearDoors                nose-wheel doors, shown while the gear is out
//   attBall attBall2         the pilots' attitude displays: turn with the bank
//   prop propDisc            (propeller aircraft) the propeller, and its blur when fast
//   beacon strobe            blink
//   pilot canopy             hidden when the camera is inside (rig.eye, rig.windowEye)
//
// Every spec value is in metres (angles in degrees) unless noted. spec-phenom300.mjs rebuilds
// the Phenom 300E through this kit (KIT_CHECK=1 node scripts/build-models.mjs phenom300) and is
// the reference spec; the window-seat camera (cabin.windowSeat) should sit beside a window.

import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function buildJet(ac, kit, S) {
  const { THREE, V, C, T, RY, RZ, lerp, MAT, MATERIALS, loft, smooth, surface, controlSurface, lathe, cylinderBetween, registration, REGISTRATION, part, curve, asNode } = kit;
  const DEG = Math.PI / 180;

  const X0 = MATERIALS.length;
  const XMAT = { glass: X0, fabric: X0 + 1, display: X0 + 2, skin: X0 + 3, leather: X0 + 4, wood: X0 + 5, blur: X0 + 6 };
  const extraMaterials = [
    { name: "cabinGlass", pbrMetallicRoughness: { baseColorFactor: [0.3, 0.38, 0.46, 0.4], metallicFactor: 0.85, roughnessFactor: 0.04 }, alphaMode: "BLEND", doubleSided: true },
    { name: "fabric", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 }, doubleSided: true },
    // Screens glow in their own colours whatever the light (unlit): a grey glow added on top washed
    // every colour out to blank-looking grey.
    { name: "display", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, extensions: { KHR_materials_unlit: {} }, doubleSided: true },
    // The skin is two-sided: from the cockpit you see the inside of the frame around the windshield.
    { name: "skin", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.3 }, doubleSided: true },
    { name: "leather", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.55 }, doubleSided: true },
    { name: "wood", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.05, roughnessFactor: 0.22 }, doubleSided: true },
    { name: "propBlur", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.16], metallicFactor: 0, roughnessFactor: 0.6 }, alphaMode: "BLEND", doubleSided: true },
  ];

  const nodes = {};
  const add = (node, pt) => (nodes[node] ??= { parts: [] }).parts.push(pt);
  const rig = { retractDeg: {}, wheelRadius: {} };
  const INSIDE = { aoStrength: 0.4 };

  // ---- colours
  const cWhite = C(ac.livery.body), cStripe = C(S.stripe?.colour ?? ac.livery.stripe), cAccent = C(S.stripe?.accent ?? ac.livery.accent);
  const cWing = C(S.wingColour ?? "#eceef0"), cMetal = C("#a3a8ae"), cBlack = C("#151719"), cTyre = C("#1c1d1f"), cSeam = C("#8d939a");
  const cHead = C("#efeae0"), cSide = C("#e4dccb"), cDado = C("#6a5746"), cCarpet = C("#5d564f"), cCock = C("#4d5156");
  const cLeather = C(S.cabin?.leather ?? "#d8cbb2"), cLeatherDk = C(S.cabin?.trim ?? "#a9977a"), cPilotSeat = C("#5b5e62"), cWood = C(S.cabin?.wood ?? "#7a4f2e");
  const skinColor = cWhite;

  // ---------------------------------------------------------------- fuselage
  // Cross-sections: [z, half width, top, bottom, squareness].
  const FUS = curve(S.fus);
  const Z_NOSE = S.fus[0][0], Z_TAIL = S.fus[S.fus.length - 1][0];
  const LIFT = S.lift ?? 0;
  const ringPt = (z, th, inset = 0) => {
    const [hw, top, bot, e] = FUS(z);
    const yc = (top + bot) / 2, hh = (top - bot) / 2 - inset, w = hw - inset;
    const c = Math.cos(th), s = Math.sin(th);
    return V(Math.sign(c) * Math.abs(c) ** (2 / e) * w, yc + Math.sign(s) * Math.abs(s) ** (2 / e) * hh, z);
  };
  const centreY = (z) => { const f = FUS(z); return (f[1] + f[2]) / 2; };
  const thForY = (z, y, side = 1) => {
    const [, top, bot, e] = FUS(z);
    const yc = (top + bot) / 2, hh = (top - bot) / 2;
    const t = Math.max(-1, Math.min(1, (y - yc) / hh));
    const th = Math.asin(Math.sign(t) * Math.abs(t) ** (e / 2));
    return side > 0 ? th : Math.PI - th;
  };
  const halfW = (z, y) => {
    const [hw, top, bot, e] = FUS(z);
    const yc = (top + bot) / 2, hh = (top - bot) / 2;
    const t = Math.min(1, Math.abs((y - yc) / hh));
    return hw * Math.max(0, 1 - t ** e) ** (1 / e);
  };
  const radial = (p) => V(p.x, p.y - centreY(p.z), 0).normalize();
  // Cabin reference values (the widest, constant section).
  const CAB = FUS(S.cabinRefZ ?? (S.lining.z0 + S.lining.z1) / 2);
  const HW = CAB[0], TOP = CAB[1];
  const LEDGE = S.floor; // the floor the seats stand on
  const AISLE = LEDGE - (S.aisleDrop ?? 0.07);

  // ---- openings
  const RV = S.rv ?? HW * 1.047; // metres per radian (true-size rounded corners)
  const M = 0.04;
  const WIN = [];
  const addWin = (z0, z1, t0, t1, r, kind) => WIN.push({ z0, z1, t0: Math.min(t0, t1), t1: Math.max(t0, t1), r, kind });
  const W = S.windows;
  const cabinWin = (zc, side) => addWin(zc - W.w / 2, zc + W.w / 2, thForY(zc, W.yc - W.h / 2, side), thForY(zc, W.yc + W.h / 2, side), W.r, "cabin");
  for (const z of W.left) cabinWin(z, 1);
  for (const z of W.right) cabinWin(z, -1);
  for (const cw of S.cockpitWindows) for (const side of [1, -1]) addWin(cw.z0, cw.z1, thForY(cw.zc ?? (cw.z0 + cw.z1) / 2, cw.y0, side), thForY(cw.zc ?? (cw.z0 + cw.z1) / 2, cw.y1, side), cw.r ?? 0.08, "cockpit");
  {
    const WS = S.windshield, post = WS.post ?? 2.5;
    const pane = (side) => {
      const c = side > 0 ? (90 - post) * DEG : (90 + post) * DEG;
      const lower = WS.lower.map(([z, y]) => [z, thForY(z, y, side)]);
      return [[WS.z1 - 0.005, c], [WS.lower[0][0], c], ...lower];
    };
    WIN.push({ z0: WS.lower[0][0], z1: WS.z1, t0: 18 * DEG, t1: 162 * DEG, r: 0, kind: "windshield", polys: [pane(1), pane(-1)] });
  }
  const MT = M / RV;
  const inCut = (z, th) => WIN.some((w) => z > w.z0 - M && z < w.z1 + M && th > w.t0 - MT && th < w.t1 + MT);

  const zRows = (() => {
    const nose = [];
    const zs = S.noseRows ?? [0, 0.02, 0.05, 0.1, 0.16, 0.24, 0.34, 0.45, 0.58, 0.72, 0.88, 1.05, 1.22];
    for (const d of zs) nose.push(Z_NOSE - d);
    const s = [...nose];
    const zStart = Z_NOSE - zs[zs.length - 1] - 0.16, cabin = S.rowStep ?? 0.14, ends = S.rowStepEnds ?? 0.11;
    for (let z = zStart; z > Z_TAIL; z -= z > S.lining.z1 - 0.6 && z < S.lining.z0 ? cabin : ends) s.push(z);
    s.push(Z_TAIL);
    const edges = WIN.flatMap((w) => [w.z0 - M, w.z1 + M]);
    const keep = s.filter((z) => z >= zStart || z <= Z_TAIL || !edges.some((e) => Math.abs(e - z) < 0.06));
    return [...new Set([...keep, ...edges].map((z) => +z.toFixed(4)))].sort((a, b) => b - a);
  })();
  const thCols = (() => {
    const s = [];
    const n = S.columns ?? 88;
    for (let i = 0; i < n; i++) s.push(-Math.PI / 2 + (i / n) * Math.PI * 2);
    const edges = WIN.flatMap((w) => [w.t0 - MT, w.t1 + MT]);
    const keep = s.filter((t) => !edges.some((e) => Math.abs(e - t) < 0.035));
    return [...new Set([...keep, ...edges].map((t) => +t.toFixed(5)))].sort((a, b) => a - b);
  })();

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
  const roundRect = (z0, z1, v0, v1, r, seg = 7) => {
    r = Math.min(r, (z1 - z0) / 2 - 1e-4, (v1 - v0) / 2 - 1e-4);
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
  /** Split long edges (flat z, v layout) so shapes laid on the curved skin follow it. */
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
  const LIN = 0.065;
  const out = (m) => radial(m), inn = (m) => radial(m).negate();

  add("body", part(lattice(0, Z_NOSE, Z_TAIL, false, true), XMAT.skin, skinColor));
  for (const w of WIN) {
    const v0 = w.t0 * RV, v1 = w.t1 * RV;
    const frame = new THREE.Shape(densRect(w.z0 - M, w.z1 + M, v0 - M, v1 + M));
    if (w.polys) {
      for (const poly of w.polys) frame.holes.push(new THREE.Path(polyPts(poly)));
      add("body", part(onSkin(frame, 0, out, 0.07), XMAT.skin, skinColor));
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
    add("canopy", part(onSkin(new THREE.Shape(roundRect(w.z0, w.z1, v0, v1, w.r)), 0.012, out), XMAT.glass, C("#ffffff"), { noAO: true, noOcclude: true }));
    if (w.kind !== "cabin") {
      const ring = new THREE.Shape(roundRect(w.z0 - 0.018, w.z1 + 0.018, v0 - 0.018, v1 + 0.018, w.r + 0.018));
      ring.holes.push(new THREE.Path(roundRect(w.z0, w.z1, v0, v1, w.r)));
      add("body", part(onSkin(ring, -0.002, out), MAT.dark, cBlack, { noAO: true }));
    }
  }

  // ---- the cabin lining, with enlarged window surrounds and reveals
  const Z_LIN0 = S.lining.z0, Z_LIN1 = S.lining.z1;
  const cockpitZ = S.cockpit.bulkheadZ;
  const liningColor = (p) => {
    if (p.z > cockpitZ) return cCock;
    if (p.y > TOP - 0.33) return cHead;
    if (p.y > LEDGE + 0.5) return cSide;
    return cDado;
  };
  add("body", part(lattice(LIN, Z_LIN0, Z_LIN1, true), XMAT.fabric, liningColor, INSIDE));
  add("body", part(lattice(0.03, S.windshield.z1 + 0.3, Z_LIN0, true), XMAT.fabric, cCock, INSIDE));
  add("body", part(loft([thCols.map((t) => ringPt(Z_LIN0, t, LIN)), thCols.map((t) => ringPt(Z_LIN0, t, 0.03))], { capStart: false, capEnd: false }), XMAT.fabric, cCock, INSIDE));
  for (const w of WIN) {
    if (w.z1 > Z_LIN0) continue;
    const v0 = w.t0 * RV, v1 = w.t1 * RV, zc = (w.z0 + w.z1) / 2, vc = (v0 + v1) / 2;
    const grow = (half) => half + Math.min(half * 0.12, M - 0.012);
    const hz = grow((w.z1 - w.z0) / 2), hv = grow((v1 - v0) / 2);
    const big = roundRect(zc - hz, zc + hz, vc - hv, vc + hv, w.r + (hz - (w.z1 - w.z0) / 2));
    const surround = new THREE.Shape(densRect(w.z0 - M, w.z1 + M, v0 - M, v1 + M));
    surround.holes.push(new THREE.Path(big));
    add("body", part(onSkin(surround, LIN, inn), XMAT.fabric, w.kind === "cabin" ? cSide : cCock, INSIDE));
    const small = roundRect(w.z0, w.z1, v0, v1, w.r);
    const ringAt = (pts, inset) => pts.map((q) => ringPt(q.x, q.y / RV, inset));
    const rev = loft([ringAt(small, 0.004), ringAt(big, LIN)], { capStart: false, capEnd: false });
    add("body", part(rev, XMAT.fabric, w.kind === "cabin" ? C("#f1ede5") : cCock, INSIDE));
  }
  const crossSection = (z, inset, yMin) => {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const p = ringPt(z, -Math.PI / 2 + (i / 64) * Math.PI * 2, inset);
      pts.push(new THREE.Vector2(p.x, Math.max(p.y, yMin)));
    }
    return new THREE.Shape(pts);
  };
  const flatAt = (shape, z) => new THREE.ShapeGeometry(shape, 4).applyMatrix4(T(0, 0, z));
  add("body", part(flatAt(crossSection(Z_LIN1, LIN - 0.01, AISLE - 0.01), Z_LIN1), XMAT.fabric, cSide, INSIDE));
  {
    // Lavatory (or baggage) wall at the back of the cabin, with its door.
    const zL = S.cabin.lavZ, dh = Math.min(1.27, TOP - LIN - LEDGE - 0.25);
    add("body", part(flatAt(crossSection(zL, LIN - 0.01, LEDGE), zL), XMAT.wood, (p) => (Math.abs(p.x) < 0.3 && p.y < LEDGE + dh ? cWood : cSide), INSIDE));
    add("body", part(new THREE.BoxGeometry(0.6, dh, 0.02).applyMatrix4(T(0, LEDGE + dh / 2, zL + 0.012)), XMAT.wood, cWood, INSIDE));
    for (const x of [0.3, -0.3]) add("body", part(new THREE.BoxGeometry(0.012, dh, 0.012).applyMatrix4(T(x, LEDGE + dh / 2, zL + 0.024)), MAT.metal, cMetal, INSIDE));
    add("body", part(new THREE.BoxGeometry(0.6, 0.012, 0.012).applyMatrix4(T(0, LEDGE + dh, zL + 0.024)), MAT.metal, cMetal, INSIDE));
    add("body", part(new THREE.BoxGeometry(0.03, 0.12, 0.03).applyMatrix4(T(-0.22, LEDGE + 0.72, zL + 0.035)), MAT.metal, cMetal, INSIDE));
  }

  // ---------------------------------------------------------------- wings
  const WG = S.wing;
  const DIH = WG.dihedral * DEG, SWEEP = WG.sweep * DEG, XT = WG.span;
  const wingY = (x) => WG.y0 + Math.abs(x) * Math.tan(DIH);
  const chordAt = (x) => lerp(WG.rootChord, WG.tipChord, Math.abs(x) / XT);
  const leAt = (x) => WG.le0 - Math.abs(x) * Math.tan(SWEEP);
  const FLAP = WG.flap, AIL = WG.aileron, FCUT = WG.flapCut ?? 0.72, ACUT = WG.aileronCut ?? 0.74;
  for (const side of [1, -1]) {
    const up = V(-side * Math.sin(DIH), Math.cos(DIH), 0);
    const LE = (x) => V(side * x, wingY(x), leAt(x));
    const st = (x0, x1, cuts) => cuts.map(([x, cut]) => ({ t: (x - x0) / (x1 - x0), cut }));
    add("body", part(surface({ rootLE: LE(0), tipLE: LE(XT), rootChord: chordAt(0), tipChord: chordAt(XT), thickness: WG.thickness ?? 0.12, camber: 0.02, up,
      stations: st(0, XT, [[0, 1], [FLAP[0], 1], [FLAP[0], FCUT], [FLAP[1], FCUT], [FLAP[1], 1], [AIL[0], 1], [AIL[0], ACUT], [AIL[1], ACUT], [AIL[1], 1], [XT, 1]]) }), MAT.paint, cWing));
    const hinge = (x, cut) => V(side * x, wingY(x) - 0.012, leAt(x) - cut * chordAt(x));
    const mk = (range, cut, name) => {
      const [x0, x1] = side > 0 ? range : [range[1], range[0]];
      const cs = controlSurface(hinge(x0, cut), hinge(x1, cut), (1 - cut) * chordAt(x0), (1 - cut) * chordAt(x1), 0.06);
      nodes[name] = { parts: [part(cs.geo, MAT.paint, cWing)], translation: cs.translation, rotation: cs.rotation };
    };
    mk(FLAP, FCUT, side > 0 ? "flapL" : "flapR");
    mk(AIL, ACUT, side > 0 ? "ailL" : "ailR");
    const WL = WG.winglet;
    let lightY = wingY(XT) + 0.05, lightX = XT + 0.05;
    if (WL) {
      const wr = LE(XT).add(V(0, -0.01, -0.02)), wt = V(side * (XT + WL.out), wingY(XT) + WL.height, leAt(XT) - WL.back);
      add("body", part(surface({ rootLE: wr, tipLE: wt, rootChord: chordAt(XT) * 0.98, tipChord: WL.tipChord, thickness: 0.1, camber: 0, up: V(side, 0, 0), stations: [{ t: 0 }, { t: 1 }] }), MAT.paint, WL.colour ? C(WL.colour) : cWhite));
      add("body", part(new THREE.SphereGeometry(1, 14, 8).applyMatrix4(new THREE.Matrix4().makeScale(0.07, 0.07, chordAt(XT) * 0.45)).applyMatrix4(T(side * XT, wingY(XT) + 0.02, leAt(XT) - chordAt(XT) * 0.47)), MAT.paint, cWhite));
    } else {
      // Plain rounded tip.
      add("body", part(new THREE.SphereGeometry(1, 16, 8).applyMatrix4(new THREE.Matrix4().makeScale(0.12, chordAt(XT) * 0.06, chordAt(XT) * 0.5)).applyMatrix4(T(side * XT, wingY(XT) + 0.01, leAt(XT) - chordAt(XT) * 0.48)), MAT.paint, cWing));
      lightX = XT + 0.1;
    }
    add("body", part(new THREE.SphereGeometry(0.04, 10, 8).applyMatrix4(T(side * lightX, lightY, leAt(XT) - 0.05)), side > 0 ? MAT.navRed : MAT.navGreen, C("#ffffff"), { noAO: true }));
    add("strobe", part(new THREE.SphereGeometry(0.035, 10, 8).applyMatrix4(T(side * (lightX + 0.01), lightY + 0.07, leAt(XT) - Math.min(0.75, chordAt(XT) * 0.8))), MAT.white, C("#ffffff"), { noAO: true }));
  }
  const superRing = (z, hw, top, bot, e, n = 56) => {
    const yc = (top + bot) / 2, hh = (top - bot) / 2, r = [];
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      r.push(V(Math.sign(c) * Math.abs(c) ** (2 / e) * hw, yc + Math.sign(s) * Math.abs(s) ** (2 / e) * hh, z));
    }
    return r;
  };
  if (S.fairing) add("body", part(smooth(loft(S.fairing.keys.map(([z, hw, bot]) => superRing(z, hw, S.fairing.top, bot, S.fairing.e ?? 2.0)))), XMAT.skin, cWhite));

  // ---------------------------------------------------------------- tail
  const F = S.fin;
  const fin = { rootLE: V(0, ...F.rootLE), tipLE: V(0, ...F.tipLE), rootChord: F.rootChord, tipChord: F.tipChord };
  const RF = F.rudder ?? 0.3;
  const finBand = (p) => (S.finBand && p.y > S.finBand[0] && p.y < S.finBand[1] ? cStripe : S.finColour ? C(S.finColour) : cWhite);
  add("body", part(surface({ rootLE: fin.rootLE, tipLE: fin.tipLE, rootChord: fin.rootChord, tipChord: fin.tipChord, thickness: F.thickness ?? 0.11, camber: 0, up: V(1, 0, 0), stations: [{ t: 0, cut: 1 - RF }, { t: 1, cut: 1 - RF }] }), MAT.paint, finBand));
  {
    const a = fin.rootLE.clone().add(V(0, 0.1, -(1 - RF) * fin.rootChord)), b = fin.tipLE.clone().add(V(0, -0.04, -(1 - RF) * fin.tipChord));
    const cs = controlSurface(a, b, RF * fin.rootChord, RF * fin.tipChord, 0.07);
    nodes.rudder = { parts: [part(cs.geo, MAT.paint, finBand)], translation: cs.translation, rotation: cs.rotation };
  }
  const finLE = (z) => fin.rootLE.y + ((fin.rootLE.z - z) / (fin.rootLE.z - fin.tipLE.z)) * (fin.tipLE.y - fin.rootLE.y);
  if (S.dorsal) {
    const { z0: Z0, z1: Z1, ze: ZE, width = 0.2 } = S.dorsal, rings = [];
    for (let i = 0; i <= 14; i++) {
      const z = lerp(Z0, ZE, i / 14);
      const s = Math.min(1, (Z0 - z) / (Z0 - Z1));
      const top = FUS(z)[1];
      let apex = top + 0.01 + s ** 1.6 * (finLE(Z1) - FUS(Z1)[1]);
      if (z < Z1) apex = finLE(z) - 0.08;
      let wb = 0.05 + width * Math.sqrt(s);
      if (z < Z1) wb = lerp(wb, 0.04, (Z1 - z) / (Z1 - ZE));
      const ring = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; ring.push(V(wb * (1 - t) ** 2.2, lerp(top - 0.04, apex, t), z)); }
      for (let k = 7; k >= 0; k--) ring.push(V(-ring[k].x, ring[k].y, z));
      ring.push(V(0, top - 0.12, z));
      rings.push(ring);
    }
    add("body", part(smooth(loft(rings)), MAT.paint, cWhite));
  }
  if (S.strakes) for (const side of [1, -1]) {
    const { z0, z1 } = S.strakes, y0 = (z) => FUS(z)[2] + 0.03;
    const rootLE = V(side * 0.06, y0(z0), z0), tipLE = V(side * 0.3, y0(z0) - 0.22, z0 - 0.45);
    add("body", part(surface({ rootLE, tipLE, rootChord: z0 - z1, tipChord: 0.42, thickness: 0.06, camber: 0, up: V(Math.cos(0.5), side * Math.sin(0.5), 0).multiplyScalar(side), stations: [{ t: 0 }, { t: 1 }] }), MAT.paint, cWhite));
  }
  // Tailplane: T-tail on top of the fin, cruciform part-way up, or low on the tailcone.
  const HT = S.tailplane, EF = HT.elevator ?? 0.34;
  for (const side of [1, -1]) {
    const rootLE = V(side * (HT.rootX ?? 0.05), HT.y, HT.rootLE), tipLE = V(side * HT.tipX, HT.y + (HT.tipDy ?? -0.04), HT.tipLE);
    add("body", part(surface({ rootLE, tipLE, rootChord: HT.root, tipChord: HT.tip, thickness: 0.1, camber: 0, stations: [{ t: 0, cut: 1 - EF }, { t: 1, cut: 1 - EF }] }), MAT.paint, cWhite));
    const a0 = rootLE.clone().add(V(0, 0, -(1 - EF) * HT.root)), b0 = tipLE.clone().add(V(0, 0, -(1 - EF) * HT.tip));
    const [a, b, ca, cb] = side > 0 ? [a0, b0, EF * HT.root, EF * HT.tip] : [b0, a0, EF * HT.tip, EF * HT.root];
    const cs = controlSurface(a, b, ca, cb, 0.05);
    nodes[side > 0 ? "elevL" : "elevR"] = { parts: [part(cs.geo, MAT.paint, cWhite)], translation: cs.translation, rotation: cs.rotation };
  }
  const tTail = HT.y > finLE(HT.rootLE) - 0.2;
  if (tTail) {
    // Bullet fairing where the tailplane meets the top of the fin.
    const len = HT.root * 1.5, zb = HT.rootLE + 0.35;
    add("body", part(lathe([[0.001, 0], [0.06, len * 0.06], [0.1, len * 0.21], [0.11, len * 0.53], [0.09, len * 0.79], [0.04, len * 0.95], [0.001, len]], 18, T(0, HT.y + 0.02, zb - len)), MAT.paint, cWhite));
    nodes.beacon = { parts: [part(new THREE.SphereGeometry(0.045, 10, 8), MAT.navRed, C("#ffffff"), { noAO: true })], translation: [0, HT.y + 0.14, zb - len * 0.47] };
  } else {
    const zt = fin.tipLE.z - fin.tipChord * 0.4;
    nodes.beacon = { parts: [part(new THREE.SphereGeometry(0.045, 10, 8), MAT.navRed, C("#ffffff"), { noAO: true })], translation: [0, fin.tipLE.y + 0.04, zt] };
  }
  const bz = S.fus[Math.floor(S.fus.length / 2)][0];
  add("beacon", part(new THREE.SphereGeometry(0.04, 10, 8).applyMatrix4(T(0, FUS(bz)[2] - 0.02 - nodes.beacon.translation[1], bz - nodes.beacon.translation[2])), MAT.navRed, C("#ffffff"), { noAO: true }));
  add("body", part(new THREE.SphereGeometry(0.035, 8, 6).applyMatrix4(T(0, centreY(Z_TAIL + 0.05), Z_TAIL - 0.02)), MAT.white, C("#ffffff"), { noAO: true }));

  // ---------------------------------------------------------------- engines
  const nacelleProfile = (r, len) => [[r * 0.64, 0], [r * 0.69, len * 0.02], [r * 0.85, len * 0.16], [r * 0.96, len * 0.4], [r, len * 0.68], [r * 0.99, len * 0.86], [r * 0.92, len * 0.96], [r * 0.85, len * 0.99], [r * 0.78, len]];
  const nacelle = (EX, EY, ZI, LEN, R) => {
    add("body", part(lathe(nacelleProfile(R, LEN), 36, T(EX, EY, ZI - LEN)), XMAT.skin, (p) => (p.z > ZI - 0.12 ? C("#c8ccd1") : S.nacelleColour ? C(S.nacelleColour) : cWhite)));
    add("body", part(lathe([[R * 0.74, LEN * 0.89], [R * 0.77, LEN]], 32, T(EX, EY, ZI - LEN)), XMAT.skin, C("#b8bcc2")));
    add("body", part(new THREE.CircleGeometry(R * 0.74, 32).applyMatrix4(T(EX, EY, ZI - R * 0.72)), MAT.dark, C("#2a2c2f"), { noAO: true }));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      add("body", part(new THREE.BoxGeometry(R * 0.09, R * 0.51, 0.01).applyMatrix4(RZ(a)).applyMatrix4(T(EX + Math.sin(-a) * R * 0.44, EY + Math.cos(a) * R * 0.44, ZI - R * 0.69)), MAT.metal, C("#8e949a"), { noAO: true }));
    }
    add("body", part(lathe([[0.001, R * 0.56], [R * 0.13, R * 0.41], [R * 0.22, R * 0.15], [R * 0.23, 0]], 16, T(EX, EY, ZI - R * 0.74)), MAT.metal, C("#d8dbdf")));
    add("body", part(lathe([[R * 0.62, 0], [R * 0.51, R * 0.31], [R * 0.31, R * 0.77], [0.001, R * 1.08]], 20, new THREE.Matrix4().makeRotationY(Math.PI).premultiply(T(EX, EY, ZI - LEN + R * 0.77))), MAT.dark, C("#3a3c3f")));
  };
  for (const E of S.engines ?? []) {
    for (const side of [1, -1]) {
      const EX = side * E.x;
      nacelle(EX, E.y, E.zi, E.len, E.r);
      if (E.mount === "wing") {
        // Over-the-wing pylon (HondaJet): from the wing's top surface up to the nacelle.
        const wz = E.zi - E.len * 0.55;
        const yw = wingY(E.x) + 0.06;
        add("body", part(surface({ rootLE: V(EX, yw, wz + 0.25), tipLE: V(EX, E.y - E.r * 0.7, wz + 0.15), rootChord: E.len * 0.55, tipChord: E.len * 0.5, thickness: 0.12, camber: 0, up: V(1, 0, 0), stations: [{ t: 0 }, { t: 1 }] }), MAT.paint, cWhite));
      } else {
        const yP = E.y - 0.02;
        add("body", part(surface({ rootLE: V(side * (halfW(E.zi - E.len * 0.47, yP) - 0.08), yP, E.zi - E.len * 0.29), tipLE: V(side * (E.x - E.r * 0.77), yP, E.zi - E.len * 0.32), rootChord: E.len * 0.55, tipChord: E.len * 0.49, thickness: 0.11, camber: 0, stations: [{ t: 0 }, { t: 1 }] }), MAT.paint, cWhite));
      }
    }
  }
  if (S.centreEngine) {
    // Falcon 8X: the third engine sits in the tail; its intake is an S-duct on top of the fuselage
    // in front of the fin, its exhaust at the very end of the tailcone.
    const CE = S.centreEngine;
    const top = (z) => FUS(z)[1];
    const rings = [];
    for (let i = 0; i <= 10; i++) {
      const z = lerp(CE.z0, CE.z1, i / 10);
      const s = Math.sin((i / 10) * Math.PI * 0.5);
      rings.push(superRing(z, CE.w * (0.3 + 0.7 * s), top(z) + CE.h * s, top(z) - 0.3, 2.2, 32));
    }
    add("body", part(smooth(loft(rings, { capStart: true, capEnd: false })), XMAT.skin, cWhite));
    const zf = CE.z0 + 0.02;
    add("body", part(new THREE.CircleGeometry(1, 28).applyMatrix4(new THREE.Matrix4().makeScale(CE.w * 0.85, CE.h * 0.42, 1)).applyMatrix4(T(0, top(zf) + CE.h * 0.5, zf + 0.01)), MAT.dark, C("#2a2c2f"), { noAO: true }));
    add("body", part(lathe([[CE.nozzle * 0.8, 0], [CE.nozzle, 0.3], [CE.nozzle * 0.95, 0.5]], 24, new THREE.Matrix4().makeRotationY(Math.PI).premultiply(T(0, centreY(Z_TAIL), Z_TAIL + 0.45))), MAT.metal, C("#7d8288")));
  }
  if (S.prop) {
    // Turboprop nose: spinner, propeller (spins), the blur disc, exhaust stacks.
    const P = S.prop;
    add("body", part(lathe([[P.spinner, 0], [P.spinner * 0.97, P.spinnerLen * 0.25], [P.spinner * 0.75, P.spinnerLen * 0.6], [P.spinner * 0.35, P.spinnerLen * 0.88], [0.001, P.spinnerLen]], 24, T(0, P.y, P.z)), MAT.paint, C(P.spinnerColour ?? "#ffffff")));
    const parts = [];
    for (let b = 0; b < P.blades; b++) {
      const a = (b / P.blades) * Math.PI * 2;
      const prof = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, r = lerp(P.spinner * 0.8, P.r, t), wdt = lerp(0.2, 0.09, t) * (P.r / 1.3), tw = lerp(0.9, 0.25, t);
        prof.push([V(-wdt / 2 * Math.cos(tw), r, wdt / 2 * Math.sin(tw)), V(wdt / 2 * Math.cos(tw), r, -wdt / 2 * Math.sin(tw)), V(wdt / 2 * Math.cos(tw) + 0.004, r, -wdt / 2 * Math.sin(tw) - 0.012), V(-wdt / 2 * Math.cos(tw) + 0.004, r, wdt / 2 * Math.sin(tw) - 0.012)]);
      }
      const g = loft(prof).applyMatrix4(RZ(a));
      parts.push(part(g, MAT.dark, (p) => (Math.hypot(p.x, p.y) > P.r - 0.12 ? C("#e8e8e8") : C("#26282b"))));
    }
    nodes.prop = { parts, translation: [0, P.y, P.z + 0.05] };
    nodes.propDisc = { parts: [part(new THREE.RingGeometry(P.spinner, P.r, 48, 2), XMAT.blur, (p) => (Math.hypot(p.x, p.y) > P.r - 0.12 ? C("#d8d8d8") : C("#2a2c30")), { noAO: true, noOcclude: true })], translation: [0, P.y, P.z + 0.06] };
    for (const side of [1, -1]) {
      const zE = P.exhaustZ;
      add("body", part(cylinderBetween(V(side * (halfW(zE, P.y) - 0.03), P.y + 0.05, zE), V(side * (halfW(zE, P.y) + 0.1), P.y + 0.02, zE - 0.22), 0.07, 12), MAT.metal, C("#5a5550")));
    }
  }

  // ---------------------------------------------------------------- markings
  const R = S.registration;
  if (R.on === "nacelle") {
    const E = S.engines[0];
    const prof = nacelleProfile(E.r, E.len);
    const nacR = (z) => {
      const u = z - (E.zi - E.len);
      for (let i = 1; i < prof.length; i++) if (u <= prof[i][1]) return lerp(prof[i - 1][0], prof[i][0], (u - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1]));
      return prof[prof.length - 1][0];
    };
    for (const side of [1, -1]) {
      const onNacelle = (z, y) => E.x + Math.sqrt(Math.max(0, nacR(z) ** 2 - (y - E.y) ** 2));
      for (const b of registration(REGISTRATION, side, onNacelle, E.y, E.zi - E.len * 0.53, R.h ?? 0.19)) add("body", part(b, MAT.paint, C("#22262b"), { noAO: true, noOcclude: true }));
    }
  } else {
    for (const side of [1, -1]) for (const b of registration(REGISTRATION, side, halfW, R.y, R.z, R.h)) add("body", part(b, MAT.paint, C("#22262b"), { noAO: true, noOcclude: true }));
  }
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
  if (S.stripe) {
    const SP = S.stripe;
    const base = (z) => SP.y + Math.max(0, SP.riseFrom - z) * SP.rise;
    const taper = (z) => Math.min(1, Math.max(0, (SP.z0 - z) / 0.7));
    const tailTaper = (z) => (SP.taperTo === undefined ? 1 : Math.min(1, Math.max(0, (z - SP.z1) / 0.7)));
    for (const side of [1, -1]) {
      ribbon(side, SP.z0, SP.z1, base, (z) => base(z) + SP.width * taper(z) * tailTaper(z), cStripe);
      if (SP.under !== false) ribbon(side, SP.z0 - 0.1, SP.z1, (z) => base(z) - 0.045 * taper(z + 0.1) * tailTaper(z), (z) => base(z) - 0.02 * taper(z + 0.1) * tailTaper(z), cAccent);
    }
  }
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
  const D = S.door;
  rectSeam(1, D.z0, D.z1, D.y0, D.y1);
  add("body", part(new THREE.BoxGeometry(0.02, 0.03, 0.14).applyMatrix4(T(halfW(D.z0 + 0.1, D.y0 + 0.57) + 0.008, D.y0 + 0.57, D.z0 + 0.12)), MAT.metal, cMetal));
  for (const ex of S.exits ?? []) rectSeam(ex.side, ex.z0, ex.z1, ex.y0, ex.y1);
  for (const [z, h] of S.antennas ?? []) add("body", part(new THREE.BoxGeometry(0.012, h, 0.12).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.35)).applyMatrix4(T(0, FUS(z)[1] + h / 2 - 0.02, z)), MAT.dark, C("#2b2d30")));
  if (S.pitot) for (const side of [1, -1]) { const [z, y] = S.pitot; add("body", part(cylinderBetween(V(side * halfW(z, y), y, z), V(side * (halfW(z, y) + 0.09), y, z + 0.12), 0.01, 6), MAT.metal, cMetal)); }

  // ---------------------------------------------------------------- landing gear
  const tyre = (Rr, w) => {
    const prof = [[Rr * 0.55, -w / 2], [Rr * 0.86, -w / 2], [Rr * 0.97, -w * 0.36], [Rr, -w * 0.15], [Rr, w * 0.15], [Rr * 0.97, w * 0.36], [Rr * 0.86, w / 2], [Rr * 0.55, w / 2]];
    return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28).applyMatrix4(RZ(-Math.PI / 2));
  };
  const wheelParts = (Rr, w, offsets = [0]) => {
    const parts = [];
    for (const ox of offsets) {
      parts.push(part(tyre(Rr, w).applyMatrix4(T(ox, 0, 0)), MAT.rubber, cTyre), part(new THREE.CylinderGeometry(Rr * 0.56, Rr * 0.56, w * 0.86, 22).applyMatrix4(RZ(-Math.PI / 2)).applyMatrix4(T(ox, 0, 0)), MAT.metal, C("#c5c9ce")));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        for (const sx of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(Rr * 0.08, Rr * 0.08, 0.02, 8).applyMatrix4(RZ(-Math.PI / 2)).applyMatrix4(T(ox + sx * w * 0.44, Math.cos(a) * Rr * 0.33, Math.sin(a) * Rr * 0.33)), MAT.dark, cBlack));
      }
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
  const G = S.gear;
  {
    const MR = G.mainR, MW = G.mainW, gx = G.mainX, gz = G.mainZ ?? 0;
    const dual = G.mainDual ? [-(MW * 0.55), MW * 0.55] : [0];
    for (const side of [1, -1]) {
      const name = side > 0 ? "gearL" : "gearR";
      const P = V(side * gx, G.pivotY, gz + 0.12), K = V(side * gx, MR - LIFT + 0.13, gz + 0.13), A = V(side * gx, MR - LIFT, gz), Wc = V(side * (gx + (G.mainDual ? 0 : 0.14)), MR - LIFT, gz);
      const u = Wc.clone().sub(P).normalize();
      const w = V(-side, 0.06, 0).normalize();
      const axis = u.clone().cross(w).normalize();
      rig.retractDeg[name] = +((Math.acos(u.dot(w)) * 180) / Math.PI).toFixed(1);
      const legR = G.legR ?? 0.05;
      const parts = [
        part(cylinderBetween(P, K, legR, 12), MAT.metal, C("#c9cdd2")),
        part(cylinderBetween(P.clone().lerp(K, 0.55), K, legR * 0.72, 12), MAT.metal, C("#eef0f2")),
        part(cylinderBetween(K, A, legR * 0.68, 10), MAT.metal, cMetal),
        part(new THREE.BoxGeometry(0.02, (G.pivotY - MR + LIFT) * 0.62, 0.3 * (MR / 0.27)).applyMatrix4(T(side * (gx + 0.07 + (G.mainDual ? MW * 0.9 : 0)), (G.pivotY + MR - LIFT) / 2 + 0.05, gz + 0.13)), XMAT.skin, cWing),
      ];
      if (!G.mainDual) parts.push(part(cylinderBetween(A.clone().add(V(-side * 0.02, 0, 0)), Wc, 0.025, 8), MAT.metal, cMetal));
      else parts.push(part(cylinderBetween(A.clone().add(V(-MW * 1.1, 0, 0)), A.clone().add(V(MW * 1.1, 0, 0)), 0.03, 8), MAT.metal, cMetal));
      nodes[name] = asNode(parts, P, axis, u.clone().negate(), { moving: true });
      const wn = side > 0 ? "wheelL" : "wheelR";
      nodes[wn] = adopt(name, { parts: wheelParts(MR, MW, dual), translation: [Wc.x, Wc.y, Wc.z], rotation: [0, 0, 0, 1] });
      rig.wheelRadius[wn] = MR;
    }
  }
  {
    const NR = G.noseR, NW = G.noseW, nz = G.noseZ, py = G.nosePivotY ?? 0.8;
    const P = V(0, py, nz + 0.05), Wn = V(0, NR - LIFT, nz - 0.02), Fk = NR - LIFT + 0.16;
    const parts = [
      part(cylinderBetween(P, V(0, Fk + 0.06, nz + 0.02), 0.045, 12), MAT.metal, C("#c9cdd2")),
      part(cylinderBetween(V(0, Fk + 0.2, nz + 0.02), V(0, Fk - 0.03, nz), 0.032, 12), MAT.metal, C("#eef0f2")),
      part(cylinderBetween(V(0.1, Fk, nz), V(0.1, Wn.y, Wn.z), 0.022, 8), MAT.metal, cMetal),
      part(cylinderBetween(V(-0.1, Fk, nz), V(-0.1, Wn.y, Wn.z), 0.022, 8), MAT.metal, cMetal),
      part(new THREE.BoxGeometry(0.22, 0.04, 0.07).applyMatrix4(T(0, Fk, nz)), MAT.metal, cMetal),
      part(cylinderBetween(V(0, py - 0.04, nz - 0.4), V(0, Fk + 0.25, nz), 0.02, 8), MAT.metal, cMetal),
      part(new THREE.SphereGeometry(0.045, 10, 8).applyMatrix4(T(0, Fk + 0.3, nz + 0.09)), MAT.white, C("#ffffff"), { noAO: true }),
    ];
    nodes.gearN = asNode(parts, P, V(-1, 0, 0), V(0, 1, 0), { moving: true });
    rig.retractDeg.gearN = G.noseRetract ?? 95;
    nodes.wheelN = adopt("gearN", { parts: wheelParts(NR, NW, G.noseDual ? [-NW * 0.6, NW * 0.6] : [0]), translation: [Wn.x, Wn.y, Wn.z], rotation: [0, 0, 0, 1] });
    rig.wheelRadius.wheelN = NR;
    const doors = [];
    for (const side of [1, -1]) doors.push(part(new THREE.BoxGeometry(0.015, 0.3, 0.72).applyMatrix4(new THREE.Matrix4().compose(V(side * 0.15, FUS(nz)[2] - 0.1, nz + 0.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.12)), V(1, 1, 1))), XMAT.skin, cWhite));
    nodes.gearDoors = { parts: doors, moving: true };
  }

  // ---------------------------------------------------------------- inside
  const box = (w, h, d, x, y, z, rx = 0, ry = 0) => new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), V(1, 1, 1)));
  const pad = (w, h, d, m, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)).applyMatrix4(m);
  const at = (x, y, z, rx = 0, ry = 0) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, "YXZ")), V(1, 1, 1));

  const CK = S.cockpit, PZ = CK.panelZ, CX = CK.seatX;
  // The cabin floor runs from the cockpit bulkhead back until the belly starts to rise into it.
  let floorEnd = S.cabin.lavZ;
  while (floorEnd > Z_LIN1 + 0.05 && FUS(floorEnd - 0.05)[2] < AISLE - 0.22) floorEnd -= 0.05;
  const cabinLen = CK.bulkheadZ - floorEnd, cabinMid = (CK.bulkheadZ + floorEnd) / 2;
  const floorHalf = Math.min(halfW(cabinMid, AISLE - 0.02), halfW(CK.bulkheadZ, AISLE - 0.02), halfW(floorEnd, AISLE - 0.02), halfW(floorEnd, LEDGE)) - LIN;
  // Floors: cockpit, the aisle, and raised side ledges (where the cabin has a dropped aisle).
  { const fy = LEDGE - (CK.floorDrop ?? 0.03) - 0.02; add("body", part(box(2 * (Math.min(halfW(PZ, fy - 0.02), halfW(CK.bulkheadZ, fy - 0.02)) - 0.08), 0.04, PZ - CK.bulkheadZ, 0, fy, (PZ + CK.bulkheadZ) / 2), XMAT.fabric, cCarpet, INSIDE)); }
  const aisleHalf = S.cabin.aisleHalf ?? 0.38;
  add("body", part(box(2 * aisleHalf, 0.04, cabinLen, 0, AISLE - 0.02, cabinMid), XMAT.fabric, cCarpet, INSIDE));
  if (AISLE < LEDGE - 0.01) for (const side of [1, -1]) {
    const w = floorHalf - aisleHalf;
    add("body", part(box(w, LEDGE - AISLE + 0.01, cabinLen, side * (aisleHalf + w / 2), (LEDGE + AISLE) / 2 - 0.005, cabinMid), XMAT.fabric, C("#4e4842"), INSIDE));
    add("body", part(box(0.012, 0.012, cabinLen, side * (aisleHalf + 0.005), LEDGE - 0.005, cabinMid), MAT.metal, cMetal, INSIDE));
  } else for (const side of [1, -1]) {
    const w = floorHalf - aisleHalf;
    add("body", part(box(w, 0.04, cabinLen, side * (aisleHalf + w / 2), LEDGE - 0.02, cabinMid), XMAT.fabric, cCarpet, INSIDE));
  }

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
  // Cabin seats: rows of a seat each side (facing forward or aft), tables between facing pairs,
  // a polished side shelf under the windows (the outboard armrest), a divan if the spec has one.
  const CB = S.cabin, SW = CB.seatWidth ?? 0.46;
  const wallAt = (z) => halfW(z, LEDGE + 0.645) - LIN;
  const SX = CB.seatX ?? Math.min(wallAt(cabinMid) - 0.355, halfW(cabinMid, LEDGE + 0.04) - LIN - SW / 2 - 0.09);
  for (const row of CB.rows) for (const side of [1, -1]) {
    if (row.sides && !row.sides.includes(side)) continue;
    const aft = row.facing === "aft";
    seat(at(side * SX, LEDGE, row.z, 0, aft ? Math.PI : 0), { width: SW, arms: [aft ? side : -side] });
  }
  for (const tz of CB.tables ?? []) for (const side of [1, -1]) {
    add("body", part(pad(0.4, 0.03, 0.56, at(side * (SX + 0.07), LEDGE + 0.67, tz), 0.012), XMAT.wood, cWood, INSIDE));
    add("body", part(cylinderBetween(V(side * (SX - 0.01), LEDGE, tz), V(side * (SX - 0.01), LEDGE + 0.66, tz), 0.018, 10), MAT.metal, cMetal, INSIDE));
  }
  if (CB.divan) {
    const { z0, z1, side } = CB.divan, x = side * (wallAt((z0 + z1) / 2) - 0.3);
    add("body", part(pad(0.55, 0.14, z1 - z0, at(x, LEDGE + 0.36, (z0 + z1) / 2), 0.04), XMAT.leather, cLeather, INSIDE));
    add("body", part(pad(0.14, 0.5, z1 - z0, at(x + side * 0.22, LEDGE + 0.62, (z0 + z1) / 2, 0, 0), 0.05), XMAT.leather, cLeather, INSIDE));
    add("body", part(box(0.5, 0.29, z1 - z0 - 0.04, x, LEDGE + 0.145, (z0 + z1) / 2), MAT.dark, C("#38342f"), INSIDE));
  }
  for (const side of [1, -1]) {
    const z0 = Z_LIN1 + 0.68, z1 = (side > 0 ? D.z0 : CB.galleyZ - 0.32) - 0.1;
    const wallX = wallAt(cabinMid);
    add("body", part(pad(0.13, 0.045, z1 - z0, at(side * (wallX - 0.05), LEDGE + 0.645, (z0 + z1) / 2), 0.015), XMAT.wood, cWood, INSIDE));
    add("body", part(box(0.01, 0.06, z1 - z0 - 0.02, side * (wallX - 0.115), LEDGE + 0.6, (z0 + z1) / 2), XMAT.wood, C("#4a2e1a"), INSIDE));
  }
  {
    const zc = cabinMid, len = cabinLen - 0.9, yTop = TOP - LIN;
    add("body", part(pad(0.42, 0.05, len, at(0, yTop - 0.03, zc), 0.02), XMAT.fabric, C("#d9d3c6"), INSIDE));
    for (const sx of [-1, 1]) add("body", part(box(0.012, 0.008, len - 0.1, sx * 0.23, yTop - 0.045, zc), MAT.white, C("#ffffff"), { noAO: true, noOcclude: true }));
    for (const z of W.left) for (const sx of [-1, 1]) add("body", part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 14).applyMatrix4(T(sx * 0.15, yTop - 0.058, z)), MAT.metal, cMetal, INSIDE));
  }
  // Refreshment centre opposite the airstair door.
  {
    const gz = CB.galleyZ, wl = Math.min(wallAt(gz), halfW(gz + 0.3, LEDGE) - LIN, halfW(gz - 0.3, LEDGE) - LIN), gw = Math.min(0.34, wl - aisleHalf - 0.03), gx = -(wl - gw / 2 - 0.02);
    add("body", part(box(gw, 0.84, 0.6, gx, LEDGE + 0.42, gz), XMAT.wood, cWood, INSIDE));
    add("body", part(box(gw + 0.04, 0.03, 0.62, gx - 0.02, LEDGE + 0.855, gz), XMAT.wood, C("#e8e2d4"), INSIDE));
    for (const y of [LEDGE + 0.34, LEDGE + 0.56]) add("body", part(box(0.012, 0.012, 0.52, gx + gw / 2 + 0.005, y, gz), MAT.metal, cMetal, INSIDE));
  }
  for (const side of [1, -1]) {
    const bx = halfW(CK.bulkheadZ, LEDGE + 0.67) - LIN - 0.1;
    add("body", part(box(0.16, Math.min(1.0, TOP - LIN - LEDGE - 0.12), 0.06, side * (bx - 0.06), LEDGE + 0.67, CK.bulkheadZ), XMAT.fabric, cSide, INSIDE));
  }

  // Cockpit: two pilot seats, the panel with three big screens, glareshield, pedestal, wheels
  // (or side-sticks), rudder pedals.
  const FY = LEDGE - (CK.floorDrop ?? 0.03); // cockpit floor (often a step below the cabin's)
  for (const side of [1, -1]) seat(at(side * CX, FY, PZ - 0.72), { width: 0.5, colour: cPilotSeat, trim: C("#3f4246"), rec: 0.2, backLen: 0.68 });
  const panelW = 2 * (halfW(PZ, FY + 0.65) - 0.06), gsW = 2 * (halfW(PZ + 0.1, FY + 0.94) - 0.07);
  add("body", part(box(panelW, 0.54, 0.08, 0, FY + 0.65, PZ + 0.04), MAT.dark, C("#2a2d31"), INSIDE));
  add("body", part(box(gsW, 0.05, 0.28, 0, FY + 0.94, PZ + 0.1), MAT.dark, cBlack, INSIDE));
  const D0 = PZ - 0.008;
  const disp = (w, h, x, y, dz, c) => add("body", part(box(w, h, 0.002, x, y, D0 - dz), XMAT.display, C(c), { noAO: true, noOcclude: true }));
  const dispR = (w, h, x, y, dz, c, rz) => add("body", part(new THREE.BoxGeometry(w, h, 0.002).applyMatrix4(RZ(rz)).applyMatrix4(T(x, y, D0 - dz)), XMAT.display, C(c), { noAO: true, noOcclude: true }));
  const DSW = 0.3, DSH = 0.2, SCY = FY + 0.74;
  const bezel = (x) => add("body", part(box(DSW + 0.03, DSH + 0.06, 0.01, x, SCY, PZ - 0.002), MAT.dark, C("#101215"), { noAO: true }));
  const pfd = (x, node) => {
    bezel(x);
    disp(DSW, DSH, x, SCY, 0, "#05070a");
    const ax = x, ay = SCY + 0.01, HWb = 0.075, HHb = 0.07, Rb = 0.112;
    const ball = [];
    const flat = (g, c) => ball.push(part(g, XMAT.display, C(c), { noAO: true, noOcclude: true }));
    flat(new THREE.CircleGeometry(Rb, 40, 0, Math.PI), "#2a7fe0");
    flat(new THREE.CircleGeometry(Rb, 40, Math.PI, Math.PI), "#9a5a22");
    flat(new THREE.BoxGeometry(2 * Rb, 0.0025, 0.001).applyMatrix4(T(0, 0, -0.0005)), "#ffffff");
    for (const [dy, len] of [[0.018, 0.022], [0.036, 0.045], [0.054, 0.022], [0.072, 0.045], [-0.018, 0.022], [-0.036, 0.045], [-0.054, 0.022]]) flat(new THREE.BoxGeometry(len, 0.0016, 0.001).applyMatrix4(T(0, dy, -0.0005)), "#ffffff");
    nodes[node] = { parts: ball, translation: [ax, ay, D0 - 0.002] };
    const mask = new THREE.Shape([new THREE.Vector2(-(DSW + 0.03) / 2, -(DSH + 0.06) / 2), new THREE.Vector2((DSW + 0.03) / 2, -(DSH + 0.06) / 2), new THREE.Vector2((DSW + 0.03) / 2, (DSH + 0.06) / 2), new THREE.Vector2(-(DSW + 0.03) / 2, (DSH + 0.06) / 2)]);
    mask.holes.push(new THREE.Path([new THREE.Vector2(-HWb, 0.01 - HHb), new THREE.Vector2(-HWb, 0.01 + HHb), new THREE.Vector2(HWb, 0.01 + HHb), new THREE.Vector2(HWb, 0.01 - HHb)]));
    add("body", part(new THREE.ShapeGeometry(mask).applyMatrix4(T(x, SCY, D0 - 0.004)), MAT.dark, C("#07090c"), { noAO: true, noOcclude: true }));
    for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
      const t = (a * Math.PI) / 180, rr = 0.064;
      dispR(0.0018, Math.abs(a) % 30 === 0 ? 0.01 : 0.006, ax + Math.sin(t) * rr, ay + Math.cos(t) * rr, 0.005, "#ffffff", -t);
    }
    for (const sx of [-1, 1]) {
      dispR(0.03, 0.004, ax + sx * 0.016, ay - 0.006, 0.006, "#f5c518", sx * 0.45);
      disp(0.018, 0.004, ax + sx * 0.058, ay, 0.006, "#f5c518");
    }
    disp(0.004, 0.004, ax, ay, 0.007, "#f5c518");
    for (const sx of [-1, 1]) {
      const tx = x + sx * 0.108;
      disp(0.04, 0.15, tx, ay, 0.005, "#2b3038");
      for (let k = -6; k <= 6; k++) disp(k % 2 ? 0.006 : 0.011, 0.0014, tx - sx * 0.016, ay + k * 0.011, 0.006, "#d9dde3");
      disp(0.042, 0.018, tx, ay, 0.007, "#000000");
      disp(0.03, 0.006, tx, ay, 0.008, "#ffffff");
    }
    disp(0.008, 0.11, x + 0.139, ay, 0.005, "#2b3038");
    disp(0.15, 0.03, x, SCY - 0.085, 0.005, "#1d2128");
    for (let k = -6; k <= 6; k++) disp(0.0014, k % 3 ? 0.005 : 0.01, x + k * 0.011, SCY - 0.077, 0.006, "#d9dde3");
    disp(0.008, 0.006, x + 0.02, SCY - 0.072, 0.007, "#e040d8");
    for (const [dx, w, c] of [[-0.11, 0.04, "#3fd46b"], [-0.055, 0.035, "#e040d8"], [0.03, 0.05, "#45c6e8"], [0.1, 0.03, "#ffffff"]]) disp(w, 0.007, x + dx, SCY + 0.09, 0.006, c);
  };
  const mfd = (x) => {
    bezel(x);
    disp(DSW, DSH, x, SCY, 0, "#08111f");
    const mx = x + 0.03;
    for (const [dx, dy, w, h, c] of [[-0.06, 0.04, 0.12, 0.09, "#2e6a3a"], [0.04, 0.05, 0.1, 0.08, "#3f7d46"], [-0.02, -0.04, 0.14, 0.08, "#5a7a3a"], [0.07, -0.05, 0.08, 0.07, "#7a6d3c"], [0.0, 0.0, 0.05, 0.03, "#2a5c9a"], [-0.08, -0.06, 0.04, 0.05, "#2a5c9a"]]) disp(w, h, mx + dx, SCY + dy, 0.004, c);
    for (const rr of [0.045, 0.085]) add("body", part(new THREE.TorusGeometry(rr, 0.0011, 4, 48).applyMatrix4(T(mx, SCY - 0.04, D0 - 0.007)), XMAT.display, C("#e8ecf2"), { noAO: true, noOcclude: true }));
    dispR(0.16, 0.003, mx + 0.03, SCY + 0.005, 0.008, "#e040d8", 0.55);
    add("body", part(new THREE.CircleGeometry(0.01, 3).applyMatrix4(RZ(Math.PI / 2)).applyMatrix4(new THREE.Matrix4().makeScale(0.8, 1.3, 1)).applyMatrix4(T(mx, SCY - 0.04, D0 - 0.009)), XMAT.display, C("#ffffff"), { noAO: true, noOcclude: true }));
    for (const [dx, dy] of [[-0.05, 0.07], [0.07, 0.03], [0.02, -0.075]]) disp(0.022, 0.006, mx + dx, SCY + dy, 0.008, "#e8ecf2");
    disp(0.07, DSH, x - 0.115, SCY, 0.003, "#0e1218");
    const nEng = (S.engines?.length ? 2 : 1) + (S.centreEngine ? 1 : 0);
    for (let k = 0; k < nEng; k++) {
      const bx = x - 0.115 + (k - (nEng - 1) / 2) * 0.022;
      disp(0.012, 0.09, bx, SCY + 0.035, 0.004, "#262c34");
      disp(0.012, 0.068, bx, SCY + 0.024, 0.005, "#3fd46b");
      disp(0.018, 0.003, bx, SCY + 0.058, 0.006, "#ffffff");
      disp(0.012, 0.035, bx, SCY - 0.05, 0.004, "#262c34");
      disp(0.012, 0.026, bx, SCY - 0.054, 0.005, "#45c6e8");
    }
  };
  const screenX = CK.screenX ?? CX * 1.055;
  pfd(screenX, "attBall");
  mfd(0);
  pfd(-screenX, "attBall2");
  if (CK.extraScreens) for (const sx of [-1, 1]) { const x = sx * screenX * 2; if (halfW(PZ, SCY) - 0.12 > Math.abs(x) + DSW / 2) mfd(x); }
  add("body", part(box(0.18, 0.42, 0.55, 0, FY + 0.21, PZ - 0.29), MAT.dark, C("#2a2d31"), INSIDE));
  for (const x of [0.03, -0.03].concat(S.centreEngine ? [0] : [])) {
    add("body", part(cylinderBetween(V(x, FY + 0.42, PZ - 0.26), V(x, FY + 0.54, PZ - 0.32), 0.008, 6), MAT.metal, cMetal, INSIDE));
    add("body", part(box(0.04, 0.03, 0.05, x, FY + 0.55, PZ - 0.32), MAT.dark, C("#1c1e21"), INSIDE));
  }
  for (const x of [0.07, -0.07]) {
    const tilt = new THREE.Matrix4().compose(V(x, FY + 0.422, PZ - 0.54), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), V(1, 1, 1));
    add("body", part(new THREE.BoxGeometry(0.09, 0.006, 0.13).applyMatrix4(tilt), XMAT.display, C("#0b1220"), { noAO: true }));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const g = new THREE.BoxGeometry(0.022, 0.002, 0.02).applyMatrix4(T(-0.026 + c * 0.026, 0.0035, -0.04 + r * 0.026)).applyMatrix4(tilt);
      add("body", part(g, XMAT.display, C(r === 0 ? "#2f8fd8" : "#5a6472"), { noAO: true, noOcclude: true }));
    }
  }
  for (const side of [1, -1]) {
    const x = side * CX * 1.055;
    if (CK.sidestick) {
      // Side-stick on the outboard console (Falcon 8X and Gulfstreams have them).
      const sx = side * (Math.min(halfW(PZ - 0.7, FY + 0.6), halfW(PZ - 0.95, FY + 0.1), halfW(PZ - 0.25, FY + 0.1)) - 0.12);
      add("body", part(box(0.14, 0.5, 0.7, sx, FY + 0.35, PZ - 0.6), MAT.dark, C("#2a2d31"), INSIDE));
      add("body", part(cylinderBetween(V(sx, FY + 0.6, PZ - 0.55), V(sx, FY + 0.76, PZ - 0.57), 0.018, 10), MAT.dark, cBlack, INSIDE));
      add("body", part(new THREE.SphereGeometry(0.03, 12, 8).applyMatrix4(new THREE.Matrix4().makeScale(1, 1.5, 1.1)).applyMatrix4(T(sx, FY + 0.79, PZ - 0.57)), MAT.dark, cBlack, INSIDE));
    } else {
      add("body", part(cylinderBetween(V(x, FY + 0.41, PZ), V(x, FY + 0.45, PZ - 0.32), 0.02, 10), MAT.dark, C("#2a2c2f"), INSIDE));
      add("body", part(box(0.08, 0.07, 0.05, x, FY + 0.46, PZ - 0.33), MAT.dark, cBlack, INSIDE));
      add("body", part(cylinderBetween(V(x - 0.13, FY + 0.46, PZ - 0.34), V(x + 0.13, FY + 0.46, PZ - 0.34), 0.016, 10), MAT.dark, cBlack, INSIDE));
      for (const s of [-1, 1]) add("body", part(cylinderBetween(V(x + s * 0.13, FY + 0.46, PZ - 0.34), V(x + s * 0.15, FY + 0.58, PZ - 0.34), 0.02, 10), MAT.dark, cBlack, INSIDE));
    }
    for (const s of [-1, 1]) add("body", part(box(0.08, 0.14, 0.02, x + s * 0.09, FY + 0.09, PZ - 0.04, -0.5), MAT.metal, C("#5c6066"), INSIDE));
  }

  // The pilot, in the left seat.
  {
    const pp = [];
    const cShirt = C("#f2f2f0"), cTrousers = C("#25303f"), cSkin = C("#d9a77f"), cHair = C("#3b2a1e"), cHeadset = C("#24262a");
    const limb = (a, b, r, c) => pp.push(part(cylinderBetween(a, b, r, 10), XMAT.fabric, c, INSIDE));
    const ball = (p, r, c, mat = XMAT.fabric) => pp.push(part(new THREE.SphereGeometry(r, 14, 10).applyMatrix4(T(p.x, p.y, p.z)), mat, c, INSIDE));
    const x = CX, fy = FY, fz = PZ - 0.72;
    pp.push(part(new THREE.SphereGeometry(1, 16, 12).applyMatrix4(new THREE.Matrix4().compose(V(x, fy + 0.72, fz - 0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22, 0, 0)), V(0.19, 0.27, 0.12))), XMAT.fabric, cShirt, INSIDE));
    const head = V(x, fy + 1.12, fz - 0.15);
    limb(V(x, fy + 0.9, fz - 0.1), head.clone().add(V(0, -0.06, 0.01)), 0.045, cSkin);
    ball(head, 0.1, cSkin);
    pp.push(part(new THREE.SphereGeometry(0.104, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45).applyMatrix4(new THREE.Matrix4().compose(head.clone().add(V(0, 0.005, -0.012)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), V(1, 1, 1))), XMAT.fabric, cHair, INSIDE));
    for (const s of [-1, 1]) ball(head.clone().add(V(s * 0.1, -0.01, 0)), 0.04, cHeadset, MAT.dark);
    pp.push(part(new THREE.TorusGeometry(0.105, 0.012, 6, 16, Math.PI).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)).applyMatrix4(T(head.x, head.y + 0.005, head.z)), MAT.dark, cHeadset, INSIDE));
    pp.push(part(cylinderBetween(head.clone().add(V(0.1, -0.03, 0.02)), head.clone().add(V(0.03, -0.07, 0.1)), 0.006, 6), MAT.dark, cHeadset, INSIDE));
    for (const s of [-1, 1]) {
      const handAt = CK.sidestick && s > 0 ? V(Math.min(halfW(PZ - 0.7, FY + 0.6), halfW(PZ - 0.95, FY + 0.1), halfW(PZ - 0.25, FY + 0.1)) - 0.12, FY + 0.8, PZ - 0.57) : V(x * 1.055 + s * 0.14 - (x * 1.055 - x), FY + 0.52, PZ - 0.34);
      const sh = V(x + s * 0.18, fy + 0.88, fz - 0.08), el = V(x + s * 0.21, fy + 0.62, fz + 0.2);
      limb(sh, el, 0.042, cShirt);
      limb(el, handAt, 0.036, cSkin);
      ball(handAt, 0.035, cSkin);
      const hip = V(x + s * 0.09, fy + 0.5, fz - 0.03), knee = V(x + s * 0.11, fy + 0.55, fz + 0.38), foot = V(x + s * 0.1, FY + 0.09, PZ - 0.08);
      limb(hip, knee, 0.065, cTrousers);
      ball(knee, 0.063, cTrousers);
      limb(knee, foot, 0.05, cTrousers);
      pp.push(part(new THREE.BoxGeometry(0.09, 0.07, 0.2).applyMatrix4(T(foot.x, foot.y - 0.02, foot.z - 0.04)), MAT.dark, C("#1b1b1d"), INSIDE));
    }
    nodes.pilot = { parts: pp };
  }

  rig.eye = [CX, FY + 1.16, PZ - 0.79];
  const we = CB.windowSeat;
  rig.windowEye = [SX - 0.01, LEDGE + 1.14, we];
  rig.fov = S.fov ?? 80;
  rig.eyePitch = 9;
  // Quality check: nothing inside the cabin may poke out through the skin.
  {
    const bad = [];
    for (const [name, node] of Object.entries(nodes)) {
      if (name !== "body" && name !== "pilot") continue;
      node.parts.forEach((pt, i) => {
        if (pt.aoStrength === undefined) return;
        const pos = pt.geo.attributes.position;
        let worst = 0, atp = null;
        for (let k = 0; k < pos.count; k++) {
          const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
          if (z > Z_NOSE || z < Z_TAIL) continue;
          const [, top, bot] = FUS(z);
          const over = y > top || y < bot ? 0.05 : Math.abs(x) - halfW(z, y);
          if (over > worst) { worst = over; atp = [x, y, z]; }
        }
        if (worst > 0.002) bad.push(`${name}#${i} sticks out ${(worst * 100).toFixed(1)} cm at (${atp.map((v) => v.toFixed(2)).join(", ")})`);
      });
    }
    if (bad.length) console.warn(`${ac.id}: interior parts outside the skin:\n  ` + bad.slice(0, 12).join("\n  "));
  }
  for (const node of Object.values(nodes)) {
    if (node.parent) continue;
    if (node.translation) node.translation = [node.translation[0], node.translation[1] + LIFT, node.translation[2]];
    else for (const pt of node.parts) pt.geo.applyMatrix4(T(0, LIFT, 0));
  }
  rig.eye[1] += LIFT;
  rig.windowEye[1] += LIFT;
  return { nodes, extraMaterials, rig };
}
