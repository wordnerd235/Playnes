// The Cessna 172 Skyhawk, built from its real proportions (metres): 8.28 m long, 11.0 m span,
// 2.72 m tall at the fin, high strut-braced wing (1.63 m chord inboard, tapering outboard,
// 1.7 degrees of dihedral), fixed tricycle gear (2.54 m track, about 1.65 m wheelbase) on
// spring-steel main legs, 1.9 m two-blade propeller, four seats.
//
// glTF conventions (same as build-models.mjs): +Y up, nose toward +Z, left wing toward +X,
// origin on the ground between the main wheels.
//
// Nodes the game animates (src/game/planeView.ts):
//   prop                     spins about its local Z
//   flapL flapR ailL ailR    hinge about local X (negative = trailing edge down)
//   elevL elevR rudder       hinges
//   gearN                    nose fork: steers (retractDeg 0: fixed gear never folds)
//   wheelL wheelR wheelN     spin about local X
//   needleIas needleAlt      panel needles: turn about local Z (clockwise as the pilot sees it)
//   attBall                  attitude indicator: turns with the bank
//   propDisc                 the blur of a fast propeller (shown when it spins fast)
//   beacon strobe            blink
//   pilot canopy             hidden when the camera is inside (rig.eye, rig.windowEye)

import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function buildC172(ac, kit) {
  const { THREE, V, C, T, RX, RY, RZ, lerp, MAT, MATERIALS, loft, smooth, surface, controlSurface, lathe, cylinderBetween, registration, REGISTRATION, part, sheet, curve, asNode } = kit;

  const X0 = MATERIALS.length;
  const XMAT = { glass: X0, fabric: X0 + 1, screen: X0 + 2, blur: X0 + 3 };
  const extraMaterials = [
    { name: "cabinGlass", pbrMetallicRoughness: { baseColorFactor: [0.62, 0.74, 0.86, 0.22], metallicFactor: 0.7, roughnessFactor: 0.04 }, alphaMode: "BLEND", doubleSided: true },
    { name: "fabric", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }, doubleSided: true },
    { name: "screen", pbrMetallicRoughness: { baseColorFactor: [0.02, 0.06, 0.035, 1], metallicFactor: 0.3, roughnessFactor: 0.2 }, emissiveFactor: [0.03, 0.14, 0.06], doubleSided: true },
    { name: "propBlur", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.16], metallicFactor: 0, roughnessFactor: 0.6 }, alphaMode: "BLEND", doubleSided: true },
  ];

  const nodes = {};
  const add = (node, pt) => (nodes[node] ??= { parts: [] }).parts.push(pt);
  const rig = { retractDeg: { gearN: 0 }, wheelRadius: {} };
  const INSIDE = { aoStrength: 0.42 };

  // ---- colours: classic white with a red-and-blue side stripe
  const cWhite = C(ac.livery.body), cRed = C(ac.livery.stripe), cBlue = C(ac.livery.accent);
  const cLine = C("#9aa0a6"), cBlack = C("#16181b"), cMetal = C("#9aa0a7"), cTyre = C("#1c1d1f");
  const cGlassTint = C("#2a3a4c");
  /** Side stripe: a red band with a thin blue one under it, along the whole fuselage. */
  const stripeAt = (p) => {
    const y0 = 1.13 - Math.max(0, -p.z - 0.8) * 0.018;
    if (p.y > y0 && p.y < y0 + 0.085) return cRed;
    if (p.y > y0 - 0.05 && p.y < y0 - 0.02) return cBlue;
    return null;
  };
  const skin = (p, n) => (Math.abs(n.x) > 0.35 ? stripeAt(p) : null) ?? cWhite;

  const superRing = (z, hw, top, bot, e, n = 48) => {
    const yc = (top + bot) / 2, hh = (top - bot) / 2;
    const r = [];
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      r.push(V(Math.sign(c) * Math.abs(c) ** (2 / e) * hw, yc + Math.sign(s) * Math.abs(s) ** (2 / e) * hh, z));
    }
    return r;
  };
  const halfWidthAt = (f) => (z, y) => {
    const [hw, top, bot, e] = f(z);
    const s = Math.min(1, Math.abs((y - (top + bot) / 2) / ((top - bot) / 2)));
    return hw * (1 - s ** e) ** (1 / e);
  };

  // ---- cowling: [z, half-width, top, bottom, roundness]
  const cowl = curve([
    [2.46, 0.3, 1.36, 0.97, 2.4],
    [2.36, 0.4, 1.41, 0.88, 2.6],
    [2.1, 0.46, 1.43, 0.8, 2.8],
    [1.7, 0.5, 1.43, 0.76, 3.0],
    [1.32, 0.53, 1.43, 0.73, 3.2],
  ]);
  const czs = [];
  for (let z = 2.46; z > 1.32; z -= 0.08) czs.push(z);
  czs.push(1.32);
  add("body", part(smooth(loft(czs.map((z) => superRing(z, ...cowl(z))))), MAT.paint, skin));
  // Air intakes either side of the spinner, oil door on top, exhaust under the right side.
  for (const side of [1, -1]) {
    const g = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 18).applyMatrix4(RX(Math.PI / 2)).applyMatrix4(new THREE.Matrix4().makeScale(1.25, 0.8, 1)).applyMatrix4(T(side * 0.2, 1.1, 2.465));
    add("body", part(g, MAT.dark, cBlack, { noAO: true }));
  }
  add("body", part(new THREE.BoxGeometry(0.22, 0.012, 0.28).applyMatrix4(T(0, 1.435, 1.78)), MAT.paint, cLine, { noAO: true, noOcclude: true }));
  add("body", part(cylinderBetween(V(-0.18, 0.8, 1.6), V(-0.2, 0.72, 1.35), 0.025, 10), MAT.metal, C("#6a6560")));
  // Landing light in the front of the cowling.
  add("body", part(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 14).applyMatrix4(RX(Math.PI / 2)).applyMatrix4(T(0.05, 0.94, 2.43)), MAT.white, C("#ffffff"), { noAO: true }));

  // ---- cabin: the lower body up to the window sill (an open U-shape along the cabin)
  const SILL = 1.3, ROOF = 1.9, BELLY = 0.72;
  const cabinHW = (z) => lerp(0.535, 0.56, Math.min(1, Math.max(0, (1.4 - z) / 0.4)));
  const uRing = (z) => {
    const hw = cabinHW(z), r = 0.2, pts = [];
    pts.push(V(hw, SILL, z));
    for (let i = 0; i <= 4; i++) pts.push(V(hw, lerp(SILL, BELLY + r, i / 4), z));
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      pts.push(V(hw - r + r * Math.cos(a), BELLY + r - r * Math.sin(a), z));
    }
    for (let i = 1; i <= 6; i++) pts.push(V(lerp(hw - r, -(hw - r), i / 7), BELLY, z));
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      pts.push(V(-(hw - r) - r * Math.sin(a), BELLY + r - r * Math.cos(a), z));
    }
    for (let i = 1; i <= 4; i++) pts.push(V(-hw, lerp(BELLY + r, SILL, i / 4), z));
    return pts.reverse(); // run left to right so the skin faces outward
  };
  const uzs = [];
  for (let z = 1.4; z > -0.82; z -= 0.12) uzs.push(z);
  uzs.push(-0.82);
  add("body", part(sheet(uzs.map(uRing)), MAT.paint, skin));
  // Door seams (thin grey lines just proud of the skin) and handles.
  for (const side of [1, -1]) {
    const x = side * 0.565;
    for (const z of [1.28, 0.06]) add("body", part(new THREE.BoxGeometry(0.004, SILL - 0.8, 0.012).applyMatrix4(T(x, (SILL + 0.8) / 2, z)), MAT.paint, cLine, { noAO: true, noOcclude: true }));
    add("body", part(new THREE.BoxGeometry(0.004, 0.012, 1.22).applyMatrix4(T(x, 0.8, 0.67)), MAT.paint, cLine, { noAO: true, noOcclude: true }));
    add("body", part(new THREE.BoxGeometry(0.02, 0.025, 0.12).applyMatrix4(T(side * 0.572, 1.18, 0.2)), MAT.metal, cMetal));
  }

  // ---- windows, pillars and roof
  /** A flat window pane at x through the outline points [z, y] (convex, in order). */
  const pane = (x, outline) => {
    const pos = [];
    for (const [z, y] of outline) pos.push(x, y, z);
    const idx = [];
    for (let i = 1; i < outline.length - 1; i++) idx.push(0, i, i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const glass = [];
  // Windshield: from the top of the cowling up to the roof, bulging forward a little.
  const wsRows = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const z0 = lerp(1.36, 0.86, t), y = lerp(1.43, ROOF, t), hw = lerp(0.52, 0.555, t);
    const row = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10 * 2 - 1;
      row.push(V(u * hw, y, z0 + 0.07 * (1 - u * u) * Math.sin(t * Math.PI) * 0.6 + 0.03 * (1 - u * u)));
    }
    wsRows.push(row);
  }
  glass.push(part(sheet(wsRows), XMAT.glass, C("#ffffff"), { noAO: true, noOcclude: true }));
  for (const side of [1, -1]) {
    const x = side * 0.548;
    // Door window (front edge follows the windshield post) and the rear side window.
    glass.push(part(pane(x, [[1.3, SILL], [0.1, SILL], [0.1, ROOF - 0.03], [0.88, ROOF - 0.03], [1.33, 1.44]]), XMAT.glass, C("#ffffff"), { noAO: true, noOcclude: true }));
    glass.push(part(pane(x, [[0.02, SILL + 0.02], [-0.74, SILL + 0.08], [-0.78, ROOF - 0.05], [0.02, ROOF - 0.03]]), XMAT.glass, C("#ffffff"), { noAO: true, noOcclude: true }));
    // Posts: windshield (A), between the windows (B), behind the rear window (C).
    add("body", part(cylinderBetween(V(side * 0.535, 1.43, 1.36), V(side * 0.555, ROOF, 0.86), 0.022, 8), MAT.paint, cWhite));
    add("body", part(new THREE.BoxGeometry(0.03, ROOF - SILL, 0.08).applyMatrix4(T(side * 0.552, (ROOF + SILL) / 2, 0.06)), MAT.paint, cWhite));
    add("body", part(new THREE.BoxGeometry(0.03, ROOF - SILL, 0.07).applyMatrix4(T(side * 0.552, (ROOF + SILL) / 2, -0.8)), MAT.paint, cWhite));
    // Frame along the top of the windows.
    add("body", part(new THREE.BoxGeometry(0.03, 0.04, 1.7).applyMatrix4(T(side * 0.552, ROOF - 0.01, 0.03)), MAT.paint, cWhite));
  }
  nodes.canopy = { parts: glass };
  add("body", part(new THREE.BoxGeometry(1.12, 0.03, 1.7).applyMatrix4(T(0, ROOF + 0.005, 0.03)), MAT.paint, cWhite));

  // ---- tailcone: [z, half-width, top, bottom, roundness]; the rear window is in its top
  const tail = curve([
    [-0.8, 0.56, 1.9, 0.72, 3.4],
    [-1.2, 0.53, 1.8, 0.74, 3.0],
    [-1.8, 0.47, 1.66, 0.79, 2.6],
    [-2.6, 0.38, 1.55, 0.87, 2.3],
    [-3.5, 0.28, 1.47, 0.95, 2.1],
    [-4.4, 0.19, 1.41, 1.02, 2.0],
    [-5.2, 0.11, 1.38, 1.08, 2.0],
    [-5.5, 0.04, 1.36, 1.12, 2.0],
  ]);
  const tailX = halfWidthAt(tail);
  const rearWindow = (p, n) => p.z < -0.84 && p.z > -1.72 && n.y > 0.45 && Math.abs(p.x) < 0.5;
  const tzs = [];
  for (let z = -0.8; z > -5.5; z -= 0.1) tzs.push(z);
  tzs.push(-5.5);
  add("body", part(smooth(loft(tzs.map((z) => superRing(z, ...tail(z))))), MAT.paint, (p, n) => (rearWindow(p, n) ? cGlassTint : skin(p, n))));

  // ---- wings: constant chord to 2.6 m out, then tapering (the trailing edge stays straight)
  const DIH = (1.73 * Math.PI) / 180;
  const WY = ROOF + 0.02, LE0 = 0.86, CH0 = 1.63, CHT = 1.12, XB = 2.6, XT = 5.5;
  const wingY = (x) => WY + Math.abs(x) * Math.tan(DIH);
  const chordAt = (x) => (Math.abs(x) <= XB ? CH0 : lerp(CH0, CHT, (Math.abs(x) - XB) / (XT - XB)));
  const leAt = (x) => LE0 - (CH0 - chordAt(x));
  const FLAP = [0.6, 2.6], AIL = [2.7, 5.05], FCUT = 0.7, ACUT = 0.75;
  for (const side of [1, -1]) {
    const up = V(-side * Math.sin(DIH), Math.cos(DIH), 0);
    const LE = (x) => V(side * x, wingY(x), leAt(x));
    const stations = (x0, x1, cuts) => cuts.map(([x, cut]) => ({ t: (x - x0) / (x1 - x0), cut }));
    add("body", part(surface({ rootLE: LE(0), tipLE: LE(XB), rootChord: CH0, tipChord: CH0, thickness: 0.12, camber: 0.02, up, stations: stations(0, XB, [[0, 1], [FLAP[0], 1], [FLAP[0], FCUT], [XB, FCUT]]) }), MAT.paint, cWhite));
    add("body", part(surface({ rootLE: LE(XB), tipLE: LE(XT), rootChord: CH0, tipChord: CHT, thickness: 0.115, camber: 0.02, up, stations: stations(XB, XT, [[XB, 1], [AIL[0], 1], [AIL[0], ACUT], [AIL[1], ACUT], [AIL[1], 1], [XT, 1]]) }), MAT.paint, cWhite));
    // Rounded wingtip cap.
    add("body", part(new THREE.SphereGeometry(1, 16, 8).applyMatrix4(new THREE.Matrix4().makeScale(0.07, 0.06, CHT * 0.5)).applyMatrix4(T(side * (XT + 0.01), wingY(XT) + 0.02, leAt(XT) - CHT * 0.45)), MAT.paint, cWhite));
    // Flap and aileron (hinges toward +X on both sides, so "negative = trailing edge down").
    const hinge = (x, cut) => V(side * x, wingY(x) - 0.01, leAt(x) - cut * chordAt(x));
    const mk = (range, cut, name) => {
      const [x0, x1] = side > 0 ? range : [range[1], range[0]];
      const cs = controlSurface(hinge(x0, cut), hinge(x1, cut), (1 - cut) * chordAt(x0), (1 - cut) * chordAt(x1), 0.05);
      nodes[name] = { parts: [part(cs.geo, MAT.paint, cWhite)], translation: cs.translation, rotation: cs.rotation };
    };
    mk(FLAP, FCUT, side > 0 ? "flapL" : "flapR");
    mk(AIL, ACUT, side > 0 ? "ailL" : "ailR");
    // Wing strut, from the bottom of the cabin to about 55% of the way out.
    add("body", part(cylinderBetween(V(side * 0.5, 0.86, 0.02), V(side * 2.95, wingY(2.95) - 0.08, 0.28), 0.032, 10).applyMatrix4(new THREE.Matrix4()), MAT.paint, cWhite));
    // Fuel cap near the root, navigation and strobe lights at the tip.
    add("body", part(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12).applyMatrix4(T(side * 1.6, wingY(1.6) + 0.1, 0.25)), MAT.metal, cMetal));
    add("body", part(new THREE.SphereGeometry(0.035, 10, 8).applyMatrix4(T(side * (XT + 0.07), wingY(XT) + 0.02, leAt(XT) - 0.15)), side > 0 ? MAT.navRed : MAT.navGreen, C("#ffffff"), { noAO: true }));
    add("strobe", part(new THREE.SphereGeometry(0.03, 10, 8).applyMatrix4(T(side * (XT + 0.07), wingY(XT) + 0.02, leAt(XT) - 0.32)), MAT.white, C("#ffffff"), { noAO: true }));
  }
  // Stall-warning vent and pitot tube under the left wing.
  add("body", part(cylinderBetween(V(3.4, wingY(3.4) - 0.07, leAt(3.4) - 0.2), V(3.4, wingY(3.4) - 0.07, leAt(3.4) + 0.12), 0.012, 8), MAT.metal, cMetal));

  // ---- tailplane with elevators
  const HY = 1.24, EF = 0.42;
  for (const side of [1, -1]) {
    const rootLE = V(side * 0.1, HY, -4.35), tipLE = V(side * 1.73, HY + 0.02, -4.72);
    add("body", part(surface({ rootLE, tipLE, rootChord: 1.25, tipChord: 0.85, thickness: 0.1, camber: 0, stations: [{ t: 0, cut: 1 - EF }, { t: 1, cut: 1 - EF }] }), MAT.paint, cWhite));
    const a0 = rootLE.clone().add(V(0, 0, -(1 - EF) * 1.25)), b0 = tipLE.clone().add(V(0, 0, -(1 - EF) * 0.85));
    const [a, b, ca, cb] = side > 0 ? [a0, b0, EF * 1.25, EF * 0.85] : [b0, a0, EF * 0.85, EF * 1.25];
    const cs = controlSurface(a, b, ca, cb, 0.05);
    nodes[side > 0 ? "elevL" : "elevR"] = { parts: [part(cs.geo, MAT.paint, cWhite)], translation: cs.translation, rotation: cs.rotation };
  }

  // ---- fin, rudder and the dorsal fillet in front of it
  const fin = { rootLE: V(0, 1.4, -4.12), tipLE: V(0, 2.72, -5.0), rootChord: 1.38, tipChord: 0.8 };
  const RF = 0.4;
  const finColor = (p) => (p.y > 2.2 && p.y < 2.33 ? cRed : p.y > 2.15 && p.y < 2.19 ? cBlue : cWhite);
  add("body", part(surface({ rootLE: fin.rootLE, tipLE: fin.tipLE, rootChord: fin.rootChord, tipChord: fin.tipChord, thickness: 0.1, camber: 0, up: V(1, 0, 0), stations: [{ t: 0, cut: 1 - RF }, { t: 1, cut: 1 - RF }] }), MAT.paint, finColor));
  {
    const a = fin.rootLE.clone().add(V(0, -0.12, -(1 - RF) * fin.rootChord)), b = fin.tipLE.clone().add(V(0, 0, -(1 - RF) * fin.tipChord));
    const cs = controlSurface(a, b, RF * fin.rootChord, RF * fin.tipChord, 0.06);
    nodes.rudder = { parts: [part(cs.geo, MAT.paint, finColor)], translation: cs.translation, rotation: cs.rotation };
  }
  const dorsal = curve([
    [-2.5, 0.015, 1.57, 1.52],
    [-3.3, 0.04, 1.68, 1.46],
    [-4.1, 0.055, 1.92, 1.42],
    [-4.4, 0.05, 2.05, 1.4],
  ]);
  add("body", part(smooth(loft([-2.5, -2.9, -3.3, -3.7, -4.1, -4.4].map((z) => superRing(z, ...dorsal(z), 2, 16)))), MAT.paint, cWhite));
  nodes.beacon = { parts: [part(new THREE.SphereGeometry(0.045, 10, 8), MAT.navRed, C("#ffffff"), { noAO: true })], translation: [0, 2.76, -5.25] };
  // Antennas: a whip on the roof and the navigation "V" on the fin.
  add("body", part(cylinderBetween(V(0, ROOF + 0.25, -0.3), V(0, ROOF + 0.9, -0.55), 0.006, 6), MAT.dark, cBlack));
  for (const side of [1, -1]) add("body", part(cylinderBetween(V(0, 2.0, -4.6), V(side * 0.35, 2.12, -4.35), 0.006, 6), MAT.metal, cMetal));

  // ---- registration on the tailcone
  for (const side of [1, -1]) {
    for (const b of registration(REGISTRATION, side, (z, y) => tailX(z, y), 1.22, -2.95, 0.2)) add("body", part(b, MAT.paint, C("#22262b"), { noAO: true, noOcclude: true }));
  }

  // ---- landing gear: spring-steel main legs, nose oleo strut, wheels with speed fairings
  const tyre = (R, w) => {
    const prof = [[R * 0.55, -w / 2], [R * 0.86, -w / 2], [R * 0.97, -w * 0.36], [R, -w * 0.15], [R, w * 0.15], [R * 0.97, w * 0.36], [R * 0.86, w / 2], [R * 0.55, w / 2]];
    return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28).applyMatrix4(RZ(-Math.PI / 2));
  };
  const wheelParts = (R, w) => {
    const parts = [part(tyre(R, w), MAT.rubber, cTyre), part(new THREE.CylinderGeometry(R * 0.55, R * 0.55, w * 0.86, 20).applyMatrix4(RZ(-Math.PI / 2)), MAT.paint, C("#e9e9e4"))];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      for (const sx of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(R * 0.08, R * 0.08, 0.02, 8).applyMatrix4(RZ(-Math.PI / 2)).applyMatrix4(T(sx * w * 0.44, Math.cos(a) * R * 0.32, Math.sin(a) * R * 0.32)), MAT.dark, cBlack));
    }
    return parts;
  };
  /**
   * Speed fairing over the top of a wheel: a teardrop, rounded in front and tapering behind,
   * with the bottom open so you can see the tyre turn. A thin red pinstripe along each side.
   */
  const fairing = (cx, cy, cz, R, w) => {
    const g = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (z < 0) {
        const k = 1 + 0.5 * z; // tail narrows to half
        x *= k;
        y = y * k + (1 - k) * 0.25; // and its top line slopes down gently
        z *= 1.7;
      }
      pos.setXYZ(i, cx + x * w * 0.95, cy - R * 0.2 + y * R * 1.3, cz + R * 0.35 + z * R * 2.0);
    }
    g.computeVertexNormals();
    const stripe = cy + R * 0.42;
    return part(g, MAT.paint, (p) => (Math.abs(p.y - stripe) < 0.013 ? cRed : cWhite));
  };
  const MR = 0.215, MW = 0.15;
  for (const side of [1, -1]) {
    // Leg: a flat steel bar curving down and out to the axle.
    const pts = [V(side * 0.42, 0.78, -0.08), V(side * 0.7, 0.62, -0.06), V(side * 0.98, 0.42, -0.03), V(side * 1.17, MR + 0.04, 0)];
    const rings = pts.map((p, i) => {
      const w = lerp(0.075, 0.05, i / 3), h = 0.022;
      return [V(p.x, p.y + h, p.z - w / 2), V(p.x, p.y + h, p.z + w / 2), V(p.x, p.y - h, p.z + w / 2), V(p.x, p.y - h, p.z - w / 2)];
    });
    add("body", part(loft(rings), MAT.paint, cWhite));
    // A step on the leg, for climbing in.
    add("body", part(new THREE.BoxGeometry(0.12, 0.012, 0.09).applyMatrix4(T(side * 0.8, 0.56, 0.02)), MAT.metal, cMetal));
    add("body", fairing(side * 1.27, MR, 0, MR, MW));
    const W = V(side * 1.27, MR, 0);
    nodes[side > 0 ? "wheelL" : "wheelR"] = { parts: wheelParts(MR, MW), translation: [W.x, W.y, W.z], moving: true };
    rig.wheelRadius[side > 0 ? "wheelL" : "wheelR"] = MR;
  }
  {
    const NR = 0.19, NW = 0.13;
    const P = V(0, 0.8, 1.5), W = V(0, NR, 1.65);
    const parts = [
      part(cylinderBetween(P, V(0, 0.5, 1.6), 0.042, 12), MAT.paint, cWhite),
      part(cylinderBetween(V(0, 0.52, 1.6), V(0, 0.36, 1.635), 0.03, 12), MAT.metal, C("#e8eaec")),
      part(cylinderBetween(V(0.085, 0.38, 1.64), V(0.085, NR, 1.65), 0.018, 8), MAT.paint, cWhite),
      part(cylinderBetween(V(-0.085, 0.38, 1.64), V(-0.085, NR, 1.65), 0.018, 8), MAT.paint, cWhite),
      part(new THREE.BoxGeometry(0.2, 0.03, 0.06).applyMatrix4(T(0, 0.38, 1.64)), MAT.paint, cWhite),
      fairing(0, NR, 1.65, NR, NW),
    ];
    nodes.gearN = asNode(parts, P, V(1, 0, 0), V(0, 1, 0), { moving: true });
    const m = new THREE.Matrix4().compose(V(...nodes.gearN.translation), new THREE.Quaternion(...nodes.gearN.rotation), V(1, 1, 1)).invert();
    const local = W.clone().applyMatrix4(m);
    nodes.wheelN = { parts: wheelParts(NR, NW), translation: [local.x, local.y, local.z], parent: "gearN", moving: true };
    rig.wheelRadius.wheelN = NR;
  }

  // ---- spinner and propeller (1.9 m, two blades with painted tips)
  const PY = 1.165, PZ = 2.5;
  add("body", part(lathe([[0.17, 0], [0.165, 0.08], [0.13, 0.2], [0.06, 0.3], [0.001, 0.34]], 22, T(0, PY, 2.46)), MAT.paint, cWhite));
  {
    const parts = [];
    for (let i = 0; i < 2; i++) {
      const b = new THREE.BoxGeometry(0.15, 0.95, 0.03, 1, 10, 1);
      const p = b.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k) + 0.475 + 0.08;
        const t = (y - 0.08) / 0.95;
        const chord = (0.55 + 0.5 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.75)) * (t > 0.92 ? 1 - (t - 0.92) * 6 : 1);
        let x = p.getX(k) * chord;
        let z = p.getZ(k);
        const ang = (1 - t) * 0.65 + 0.15;
        [x, z] = [x * Math.cos(ang) - z * Math.sin(ang), x * Math.sin(ang) + z * Math.cos(ang)];
        p.setXYZ(k, x, y, z);
      }
      b.applyMatrix4(RZ(i * Math.PI));
      parts.push(part(b, MAT.dark, (q) => {
        const r = Math.hypot(q.x, q.y);
        return r > 0.97 ? cRed : r > 0.93 ? C("#f2f2ee") : r > 0.89 ? cRed : C("#3a3d42");
      }, { smooth: true }));
    }
    nodes.prop = { parts, translation: [0, PY, PZ] };
    // What the eye sees of a fast-turning propeller: a faint disc, with the tips a pale ring.
    const disc = new THREE.RingGeometry(0.17, 0.95, 40, 3);
    nodes.propDisc = { parts: [part(disc, XMAT.blur, (p) => (Math.hypot(p.x, p.y) > 0.86 ? C("#d88a8a") : C("#2a2c30")), { noAO: true, noOcclude: true })], translation: [0, PY, PZ + 0.01] };
  }

  // ---- inside: floor, walls, ceiling, instrument panel, yokes, seats
  const cCarpet = C("#3b3e43"), cWall = C("#b9b3a7"), cCeiling = C("#d9d5cc"), cPanel = C("#34373b"), cSeat = C("#6d6458"), cSeatDark = C("#4f4840");
  const box = (w, h, d, x, y, z, rx = 0) => new THREE.BoxGeometry(w, h, d).applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), V(1, 1, 1)));
  /** A padded shape (seats): a box with soft rounded edges. */
  const pad = (w, h, d, x, y, z, rx = 0, r = 0.035) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2)).applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), V(1, 1, 1)));
  add("body", part(box(1.04, 0.03, 2.1, 0, 0.84, 0.2), XMAT.fabric, cCarpet, INSIDE));
  for (const side of [1, -1]) add("body", part(box(0.02, SILL - 0.84, 2.1, side * 0.528, (SILL + 0.84) / 2, 0.2), XMAT.fabric, cWall, INSIDE));
  add("body", part(box(1.06, 0.015, 1.68, 0, ROOF - 0.03, 0.03), XMAT.fabric, cCeiling, INSIDE));
  // Panel: a vertical slab facing the seats, with a glareshield over it.
  const PZP = 1.24;
  add("body", part(box(1.04, 0.42, 0.05, 0, 1.2, PZP + 0.025), MAT.dark, cPanel, INSIDE));
  add("body", part(box(1.06, 0.04, 0.2, 0, 1.43, PZP - 0.02), MAT.dark, cBlack, INSIDE));
  // Round dials: the classic "six-pack" in front of the pilot (left seat, +X).
  const dial = (x, y, r = 0.04) => {
    add("body", part(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.01, 24).applyMatrix4(RX(Math.PI / 2)).applyMatrix4(T(x, y, PZP - 0.003)), MAT.metal, C("#55585c"), { noAO: true }));
    add("body", part(new THREE.CylinderGeometry(r, r, 0.01, 24).applyMatrix4(RX(Math.PI / 2)).applyMatrix4(T(x, y, PZP - 0.007)), MAT.dark, cBlack, { noAO: true }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      add("body", part(new THREE.BoxGeometry(0.003, r * 0.22, 0.002).applyMatrix4(RZ(-a)).applyMatrix4(T(x - Math.sin(a) * r * 0.8, y + Math.cos(a) * r * 0.8, PZP - 0.013)), MAT.white, C("#ffffff"), { noAO: true }));
    }
  };
  const needle = (name, x, y, len, color = "#f4f4f0") => {
    nodes[name] = { parts: [part(new THREE.BoxGeometry(0.004, len, 0.002).applyMatrix4(T(0, len * 0.4, 0)), MAT.white, C(color), { noAO: true })], translation: [x, y, PZP - 0.016] };
  };
  const SIX = { x: 0.3, top: 1.3, bot: 1.19, dx: 0.095 };
  for (const dy of [SIX.top, SIX.bot]) for (const dx of [SIX.dx, 0, -SIX.dx]) dial(SIX.x + dx, dy);
  needle("needleIas", SIX.x + SIX.dx, SIX.top, 0.034);
  needle("needleAlt", SIX.x - SIX.dx, SIX.top, 0.03);
  // Attitude indicator: a sky-over-ground ball that turns with the bank, behind a fixed
  // orange playne symbol.
  {
    const r = 0.037;
    const sky = new THREE.CircleGeometry(r, 20, 0, Math.PI).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
    const ground = new THREE.CircleGeometry(r, 20, Math.PI, Math.PI).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
    nodes.attBall = {
      parts: [
        part(sky, MAT.paint, C("#3f86d6"), { noAO: true }),
        part(ground, MAT.paint, C("#8a5a32"), { noAO: true }),
        part(new THREE.BoxGeometry(r * 2, 0.003, 0.002), MAT.white, C("#ffffff"), { noAO: true }),
      ],
      translation: [SIX.x, SIX.top, PZP - 0.014],
    };
    add("body", part(new THREE.BoxGeometry(0.045, 0.005, 0.003).applyMatrix4(T(SIX.x, SIX.top - 0.004, PZP - 0.02)), MAT.paint, C("#f29a1d"), { noAO: true }));
    add("body", part(new THREE.BoxGeometry(0.006, 0.006, 0.003).applyMatrix4(T(SIX.x, SIX.top, PZP - 0.02)), MAT.paint, C("#f29a1d"), { noAO: true }));
  }
  // The other needles are fixed (heading card, turn coordinator, climb).
  for (const [dx, dy] of [[SIX.dx, SIX.bot], [0, SIX.bot], [-SIX.dx, SIX.bot]]) {
    add("body", part(new THREE.BoxGeometry(0.004, 0.03, 0.002).applyMatrix4(RZ(dx > 0 ? 0.4 : dx < 0 ? -1.5 : 0)).applyMatrix4(T(SIX.x + dx, dy + 0.008, PZP - 0.016)), MAT.white, C("#ffffff"), { noAO: true }));
  }
  // Radio stack in the middle, engine gauges and a glovebox on the right.
  for (let i = 0; i < 4; i++) {
    add("body", part(box(0.17, 0.045, 0.012, 0.04, 1.36 - i * 0.055, PZP - 0.005), MAT.dark, C("#1d1f22"), INSIDE));
    add("body", part(box(0.05, 0.018, 0.004, 0.0, 1.36 - i * 0.055, PZP - 0.012), XMAT.screen, C("#ffffff"), { noAO: true }));
    for (const kx of [0.085, 0.1]) add("body", part(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10).applyMatrix4(RX(Math.PI / 2)).applyMatrix4(T(kx, 1.36 - i * 0.055, PZP - 0.014)), MAT.metal, cMetal));
  }
  for (const [x, y] of [[-0.14, 1.32], [-0.22, 1.32], [-0.14, 1.23], [-0.22, 1.23]]) dial(x, y, 0.028);
  add("body", part(box(0.24, 0.12, 0.01, -0.34, 1.12, PZP - 0.004), MAT.dark, C("#2a2c30"), INSIDE));
  // Throttle (black) and mixture (red) knobs under the radios; the trim wheel low down.
  add("body", part(cylinderBetween(V(0.05, 1.07, PZP), V(0.05, 1.07, PZP - 0.07), 0.006, 6), MAT.metal, cMetal));
  add("body", part(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12).applyMatrix4(RX(Math.PI / 2)).applyMatrix4(T(0.05, 1.07, PZP - 0.08)), MAT.dark, cBlack));
  add("body", part(cylinderBetween(V(-0.02, 1.07, PZP), V(-0.02, 1.07, PZP - 0.05), 0.005, 6), MAT.metal, cMetal));
  add("body", part(new THREE.CylinderGeometry(0.015, 0.015, 0.018, 12).applyMatrix4(RX(Math.PI / 2)).applyMatrix4(T(-0.02, 1.07, PZP - 0.06)), MAT.paint, C("#c21f26")));
  add("body", part(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 18).applyMatrix4(RZ(Math.PI / 2)).applyMatrix4(T(0.02, 0.94, 0.95)), MAT.dark, cBlack, INSIDE));
  // Two control wheels ("yokes") on shafts through the panel, and rudder pedals.
  for (const x of [0.3, -0.3]) {
    add("body", part(cylinderBetween(V(x, 1.13, PZP), V(x, 1.13, 1.0), 0.016, 10), MAT.metal, cMetal, INSIDE));
    add("body", part(box(0.06, 0.06, 0.05, x, 1.13, 0.99), MAT.dark, cBlack, INSIDE));
    add("body", part(cylinderBetween(V(x - 0.13, 1.13, 0.98), V(x + 0.13, 1.13, 0.98), 0.016, 10), MAT.dark, cBlack, INSIDE));
    for (const s of [-1, 1]) add("body", part(cylinderBetween(V(x + s * 0.13, 1.13, 0.98), V(x + s * 0.14, 1.24, 0.98), 0.019, 10), MAT.dark, cBlack, INSIDE));
    for (const s of [-1, 1]) add("body", part(box(0.08, 0.13, 0.02, x + s * 0.09, 0.95, 1.12, -0.5), MAT.metal, C("#5c6066"), INSIDE));
  }
  // Seats: two in front, a bench behind. Backs recline (a negative turn about x tips the top
  // toward the tail).
  // Front seats are drawn from their side profile: the back reclines 17 degrees from the
  // rear of the cushion, bulges a little at the small of the back, and rises into a narrower
  // headrest that is part of the same upholstery. The profile is extruded across the seat's
  // width with rounded edges.
  const SEAT = { hz: 0.29, hy: 1.05, rec: 0.3 };
  const seatDir = [-Math.sin(SEAT.rec), Math.cos(SEAT.rec)], seatFwd = [Math.cos(SEAT.rec), Math.sin(SEAT.rec)];
  /** A point on the seat back: u up along the back from the hinge, v forward from its front face. */
  const seatPt = (u, v) => [SEAT.hz + seatDir[0] * u + seatFwd[0] * v, SEAT.hy + seatDir[1] * u + seatFwd[1] * v];
  const profileSlab = (x, width, front, rear, bev = 0.018) => {
    // front, rear: [u, v] lists, bottom to top (the outline is front up, then rear down).
    const shape = new THREE.Shape();
    const outline = [...front, ...[...rear].reverse()].map(([u, v]) => seatPt(u, v));
    shape.moveTo(-outline[0][0], outline[0][1]);
    for (const [z, y] of outline.slice(1)) shape.lineTo(-z, y);
    shape.closePath();
    const depth = width - 2 * bev;
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 4 });
    // Shape x = -z, y = y, extruded along its z: turn so the extrusion runs across the cabin.
    return g.applyMatrix4(RY(Math.PI / 2)).applyMatrix4(T(x - depth / 2, 0, 0));
  };
  for (const x of [0.27, -0.27]) {
    // Cushion, its front edge a little higher than the back (thighs supported).
    add("body", part(pad(0.44, 0.12, 0.48, x, 0.99, 0.52, -0.07), XMAT.fabric, cSeat, INSIDE));
    const b = 0.018; // the rounded edge adds this all round, so the outline is drawn inside it
    add("body", part(profileSlab(x, 0.44,
      [[0.02, -b], [0.12, 0.02 - b], [0.25, 0.03 - b], [0.4, 0.018 - b], [0.55, 0.004 - b], [0.63, -b]],
      [[0.02, -0.11 + b], [0.3, -0.1 + b], [0.63, -0.085 + b]]), XMAT.fabric, cSeat, INSIDE));
    add("body", part(profileSlab(x, 0.28,
      [[0.6, -0.002 - b], [0.7, 0.006 - b], [0.8, -b]],
      [[0.6, -0.075 + b], [0.8, -0.07 + b]], 0.03), XMAT.fabric, cSeat, INSIDE));
    // A darker seam where the headrest meets the back.
    add("body", part(profileSlab(x, 0.3, [[0.6, -0.012], [0.612, -0.012]], [[0.6, -0.068], [0.612, -0.068]], 0.004), XMAT.fabric, cSeatDark, INSIDE));
    // Seat frame and rails under the cushion.
    add("body", part(box(0.38, 0.1, 0.4, x, 0.89, 0.52), MAT.dark, C("#2b2d30"), INSIDE));
    for (const s of [-1, 1]) add("body", part(box(0.03, 0.02, 0.7, x + s * 0.15, 0.855, 0.55), MAT.metal, cMetal, INSIDE));
  }
  // The rear bench: one cushion, a back split in two (each side folds on the real one).
  add("body", part(pad(0.98, 0.11, 0.44, 0, 0.95, -0.42), XMAT.fabric, cSeat, INSIDE));
  for (const x of [0.245, -0.245]) add("body", part(pad(0.47, 0.56, 0.1, x, 1.24, -0.66, -0.18), XMAT.fabric, cSeat, INSIDE));

  // ---- the pilot, in the left seat with a headset, hands on the control wheel
  {
    const pp = [];
    const cShirt = C("#3d6ea8"), cTrousers = C("#6d6550"), cSkin = C("#d9a77f"), cHair = C("#4a3626"), cHeadset = C("#24262a");
    const limb = (a, b, r, c) => pp.push(part(cylinderBetween(a, b, r, 10), XMAT.fabric, c, INSIDE));
    const ball = (p, r, c, mat = XMAT.fabric) => pp.push(part(new THREE.SphereGeometry(r, 14, 10).applyMatrix4(T(p.x, p.y, p.z)), mat, c, INSIDE));
    const x = 0.27;
    pp.push(part(new THREE.SphereGeometry(1, 16, 12).applyMatrix4(new THREE.Matrix4().compose(V(x, 1.3, 0.35), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0)), V(0.18, 0.26, 0.12))), XMAT.fabric, cShirt, INSIDE));
    // Sitting back in the seat: the torso along the seat back, the head just clear of the headrest.
    const head = V(x, 1.66, 0.235);
    limb(V(x, 1.48, 0.3), head.clone().add(V(0, -0.06, 0.01)), 0.045, cSkin);
    ball(head, 0.1, cSkin);
    pp.push(part(new THREE.SphereGeometry(0.104, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45).applyMatrix4(new THREE.Matrix4().compose(head.clone().add(V(0, 0.005, -0.012)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), V(1, 1, 1))), XMAT.fabric, cHair, INSIDE));
    for (const s of [-1, 1]) ball(head.clone().add(V(s * 0.1, -0.01, 0)), 0.04, cHeadset, MAT.dark);
    pp.push(part(new THREE.TorusGeometry(0.105, 0.012, 6, 16, Math.PI).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)).applyMatrix4(new THREE.Matrix4().makeRotationX(0)).applyMatrix4(T(head.x, head.y + 0.005, head.z)), MAT.dark, cHeadset, INSIDE));
    pp.push(part(cylinderBetween(head.clone().add(V(0.1, -0.03, 0.02)), head.clone().add(V(0.03, -0.07, 0.1)), 0.006, 6), MAT.dark, cHeadset, INSIDE));
    for (const s of [-1, 1]) {
      const sh = V(x + s * 0.17, 1.46, 0.31), el = V(x + s * 0.2, 1.24, 0.6), hand = V(x + s * 0.135, 1.2, 0.97);
      limb(sh, el, 0.042, cShirt);
      limb(el, hand, 0.036, cSkin);
      ball(hand, 0.035, cSkin);
      const hip = V(x + s * 0.09, 1.11, 0.41), knee = V(x + s * 0.11, 1.15, 0.8), foot = V(x + s * 0.1, 0.9, 1.08);
      limb(hip, knee, 0.065, cTrousers);
      ball(knee, 0.063, cTrousers);
      limb(knee, foot, 0.05, cTrousers);
      pp.push(part(new THREE.BoxGeometry(0.09, 0.07, 0.2).applyMatrix4(T(foot.x, foot.y - 0.02, foot.z + 0.04)), MAT.dark, C("#3a2d24"), INSIDE));
    }
    nodes.pilot = { parts: pp };
  }

  // Where the pilot's eyes are, and a passenger's in the left rear seat (looking out the window).
  // Where a seated person's eyes are: the pilot sits back against the seat (head just clear of
  // the headrest), about 0.22 m above the glareshield; the passenger on the left of the rear bench. A wide view (degrees, across
  // the longer side of the screen) takes in the panel, both windshield posts and the roof edge,
  // as a person sitting there sees them.
  rig.eye = [0.27, 1.67, 0.31];
  rig.windowEye = [0.2, 1.55, -0.45];
  rig.fov = 85;
  return { nodes, extraMaterials, rig };
}
