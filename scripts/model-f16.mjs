// The F-16 Fighting Falcon, built from its real proportions (metres): 14.5 m fuselage plus nose
// probe, 9.45 m span over the wingtip rails, 40-degree leading edges, 5.58 m tailplane span,
// 4.0 m wheelbase and 2.37 m wheel track, fin top about 5.1 m above the ground.
//
// glTF conventions (same as build-models.mjs): +Y up, nose toward +Z, left wing toward +X,
// origin on the ground between the main wheels.
//
// Nodes the game animates (see src/game/planeView.ts and the generated src/data/rigs.ts):
//   gearL gearR gearN      legs: rotate about their local X to retract (angles in the rig)
//   wheelL wheelR wheelN   children of the legs: spin about their local X
//   gearDoors              shown while the gear is out
//   ailL ailR              flaperons          elevL elevR   all-moving tailplanes
//   rudder                 brakeLU brakeLD brakeRU brakeRD  speedbrake petals beside the nozzle
//   burner                 afterburner flame  strobe        fin-top light
//   pilot canopy hudGlass  hidden when the camera is the pilot's eyes (rig.eye; rig.hud = the glass)

export function buildF16(ac, kit) {
  const { THREE, V, C, T, RZ, lerp, MAT, MATERIALS, loft, smooth, surface, controlSurface, lathe, cylinderBetween, registration, REGISTRATION, part, faceted, sheet, curve, asNode } = kit;

  // Extra materials (after the shared ones).
  const X0 = MATERIALS.length;
  const XMAT = { matte: X0, canopy: X0 + 1, hud: X0 + 2, burner: X0 + 3, screen: X0 + 4 };
  const extraMaterials = [
    { name: "matte", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.05, roughnessFactor: 0.55 }, doubleSided: true },
    // The F-16's canopy has a faint gold tint.
    { name: "canopy", pbrMetallicRoughness: { baseColorFactor: [0.72, 0.6, 0.34, 0.3], metallicFactor: 0.9, roughnessFactor: 0.04 }, alphaMode: "BLEND", doubleSided: true },
    { name: "hud", pbrMetallicRoughness: { baseColorFactor: [0.45, 0.95, 0.6, 0.14], metallicFactor: 0.2, roughnessFactor: 0.1 }, alphaMode: "BLEND", doubleSided: true },
    { name: "burner", pbrMetallicRoughness: { baseColorFactor: [1, 0.62, 0.25, 0.38], metallicFactor: 0, roughnessFactor: 1 }, emissiveFactor: [1, 0.55, 0.2], alphaMode: "BLEND", doubleSided: true },
    { name: "screen", pbrMetallicRoughness: { baseColorFactor: [0.02, 0.06, 0.035, 1], metallicFactor: 0.3, roughnessFactor: 0.2 }, emissiveFactor: [0.02, 0.12, 0.05], doubleSided: true },
  ];

  const nodes = {};
  const add = (node, pt) => (nodes[node] ??= { parts: [] }).parts.push(pt);
  const rig = { retractDeg: {}, wheelRadius: {} };

  // ---- colours: the three-grey scheme, a darker radome, and the livery accent on the fin
  const cDark = C("#667079"), cMid = C("#8c97a0"), cLight = C("#b3bcc4"), cRadome = C("#5f676f");
  const cTub = C("#33373b");
  const cAccent = C(ac.livery.accent), cLine = C("#4a5158"), cBlack = C("#15171a"), cMetal = C("#8a8f96"), cHot = C("#4a4744");
  const camo = (p, n) => {
    if (inTub(p)) return cTub;
    if (p.z > 6.28) return cRadome;
    if (n.y < -0.3) return cLight;
    if (n.y > 0.15 && Math.abs(p.x) < 2.5 && p.z > -3.2 && p.z < 5.9) return cDark;
    return cMid;
  };

  // ---- canopy outline: one-piece bubble [z, half-width, sill, top], then the fairing behind it
  const canopy = curve([
    [5.5, 0.02, 2.3, 2.31],
    [5.2, 0.22, 2.27, 2.5],
    [4.8, 0.34, 2.25, 2.74],
    [4.3, 0.41, 2.24, 2.92],
    [3.8, 0.43, 2.24, 2.98],
    [3.2, 0.43, 2.26, 2.95],
    [2.7, 0.41, 2.3, 2.86],
    [2.35, 0.4, 2.33, 2.76],
    [1.6, 0.34, 2.38, 2.58],
    [0.7, 0.2, 2.4, 2.47],
  ]);
  // The cockpit tub: a trough cut into the top of the fuselage under the glass.
  const TUB0 = 2.5, TUB1 = 5.2, TUB_DEPTH = 0.6;
  const tubHalf = (z) => (z > TUB0 && z < TUB1 ? Math.max(0, canopy(z)[0] - 0.035) : 0);
  const tubFloor = (z) => canopy(z)[1] - TUB_DEPTH * Math.max(0, Math.min(1, (z - TUB0) / 0.1, (TUB1 - z) / 0.55));
  const inTub = (p) => p.z > TUB0 - 0.02 && p.z < TUB1 + 0.02 && Math.abs(p.x) < tubHalf(p.z) + 0.01 && p.y > 1.52 && p.y < canopy(p.z)[1] - 0.03;

  // ---- fuselage: [z, half-width, top, bottom, roundness]
  const body = curve([
    [8.0, 0.015, 1.925, 1.895, 2.0],
    [7.8, 0.09, 1.99, 1.81, 2.0],
    [7.5, 0.165, 2.05, 1.72, 2.0],
    [7.0, 0.26, 2.13, 1.61, 2.0],
    [6.5, 0.34, 2.19, 1.53, 2.0],
    [6.0, 0.41, 2.24, 1.47, 2.0],
    [5.4, 0.49, 2.28, 1.43, 2.1],
    [4.6, 0.56, 2.27, 1.42, 2.3],
    [3.6, 0.63, 2.27, 1.38, 2.4],
    [2.6, 0.71, 2.33, 1.22, 2.5],
    [1.6, 0.79, 2.44, 0.99, 2.6],
    [0.6, 0.83, 2.44, 0.95, 2.7],
    [-0.6, 0.84, 2.4, 0.95, 2.7],
    [-2.0, 0.8, 2.36, 1.0, 2.6],
    [-3.4, 0.72, 2.32, 1.07, 2.4],
    [-4.6, 0.64, 2.3, 1.1, 2.2],
    [-5.5, 0.6, 2.29, 1.11, 2.0],
  ]);
  const superRing = (z, hw, top, bot, e, n, grow = 0) => {
    const yc = (top + bot) / 2, hh = (top - bot) / 2 + grow;
    const r = [];
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      r.push(V(Math.sign(c) * Math.abs(c) ** (2 / e) * (hw + grow), yc + Math.sign(s) * Math.abs(s) ** (2 / e) * hh, z));
    }
    return r;
  };
  const bodyRing = (z, grow = 0, n = 64) => superRing(z, ...body(z), n, grow);
  /** Half-width of the fuselage at height y. */
  const bodyX = (z, y) => {
    const [hw, top, bot, e] = body(z);
    const s = Math.min(1, Math.abs((y - (top + bot) / 2) / ((top - bot) / 2)));
    return hw * (1 - s ** e) ** (1 / e);
  };
  const zs = [];
  for (let z = 8.0; z > 6.0; z -= 0.1) zs.push(z);
  for (let z = 6.0; z > -5.5; z -= 0.2) zs.push(z);
  zs.push(-5.5, TUB1 + 0.01, TUB1 - 0.02, TUB1 - 0.55, TUB0 + 0.1, TUB0 + 0.01, TUB0 - 0.01);
  zs.sort((p, q) => q - p);
  const tubRing = (z) => bodyRing(z).map((p) => (Math.abs(p.x) < tubHalf(z) && p.y > 2.0 ? V(p.x, tubFloor(z), p.z) : p));
  add("body", part(smooth(loft(zs.map((z) => tubRing(z)))), XMAT.matte, camo));
  // Panel lines around the fuselage (thin dark bands just proud of the skin).
  for (const z of [6.28, 5.55, 1.1, -1.9, -3.7, -5.42]) {
    add("body", part(smooth(loft([bodyRing(z + 0.008, 0.004), bodyRing(z - 0.008, 0.004)], { capStart: false, capEnd: false })), XMAT.matte, cLine, { noAO: true, noOcclude: true }));
  }
  // Nose probe.
  add("body", part(cylinderBetween(V(0, 1.91, 7.95), V(0, 1.91, 8.5), 0.012, 8), MAT.metal, cMetal));

  // ---- chin intake: [z, half-width, top, bottom]
  const intake = curve([
    [4.55, 0.5, 1.36, 0.93],
    [4.2, 0.54, 1.38, 0.9],
    [3.4, 0.6, 1.4, 0.88],
    [2.4, 0.68, 1.36, 0.92],
    [1.4, 0.74, 1.25, 0.97],
    [0.9, 0.74, 1.2, 1.0],
  ]);
  const intakeRing = (z, k = 1, zAt = z) => {
    const [hw, top, bot] = intake(z);
    const yc = (top + bot) / 2;
    return superRing(zAt, hw * k, yc + ((top - bot) / 2) * k, yc - ((top - bot) / 2) * k, 3.2, 48);
  };
  const izs = [];
  for (let z = 4.55; z > 0.9; z -= 0.2) izs.push(z);
  izs.push(0.9);
  add("body", part(smooth(loft(izs.map((z) => intakeRing(z)), { capStart: false })), XMAT.matte, camo));
  add("body", part(smooth(loft([intakeRing(4.55), intakeRing(4.55, 0.9, 4.53)], { capStart: false, capEnd: false })), XMAT.matte, cMid));
  add("body", part(smooth(loft([intakeRing(4.55, 0.9, 4.53), intakeRing(4.1, 0.84), intakeRing(3.4, 0.7)], { capStart: false })), MAT.dark, cBlack));

  // ---- strakes, wing blend and the shelves beside the engine: [z, half-width, thickness, height]
  const shelf = curve([
    [5.3, 0.5, 0.02, 1.95],
    [4.6, 0.64, 0.05, 1.93],
    [3.6, 0.82, 0.08, 1.9],
    [2.6, 1.02, 0.12, 1.86],
    [1.8, 1.25, 0.18, 1.82],
    [1.0, 1.4, 0.26, 1.78],
    [0.0, 1.4, 0.3, 1.76],
    [-1.5, 1.38, 0.3, 1.76],
    [-3.0, 1.32, 0.26, 1.76],
    [-3.6, 1.28, 0.22, 1.76],
    [-5.2, 1.22, 0.2, 1.76],
  ]);
  const szs = [];
  for (let z = 5.3; z > -5.2; z -= 0.25) szs.push(z);
  szs.push(-5.2);
  add("body", part(smooth(loft(szs.map((z) => {
    const [w, t, yc] = shelf(z);
    return superRing(z, w, yc + t / 2, yc - t / 2, 2.0, 40);
  }))), XMAT.matte, camo));

  // ---- wings (40-degree leading edge, straight trailing edge) with flaperons
  const WY = 1.76;
  const wing = { rootX: 1.3, tipX: 4.72, rootLEz: 0.95, tipLEz: -1.92, rootChord: 3.95, tipChord: 1.0, thick: 0.045 };
  const wingAt = (t, side) => ({ le: V(side * lerp(wing.rootX, wing.tipX, t), WY, lerp(wing.rootLEz, wing.tipLEz, t)), ch: lerp(wing.rootChord, wing.tipChord, t) });
  const F0 = 0.03, F1 = 0.615, CUT = 0.8;
  for (const side of [1, -1]) {
    add("body", part(surface({
      rootLE: wingAt(0, side).le, tipLE: wingAt(1, side).le, rootChord: wing.rootChord, tipChord: wing.tipChord, thickness: wing.thick, camber: 0,
      stations: [{ t: 0, cut: 1 }, { t: F0, cut: 1 }, { t: F0, cut: CUT }, { t: F1, cut: CUT }, { t: F1, cut: 1 }, { t: 0.8, cut: 1 }, { t: 1, cut: 1 }],
    }), XMAT.matte, camo));
    // Flaperon (hinge toward +X on both sides, so "negative = trailing edge down" holds).
    const h0 = wingAt(F0, side), h1 = wingAt(F1, side);
    const p0 = h0.le.clone().add(V(0, 0, -CUT * h0.ch)), p1 = h1.le.clone().add(V(0, 0, -CUT * h1.ch));
    const [a, b, ca, cb, th] = side > 0 ? [p0, p1, (1 - CUT) * h0.ch, (1 - CUT) * h1.ch, 0.021 * h0.ch] : [p1, p0, (1 - CUT) * h1.ch, (1 - CUT) * h0.ch, 0.021 * h1.ch];
    const cs = controlSurface(a, b, ca, cb, th);
    nodes[side > 0 ? "ailL" : "ailR"] = { parts: [part(cs.geo, XMAT.matte, cMid)], translation: cs.translation, rotation: cs.rotation };
    // Leading-edge flap line (top and bottom): a thin dark strip at 13% chord.
    for (const s of [1, -1]) {
      const rows = [0.02, 0.98].map((t) => {
        const w = wingAt(t, side);
        const y = WY + s * (0.0855 * 5 * wing.thick * w.ch + 0.003);
        return [V(w.le.x, y, w.le.z - 0.125 * w.ch), V(w.le.x, y, w.le.z - 0.125 * w.ch - 0.014)];
      });
      add("body", part(sheet(rows), XMAT.matte, cLine, { noAO: true, noOcclude: true }));
    }
    // Wingtip launch rail and navigation light.
    const rx = side * 4.77;
    add("body", part(cylinderBetween(V(rx, WY, -3.2), V(rx, WY, -0.55), 0.055, 12), XMAT.matte, cMid));
    add("body", part(lathe([[0.055, 0], [0.045, 0.12], [0.02, 0.22], [0.001, 0.26]], 12, T(rx, WY, -0.55)), XMAT.matte, cMid));
    add("body", part(new THREE.SphereGeometry(0.035, 10, 8).applyMatrix4(T(rx + side * 0.03, WY, -1.6)), side > 0 ? MAT.navRed : MAT.navGreen, C("#ffffff"), { noAO: true }));
  }

  // ---- all-moving tailplanes (10 degrees of droop)
  const A10 = (10 * Math.PI) / 180;
  for (const side of [1, -1]) {
    const rootLE = V(side * 1.15, 1.76, -3.85);
    const tipLE = V(side * 2.79, 1.76 - 1.64 * Math.tan(A10), -5.23);
    const g = surface({ rootLE, tipLE, rootChord: 2.35, tipChord: 0.6, thickness: 0.04, camber: 0, up: V(side * Math.sin(A10), Math.cos(A10), 0), stations: [{ t: 0 }, { t: 0.5 }, { t: 1 }] });
    const pivot = V(side * 1.18, 1.755, -4.9);
    nodes[side > 0 ? "elevL" : "elevR"] = asNode([part(g, XMAT.matte, camo)], pivot, V(Math.cos(A10), -side * Math.sin(A10), 0));
  }

  // ---- fin, rudder, dorsal fairing and ventral fins
  const fin = { rootLE: V(0, 2.3, -2.3), tipLE: V(0, 5.0, -5.1), rootChord: 2.75, tipChord: 0.95 };
  const finAt = (t) => ({ le: fin.rootLE.clone().lerp(fin.tipLE, t), ch: lerp(fin.rootChord, fin.tipChord, t) });
  const R0 = 0.1, R1 = 0.74, RC = 0.74;
  const finColor = (p) => (p.y > 4.62 ? cAccent : cMid);
  add("body", part(surface({
    rootLE: fin.rootLE, tipLE: fin.tipLE, rootChord: fin.rootChord, tipChord: fin.tipChord, thickness: 0.05, camber: 0, up: V(1, 0, 0),
    stations: [{ t: 0, cut: 1 }, { t: R0, cut: 1 }, { t: R0, cut: RC }, { t: R1, cut: RC }, { t: R1, cut: 1 }, { t: 0.86, cut: 1 }, { t: 0.865, cut: 1 }, { t: 1, cut: 1 }],
  }), XMAT.matte, finColor));
  {
    const a = finAt(R0), b = finAt(R1);
    const cs = controlSurface(a.le.clone().add(V(0, 0, -RC * a.ch)), b.le.clone().add(V(0, 0, -RC * b.ch)), (1 - RC) * a.ch, (1 - RC) * b.ch, 0.028 * a.ch);
    nodes.rudder = { parts: [part(cs.geo, XMAT.matte, cMid)], translation: cs.translation, rotation: cs.rotation };
  }
  const dorsal = curve([
    [-0.5, 0.04, 2.42, 2.3],
    [-2.0, 0.14, 2.56, 2.2],
    [-3.5, 0.17, 2.64, 2.2],
    [-5.3, 0.15, 2.6, 2.1],
    [-5.95, 0.07, 2.46, 2.2],
  ]);
  const dzs = [];
  for (let z = -0.5; z > -5.95; z -= 0.3) dzs.push(z);
  dzs.push(-5.95);
  add("body", part(smooth(loft(dzs.map((z) => superRing(z, ...dorsal(z), 2.2, 20)))), XMAT.matte, cMid));
  for (const side of [1, -1]) {
    add("body", part(surface({
      rootLE: V(side * 0.4, 1.16, -3.85), tipLE: V(side * 0.57, 0.56, -4.3), rootChord: 1.3, tipChord: 0.75, thickness: 0.05, camber: 0,
      up: V(1, side * 0.27, 0).normalize(), stations: [{ t: 0 }, { t: 1 }],
    }), XMAT.matte, cMid));
  }
  nodes.strobe = { parts: [part(new THREE.SphereGeometry(0.05, 10, 8), MAT.white, C("#ffffff"), { noAO: true })], translation: [0, 5.05, -5.75] };

  // ---- canopy glass, fairing and sill rails (the outline is defined near the top)
  const arc = (z, n = 24, grow = 0) => {
    const [hw, sill, top] = canopy(z);
    const r = [];
    for (let j = 0; j <= n; j++) {
      const a = (j / n) * Math.PI;
      r.push(V(Math.cos(a) * (hw + grow), sill + Math.sin(a) ** 0.85 * (top - sill + grow), z));
    }
    return r;
  };
  const czs = [];
  for (let z = 5.5; z > 2.35; z -= 0.15) czs.push(z);
  czs.push(2.35);
  nodes.canopy = { parts: [part(sheet(czs.map((z) => arc(z))), XMAT.canopy, C("#ffffff"), { noAO: true, noOcclude: true })] };
  const fzs = [];
  for (let z = 2.35; z > 0.7; z -= 0.2) fzs.push(z);
  fzs.push(0.7);
  // Closed rings for the fairing (arc plus a floor), so it's solid behind the glass.
  add("body", part(smooth(loft(fzs.map((z) => [...arc(z, 20, 0.012), V(0, canopy(z)[1] - 0.08, z)]))), XMAT.matte, (p, n) => (p.z > 2.25 ? cLine : camo(p, n))));
  // Sill rails along both sides of the glass.
  for (const side of [1, -1]) {
    const rows = czs.filter((z) => z < 5.3).map((z) => {
      const [hw, sill] = canopy(z);
      return [V(side * (hw + 0.012), sill - 0.03, z), V(side * (hw + 0.014), sill + 0.035, z)];
    });
    add("body", part(sheet(rows), XMAT.matte, cLine, { noAO: true, noOcclude: true }));
  }

  // ---- cockpit: seat, panel, consoles, stick and throttle, glareshield and HUD; then the pilot
  const cDeck = C("#26292d"), cPanel = C("#2e3236"), cSeat = C("#3d423a"), cSuit = C("#5d6b4a"), cHelmet = C("#d9dcde"), cVisor = C("#1a1d22"), cHarness = C("#8a8f7a");
  const cKnob = C("#b9bec4"), cBezel = C("#1b1d20");
  const box = (w, h, d, m) => new THREE.BoxGeometry(w, h, d).applyMatrix4(m);
  const quat = (rx, ry = 0, rz = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  const tilt = (x, y, z, rx, ry = 0, rz = 0) => new THREE.Matrix4().compose(V(x, y, z), quat(rx, ry, rz), V(1, 1, 1));
  const RECLINE = 0.52; // the F-16 seat leans back 30 degrees
  // Ejection seat: back, headrest, pan, side rails and the yellow-and-black pull handle.
  add("body", part(box(0.4, 1.07, 0.09, tilt(0, 2.265, 3.11, -RECLINE)), MAT.dark, cSeat));
  add("body", part(box(0.24, 0.16, 0.11, tilt(0, 2.72, 2.93, -RECLINE)), MAT.dark, cBezel));
  add("body", part(box(0.42, 0.1, 0.46, tilt(0, 1.83, 3.6, 0.08)), MAT.dark, cSeat));
  for (const sx of [-0.215, 0.215]) add("body", part(box(0.025, 0.2, 0.5, tilt(sx, 1.87, 3.58, 0.08)), MAT.dark, cBezel));
  add("body", part(box(0.1, 0.07, 0.03, tilt(0, 1.93, 3.85, 0.2)), MAT.paint, C("#f2c230")));
  for (const sx of [-0.03, 0.03]) add("body", part(box(0.018, 0.074, 0.034, tilt(sx, 1.93, 3.85, 0.2)), MAT.dark, cBezel));

  // Instrument panel: a slab facing the pilot, leaning away at the top. Things on it are placed
  // by (u = left, v = up the panel, w = out toward the pilot).
  const PT = 0.26, PC = V(0, 2.17, 4.22);
  const onPanel = (u, v, w = 0) => new THREE.Matrix4().compose(V(u, PC.y + v * Math.cos(PT) + w * Math.sin(PT), PC.z + v * Math.sin(PT) - w * Math.cos(PT)), quat(PT), V(1, 1, 1));
  const slab = (w, h, d, u, v, out = 0) => new THREE.BoxGeometry(w, h, d).applyMatrix4(onPanel(u, v, out));
  const dial = (r, u, v, out = 0.012, seg = 24, a0 = 0, a1 = Math.PI * 2) => new THREE.CylinderGeometry(r, r, 0.01, seg, 1, false, a0, a1).applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)).applyMatrix4(onPanel(u, v, out));
  const SCREEN = XMAT.screen;
  add("body", part(slab(0.74, 0.4, 0.03, 0, 0), MAT.dark, cPanel));
  add("body", part(slab(0.22, 0.28, 0.03, 0, -0.33), MAT.dark, cPanel));
  for (const side of [1, -1]) {
    add("body", part(slab(0.13, 0.2, 0.03, side * 0.305, -0.3), MAT.dark, cPanel));
    // Multi-function display: bezel, glowing screen, a row of buttons on every side.
    const u = side * 0.215;
    add("body", part(slab(0.165, 0.165, 0.014, u, 0, 0.018), MAT.dark, cBezel));
    add("body", part(slab(0.122, 0.122, 0.004, u, 0, 0.027), SCREEN, C("#ffffff"), { noAO: true }));
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * 0.024;
      for (const [du, dv] of [[o, 0.072], [o, -0.072], [0.072, o], [-0.072, o]]) add("body", part(slab(0.012, 0.012, 0.006, u + du, dv, 0.027), MAT.dark, cKnob, { noAO: true }));
    }
    // What's on the screens: a few glowing lines (a radar sweep on the left, a list on the right).
    if (side > 0) {
      add("body", part(slab(0.09, 0.003, 0.002, u, -0.02, 0.03), MAT.navGreen, C("#ffffff"), { noAO: true }));
      add("body", part(slab(0.003, 0.09, 0.002, u, 0, 0.03), MAT.navGreen, C("#ffffff"), { noAO: true }));
      add("body", part(dial(0.006, u + 0.025, 0.028, 0.03, 8), MAT.navGreen, C("#ffffff"), { noAO: true }));
    } else {
      for (let i = 0; i < 4; i++) add("body", part(slab(0.07 - i * 0.012, 0.004, 0.002, u - 0.012 - i * 0.006, 0.036 - i * 0.022, 0.03), MAT.navGreen, C("#ffffff"), { noAO: true }));
    }
    // Small round gauges beside the compass.
    add("body", part(dial(0.03, side * 0.095, -0.13, 0.016), MAT.dark, cBezel));
    add("body", part(dial(0.024, side * 0.095, -0.13, 0.019), MAT.glass, C("#ffffff"), { noAO: true }));
    add("body", part(slab(0.003, 0.02, 0.002, side * 0.095, -0.122, 0.026), MAT.white, C("#ffffff"), { noAO: true }));
  }
  // Keypad under the HUD, threat scope to its left, data display to its right.
  add("body", part(slab(0.16, 0.095, 0.02, 0, 0.14, 0.02), MAT.dark, cBezel));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) add("body", part(slab(0.02, 0.018, 0.008, (c - 2) * 0.028, 0.14 + (1 - r) * 0.026, 0.032), MAT.dark, cKnob, { noAO: true }));
  add("body", part(dial(0.04, 0.215, 0.145, 0.016), MAT.dark, cBezel));
  add("body", part(dial(0.032, 0.215, 0.145, 0.02), SCREEN, C("#ffffff"), { noAO: true }));
  add("body", part(slab(0.125, 0.05, 0.014, -0.215, 0.145, 0.018), MAT.dark, cBezel));
  add("body", part(slab(0.105, 0.032, 0.004, -0.215, 0.145, 0.027), SCREEN, C("#ffffff"), { noAO: true }));
  for (let i = 0; i < 2; i++) add("body", part(slab(0.08, 0.004, 0.002, -0.215, 0.152 - i * 0.014, 0.03), MAT.navGreen, C("#ffffff"), { noAO: true }));
  // Attitude ball (sky over ground) and the compass below it.
  add("body", part(dial(0.05, 0, 0, 0.016), MAT.dark, cBezel));
  add("body", part(dial(0.042, 0, 0, 0.02, 24, -Math.PI / 2, Math.PI), MAT.paint, C("#3f86d6"), { noAO: true }));
  add("body", part(dial(0.042, 0, 0, 0.02, 24, Math.PI / 2, Math.PI), MAT.paint, C("#7a5230"), { noAO: true }));
  add("body", part(slab(0.05, 0.004, 0.002, 0, 0, 0.028), MAT.paint, C("#f2c230"), { noAO: true }));
  add("body", part(dial(0.05, 0, -0.115, 0.016), MAT.dark, cBezel));
  add("body", part(dial(0.042, 0, -0.115, 0.02), MAT.glass, C("#ffffff"), { noAO: true }));
  add("body", part(slab(0.07, 0.003, 0.002, 0, -0.115, 0.027), MAT.white, C("#ffffff"), { noAO: true }));
  add("body", part(slab(0.003, 0.07, 0.002, 0, -0.115, 0.027), MAT.white, C("#ffffff"), { noAO: true }));
  // Landing gear handle (left side, with its wheel-shaped knob) and three green lights.
  add("body", part(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8).applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)).applyMatrix4(onPanel(0.305, -0.3, 0.04)), MAT.metal, cKnob));
  add("body", part(new THREE.CylinderGeometry(0.022, 0.022, 0.016, 14).applyMatrix4(RZ(Math.PI / 2)).applyMatrix4(onPanel(0.305, -0.3, 0.075)), MAT.paint, C("#f4f4f4")));
  for (const [du, dv] of [[0, 0.07], [-0.022, 0.045], [0.022, 0.045]]) add("body", part(dial(0.007, 0.305 + du, -0.3 + dv, 0.018, 8), MAT.navGreen, C("#ffffff"), { noAO: true }));
  // Switches on the centre pedestal and the right-hand panel.
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) add("body", part(slab(0.014, 0.022, 0.016, (c - 1) * 0.055, -0.27 - r * 0.055, 0.022), MAT.metal, cKnob, { noAO: true }));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) add("body", part(slab(0.014, 0.022, 0.016, -0.28 - c * 0.045, -0.24 - r * 0.05, 0.022), MAT.metal, cKnob, { noAO: true }));

  // Glareshield hood over the panel, and the HUD on top of it.
  const hood = curve([
    [4.1, 0.385, 2.3, 2.43],
    [4.4, 0.36, 2.29, 2.42],
    [4.8, 0.3, 2.27, 2.39],
    [5.2, 0.17, 2.28, 2.33],
  ]);
  const hoodRing = (z) => {
    const [hw, sill, top] = hood(z);
    const r = [];
    for (let j = 0; j <= 16; j++) {
      const a = (j / 16) * Math.PI;
      r.push(V(Math.cos(a) * hw, sill + Math.sin(a) ** 0.6 * (top - sill), z));
    }
    r.push(V(0, sill + (top - sill) * 0.55, z));
    return r;
  };
  add("body", part(smooth(loft([4.1, 4.25, 4.4, 4.6, 4.8, 5.0, 5.2].map(hoodRing))), MAT.dark, cDeck));
  const HUD = { centre: V(0, 2.79, 4.08), w: 0.24, h: 0.21, lean: -0.3 };
  add("body", part(box(0.22, 0.07, 0.2, tilt(0, 2.455, 4.3, 0.1)), MAT.dark, cBezel));
  add("body", part(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16).applyMatrix4(tilt(0, 2.495, 4.3, 0.1)), MAT.glass, C("#ffffff"), { noAO: true }));
  nodes.hudGlass = { parts: [part(box(HUD.w, HUD.h, 0.008, tilt(HUD.centre.x, HUD.centre.y, HUD.centre.z, HUD.lean)), XMAT.hud, C("#ffffff"), { noAO: true, noOcclude: true })] };
  for (const sx of [-1, 1]) {
    add("body", part(cylinderBetween(V(sx * (HUD.w / 2 + 0.005), 2.47, 4.26), V(sx * (HUD.w / 2 + 0.005), HUD.centre.y + HUD.h / 2, HUD.centre.z - 0.032), 0.007, 6), MAT.dark, cBezel, { noAO: true }));
  }
  add("body", part(box(HUD.w + 0.02, 0.012, 0.012, tilt(0, HUD.centre.y - HUD.h / 2, HUD.centre.z + 0.03, HUD.lean)), MAT.dark, cBezel, { noAO: true }));

  // Side consoles with rows of switches; throttle on the left, side-stick and armrest on the right.
  for (const side of [1, -1]) {
    add("body", part(box(0.19, 0.37, 1.4, tilt(side * 0.305, 1.845, 3.45, 0)), MAT.dark, cPanel));
    for (let i = 0; i < 6; i++) {
      const z = 2.9 + i * 0.13;
      if (side < 0 && z > 3.3 && z < 3.9) continue; // the armrest and stick live here
      if (side > 0 && z > 3.65 && z < 3.95) continue; // the throttle lives here
      for (let j = 0; j < 3; j++) add("body", part(box(0.012, 0.022, 0.012, tilt(side * (0.25 + j * 0.05), 2.04, z, 0)), MAT.metal, cKnob, { noAO: true }));
      add("body", part(box(0.17, 0.002, 0.004, tilt(side * 0.305, 2.031, z + 0.065, 0)), MAT.dark, cBezel, { noAO: true }));
    }
    for (const z of [4.0, 4.08]) add("body", part(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12).applyMatrix4(T(side * 0.3, 2.04, z)), MAT.dark, cKnob));
  }
  add("body", part(box(0.06, 0.012, 0.3, tilt(0.3, 2.034, 3.8, 0)), MAT.dark, cBezel));
  add("body", part(box(0.02, 0.09, 0.03, tilt(0.3, 2.07, 3.8, 0.25)), MAT.metal, cKnob));
  add("body", part(new THREE.CylinderGeometry(0.03, 0.034, 0.1, 12).applyMatrix4(tilt(0.3, 2.13, 3.815, 0.25, 0, Math.PI / 2)), MAT.dark, C("#3a3d42")));
  add("body", part(box(0.09, 0.035, 0.26, tilt(-0.3, 2.065, 3.45, 0)), MAT.dark, cSeat));
  add("body", part(new THREE.CylinderGeometry(0.036, 0.04, 0.035, 14).applyMatrix4(T(-0.3, 2.05, 3.74)), MAT.dark, cBezel));
  add("body", part(new THREE.CylinderGeometry(0.02, 0.026, 0.15, 12).applyMatrix4(tilt(-0.3, 2.135, 3.755, 0.22)), MAT.dark, C("#3a3d42")));
  add("body", part(new THREE.SphereGeometry(0.026, 12, 8).applyMatrix4(T(-0.3, 2.21, 3.775)), MAT.dark, C("#3a3d42")));
  add("body", part(new THREE.SphereGeometry(0.009, 8, 6).applyMatrix4(T(-0.285, 2.228, 3.785)), MAT.navRed, C("#ffffff"), { noAO: true }));

  // The pilot (hidden when you're looking out through their eyes): leaning back 30 degrees,
  // hands on the throttle and stick, legs under the panel.
  {
    const pp = [];
    const limb = (a, b, r) => pp.push(part(cylinderBetween(a, b, r, 10), MAT.dark, cSuit));
    const joint = (p, r, c = cSuit) => pp.push(part(new THREE.SphereGeometry(r, 10, 8).applyMatrix4(T(p.x, p.y, p.z)), MAT.dark, c));
    pp.push(part(new THREE.SphereGeometry(0.2, 16, 12).applyMatrix4(new THREE.Matrix4().compose(V(0, 2.2, 3.29), quat(-RECLINE), V(0.92, 1.75, 0.66))), MAT.dark, cSuit));
    for (const sx of [-0.085, 0.085]) pp.push(part(box(0.045, 0.42, 0.02, tilt(sx, 2.3, 3.36, -RECLINE)), MAT.dark, cHarness));
    const head = V(0, 2.8, 3.2);
    pp.push(part(new THREE.SphereGeometry(0.135, 20, 14).applyMatrix4(T(head.x, head.y, head.z)), MAT.paint, cHelmet));
    pp.push(part(new THREE.SphereGeometry(0.139, 20, 10, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.3).applyMatrix4(new THREE.Matrix4().compose(head, quat(Math.PI / 2), V(1, 1, 1))), MAT.glass, cVisor, { noAO: true }));
    pp.push(part(new THREE.SphereGeometry(0.06, 10, 8).applyMatrix4(T(0, 2.73, 3.32)), MAT.dark, cBezel));
    pp.push(part(cylinderBetween(V(0, 2.7, 3.36), V(0.08, 2.45, 3.4), 0.018, 6), MAT.dark, cBezel));
    for (const side of [1, -1]) {
      const sh = V(side * 0.2, 2.5, 3.15), el = V(side * 0.3, 2.22, 3.42), hand = side > 0 ? V(0.3, 2.14, 3.8) : V(-0.3, 2.19, 3.76);
      joint(sh, 0.06);
      limb(sh, el, 0.05);
      joint(el, 0.05);
      limb(el, hand, 0.042);
      joint(hand, 0.045, C("#3b3f36"));
      const hip = V(side * 0.1, 1.95, 3.48), knee = V(side * 0.17, 2.03, 3.95), foot = V(side * 0.17, 1.75, 4.3);
      limb(hip, knee, 0.07);
      joint(knee, 0.07);
      limb(knee, foot, 0.055);
    }
    nodes.pilot = { parts: pp };
  }
  // Where the pilot's eyes are, and where the HUD glass is (for the view from the cockpit).
  rig.eye = [0, 2.81, 3.3];
  rig.hud = { centre: [HUD.centre.x, HUD.centre.y, HUD.centre.z], halfHeight: HUD.h / 2 };

  // ---- registration on both sides, between the canopy and the wing
  for (const side of [1, -1]) {
    for (const b of registration(REGISTRATION, side, (z, y) => bodyX(z, y), 2.06, 1.15, 0.24)) add("body", part(b, XMAT.matte, C("#3d444b"), { noAO: true, noOcclude: true }));
  }

  // ---- engine nozzle ("turkey feathers") and afterburner
  const EY = 1.7;
  add("body", part(faceted(lathe([[0.6, 0.0], [0.6, -0.12], [0.56, -0.5], [0.47, -0.95]], 18, T(0, EY, -5.45))), MAT.metal, cHot));
  add("body", part(lathe([[0.45, -0.95], [0.5, -0.5], [0.42, -0.1], [0.001, -0.1]], 18, T(0, EY, -5.45)), MAT.dark, C("#1c1a19")));
  add("body", part(lathe([[0.3, -0.12], [0.34, -0.14], [0.3, -0.16]], 18, T(0, EY, -5.45)), MAT.metal, C("#5a5550")));
  nodes.burner = {
    parts: [
      part(lathe([[0.4, 0], [0.34, -0.9], [0.2, -1.9], [0.02, -2.9]], 16), XMAT.burner, C("#ffb060"), { noAO: true, noOcclude: true }),
      part(lathe([[0.24, 0.02], [0.16, -0.7], [0.02, -1.5]], 12), XMAT.burner, C("#fff2d0"), { noAO: true, noOcclude: true }),
    ],
    translation: [0, EY, -6.3],
  };

  // ---- speedbrakes: a pair of petals each side of the nozzle, hinged at the front
  for (const side of [1, -1]) {
    for (const up of [1, -1]) {
      const rows = [];
      for (const z of [-5.2, -6.25]) {
        const k = (z + 5.2) / -1.05;
        const y0 = 1.76, th = lerp(0.1, 0.015, k);
        rows.push([V(side * 0.7, y0, z), V(side * 0.7, y0 + up * th, z), V(side * lerp(1.22, 1.08, k), y0 + up * th * 0.6, z), V(side * lerp(1.22, 1.08, k), y0, z)]);
      }
      const g = smooth(loft(rows));
      nodes[`brake${side > 0 ? "L" : "R"}${up > 0 ? "U" : "D"}`] = asNode([part(g, XMAT.matte, cMid)], V(side * 0.95, 1.76 + up * 0.05, -5.2));
    }
  }

  // ---- landing gear
  const tyre = (R, w) => {
    const prof = [[R * 0.55, -w / 2], [R * 0.86, -w / 2], [R * 0.97, -w * 0.36], [R, -w * 0.15], [R, w * 0.15], [R * 0.97, w * 0.36], [R * 0.86, w / 2], [R * 0.55, w / 2]];
    return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28).applyMatrix4(RZ(-Math.PI / 2));
  };
  const hub = (R, w) => new THREE.CylinderGeometry(R * 0.56, R * 0.56, w * 0.86, 20).applyMatrix4(RZ(-Math.PI / 2));
  const wheelParts = (R, w) => {
    const parts = [part(tyre(R, w), MAT.rubber, C("#ffffff")), part(hub(R, w), MAT.metal, C("#b9bec4"))];
    // Bolts on both faces, so you can see the wheel turning.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const sx of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(R * 0.09, R * 0.09, 0.02, 8).applyMatrix4(RZ(-Math.PI / 2)).applyMatrix4(T(sx * w * 0.44, Math.cos(a) * R * 0.34, Math.sin(a) * R * 0.34)), MAT.dark, cBlack));
    }
    return parts;
  };
  const worldOf = (n) => new THREE.Matrix4().compose(V(...n.translation), new THREE.Quaternion(...n.rotation), V(1, 1, 1));
  /** Make `child` (built with asNode in model space) a child of `parentName`. */
  const adopt = (parentName, child) => {
    const m = worldOf(nodes[parentName]).invert().multiply(worldOf(child));
    const t = V(0, 0, 0), q = new THREE.Quaternion(), s = V(1, 1, 1);
    m.decompose(t, q, s);
    return { ...child, translation: [t.x, t.y, t.z], rotation: [q.x, q.y, q.z, q.w], parent: parentName, moving: true };
  };
  // Main legs: from the belly out to the wheels; they swing forward and inward into the belly.
  const MR = 0.34, MW = 0.24;
  for (const side of [1, -1]) {
    const name = side > 0 ? "gearL" : "gearR";
    const P = V(side * 0.55, 1.05, 0.15), W = V(side * 1.185, MR, 0);
    const u = W.clone().sub(P), len = u.length();
    u.normalize();
    const w = V(side * -0.15, 0.4, 0.85).normalize();
    const axis = u.clone().cross(w).normalize();
    rig.retractDeg[name] = +((Math.acos(u.dot(w)) * 180) / Math.PI).toFixed(1);
    const inner = W.clone().add(V(side * -0.16, 0, 0));
    const parts = [
      part(cylinderBetween(P, inner, 0.055, 12), MAT.metal, C("#c9cdd2")),
      part(cylinderBetween(P.clone().lerp(inner, 0.45), inner, 0.04, 12), MAT.metal, C("#eef0f2")),
      part(cylinderBetween(inner, W, 0.035, 10), MAT.metal, cMetal),
      // Drag brace and a torque link.
      part(cylinderBetween(V(side * 0.5, 1.02, 0.75), P.clone().lerp(inner, 0.5), 0.028, 8), MAT.metal, cMetal),
      part(cylinderBetween(P.clone().lerp(inner, 0.55).add(V(0, 0, -0.1)), inner.clone().add(V(0, 0.02, -0.07)), 0.016, 6), MAT.metal, cMetal),
    ];
    nodes[name] = asNode(parts, P, axis, u.clone().negate(), { moving: true });
    void len;
    const wn = side > 0 ? "wheelL" : "wheelR";
    nodes[wn] = adopt(name, { parts: wheelParts(MR, MW), translation: [W.x, W.y, W.z], rotation: [0, 0, 0, 1] });
    rig.wheelRadius[wn] = MR;
  }
  // Nose leg: under the intake; swings back to lie flat.
  {
    const NR = 0.23, NW = 0.15;
    const P = V(0, 1.1, 3.98), W = V(0, NR, 4.0);
    const parts = [
      part(cylinderBetween(P, V(0, 0.55, 3.99), 0.05, 12), MAT.metal, C("#c9cdd2")),
      part(cylinderBetween(V(0, 0.6, 3.99), V(0, 0.36, 4.0), 0.036, 12), MAT.metal, C("#eef0f2")),
      // Fork down one side to the axle, and the axle.
      part(cylinderBetween(V(0, 0.38, 4.0), V(0.11, 0.36, 4.0), 0.03, 8), MAT.metal, cMetal),
      part(cylinderBetween(V(0.11, 0.37, 4.0), V(0.11, NR, 4.0), 0.028, 8), MAT.metal, cMetal),
      part(cylinderBetween(V(0.12, NR, 4.0), V(-0.02, NR, 4.0), 0.022, 8), MAT.metal, cMetal),
      // Drag brace and the landing light.
      part(cylinderBetween(V(0, 0.92, 3.5), V(0, 0.62, 3.96), 0.024, 8), MAT.metal, cMetal),
      part(new THREE.SphereGeometry(0.05, 10, 8).applyMatrix4(T(0, 0.7, 4.06)), MAT.white, C("#ffffff"), { noAO: true }),
    ];
    nodes.gearN = asNode(parts, P, V(1, 0, 0), V(0, 1, 0), { moving: true });
    rig.retractDeg.gearN = 92;
    nodes.wheelN = adopt("gearN", { parts: wheelParts(NR, NW), translation: [W.x, W.y, W.z], rotation: [0, 0, 0, 1] });
    rig.wheelRadius.wheelN = NR;
  }
  // Doors hanging open beside the bays.
  {
    const parts = [];
    for (const side of [1, -1]) {
      parts.push(part(box(0.02, 0.36, 1.25, new THREE.Matrix4().compose(V(side * 0.62, 0.84, 0.75), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.5)), V(1, 1, 1))), XMAT.matte, cLight));
      parts.push(part(box(0.016, 0.26, 0.95, new THREE.Matrix4().compose(V(side * 0.17, 0.78, 3.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.12)), V(1, 1, 1))), XMAT.matte, cLight));
    }
    nodes.gearDoors = { parts, moving: true };
  }

  return { nodes, extraMaterials, rig };
}
