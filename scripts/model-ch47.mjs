// The Boeing CH-47 Chinook (CH-47F), built from its published dimensions (metres) and checked
// against side-on photographs: fuselage 15.9 m long, two 18.3 m three-blade rotors 11.9 m apart,
// 5.8 m tall at the rear rotor head; a boxy cabin 9.3 m long, 2.3 m wide at the floor and 2.0 m
// tall, with a loading ramp under the tail; long fuel pods along the lower sides; four-post
// landing gear (twin wheels in front, single castoring wheels behind); two turboshaft engines
// on the sides of the tall rear pylon. Round bubble windows are real openings in the skin, so
// the troop seats are seen from outside and the world from inside.
//
// glTF conventions (same as build-models.mjs): +Y up, nose toward +Z, left side toward +X,
// origin on the ground between the four wheels.
//
// Nodes the game animates (src/game/planeView.ts):
//   rotorF rotorR    the rotors: spin about their local Y (front one way, rear the other)
//   attBall attBall2 the two pilots' attitude displays
//   beacon           blinks
//   pilot canopy     hidden when the camera is inside (rig.eye, rig.windowEye)

import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function buildCh47(ac, kit) {
  const { THREE, V, C, T, RY, RZ, MAT, MATERIALS, part, curve, cylinderBetween, registration, REGISTRATION, lathe } = kit;
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const X0 = MATERIALS.length;
  const XMAT = { glass: X0, fabric: X0 + 1, display: X0 + 2, skin: X0 + 3, quilt: X0 + 4 };
  const extraMaterials = [
    { name: "cabinGlass", pbrMetallicRoughness: { baseColorFactor: [0.3, 0.38, 0.46, 0.35], metallicFactor: 0.85, roughnessFactor: 0.04 }, alphaMode: "BLEND", doubleSided: true },
    { name: "fabric", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 }, doubleSided: true },
    { name: "display", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, extensions: { KHR_materials_unlit: {} }, doubleSided: true },
    // Matt military paint, two-sided (from inside you see the back of the skin around the glass).
    { name: "skin", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.05, roughnessFactor: 0.62 }, doubleSided: true },
    // The silvery quilted insulation that lines the cabin.
    { name: "quilt", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.3, roughnessFactor: 0.6 }, doubleSided: true },
  ];

  const nodes = {};
  const add = (node, pt) => (nodes[node] ??= { parts: [] }).parts.push(pt);
  const rig = { retractDeg: {}, wheelRadius: {} };
  const INSIDE = { aoStrength: 0.4 };

  // ---- colours
  const cBody = C(ac.livery.body).lerp(C("#4a4e43"), 0.25), cDark = C(ac.livery.accent), cTip = C(ac.livery.stripe);
  const cBlade = C("#2a2d2e"), cHub = C("#3a3e3f"), cMetal = C("#8b9196"), cTyre = C("#1c1d1f"), cRubber = C("#252822");
  const cQuilt = C("#a6aa9e"), cFrame = C("#666d5e"), cFloor = C("#727670"), cTread = C("#41443f"), cSeatRed = C("#a8322a"), cSeatRedDk = C("#7d2620"), cTube = C("#aab0b4");
  const cCock = C("#3a3e3b"), cPanel = C("#26292a"), cBlack = C("#121314"), cCrewSeat = C("#4f5547"), cCushion = C("#2e3230"), cExhaust = C("#b39d68");

  // ---------------------------------------------------------------- fuselage
  // Cross-sections [z, half width, top, waist, bottom, top squareness, bottom squareness]: a rounded
  // box (squarer at the bottom), the waist being where the sides are widest. The nose narrows and
  // drops to the radome under a steep windshield; aft, the belly sweeps up into the loading ramp
  // and the tail closes in a rounded bulge.
  const FUS = curve([
    [8.0, 0.05, 1.4, 1.35, 1.3, 2.2, 2.2],
    [7.96, 0.38, 1.55, 1.38, 1.12, 2.3, 2.3],
    [7.85, 0.66, 1.67, 1.42, 0.96, 2.5, 2.6],
    [7.62, 0.92, 1.8, 1.48, 0.82, 2.7, 3.0],
    [7.3, 1.1, 2.22, 1.56, 0.72, 3.0, 3.8],
    [7.0, 1.21, 2.66, 1.64, 0.66, 3.2, 4.6],
    [6.8, 1.27, 2.93, 1.7, 0.62, 3.4, 5.2],
    [6.5, 1.32, 3.06, 1.78, 0.58, 3.6, 6.0],
    [6.0, 1.355, 3.16, 1.86, 0.53, 3.8, 7.0],
    [5.4, 1.37, 3.27, 1.9, 0.5, 4.0, 8.0],
    [5.0, 1.37, 3.3, 1.9, 0.5, 4.0, 8.0],
    [-4.9, 1.37, 3.3, 1.9, 0.5, 4.0, 8.0],
    [-5.5, 1.37, 3.3, 1.9, 0.69, 4.0, 7.0],
    [-6.5, 1.37, 3.3, 1.9, 1.02, 4.0, 6.0],
    [-7.0, 1.37, 3.3, 1.92, 1.18, 4.0, 5.0],
    [-7.28, 1.35, 3.28, 1.96, 1.27, 4.0, 4.5],
    [-7.5, 1.3, 3.22, 2.06, 1.62, 3.8, 3.5],
    [-7.7, 1.18, 3.08, 2.25, 1.98, 3.4, 3.0],
    [-7.83, 0.92, 2.88, 2.42, 2.22, 3.0, 2.6],
    [-7.88, 0.3, 2.66, 2.48, 2.36, 2.5, 2.5],
  ]);
  const Z_NOSE = 8.0, Z_TAIL = -7.88;
  const sec = (z) => { const [hw, top, mid, bot, eT, eB] = FUS(z); return { hw, top, mid, bot, eT, eB }; };
  /** A point on the skin (or `inset` metres inside it, along the surface normal). */
  const ringPt = (z, th, inset = 0) => {
    const f = sec(z), s = Math.sin(th), c = Math.cos(th);
    const up = s >= 0, e = up ? f.eT : f.eB, hh = up ? f.top - f.mid : f.mid - f.bot;
    const x = Math.sign(c) * Math.abs(c) ** (2 / e) * f.hw;
    const y = f.mid + Math.sign(s) * Math.abs(s) ** (2 / e) * hh;
    if (!inset) return V(x, y, z);
    const u = x / f.hw, w = (y - f.mid) / hh;
    const n = V(Math.sign(u) * Math.abs(u) ** (e - 1) / f.hw, Math.sign(w) * Math.abs(w) ** (e - 1) / hh, 0);
    if (n.lengthSq() < 1e-12) n.set(0, Math.sign(s) || 1, 0);
    return V(x, y, z).sub(n.normalize().multiplyScalar(inset));
  };
  const thForY = (z, y, side = 1) => {
    const f = sec(z);
    const th = y >= f.mid ? Math.asin(Math.min(1, (y - f.mid) / (f.top - f.mid)) ** (f.eT / 2)) : -Math.asin(Math.min(1, (f.mid - y) / (f.mid - f.bot)) ** (f.eB / 2));
    return side > 0 ? th : Math.PI - th;
  };
  const halfW = (z, y) => {
    const f = sec(z);
    if (y > f.top || y < f.bot) return 0;
    const up = y >= f.mid, e = up ? f.eT : f.eB;
    const t = up ? (y - f.mid) / (f.top - f.mid) : (f.mid - y) / (f.mid - f.bot);
    return f.hw * Math.max(0, 1 - t ** e) ** (1 / e);
  };
  /** Height of the roof skin at sideways offset x. */
  const roofY = (z, x) => {
    const f = sec(z);
    return f.mid + (f.top - f.mid) * Math.max(0, 1 - Math.min(1, Math.abs(x) / f.hw) ** f.eT) ** (1 / f.eT);
  };

  // ---- openings: [z0, z1] x [t0, t1] in (z, angle round the section)
  const CUTS = [];
  const cut = (z0, z1, t0, t1, kind, extra = {}) => CUTS.push({ z0: Math.min(z0, z1), z1: Math.max(z0, z1), t0: Math.min(t0, t1), t1: Math.max(t0, t1), kind, ...extra });
  const mirror = (t) => Math.PI - t;
  const WS = { z0: 6.97, z1: 7.56 };
  for (const side of [1, -1]) {
    const tt = (a) => (side > 0 ? a * DEG : mirror(a * DEG));
    // Windshield: a big pane each side of the centre post.
    cut(WS.z0, WS.z1, tt(43), tt(86.5), "cockpit");
    // Front quarter window, the big sliding side window above a lower one, and the chin window
    // at the pilot's feet.
    cut(6.2, 6.9, thForY(6.55, 1.95, side), tt(36), "cockpit");
    cut(5.3, 6.1, thForY(5.7, 2.2, side), thForY(5.7, 2.86, side), "cockpit");
    cut(5.45, 6.02, thForY(5.73, 1.5, side), thForY(5.73, 2.12, side), "cockpit");
    cut(6.9, 7.45, tt(-84), tt(-32), "cockpit");
  }
  // Cabin: round bubble windows; a square escape hatch (with its own window) at the front left;
  // the crew door at the front right has a smaller one.
  const PORTS = [];
  const port = (zc, yc, r, side, extra = {}) => {
    const a = r + 0.06;
    PORTS.push({ zc, yc, r, a, side, ...extra });
    cut(zc - a, zc + a, thForY(zc, yc - a, side), thForY(zc, yc + a, side), "port");
  };
  const WINY = 2.05;
  for (const side of [1, -1]) for (const z of [1.7, -0.29, -2.32, -4.3]) port(z, WINY, 0.25, side);
  port(3.89, WINY, 0.22, 1, { hatch: true });
  const DOOR = { z0: 3.62, z1: 4.48, y0: 0.95, y1: 2.55 };
  port(4.05, 2.12, 0.18, -1);

  const normT = (t) => { let u = t; while (u < -Math.PI / 2) u += Math.PI * 2; while (u >= Math.PI * 1.5) u -= Math.PI * 2; return u; };
  const inCut = (z, th, kinds) => CUTS.some((w) => (!kinds || kinds.includes(w.kind)) && z > w.z0 && z < w.z1 && normT(th) > w.t0 && normT(th) < w.t1);

  // ---- the lattice of rows (along the body) and columns (round it), lined up with every opening
  const ZROWS = (() => {
    const s = [8.0, 7.995, 7.985, 7.97, 7.95, 7.92, 7.885, 7.85];
    for (let z = 7.8; z > 6.3; z -= 0.05) s.push(z);
    for (let z = 6.3; z > 5.0; z -= 0.1) s.push(z);
    for (let z = 5.0; z > -4.6; z -= 0.3) s.push(z);
    for (let z = -4.6; z > -7.6; z -= 0.12) s.push(z);
    for (let z = -7.6; z > Z_TAIL; z -= 0.04) s.push(z);
    s.push(Z_TAIL);
    const edges = CUTS.flatMap((w) => [w.z0, w.z1]).concat([5.0, -7.15]);
    const keep = s.filter((z) => z > 7.84 || z <= Z_TAIL || !edges.some((e) => Math.abs(e - z) < 0.035));
    return [...new Set([...keep, ...edges].map((z) => +z.toFixed(4)))].sort((a, b) => b - a);
  })();
  const COLS = (() => {
    const s = [];
    const n = 84;
    for (let i = 0; i < n; i++) s.push(-Math.PI / 2 + (i / n) * Math.PI * 2);
    const edges = CUTS.flatMap((w) => [w.t0, w.t1]).map(normT);
    const keep = s.filter((t) => !edges.some((e) => Math.abs(e - t) < 0.02));
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
  const indexed = (pos, idx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  };
  const outward = (m) => {
    const f = sec(clamp(m.z, Z_TAIL, Z_NOSE));
    return V(m.x, m.y - f.mid, 0).normalize();
  };
  /** Rows of points joined into a strip (open ends), optionally wrapped round in each row. */
  const strip = (rows, wrap = false) => {
    const n = rows[0].length, pos = [], idx = [];
    for (const r of rows) for (const p of r) pos.push(p.x, p.y, p.z);
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < (wrap ? n : n - 1); j++) {
      const j1 = (j + 1) % n;
      const a = i * n + j, b = i * n + j1, c = (i + 1) * n + j, d = (i + 1) * n + j1;
      idx.push(a, c, b, b, c, d);
    }
    return indexed(pos, idx);
  };

  const floorY = (z) => (z >= -4.9 ? 0.8 : 0.8 + (-4.9 - z) * (0.73 / 2.25));
  const CEIL = 2.78;
  /** The skin (inset 0) or a lining (inset > 0), with the openings left open. */
  const lattice = ({ inset = 0, z0 = Z_NOSE, z1 = Z_TAIL, kinds = null, clampY = null, capStart = false, capEnd = false }) => {
    const rows = ZROWS.filter((z) => z <= z0 + 1e-6 && z >= z1 - 1e-6);
    const n = COLS.length, pos = [], idx = [];
    for (const z of rows) for (const th of COLS) {
      const p = ringPt(z, th, inset);
      if (clampY) p.y = clamp(p.y, clampY[0](z), clampY[1](z));
      pos.push(p.x, p.y, p.z);
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const zc = (rows[i] + rows[i + 1]) / 2;
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        const tc = j1 ? (COLS[j] + COLS[j1]) / 2 : (COLS[j] + COLS[0] + Math.PI * 2) / 2;
        if (inCut(zc, tc, kinds)) continue;
        const a = i * n + j, b = i * n + j1, c = (i + 1) * n + j, d = (i + 1) * n + j1;
        idx.push(a, c, b, b, c, d);
      }
    }
    for (const [ri, on] of [[0, capStart], [rows.length - 1, capEnd]]) {
      if (!on) continue;
      const tip = pos.length / 3;
      let cx = 0, cy = 0;
      for (let j = 0; j < n; j++) { cx += pos[(ri * n + j) * 3]; cy += pos[(ri * n + j) * 3 + 1]; }
      pos.push(cx / n, cy / n, rows[ri]);
      for (let j = 0; j < n; j++) idx.push(tip, ri * n + j, ri * n + ((j + 1) % n));
    }
    const g = indexed(pos, idx);
    return orient(g, (m) => {
      if (m.z > Z_NOSE - 0.003) return V(0, 0, 1);
      if (m.z < Z_TAIL + 0.003) return V(0, 0, -1);
      const r = outward(m);
      return inset ? r.negate() : r;
    });
  };

  // The skin.
  add("body", part(lattice({ capStart: false, capEnd: true }), XMAT.skin, cBody));
  // Linings: the cockpit's dark grey, the cabin's quilted insulation (flat ceiling, down to the floor).
  const CK_LIN = 0.035, CB_LIN = 0.1, BULK_Z = 5.0, RAMP_END = -7.15;
  add("body", part(lattice({ inset: CK_LIN, z0: 7.8, z1: BULK_Z, kinds: ["cockpit"], capStart: true }), XMAT.skin, cCock, INSIDE));
  add("body", part(lattice({ inset: CB_LIN, z0: BULK_Z, z1: RAMP_END, kinds: ["port"], clampY: [(z) => floorY(z) - 0.02, () => CEIL] }), XMAT.quilt, cQuilt, INSIDE));

  // ---- glass, frames and reveals of the cockpit windows
  const bumpT = (z, th, w) => {
    const p0 = ringPt(z, th), p1 = ringPt(z, th + 1e-3);
    return (w / 2) / (p0.distanceTo(p1) / 1e-3);
  };
  const thSteps = (t0, t1) => [t0, ...COLS.filter((t) => t > t0 + 1e-4 && t < t1 - 1e-4), t1];
  const zSteps = (z0, z1) => [z1, ...ZROWS.filter((z) => z < z1 - 1e-4 && z > z0 + 1e-4), z0];
  for (const w of CUTS.filter((c) => c.kind === "cockpit")) {
    const zs = zSteps(w.z0, w.z1), ts = thSteps(w.t0, w.t1);
    add("canopy", part(strip(zs.map((z) => ts.map((t) => ringPt(z, t, 0.004)))), XMAT.glass, C("#ffffff"), { noAO: true, noOcclude: true }));
    // Frames: dark rubber-edged strips over each edge, and the sill between skin and lining.
    const fw = 0.05;
    const frame = (rows) => add("body", part(orient(strip(rows), outward), MAT.dark, cRubber));
    for (const t of [w.t0, w.t1]) {
      frame(zs.map((z) => { const d = bumpT(z, t, fw); return [ringPt(z, t - d, -0.005), ringPt(z, t + d, -0.005)]; }));
      add("body", part(strip(zs.map((z) => [ringPt(z, t, 0), ringPt(z, t, CK_LIN)])), MAT.dark, cRubber, INSIDE));
    }
    for (const z of [w.z0, w.z1]) {
      const tsx = [w.t0 - bumpT(z, w.t0, fw), ...ts, w.t1 + bumpT(z, w.t1, fw)];
      frame([tsx.map((t) => ringPt(z + fw / 2, t, -0.005)), tsx.map((t) => ringPt(z - fw / 2, t, -0.005))]);
      add("body", part(strip([ts.map((t) => ringPt(z, t, 0)), ts.map((t) => ringPt(z, t, CK_LIN))]), MAT.dark, cRubber, INSIDE));
    }
  }

  // ---- the round windows: a skin plate round each hole, a rubber ring, a bubble of glass, the
  // reveal through the wall, and the same plate and ring on the lining inside.
  const sideX = (side, z, y, inset) => side * (halfW(z, y) - inset);
  const ringPlate = (pw, inset, off, colour, mat, opts) => {
    const N = 24, pts0 = [], pts1 = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const s = pw.a / Math.max(Math.abs(ca), Math.abs(sa));
      pts0.push([pw.zc + pw.r * ca, pw.yc + pw.r * sa]);
      pts1.push([pw.zc + s * ca, pw.yc + s * sa]);
    }
    const P = ([z, y]) => V(sideX(pw.side, z, y, inset) + pw.side * off, y, z);
    add("body", part(strip([pts0.map(P), pts1.map(P)], true), mat, colour, opts));
  };
  const annulus = (pw, r0, r1, inset, off, colour, opts) => {
    const N = 32, rows = [[], []];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      for (const [i, r] of [[0, r0], [1, r1]]) {
        const z = pw.zc + r * Math.cos(a), y = pw.yc + r * Math.sin(a);
        rows[i].push(V(sideX(pw.side, z, y, inset) + pw.side * off, y, z));
      }
    }
    add("body", part(strip(rows, true), MAT.dark, colour, opts));
  };
  for (const pw of PORTS) {
    ringPlate(pw, 0, 0.0005, cBody, XMAT.skin);
    annulus(pw, pw.r - 0.01, pw.r + 0.045, 0, 0.007, cRubber);
    ringPlate(pw, CB_LIN, -0.0005, cQuilt, XMAT.quilt, INSIDE);
    annulus(pw, pw.r - 0.01, pw.r + 0.05, CB_LIN, -0.008, C("#4a4f46"), INSIDE);
    // The reveal through the wall.
    const N = 24, outer = [], inner = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2, z = pw.zc + pw.r * Math.cos(a), y = pw.yc + pw.r * Math.sin(a);
      outer.push(V(sideX(pw.side, z, y, 0), y, z));
      inner.push(V(sideX(pw.side, z, y, CB_LIN), y, z));
    }
    add("body", part(strip([outer, inner], true), MAT.dark, C("#3d413a"), INSIDE));
    // A bubble window, bulging out a little.
    const dome = new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, 0.5);
    const k = pw.r / Math.sin(0.5), bulge = 0.05 / (k * (1 - Math.cos(0.5)));
    dome.applyMatrix4(new THREE.Matrix4().makeScale(k, k * bulge, k));
    dome.applyMatrix4(T(0, -k * bulge * Math.cos(0.5), 0));
    dome.applyMatrix4(RZ(-pw.side * Math.PI / 2));
    dome.applyMatrix4(T(sideX(pw.side, pw.zc, pw.yc, 0) + pw.side * 0.004, pw.yc, pw.zc));
    add("canopy", part(dome, XMAT.glass, C("#ffffff"), { noAO: true, noOcclude: true }));
  }

  // ---- lines painted on the skin: door and hatch outlines, the ramp's edges
  const skinLine = (pts, side, w = 0.025, colour = C("#2f3526")) => {
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [za, ya] = pts[i], [zb, yb] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(zb - za, yb - ya) / 0.12));
      for (let k = 0; k < n; k++) dense.push([za + ((zb - za) * k) / n, ya + ((yb - ya) * k) / n]);
    }
    dense.push(pts[pts.length - 1]);
    const rows = dense.map(([z, y], i) => {
      const [za, ya] = dense[Math.max(0, i - 1)], [zb, yb] = dense[Math.min(dense.length - 1, i + 1)];
      const L = Math.hypot(zb - za, yb - ya) || 1, nz = -(yb - ya) / L, ny = (zb - za) / L;
      return [-1, 1].map((s) => {
        const z2 = z + (s * nz * w) / 2, y2 = y + (s * ny * w) / 2;
        return ringPt(z2, thForY(z2, y2, side), -0.003);
      });
    });
    add("body", part(orient(strip(rows), outward), XMAT.skin, colour));
  };
  const rect = (z0, z1, y0, y1) => [[z0, y0], [z1, y0], [z1, y1], [z0, y1], [z0, y0]];
  skinLine(rect(DOOR.z0, DOOR.z1, DOOR.y0, DOOR.y1), -1);
  skinLine([[DOOR.z0, 1.55], [DOOR.z1, 1.55]], -1, 0.02); // the door opens in two: steps below, window above
  skinLine(rect(3.89 - 0.36, 3.89 + 0.36, WINY - 0.36, WINY + 0.36), 1);
  for (const side of [1, -1]) skinLine([[-4.9, 0.86], [-7.3, 1.33]], side, 0.02);

  // ---------------------------------------------------------------- fuel pods
  // Long blisters along the lower sides: flat-bottomed, rounded at the top and the outer edge,
  // their inner edge buried in the wall (between the skin and the cabin lining).
  {
    const prof = [[1.25, 0.6], [1.45, 0.585], [1.65, 0.58], [1.78, 0.6], [1.86, 0.66], [1.89, 0.78], [1.895, 1.0], [1.89, 1.2], [1.87, 1.36], [1.82, 1.47], [1.74, 1.545], [1.62, 1.58], [1.5, 1.57], [1.4, 1.535], [1.33, 1.49], [1.3, 1.4], [1.3, 1.0], [1.29, 0.68]].map(([x, y]) => [x, 0.58 + (y - 0.58) * 1.18]); // top 1.76 m
    const smoothProf = (() => {
      const out = [], n = prof.length;
      for (let i = 0; i < n; i++) {
        const p0 = prof[(i - 1 + n) % n], p1 = prof[i], p2 = prof[(i + 1) % n], p3 = prof[(i + 2) % n];
        for (let k = 0; k < 2; k++) {
          const t = k / 2, t2 = t * t, t3 = t2 * t;
          out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
        }
      }
      return out;
    })();
    const PZ0 = 3.55, PZF = 2.75, PR0 = -4.35, PZ1 = -5.65;
    const scale = (z) => (z > PZF ? Math.sqrt(Math.max(0, 1 - ((z - PZF) / (PZ0 - PZF)) ** 2)) : z < PR0 ? Math.sqrt(Math.max(0, 1 - ((PR0 - z) / (PR0 - PZ1)) ** 2)) : 1);
    const zs = [];
    for (let z = PZ0; z > PZF; z -= 0.06) zs.push(z);
    for (let z = PZF; z > PR0; z -= 0.45) zs.push(z);
    for (let z = PR0; z > PZ1; z -= 0.1) zs.push(z);
    zs.push(PZ1);
    for (const side of [1, -1]) {
      const rows = zs.map((z) => {
        const f = Math.max(0.03, scale(z));
        return smoothProf.map(([x, y]) => V(side * (1.3 + (x - 1.3) * f), 1.17 + (y - 1.17) * f, z));
      });
      const g = strip(rows, true);
      add("body", part(orient(g, (m) => V(m.x - side * 1.45, m.y - 1.17, 0).normalize()), XMAT.skin, cBody));
    }
  }

  // ---------------------------------------------------------------- rotor pylons and the roof
  /** A rounded box section whose bottom follows the roof (just under the skin). */
  const pylonRing = (z, hwB, hwT, top, r) => {
    const pts = [];
    const bot = (x) => roofY(z, x) - 0.015;
    const yS = bot(hwB);
    for (let k = 0; k <= 8; k++) { const x = hwB - (2 * hwB * k) / 8; pts.push(V(x, bot(x), z)); }
    for (let k = 1; k <= 3; k++) { const t = k / 4; pts.push(V(-(hwB + (hwT - hwB) * t), yS + (top - r - yS) * t, z)); }
    for (let k = 0; k <= 5; k++) { const a = Math.PI - (k / 5) * (Math.PI / 2); pts.push(V(-hwT + r + Math.cos(a) * r, top - r + Math.sin(a) * r, z)); }
    for (let k = 0; k <= 5; k++) { const a = Math.PI / 2 - (k / 5) * (Math.PI / 2); pts.push(V(hwT - r + Math.cos(a) * r, top - r + Math.sin(a) * r, z)); }
    for (let k = 1; k <= 3; k++) { const t = 1 - k / 4; pts.push(V(hwB + (hwT - hwB) * t, yS + (top - r - yS) * t, z)); }
    return pts;
  };
  const pylon = (secs, colour = cBody) => {
    const dense = [];
    for (let i = 0; i < secs.length - 1; i++) {
      const a = secs[i], b = secs[i + 1];
      const n = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / 0.25));
      for (let k = 0; k < n; k++) dense.push(a.map((v, j) => v + (b[j] - v) * (k / n)));
    }
    dense.push(secs[secs.length - 1]);
    const rows = dense.map(([z, hwB, hwT, top, r]) => pylonRing(z, hwB, hwT, top, r));
    const n = rows[0].length, pos = [], idx = [];
    for (const r of rows) for (const p of r) pos.push(p.x, p.y, p.z);
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n, a = i * n + j, b = i * n + j1, c = (i + 1) * n + j, d = (i + 1) * n + j1;
      idx.push(a, c, b, b, c, d);
    }
    for (const ri of [0, rows.length - 1]) {
      const tip = pos.length / 3, cc = rows[ri].reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / n);
      pos.push(cc.x, cc.y, cc.z);
      for (let j = 0; j < n; j++) idx.push(tip, ri * n + j, ri * n + ((j + 1) % n));
    }
    const zMid = (secs[0][0] + secs[secs.length - 1][0]) / 2;
    const g = orient(indexed(pos, idx), (m) => {
      if (Math.abs(m.z - secs[0][0]) < 1e-4) return V(0, 0, Math.sign(secs[0][0] - zMid));
      if (Math.abs(m.z - secs[secs.length - 1][0]) < 1e-4) return V(0, 0, Math.sign(secs[secs.length - 1][0] - zMid));
      return V(m.x, m.y - 3.0, 0).normalize();
    });
    add("body", part(g, XMAT.skin, colour));
  };
  // Front pylon, right over the cockpit: [z, half width at the roof, at the top, top, corner radius].
  const FP_TOP = 4.3, RP_TOP = 5.1;
  pylon([[6.92, 0.3, 0.26, 3.05, 0.13], [6.88, 0.55, 0.45, 3.55, 0.25], [6.8, 0.66, 0.56, 3.95, 0.32], [6.65, 0.72, 0.62, 4.2, 0.36], [6.4, 0.74, 0.64, FP_TOP, 0.38], [4.7, 0.74, 0.64, FP_TOP, 0.38], [4.45, 0.72, 0.62, 4.18, 0.36], [4.2, 0.66, 0.56, 3.85, 0.3], [3.95, 0.55, 0.46, 3.5, 0.25], [3.8, 0.4, 0.34, 3.33, 0.18]]);
  // The tall rear pylon, its back edge leaning forward over the tail.
  pylon([[-2.3, 0.5, 0.45, 3.36, 0.2], [-2.45, 0.7, 0.62, 3.75, 0.3], [-2.65, 0.8, 0.7, 4.25, 0.35], [-2.85, 0.83, 0.73, 4.65, 0.38], [-3.1, 0.84, 0.74, 4.95, 0.4], [-3.45, 0.84, 0.74, RP_TOP, 0.4], [-7.05, 0.8, 0.72, RP_TOP, 0.4], [-7.3, 0.79, 0.71, 4.98, 0.38], [-7.5, 0.78, 0.7, 4.3, 0.36], [-7.7, 0.74, 0.66, 3.55, 0.32], [-7.82, 0.62, 0.55, 3.05, 0.25]]);
  // The tunnel along the roof for the shaft that keeps the two rotors in step.
  pylon([[4.05, 0.3, 0.27, 3.42, 0.08], [3.9, 0.42, 0.38, 3.44, 0.1], [-2.3, 0.42, 0.38, 3.44, 0.1], [-2.45, 0.3, 0.27, 3.42, 0.08]]);
  // Intake louvres on the rear pylon, blade aerials along the roof, handholds along the top edge.
  for (const side of [1, -1]) {
    const tilt = Math.atan2(0.1, RP_TOP - 3.3);
    add("body", part(new THREE.BoxGeometry(0.01, 0.4, 0.75).applyMatrix4(RZ(side * tilt)).applyMatrix4(T(side * 0.755, 4.62, -3.75)), MAT.dark, cBlack));
    for (let k = 0; k < 5; k++) add("body", part(new THREE.BoxGeometry(0.012, 0.025, 0.72).applyMatrix4(RZ(side * tilt)).applyMatrix4(T(side * 0.763, 4.48 + k * 0.07, -3.75)), MAT.dark, cDark));
    for (const z of [3.1, 1.6, 0.3, -1.0, -2.0]) {
      const y = 2.98, x = halfW(z, y);
      add("body", part(new THREE.BoxGeometry(0.035, 0.035, 0.2).applyMatrix4(T(side * (x + 0.02), y, z)), MAT.dark, cBlack));
    }
  }
  for (const [z, h, l] of [[3.3, 0.28, 0.3], [1.9, 0.12, 0.38], [0.6, 0.16, 0.22], [-1.1, 0.3, 0.3]]) {
    const g = new THREE.BoxGeometry(0.03, h, l);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) if (pos.getY(k) > 0) pos.setZ(k, pos.getZ(k) - l * 0.35); // swept back
    g.computeVertexNormals();
    add("body", part(g.applyMatrix4(T(0.2, 3.44 + h / 2, z)), MAT.dark, cDark));
  }

  // ---------------------------------------------------------------- engines
  // Turboshafts on stubs either side of the rear pylon: a round intake (the particle separator)
  // in front, the hot exhaust pipe behind.
  for (const side of [1, -1]) {
    const ex = side * 1.32, ey = 3.45;
    const prof = [[0.001, -3.93], [0.15, -3.95], [0.25, -4.0], [0.32, -4.08], [0.36, -4.18], [0.37, -4.24], [0.35, -4.27], [0.4, -4.3], [0.44, -4.42], [0.45, -4.6], [0.45, -6.1], [0.43, -6.33], [0.38, -6.52], [0.33, -6.58], [0.31, -6.6], [0.31, -6.88], [0.27, -6.9], [0.26, -6.75]];
    const g = lathe(prof.map(([r, z]) => [r, z]), 28, T(ex, ey, 0));
    add("body", part(g, XMAT.skin, (p) => (p.z < -6.59 ? cExhaust : p.z > -4.29 && p.z < -4.2 ? cBlack : cBody), { smooth: true }));
    add("body", part(new THREE.CircleGeometry(0.26, 20).applyMatrix4(RY(Math.PI)).applyMatrix4(T(ex, ey, -6.76)), MAT.dark, cBlack, { noAO: true }));
    // The stub that holds it to the pylon, faired over.
    add("body", part(new RoundedBoxGeometry(0.42, 0.3, 1.5, 2, 0.08).applyMatrix4(T(side * 0.93, ey - 0.05, -5.2)), XMAT.skin, cBody));
  }

  // ---------------------------------------------------------------- rotor heads
  const ROT = { fz: 6.45, fy: 4.58, rz: -5.49, ry: 5.58, R: 9.14 };
  for (const [z, y, top] of [[ROT.fz, ROT.fy, FP_TOP], [ROT.rz, ROT.ry, RP_TOP]]) {
    add("body", part(cylinderBetween(V(0, top - 0.05, z), V(0, y - 0.12, z), 0.17, 16), MAT.metal, cMetal));
    add("body", part(new THREE.CylinderGeometry(0.34, 0.4, 0.12, 20).applyMatrix4(T(0, top + 0.02, z)), MAT.dark, cHub));
    add("body", part(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24).applyMatrix4(T(0, (top + y - 0.15) / 2, z)), MAT.metal, cMetal));
  }
  // Rotors: three wide blades (yellow tips) on a fully articulated hub with drag dampers and
  // pitch links. The front rotor turns one way, the rear the other, so their leading edges differ.
  const airfoil = (chord, thick, le) => {
    const pts = [];
    const tk = (u) => 5 * thick * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4);
    const us = [0, 0.03, 0.1, 0.22, 0.4, 0.6, 0.8, 1];
    for (const u of us) pts.push([u, tk(u)]);
    for (const u of [...us].reverse().slice(1, -1)) pts.push([u, -tk(u)]);
    return pts.map(([u, h]) => [le * (u - 0.25) * chord, h * chord]);
  };
  const rotor = (phase, le, swash) => {
    const parts = [];
    parts.push(part(new THREE.CylinderGeometry(0.26, 0.3, 0.3, 18), MAT.dark, cHub));
    parts.push(part(new THREE.SphereGeometry(0.26, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).applyMatrix4(T(0, 0.15, 0)), MAT.dark, cHub));
    for (let i = 0; i < 3; i++) {
      const a = phase + (i * Math.PI * 2) / 3;
      const m = RY(a);
      const P = (x, y, z) => V(x, y, z).applyMatrix4(m);
      parts.push(part(new THREE.BoxGeometry(0.46, 0.16, 0.22).applyMatrix4(T(0.42, 0, 0)).applyMatrix4(m), MAT.dark, cHub));
      parts.push(part(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 12).applyMatrix4(T(0.66, 0, 0)).applyMatrix4(m), MAT.metal, cMetal));
      parts.push(part(cylinderBetween(P(0.3, 0.04, le * 0.2), P(0.95, 0.03, le * 0.13), 0.045, 8), MAT.metal, cMetal));
      parts.push(part(cylinderBetween(P(0.5, swash, -le * 0.16), P(0.52, -0.04, -le * 0.14), 0.022, 6), MAT.metal, cMetal));
      // The blade: a cuff at the root, then a constant 0.81 m chord out to the tip, a little
      // twist, and a slight droop.
      const span = [0.62, 0.8, 1.1, 1.5, 2.5, 4, 5.5, 7, 8.1, ROT.R - 0.5, ROT.R - 0.48, ROT.R - 0.05, ROT.R];
      const rows = span.map((r) => {
        const t = r / ROT.R;
        const chord = r < 1.5 ? 0.38 + (0.81 - 0.38) * ((r - 0.62) / 0.88) : 0.81;
        const thick = r < 1.5 ? 0.3 - 0.18 * ((r - 0.62) / 0.88) : 0.11;
        const twist = -(6 - 10 * t) * DEG * le; // leading edge up at the root, washed out to the tip
        const droop = -0.15 * t * t + 0.06;
        return airfoil(chord, thick, le).map(([z, y]) => {
          const zz = z * Math.cos(twist) - y * Math.sin(twist), yy = z * Math.sin(twist) + y * Math.cos(twist);
          return P(r, droop + yy, zz);
        });
      });
      const g = strip(rows, true);
      const tipC = rows[rows.length - 1].reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / rows[0].length);
      const n0 = rows[0].length, pos = [...g.attributes.position.array], idx = [...g.index.array];
      const tip = pos.length / 3;
      pos.push(tipC.x, tipC.y, tipC.z);
      for (let j = 0; j < n0; j++) idx.push(tip, (rows.length - 1) * n0 + j, (rows.length - 1) * n0 + ((j + 1) % n0));
      const bg = orient(indexed(pos, idx), (q) => {
        const lq = q.clone().applyMatrix4(RY(-a));
        return lq.x > ROT.R - 0.01 ? V(1, 0, 0).applyMatrix4(m) : V(0, lq.y - 0.06 + 0.15 * (lq.x / ROT.R) ** 2, lq.z).applyMatrix4(m);
      });
      parts.push(part(bg, MAT.dark, (p) => (Math.hypot(p.x, p.z) > ROT.R - 0.49 ? cTip : cBlade), { smooth: true }));
    }
    return parts;
  };
  const swashY = (top, y) => (top + y - 0.15) / 2;
  nodes.rotorF = { parts: rotor(0, 1, swashY(FP_TOP, ROT.fy) - ROT.fy), translation: [0, ROT.fy, ROT.fz] };
  nodes.rotorR = { parts: rotor(Math.PI / 3, -1, swashY(RP_TOP, ROT.ry) - ROT.ry), translation: [0, ROT.ry, ROT.rz] };

  // ---------------------------------------------------------------- landing gear
  // Twin wheels on each front leg, a single castoring wheel on each rear one.
  const WR = 0.27;
  const wheel = (x, z) => {
    add("body", part(new THREE.TorusGeometry(WR - 0.085, 0.085, 10, 26).applyMatrix4(RY(Math.PI / 2)).applyMatrix4(T(x, WR, z)), MAT.rubber, cTyre));
    add("body", part(new THREE.CylinderGeometry(0.125, 0.125, 0.15, 18).applyMatrix4(RZ(Math.PI / 2)).applyMatrix4(T(x, WR, z)), MAT.metal, C("#7d8388")));
    add("body", part(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10).applyMatrix4(RZ(Math.PI / 2)).applyMatrix4(T(x, WR, z)), MAT.dark, cHub));
  };
  const GF = 2.95, GR = -3.9;
  for (const side of [1, -1]) {
    const xc = side * 1.62;
    wheel(xc - side * 0.15, GF);
    wheel(xc + side * 0.15, GF);
    add("body", part(cylinderBetween(V(xc - side * 0.1, WR, GF), V(xc + side * 0.1, WR, GF), 0.05, 10), MAT.metal, cMetal));
    add("body", part(cylinderBetween(V(xc, WR, GF), V(xc, 0.66, GF + 0.1), 0.065, 12), MAT.metal, cMetal));
    add("body", part(cylinderBetween(V(xc, WR + 0.08, GF), V(xc, 0.82, GF + 0.36), 0.04, 8), MAT.dark, cDark));
    const xr = side * 1.7;
    wheel(xr, GR);
    for (const s of [-1, 1]) add("body", part(new THREE.BoxGeometry(0.03, 0.34, 0.12).applyMatrix4(T(xr + s * 0.12, WR + 0.12, GR + 0.04)), MAT.dark, cDark));
    add("body", part(new THREE.BoxGeometry(0.27, 0.05, 0.14).applyMatrix4(T(xr, WR + 0.3, GR + 0.06)), MAT.dark, cDark));
    add("body", part(cylinderBetween(V(xr, WR + 0.3, GR + 0.08), V(xr, 0.66, GR + 0.1), 0.06, 12), MAT.metal, cMetal));
    add("body", part(cylinderBetween(V(xr, WR + 0.3, GR + 0.08), V(xr, 0.64, GR + 0.5), 0.035, 8), MAT.dark, cDark));
  }

  // ---------------------------------------------------------------- lights and markings
  add("body", part(new THREE.SphereGeometry(0.06, 10, 6).applyMatrix4(T(1.88, 1.3, 0.8)), MAT.navRed, C("#ffffff"), { noAO: true }));
  add("body", part(new THREE.SphereGeometry(0.06, 10, 6).applyMatrix4(T(-1.88, 1.3, 0.8)), MAT.navGreen, C("#ffffff"), { noAO: true }));
  add("body", part(new THREE.SphereGeometry(0.05, 10, 6).applyMatrix4(T(0, 2.55, -7.86)), MAT.white, C("#ffffff"), { noAO: true }));
  for (const x of [0.28, -0.28]) add("body", part(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 14).applyMatrix4(T(x, 0.66, 7.05)), MAT.white, C("#fff6e0"), { noAO: true }));
  nodes.beacon = { parts: [part(new THREE.SphereGeometry(0.08, 10, 6), MAT.navRed, C("#ffffff"), { noAO: true })], translation: [0, RP_TOP + 0.06, -6.75] };
  // Pitot probes either side of the nose.
  for (const side of [1, -1]) {
    add("body", part(cylinderBetween(V(side * 0.5, 1.55, 7.78), V(side * 0.52, 1.55, 8.2), 0.012, 6), MAT.metal, cMetal));
    add("body", part(cylinderBetween(V(side * 0.48, 1.55, 7.7), V(side * 0.5, 1.55, 7.86), 0.03, 8), MAT.dark, cDark));
  }
  // The callsign, painted above the windows.
  for (const side of [1, -1]) for (const b of registration(REGISTRATION, side, (z, y) => halfW(z, y), 2.57, -1.0, 0.3)) add("body", part(b, XMAT.skin, cTip, { noAO: true }));

  // ---------------------------------------------------------------- inside
  const box = (w, h, d, x, y, z, rx = 0, ry = 0) => new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), V(1, 1, 1)));
  const pad = (w, h, d, x, y, z, rx = 0, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)).applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), V(1, 1, 1)));

  // ---- the cabin
  const CAB_FRONT = BULK_Z, CAB_BACK = -4.9;
  const FLOOR_HW = halfW(0, 0.85) - CB_LIN - 0.05;
  add("body", part(box(2 * FLOOR_HW, 0.06, CAB_FRONT - CAB_BACK, 0, 0.77, (CAB_FRONT + CAB_BACK) / 2), MAT.metal, cFloor, INSIDE));
  // Treadways and roller tracks along the floor, tie-down rings, the cargo-hook hatch.
  for (const x of [-0.55, 0.55]) add("body", part(box(0.34, 0.012, CAB_FRONT - CAB_BACK - 0.1, x, 0.805, (CAB_FRONT + CAB_BACK) / 2), MAT.dark, cTread, INSIDE));
  for (const x of [-0.92, 0.92]) add("body", part(box(0.08, 0.02, CAB_FRONT - CAB_BACK - 0.6, x, 0.81, (CAB_FRONT + CAB_BACK) / 2 - 0.2), MAT.metal, cTube, INSIDE));
  for (let z = 4.2; z > CAB_BACK + 0.2; z -= 0.51) for (const x of [-0.25, 0.25]) add("body", part(box(0.07, 0.012, 0.07, x, 0.806, z), MAT.metal, cTube, INSIDE));
  add("body", part(box(0.8, 0.012, 0.8, 0, 0.807, -0.75), MAT.dark, C("#4f534c"), INSIDE));
  // The closed ramp (its floor rising to the tail) and the upper door above it.
  {
    const len = Math.hypot(CAB_BACK - RAMP_END, floorY(RAMP_END) - 0.8), ang = Math.atan2(floorY(RAMP_END) - 0.8, CAB_BACK - RAMP_END);
    const zm = (CAB_BACK + RAMP_END) / 2, ym = (0.8 + floorY(RAMP_END)) / 2 - 0.03;
    add("body", part(box(2 * (FLOOR_HW - 0.04), 0.06, len, 0, ym, zm, ang), MAT.metal, cFloor, INSIDE));
    for (const x of [-0.55, 0.55]) add("body", part(box(0.34, 0.012, len - 0.1, x, ym + 0.036, zm, ang), MAT.dark, cTread, INSIDE));
    const wy0 = floorY(RAMP_END) - 0.05, wh = CEIL - wy0 + 0.02;
    add("body", part(box(2 * (halfW(RAMP_END, CEIL) - CB_LIN - 0.02), wh, 0.05, 0, wy0 + wh / 2, RAMP_END + 0.03), XMAT.quilt, cQuilt, INSIDE));
    add("body", part(box(1.6, 0.04, 0.06, 0, floorY(RAMP_END) + 0.25, RAMP_END + 0.07), MAT.dark, cFrame, INSIDE));
  }
  // Frames round the walls and ceiling (not across the windows).
  const PORT_Z = PORTS.map((p) => p.zc);
  for (let z = 4.55; z > -6.9; z -= 0.51) {
    if (PORT_Z.some((pz) => Math.abs(pz - z) < 0.36)) continue;
    const lo = floorY(z) + 0.01;
    const t0 = thForY(z, lo, 1) + 0.02, t1 = Math.PI - t0;
    const ts = [t0, ...COLS.filter((t) => t > t0 && t < t1), t1];
    const P = (t, ins, cap) => { const p = ringPt(z, t, ins); p.y = clamp(p.y, lo, cap); return p; };
    add("body", part(strip([ts.map((t) => P(t, CB_LIN - 0.004, CEIL)), ts.map((t) => P(t, CB_LIN + 0.035, CEIL - 0.035))]), XMAT.fabric, cFrame, INSIDE));
  }
  // Ceiling: a cable trough down the middle, dome lights.
  add("body", part(box(0.26, 0.05, 11.0, 0, CEIL - 0.03, -1.0), XMAT.fabric, cFrame, INSIDE));
  for (const z of [3.4, 1.0, -1.4, -3.8, -6.0]) for (const x of [-0.5, 0.5]) add("body", part(box(0.16, 0.02, 0.26, x, CEIL - 0.012, z), MAT.white, C("#f4f1e4"), { noAO: true }));
  // The bulkhead behind the pilots, with the doorway into the cockpit.
  {
    const s = new THREE.Shape();
    const ring = COLS.map((t) => ringPt(BULK_Z, t, 0.02));
    s.moveTo(ring[0].x, ring[0].y);
    for (const p of ring.slice(1)) s.lineTo(p.x, p.y);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-0.36, 0.9); hole.lineTo(0.36, 0.9); hole.lineTo(0.36, 2.55); hole.lineTo(-0.36, 2.55); hole.closePath();
    s.holes.push(hole);
    add("body", part(new THREE.ShapeGeometry(s).applyMatrix4(T(0, 0, BULK_Z)), XMAT.quilt, C("#8d9186"), INSIDE));
    for (const x of [-0.39, 0.39]) add("body", part(box(0.06, 1.7, 0.08, x, 1.72, BULK_Z), MAT.dark, cFrame, INSIDE));
    add("body", part(box(0.84, 0.06, 0.08, 0, 2.58, BULK_Z), MAT.dark, cFrame, INSIDE));
  }
  // The crew door from inside, and the escape hatch.
  add("body", part(box(0.03, DOOR.y1 - DOOR.y0, DOOR.z1 - DOOR.z0, -(halfW(4.05, 1.75) - CB_LIN - 0.012), (DOOR.y0 + DOOR.y1) / 2 + 0.05, (DOOR.z0 + DOOR.z1) / 2), MAT.dark, C("#5b6154"), INSIDE));
  add("body", part(box(0.04, 0.04, 0.22, -(halfW(4.05, 1.4) - CB_LIN - 0.04), 1.4, 3.8), MAT.metal, cTube, INSIDE));
  add("body", part(box(0.025, 0.72, 0.72, halfW(3.89, WINY) - CB_LIN - 0.01, WINY, 3.89).applyMatrix4(new THREE.Matrix4()), MAT.dark, C("#5b6154"), INSIDE));
  // Fold-down troop seats along both walls: red webbing seats and backs on a tube frame.
  const SEAT_Y = 1.22;
  const wallX = halfW(0, 1.5) - CB_LIN;
  const troopSeats = (side, zFrom, zTo) => {
    const n = Math.round((zFrom - zTo) / 0.5), w = (zFrom - zTo) / n;
    const fx = side * (wallX - 0.47), bx = side * (wallX - 0.035);
    for (let i = 0; i < n; i++) {
      const zc = zFrom - (i + 0.5) * w;
      add("body", part(box(0.42, 0.025, w - 0.04, side * (wallX - 0.26), SEAT_Y, zc), XMAT.fabric, i % 2 ? cSeatRed : cSeatRedDk, INSIDE));
      add("body", part(box(0.02, 0.42, w - 0.04, bx, SEAT_Y + 0.25, zc), XMAT.fabric, cSeatRed, INSIDE));
      for (const y of [SEAT_Y + 0.12, SEAT_Y + 0.34]) add("body", part(box(0.024, 0.04, w - 0.04, bx - side * 0.002, y, zc), XMAT.fabric, cSeatRedDk, INSIDE));
      add("body", part(cylinderBetween(V(fx, SEAT_Y - 0.02, zc - w / 2 + 0.03), V(side * (wallX - 0.44), floorY(zc) + 0.01, zc - w / 2 + 0.08), 0.016, 6), MAT.metal, cTube, INSIDE));
      add("body", part(cylinderBetween(V(bx, SEAT_Y, zc - w / 2), V(bx, SEAT_Y + 0.48, zc - w / 2), 0.014, 6), MAT.metal, cTube, INSIDE));
    }
    add("body", part(cylinderBetween(V(fx, SEAT_Y - 0.01, zFrom), V(fx, SEAT_Y - 0.01, zTo), 0.018, 8), MAT.metal, cTube, INSIDE));
    add("body", part(cylinderBetween(V(bx, SEAT_Y + 0.48, zFrom), V(bx, SEAT_Y + 0.48, zTo), 0.016, 8), MAT.metal, cTube, INSIDE));
  };
  troopSeats(1, 3.4, -4.6);
  troopSeats(-1, 3.45, -4.6);

  // ---- the cockpit
  const FY = 0.92, PZ = 6.72, SZ = 5.55, CX = 0.6;
  const floorHW = Math.min(halfW(BULK_Z, FY), halfW(6.75, FY)) - 0.06;
  add("body", part(box(2 * floorHW, 0.05, 6.75 - BULK_Z, 0, FY - 0.025, (6.75 + BULK_Z) / 2), XMAT.fabric, C("#3c403b"), INSIDE));
  add("body", part(box(2 * FLOOR_HW, FY - 0.8, 0.06, 0, (FY + 0.8) / 2, BULK_Z - 0.03), MAT.dark, cFrame, INSIDE));
  // Panel, glareshield, centre console, overhead panel.
  add("body", part(box(2.0, 0.76, 0.1, 0, 1.45, PZ + 0.05), MAT.dark, cPanel, INSIDE));
  add("body", part(pad(2.16, 0.07, 0.4, 0, 1.86, PZ + 0.12, 0, 0.03), MAT.dark, cBlack, INSIDE));
  add("body", part(box(0.4, 0.5, 1.15, 0, FY + 0.25, PZ - 0.55), MAT.dark, cPanel, INSIDE));
  add("body", part(box(0.36, 0.04, 1.0, 0, FY + 0.52, PZ - 0.6, -0.08), MAT.dark, C("#1c1e1f"), INSIDE));
  // Keypads with small green screens on the console.
  for (const [z, h] of [[PZ - 0.35, 0.12], [PZ - 0.62, 0.1], [PZ - 0.88, 0.1]]) {
    const y = FY + 0.545 + (PZ - 0.6 - z) * 0.08;
    add("body", part(box(0.26, 0.004, h, 0, y, z, -0.08), XMAT.display, C("#0d1a12"), { noAO: true, noOcclude: true }));
    for (let k = 0; k < 3; k++) add("body", part(box(0.16 - k * 0.04, 0.002, 0.008, -0.03 + k * 0.02, y + 0.003, z + h / 2 - 0.025 - k * 0.022, -0.08), XMAT.display, C(k ? "#3fd46b" : "#9cf0b0"), { noAO: true, noOcclude: true }));
  }
  add("body", part(box(0.46, 0.18, 1.1, 0, 2.86, 6.05), MAT.dark, cPanel, INSIDE));
  for (let k = 0; k < 6; k++) add("body", part(box(0.36, 0.004, 0.1, 0, 2.766, 6.48 - k * 0.17), XMAT.display, C(k % 2 ? "#2b3a2f" : "#1a2420"), { noAO: true, noOcclude: true }));
  // Five big screens across the panel: each pilot's flight display (with an attitude ball the
  // game turns) and map, and the shared one in the middle.
  const D0 = PZ - 0.003, SCY = 1.5, DW = 0.17, DH = 0.22;
  const disp = (w, h, x, y, dz, c) => add("body", part(box(w, h, 0.002, x, y, D0 - dz), XMAT.display, C(c), { noAO: true, noOcclude: true }));
  const bezel = (x) => add("body", part(box(DW + 0.04, DH + 0.05, 0.012, x, SCY, PZ), MAT.dark, C("#101213"), { noAO: true }));
  const pfd = (x, node) => {
    bezel(x);
    disp(DW, DH, x, SCY, 0, "#05070a");
    const ay = SCY + 0.02, R = 0.07, ball = [];
    const flat = (g, c) => ball.push(part(g, XMAT.display, C(c), { noAO: true, noOcclude: true }));
    flat(new THREE.CircleGeometry(R, 36, 0, Math.PI), "#2a7fe0");
    flat(new THREE.CircleGeometry(R, 36, Math.PI, Math.PI), "#9a5a22");
    flat(new THREE.BoxGeometry(2 * R, 0.002, 0.001).applyMatrix4(T(0, 0, -0.0005)), "#ffffff");
    for (const [dy, len] of [[0.014, 0.016], [0.028, 0.032], [0.042, 0.016], [-0.014, 0.016], [-0.028, 0.032]]) flat(new THREE.BoxGeometry(len, 0.0014, 0.001).applyMatrix4(T(0, dy, -0.0005)), "#ffffff");
    nodes[node] = { parts: ball, translation: [x, ay, D0 - 0.002] };
    const mask = new THREE.Shape([new THREE.Vector2(-DW / 2 - 0.02, -DH / 2 - 0.025), new THREE.Vector2(DW / 2 + 0.02, -DH / 2 - 0.025), new THREE.Vector2(DW / 2 + 0.02, DH / 2 + 0.025), new THREE.Vector2(-DW / 2 - 0.02, DH / 2 + 0.025)]);
    mask.holes.push(new THREE.Path([new THREE.Vector2(-0.05, 0.02 - 0.055), new THREE.Vector2(-0.05, 0.02 + 0.055), new THREE.Vector2(0.05, 0.02 + 0.055), new THREE.Vector2(0.05, 0.02 - 0.055)]));
    add("body", part(new THREE.ShapeGeometry(mask).applyMatrix4(T(x, SCY, D0 - 0.004)), MAT.dark, C("#07090c"), { noAO: true, noOcclude: true }));
    for (const sx of [-1, 1]) {
      disp(0.022, 0.004, x + sx * 0.012, ay - 0.004, 0.006, "#f5c518");
      disp(0.028, 0.11, x + sx * 0.068, ay, 0.005, "#2b3038");
      for (let k = -4; k <= 4; k++) disp(0.008, 0.0012, x + sx * 0.062, ay + k * 0.012, 0.006, "#d9dde3");
      disp(0.03, 0.014, x + sx * 0.068, ay, 0.007, "#000000");
    }
    disp(0.11, 0.024, x, SCY - 0.075, 0.005, "#1d2128");
    for (let k = -4; k <= 4; k++) disp(0.0012, k % 2 ? 0.004 : 0.008, x + k * 0.011, SCY - 0.068, 0.006, "#d9dde3");
    for (const [dx, w, c] of [[-0.05, 0.03, "#3fd46b"], [0.0, 0.03, "#45c6e8"], [0.05, 0.025, "#ffffff"]]) disp(w, 0.006, x + dx, SCY + 0.092, 0.006, c);
  };
  const mfd = (x, map) => {
    bezel(x);
    disp(DW, DH, x, SCY, 0, map ? "#0a1410" : "#08111f");
    if (map) {
      for (const [dx, dy, w, h, c] of [[-0.03, 0.05, 0.08, 0.07, "#2e5a32"], [0.04, 0.04, 0.07, 0.09, "#3f6d3c"], [-0.02, -0.05, 0.1, 0.08, "#5a6e34"], [0.05, -0.06, 0.05, 0.06, "#6e663a"], [0.0, 0.0, 0.04, 0.03, "#2a5c9a"]]) disp(w, h, x + dx, SCY + dy, 0.004, c);
      for (const rr of [0.035, 0.07]) add("body", part(new THREE.TorusGeometry(rr, 0.001, 4, 40).applyMatrix4(T(x, SCY - 0.03, D0 - 0.007)), XMAT.display, C("#e8ecf2"), { noAO: true, noOcclude: true }));
      add("body", part(new THREE.CircleGeometry(0.009, 3).applyMatrix4(RZ(Math.PI / 2)).applyMatrix4(T(x, SCY - 0.03, D0 - 0.009)), XMAT.display, C("#ffffff"), { noAO: true, noOcclude: true }));
    } else {
      // Engine and rotor gauges: two tall bars per engine, rotor speed arcs.
      for (const [k, c] of [[-1, "#3fd46b"], [1, "#3fd46b"]]) {
        disp(0.022, 0.1, x + k * 0.035, SCY + 0.03, 0.004, "#262c34");
        disp(0.022, 0.075, x + k * 0.035, SCY + 0.018, 0.005, c);
      }
      for (const rr of [0.032]) for (const dx of [-0.04, 0.04]) add("body", part(new THREE.TorusGeometry(rr, 0.003, 4, 24, Math.PI * 1.3).applyMatrix4(RZ(-0.15 * Math.PI)).applyMatrix4(T(x + dx, SCY - 0.06, D0 - 0.006)), XMAT.display, C("#45c6e8"), { noAO: true, noOcclude: true }));
      for (let k = 0; k < 4; k++) disp(0.12, 0.006, x, SCY + 0.1 - k * 0.012 - 0.0, 0.006, k ? "#d9dde3" : "#f5c518");
    }
  };
  pfd(0.5, "attBall");
  mfd(0.78, false);
  mfd(0, true);
  pfd(-0.5, "attBall2");
  mfd(-0.78, false);
  // Rows of switches below the screens.
  for (const x of [-0.78, -0.5, 0, 0.5, 0.78]) for (let k = 0; k < 4; k++) add("body", part(box(0.012, 0.012, 0.02, x - 0.06 + k * 0.04, 1.25, PZ - 0.005), MAT.metal, cTube, { noAO: true }));
  // The pilots' seats (armoured buckets), cyclic sticks, collective levers, pedals.
  for (const side of [1, -1]) {
    const x = side * CX;
    add("body", part(box(0.42, 0.3, 0.42, x, FY + 0.15, SZ), MAT.dark, C("#2a2d2a"), INSIDE));
    add("body", part(pad(0.52, 0.1, 0.5, x, FY + 0.36, SZ, 0, 0.03), XMAT.fabric, cCrewSeat, INSIDE));
    add("body", part(pad(0.46, 0.08, 0.46, x, FY + 0.44, SZ + 0.01, -0.05, 0.035), XMAT.fabric, cCushion, INSIDE));
    add("body", part(pad(0.52, 0.8, 0.1, x, FY + 0.82, SZ - 0.31, -0.2, 0.03), XMAT.fabric, cCrewSeat, INSIDE));
    add("body", part(pad(0.44, 0.66, 0.07, x, FY + 0.82, SZ - 0.25, -0.2, 0.03), XMAT.fabric, cCushion, INSIDE));
    add("body", part(pad(0.3, 0.2, 0.1, x, FY + 1.3, SZ - 0.38, -0.2, 0.04), XMAT.fabric, cCushion, INSIDE));
    for (const s of [-1, 1]) add("body", part(box(0.03, 0.55, 0.32, x + s * 0.27, FY + 0.72, SZ - 0.2, -0.2), MAT.dark, cCrewSeat, INSIDE));
    const cy = V(x, FY + 0.66, 5.95);
    add("body", part(cylinderBetween(V(x, FY + 0.02, 6.02), cy, 0.018, 8), MAT.dark, cBlack, INSIDE));
    add("body", part(new THREE.CylinderGeometry(0.024, 0.026, 0.13, 10).applyMatrix4(T(cy.x, cy.y + 0.06, cy.z)), MAT.dark, C("#1d1f20"), INSIDE));
    add("body", part(new THREE.BoxGeometry(0.05, 0.04, 0.05).applyMatrix4(T(cy.x, cy.y + 0.14, cy.z)), MAT.dark, cBlack, INSIDE));
    add("body", part(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 16, 1, false, 0, Math.PI * 2).applyMatrix4(T(x, FY + 0.02, 6.02)), MAT.dark, C("#232523"), INSIDE));
    const cx = x + 0.33;
    add("body", part(cylinderBetween(V(cx, FY + 0.22, SZ - 0.2), V(cx, FY + 0.5, SZ + 0.3), 0.02, 8), MAT.dark, cBlack, INSIDE));
    add("body", part(new THREE.BoxGeometry(0.06, 0.07, 0.12).applyMatrix4(T(cx, FY + 0.53, SZ + 0.33)), MAT.dark, C("#1d1f20"), INSIDE));
    add("body", part(box(0.08, 0.2, 0.3, cx, FY + 0.1, SZ - 0.2), MAT.dark, C("#2a2d2a"), INSIDE));
    for (const s of [-1, 1]) add("body", part(box(0.08, 0.15, 0.02, x + s * 0.13, FY + 0.1, 6.55, -0.5), MAT.metal, C("#5c6066"), INSIDE));
  }

  // ---- the pilot, in the right-hand seat (the captain's seat in a helicopter)
  {
    const pp = [];
    const cSuit = C("#6b7356"), cSkin = C("#d9a77f"), cHelmet = C("#5a6248"), cVisor = C("#1a1c1e"), cGlove = C("#3a3226");
    const limb = (a, b, r, c) => pp.push(part(cylinderBetween(a, b, r, 10), XMAT.fabric, c, INSIDE));
    const ball = (p, r, c, mat = XMAT.fabric) => pp.push(part(new THREE.SphereGeometry(r, 14, 10).applyMatrix4(T(p.x, p.y, p.z)), mat, c, INSIDE));
    const x = -CX;
    pp.push(part(new THREE.SphereGeometry(1, 16, 12).applyMatrix4(new THREE.Matrix4().compose(V(x, FY + 0.8, SZ - 0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, 0)), V(0.2, 0.28, 0.13))), XMAT.fabric, cSuit, INSIDE));
    const head = V(x, FY + 1.22, SZ - 0.1);
    limb(V(x, FY + 1.0, SZ - 0.13), head.clone().add(V(0, -0.07, 0)), 0.05, cSkin);
    ball(head, 0.1, cSkin);
    pp.push(part(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).applyMatrix4(T(head.x, head.y + 0.02, head.z - 0.01)), MAT.dark, cHelmet, INSIDE));
    pp.push(part(new THREE.SphereGeometry(0.138, 16, 8, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.3, Math.PI * 0.22).applyMatrix4(RY(Math.PI / 2)).applyMatrix4(T(head.x, head.y + 0.02, head.z - 0.01)), MAT.dark, cVisor, INSIDE));
    const hands = [V(x, FY + 0.7, 5.95), V(x + 0.33, FY + 0.57, SZ + 0.33)];
    for (const [i, s] of [[0, -1], [1, 1]]) {
      const sh = V(x + s * 0.19, FY + 1.0, SZ - 0.12), hand = hands[i];
      const el = V(x + s * 0.22, FY + 0.72, SZ + 0.12);
      limb(sh, el, 0.045, cSuit);
      limb(el, hand, 0.038, cSuit);
      ball(hand, 0.038, cGlove);
      const hip = V(x + s * 0.1, FY + 0.52, SZ - 0.03), knee = V(x + s * 0.12, FY + 0.58, SZ + 0.38), foot = V(x + s * 0.13, FY + 0.13, 6.47);
      limb(hip, knee, 0.068, cSuit);
      ball(knee, 0.066, cSuit);
      limb(knee, foot, 0.052, cSuit);
      pp.push(part(new THREE.BoxGeometry(0.1, 0.08, 0.22).applyMatrix4(T(foot.x, foot.y - 0.02, foot.z - 0.03)), MAT.dark, C("#2b2620"), INSIDE));
    }
    nodes.pilot = { parts: pp };
  }

  // Where the pilot's eyes are; and a soldier's on the right-hand troop seats, looking across
  // the cabin and out of the windows on the other side.
  rig.eye = [-CX, FY + 1.27, SZ - 0.02];
  rig.windowEye = [-(wallX - 0.28), SEAT_Y + 0.73, -1.3];
  rig.fov = 80;
  rig.eyePitch = 8;

  // Quality check: nothing inside may poke out through the skin.
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
          const f = sec(z);
          const over = y > f.top || y < f.bot ? 0.05 : Math.abs(x) - halfW(z, y);
          if (over > worst) { worst = over; atp = [x, y, z]; }
        }
        if (worst > 0.002) bad.push(`${name}#${i} sticks out ${(worst * 100).toFixed(1)} cm at (${atp.map((v) => v.toFixed(2)).join(", ")})`);
      });
    }
    if (bad.length) console.warn(`${ac.id}: interior parts outside the skin:\n  ` + bad.slice(0, 16).join("\n  "));
  }
  return { nodes, extraMaterials, rig };
}
