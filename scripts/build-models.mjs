// Builds "toy-real" GLB models for every aircraft in src/data/aircraft.ts, plus a hoop ring and
// a soft ground shadow. Real silhouettes and features in bright, clean shapes; no third-party
// model licensing needed.
//
// glTF conventions: +Y up, nose toward +Z, left wing toward +X. Origin = main-wheel contact point.
// Nodes the game animates:
//   gear                      shown when the gear is down
//   prop                      spins about its local Z
//   flapL flapR ailL ailR     rotate about their local X (the hinge line); negative = trailing edge down
//   elevL elevR rudder        same convention (rudder: positive = trailing edge to the right)
//   beacon strobe             blink
//
// Usage: node scripts/build-models.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AIRCRAFT } from "../src/data/aircraft.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "models");
mkdirSync(outDir, { recursive: true });

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const M = () => new THREE.Matrix4();
const T = (x, y, z) => M().makeTranslation(x, y, z);
const RX = (a) => M().makeRotationX(a);
const RY = (a) => M().makeRotationY(a);
const RZ = (a) => M().makeRotationZ(a);
const S = (x, y, z) => M().makeScale(x, y, z);
const chain = (...ms) => ms.reduce((acc, m) => acc.multiply(m), M());
const lerp = (a, b, t) => a + (b - a) * t;

// Materials (index into the glTF materials array).
const MAT = { paint: 0, glass: 1, metal: 2, rubber: 3, navRed: 4, navGreen: 5, white: 6, dark: 7 };
const MATERIALS = [
  { name: "paint", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.2, roughnessFactor: 0.3 } },
  { name: "glass", pbrMetallicRoughness: { baseColorFactor: [0.06, 0.09, 0.14, 1], metallicFactor: 0.9, roughnessFactor: 0.05 } },
  { name: "metal", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.85, roughnessFactor: 0.32 } },
  { name: "rubber", pbrMetallicRoughness: { baseColorFactor: [0.08, 0.08, 0.08, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
  { name: "navRed", pbrMetallicRoughness: { baseColorFactor: [1, 0.1, 0.1, 1], metallicFactor: 0, roughnessFactor: 0.4 }, emissiveFactor: [1, 0.05, 0.05] },
  { name: "navGreen", pbrMetallicRoughness: { baseColorFactor: [0.1, 1, 0.3, 1], metallicFactor: 0, roughnessFactor: 0.4 }, emissiveFactor: [0.1, 1, 0.3] },
  { name: "white", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.4 }, emissiveFactor: [1, 1, 1] },
  { name: "dark", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } },
];

/** A part = non-indexed geometry with normals + per-vertex colors, tagged with a material. */
function finish(geo, material, colorFn, matrix) {
  let g = geo.index ? geo : geo;
  g.deleteAttribute("uv");
  if (!g.attributes.normal) g.computeVertexNormals();
  if (matrix) g.applyMatrix4(matrix);
  if (g.index) g = g.toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const centroid = a.add(b).add(c).divideScalar(3);
    const color = typeof colorFn === "function" ? colorFn(centroid) : colorFn;
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = color.r;
      col[(i + k) * 3 + 1] = color.g;
      col[(i + k) * 3 + 2] = color.b;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return { geo: g, material };
}

function smooth(g) {
  g.computeVertexNormals();
  return g;
}

/** Loft closed rings (each an array of Vector3, same length) into an indexed surface with end caps. */
function loft(rings, { capStart = true, capEnd = true } = {}) {
  const n = rings[0].length;
  const pos = [];
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  const idx = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  const addCap = (ringIndex, flip) => {
    const r = rings[ringIndex];
    const center = r.reduce((acc, p) => acc.add(p.clone()), V(0, 0, 0)).divideScalar(n);
    const ci = pos.length / 3;
    pos.push(center.x, center.y, center.z);
    for (let j = 0; j < n; j++) {
      const a = ringIndex * n + j, b = ringIndex * n + ((j + 1) % n);
      if (flip) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  };
  if (capStart) addCap(0, false);
  if (capEnd) addCap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return orientOutward(g);
}

function orientOutward(g) {
  // Make triangle winding consistent with "away from the centroid" (works for convex-ish parts).
  const p = g.attributes.position;
  const idx = g.index.array;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) c.add(V(p.getX(i), p.getY(i), p.getZ(i)));
  c.divideScalar(p.count);
  let pos = 0, neg = 0;
  const a = V(0, 0, 0), b = V(0, 0, 0), d = V(0, 0, 0);
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(p, idx[i]);
    b.fromBufferAttribute(p, idx[i + 1]);
    d.fromBufferAttribute(p, idx[i + 2]);
    const n = b.clone().sub(a).cross(d.clone().sub(a));
    const mid = a.clone().add(b).add(d).divideScalar(3).sub(c);
    if (n.dot(mid) >= 0) pos++;
    else neg++;
  }
  if (neg > pos) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  return g;
}

// ---------------------------------------------------------------- airfoil

const AF_N = 14;
/** Closed airfoil loop in (x along chord 0..cut, y thickness), cambered slightly. */
function airfoilLoop(thickness, cut = 1, camber = 0.02) {
  const pts = [];
  const xs = [];
  for (let i = 0; i <= AF_N; i++) xs.push(cut * (1 - Math.cos((i / AF_N) * Math.PI)) / 2);
  const half = (x) => 5 * thickness * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const cam = (x) => camber * 4 * x * (1 - x);
  for (let i = AF_N; i >= 0; i--) pts.push([xs[i], cam(xs[i]) + half(xs[i])]); // upper, TE -> LE
  for (let i = 1; i < AF_N; i++) pts.push([xs[i], cam(xs[i]) - half(xs[i])]); // lower, LE -> TE
  return pts;
}

/**
 * A lifting surface along a straight leading edge from `root` to `tip` (model space).
 * Chord runs toward -Z (aft); thickness along `up`. Stations: [{t, chord, cut}] where cut < 1
 * removes the aft part of the chord (space for a control surface).
 */
function surface({ rootLE, tipLE, rootChord, tipChord, thickness, up = V(0, 1, 0), stations, camber = 0.02 }) {
  const rings = [];
  for (const st of stations) {
    const le = rootLE.clone().lerp(tipLE, st.t);
    const chord = lerp(rootChord, tipChord, st.t);
    const loop = airfoilLoop(thickness, st.cut ?? 1, camber);
    rings.push(loop.map(([x, y]) => le.clone().add(V(0, 0, -x * chord)).add(up.clone().multiplyScalar(y * chord))));
  }
  return smooth(loft(rings));
}

/**
 * A hinged control surface. Returns { geo (in node-local space), translation, rotation }.
 * Hinge runs from `a` to `b` (model space); the surface extends aft from the hinge by
 * chordA/chordB. Local X = hinge direction, local -Z = aft (chord) direction.
 */
function controlSurface(a, b, chordA, chordB, thicknessA, aftHint = V(0, 0, -1)) {
  const h = b.clone().sub(a);
  const len = h.length();
  h.normalize();
  const aft = aftHint.clone().sub(h.clone().multiplyScalar(aftHint.dot(h))).normalize();
  const zAxis = aft.clone().negate();
  const yAxis = zAxis.clone().cross(h).normalize();
  const basis = new THREE.Matrix4().makeBasis(h, yAxis, zAxis);
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
  // Local geometry: wedge from hinge (thick) to trailing edge (thin).
  const rings = [];
  for (const t of [0, 1]) {
    const x = t * len;
    const ch = lerp(chordA, chordB, t);
    const th = thicknessA * lerp(1, chordB / chordA, t);
    rings.push([V(x, th / 2, 0), V(x, th * 0.1, -ch), V(x, -th * 0.1, -ch), V(x, -th / 2, 0), V(x, 0, th * 0.35)]);
  }
  const g = smooth(loft(rings));
  return { geo: g, translation: [a.x, a.y, a.z], rotation: [q.x, q.y, q.z, q.w] };
}

// ---------------------------------------------------------------- fuselage

/** Fuselage from stations (z, half-width, half-height, center-y), RADIAL points per ring. */
const RADIAL = 56;
function fuselageGeo(stations, radial = RADIAL) {
  const rings = stations.map(([z, hw, hh, yc]) => {
    const r = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      // Super-ellipse for a slightly boxy, airliner-like cross-section.
      const c = Math.cos(a), s = Math.sin(a);
      const e = 2.3; // keep in sync with E in buildAircraft
      const x = Math.sign(c) * Math.abs(c) ** (2 / e) * hw;
      const y = Math.sign(s) * Math.abs(s) ** (2 / e) * hh;
      r.push(V(x, yc + y, z));
    }
    return r;
  });
  return smooth(loft(rings));
}

function lathe(profile, segments, matrix) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), segments);
  g.applyMatrix4(RX(Math.PI / 2)); // lathe axis Y -> Z (forward)
  if (matrix) g.applyMatrix4(matrix);
  return g;
}

function cylinderBetween(p0, p1, r, seg = 10) {
  const len = p0.distanceTo(p1);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), p1.clone().sub(p0).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), q, V(1, 1, 1)));
  return g;
}

// ---------------------------------------------------------------- aircraft

// 5x7 pixel font for the registration painted on the fuselage.
const FONT = {
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
};
export const REGISTRATION = "PLAYNE123";

/**
 * Raised pixel letters on one side of the fuselage. `side` +1 = left (+X), -1 = right.
 * Text reads left-to-right for someone looking at that side.
 */
function registration(text, side, xAt, y0, zMid, h) {
  const px = h / 7;
  const cols = text.length * 6 - 1;
  const dir = side > 0 ? -1 : 1; // reading direction along Z
  const boxes = [];
  [...text].forEach((ch, i) => {
    const g = FONT[ch];
    if (!g) return;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (g[r][c] !== "1") continue;
      const u = i * 6 + c - cols / 2;
      const z = zMid + dir * u * px;
      const y = y0 + (3 - r) * px;
      const x = side * (xAt(z) + 0.012);
      const b = new THREE.BoxGeometry(0.02, px * 0.92, px * 0.92);
      b.applyMatrix4(T(x, y, z));
      boxes.push(b);
    }
  });
  return boxes;
}

function buildAircraft(ac) {
  const s = ac.shape;
  const L = s.length;
  const D = s.fuselageDiameter;
  const R = D / 2;
  const semi = s.span / 2;
  const sweep = (s.sweepDeg * Math.PI) / 180;
  const body = C(ac.livery.body);
  const stripe = C(ac.livery.stripe);
  const accent = C(ac.livery.accent);
  const belly = body.clone().lerp(C("#9aa3ad"), 0.25);
  const isProp = s.engines === "prop-nose";
  const highWing = s.wing === "high";
  const fighter = s.engines === "fighter";

  const gearH = highWing ? 0.95 : Math.max(0.6, D * 0.42);
  const cy = gearH + R;
  const noseZ = L / 2;
  const tailZ = -L / 2;

  const nodes = {}; // name -> { parts: [], translation?, rotation? }
  const add = (node, part) => (nodes[node] ??= { parts: [] }).parts.push(part);

  // ---------------- fuselage
  const st = [];
  // Stations: denser toward the nose so the windshield edge stays clean.
  const ts = [];
  for (let i = 0; i <= 26; i++) ts.push((i / 26) * 0.78);
  for (let i = 1; i <= 24; i++) ts.push(0.78 + (i / 24) * 0.22);
  for (const t of ts) {
    const z = lerp(tailZ, noseZ, t);
    let k; // size factor
    let yOff = 0;
    if (fighter) {
      // Fighter: straight tube to the engine nozzle, long pointed radome.
      if (t < 0.1) k = 0.72 + 0.28 * (t / 0.1);
      else if (t < 0.6) k = 1;
      else {
        const u = (t - 0.6) / 0.4;
        k = Math.max(0.03, (1 - u) ** 0.8);
        yOff = -R * 0.1 * u;
      }
    } else if (t < 0.32) {
      const u = t / 0.32;
      k = 0.16 + 0.84 * Math.sin((u * Math.PI) / 2) ** 0.85;
      yOff = R * 0.5 * (1 - u) ** 1.6; // upswept tail cone
    } else if (t < 0.8) {
      k = 1;
    } else {
      const u = (t - 0.8) / 0.2;
      k = Math.sqrt(Math.max(0.0004, 1 - u ** (isProp ? 2.6 : 2.1)));
      yOff = -R * 0.12 * u * u; // nose droops a little
      if (isProp) k = Math.max(k, 0.45);
    }
    const hw = R * k * (isProp && t > 0.85 ? 0.9 : 1);
    const hh = R * k * 1.02;
    st.push([z, hw, hh, cy + yOff]);
  }
  const fus = fuselageGeo(st);
  const wsStart = noseZ - Math.max(D * 1.15, L * 0.11);
  const wsEnd = noseZ - (isProp ? L * 0.02 : D * 0.32);
  // Local (per-station) normalized coordinates so paint lines follow the fuselage shape.
  const stationAt = (z) => {
    for (let i = 0; i < st.length - 1; i++) {
      if (z >= st[i][0] && z <= st[i + 1][0]) {
        const t = (z - st[i][0]) / (st[i + 1][0] - st[i][0]);
        return { hw: lerp(st[i][1], st[i + 1][1], t), hh: lerp(st[i][2], st[i + 1][2], t), yc: lerp(st[i][3], st[i + 1][3], t) };
      }
    }
    const e = z < st[0][0] ? st[0] : st[st.length - 1];
    return { hw: e[1], hh: e[2], yc: e[3] };
  };
  const local = (p) => {
    const sa = stationAt(p.z);
    return { nx: p.x / Math.max(1e-3, sa.hw), ny: (p.y - sa.yc) / Math.max(1e-3, sa.hh) };
  };
  // Surface-grid coordinates: station index along the body and radial "row" angle, so paint
  // boundaries follow whole quads (no zig-zag edges).
  const E = 2.3;
  const rowAngle = (p) => {
    const { nx, ny } = local(p);
    const c = Math.sign(nx) * Math.abs(nx) ** (E / 2);
    const sn = Math.sign(ny) * Math.abs(ny) ** (E / 2);
    const step = (Math.PI * 2) / RADIAL;
    const a = Math.atan2(sn, c);
    return (Math.floor(a / step) + 0.5) * step; // centre angle of the quad's row
  };
  const stationIndex = (z) => {
    for (let i = 0; i < st.length - 1; i++) if (z >= st[i][0] && z < st[i + 1][0]) return i;
    return st.length - 1;
  };
  const stripeAt = (p) => {
    const sa = Math.sin(rowAngle(p));
    return sa > -0.36 && sa < -0.1;
  };
  // Split triangles into paint and glass (windshield).
  const fusPaint = [];
  const fusGlass = [];
  {
    const g = fus.toNonIndexed();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0);
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      const m = a.clone().add(b).add(c).divideScalar(3);
      const zi = stationIndex(m.z);
      const zt = (st[zi][0] - wsStart) / (wsEnd - wsStart);
      const ang = rowAngle(m);
      const sa = Math.sin(ang);
      const ca = Math.abs(Math.cos(ang));
      const glass = !fighter && zt >= 0 && zt <= 1 && sa > 0.18 && (sa < 0.93 || zt < 0.35) && ca > 0.02 + zt * 0.1;
      (glass ? fusGlass : fusPaint).push(i);
    }
    const pick = (list) => {
      const p = new Float32Array(list.length * 9), n = new Float32Array(list.length * 9);
      list.forEach((i, k) => {
        for (let v = 0; v < 3; v++) for (let d = 0; d < 3; d++) {
          p[k * 9 + v * 3 + d] = pos.array[(i + v) * 3 + d];
          n[k * 9 + v * 3 + d] = nor.array[(i + v) * 3 + d];
        }
      });
      const out = new THREE.BufferGeometry();
      out.setAttribute("position", new THREE.BufferAttribute(p, 3));
      out.setAttribute("normal", new THREE.BufferAttribute(n, 3));
      return out;
    };
    add("body", finish(pick(fusPaint), MAT.paint, (p) => (stripeAt(p) ? stripe : Math.sin(rowAngle(p)) < -0.7 ? belly : body)));
    add("body", finish(pick(fusGlass), MAT.glass, C("#ffffff")));
  }

  // Cabin windows and door outline.
  const oval = ac.maker === "Gulfstream";
  const nWin = fighter ? 0 : Math.max(2, Math.round((L * 0.36) / (oval ? 1.25 : 0.95)));
  if (fighter) {
    // Bubble canopy (gold-tinted) and its frame.
    const cz = noseZ - L * 0.3;
    add("body", finish(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass, C("#f0d78a"), chain(T(0, cy + R * 0.62, cz), S(R * 0.55, R * 0.72, L * 0.13))));
    add("body", finish(new THREE.TorusGeometry(1, 0.06, 6, 24, Math.PI), MAT.dark, C("#2a2f35"), chain(T(0, cy + R * 0.62, cz - L * 0.04), S(R * 0.56, R * 0.74, 1), RZ(0))));
    // Belly air intake under the cockpit.
    const iz = noseZ - L * 0.42;
    add("body", finish(new THREE.CylinderGeometry(R * 0.5, R * 0.42, L * 0.2, 20, 1, true), MAT.paint, body, chain(T(0, cy - R * 0.95, iz - L * 0.06), RX(Math.PI / 2), S(1.1, 1, 0.75))));
    add("body", finish(new THREE.CircleGeometry(R * 0.44, 20), MAT.dark, C("#15191d"), chain(T(0, cy - R * 0.95, iz + L * 0.04), S(1.1, 0.75, 1))));
    // Engine nozzle.
    add("body", finish(lathe([[R * 0.7, 0], [R * 0.66, -0.25], [R * 0.6, -0.75], [R * 0.52, -0.8]], 24), MAT.metal, C("#5d646c"), T(0, cy, tailZ + 0.05)));
    add("body", finish(new THREE.CircleGeometry(R * 0.5, 20), MAT.dark, C("#1b1f23"), chain(T(0, cy, tailZ - 0.7), RY(Math.PI))));
  }
  const winStart = wsStart - D * 0.75;
  const winSpacing = oval ? 1.25 : 0.95;
  for (let i = 0; i < nWin; i++) {
    const z = winStart - i * winSpacing;
    for (const side of [1, -1]) {
      const w = new THREE.CylinderGeometry(1, 1, 0.05, 16);
      const ww = oval ? 0.3 : 0.22;
      const wh = oval ? 0.24 : 0.2;
      add("body", finish(w, MAT.glass, C("#ffffff"), chain(T(side * R * 1.005, cy + R * 0.18, z), RZ(Math.PI / 2), S(wh, 1, ww))));
    }
  }

  // Registration (callsign) on both sides of the rear fuselage.
  {
    let h = Math.min(0.42, Math.max(0.24, D * 0.24));
    let zMid = fighter ? tailZ + L * 0.36 : tailZ + L * (isProp ? 0.27 : 0.34);
    if (s.engines === "rear-twin" || s.engines === "rear-tri") {
      // Between the last cabin window and the engines (which would hide it).
      const winEnd = winStart - (nWin - 1) * winSpacing - 0.35;
      const nacFront = tailZ + L * 0.24 + Math.max(1.7, L * 0.17) / 2 + 0.2;
      h = Math.max(0.16, Math.min(h, (winEnd - nacFront) / 7.8));
      zMid = (winEnd + nacFront) / 2;
    }
    const y0 = fighter ? cy - R * 0.25 : cy - R * 0.12;
    const lum = (c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
    const ink = lum(body) > 0.55 ? C("#1d2733") : C("#f4f6f8");
    for (const side of [1, -1]) {
      for (const b of registration(REGISTRATION, side, (z) => stationAt(z).hw, y0, zMid, h)) add("body", finish(b, MAT.paint, ink));
    }
  }

  // ---------------- wing
  const rootChord = Math.max(1.5, L * (fighter ? 0.34 : highWing ? 0.17 : 0.2));
  const tipChord = rootChord * (fighter ? 0.22 : highWing ? 0.92 : 0.38);
  const wingZ = fighter ? L * 0.1 : highWing ? L * 0.13 : L * 0.08; // leading edge at root
  const wingY = highWing ? cy + R * 0.98 : s.wing === "mid" ? cy - R * 0.1 : cy - R * 0.62;
  const dihedral = highWing ? 0.025 : fighter ? 0 : 0.07;
  const thick = fighter ? 0.05 : 0.13;
  const flapEnd = isProp && highWing ? 0.55 : 0.62; // fraction of semi-span
  const ailEnd = 0.93;
  const cf = highWing ? 0.28 : 0.27; // control surface chord fraction
  const rootT = R * 0.6 / semi;
  for (const side of [1, -1]) {
    const rootLE = V(side * R * 0.5, wingY, wingZ);
    const tipLE = V(side * semi, wingY + Math.tan(dihedral) * semi, wingZ - Math.tan(sweep) * semi);
    const stations = [
      { t: 0, cut: 1 },
      { t: rootT, cut: 1 },
      { t: rootT + 0.001, cut: 1 - cf },
      { t: flapEnd, cut: 1 - cf },
      { t: flapEnd + 0.001, cut: 1 - cf },
      { t: ailEnd, cut: 1 - cf },
      { t: ailEnd + 0.001, cut: 1 },
      { t: 1, cut: 1 },
    ];
    add("body", finish(surface({ rootLE, tipLE, rootChord, tipChord, thickness: thick, stations }), MAT.paint, body));

    // Hinged surfaces: hinge line at (1-cf) chord.
    const hingeAt = (t) => {
      const le = rootLE.clone().lerp(tipLE, t);
      const ch = lerp(rootChord, tipChord, t);
      return { p: le.add(V(0, 0, -(1 - cf) * ch)), ch: ch * cf, th: ch * thick * 0.55 };
    };
    const mk = (t0, t1, name, color) => {
      const h0 = hingeAt(t0), h1 = hingeAt(t1);
      // Hinge direction always toward +X so "negative = trailing edge down" holds on both sides.
      const [a, b, ca, cb] = side > 0 ? [h0.p, h1.p, h0.ch, h1.ch] : [h1.p, h0.p, h1.ch, h0.ch];
      const cs = controlSurface(a, b, ca, cb, h0.th);
      nodes[name] = { parts: [finish(cs.geo, MAT.paint, color)], translation: cs.translation, rotation: cs.rotation };
    };
    mk(rootT + 0.002, flapEnd - 0.002, side > 0 ? "flapL" : "flapR", body.clone().lerp(C("#c8ccd2"), 0.4));
    mk(flapEnd + 0.003, ailEnd - 0.002, side > 0 ? "ailL" : "ailR", body);

    // Winglet
    if (s.winglets) {
      const wlH = Math.max(0.7, semi * 0.13);
      const base = tipLE.clone();
      const top = base.clone().add(V(side * wlH * 0.25, wlH, -wlH * 0.7));
      const wl = surface({ rootLE: base, tipLE: top, rootChord: tipChord * 0.95, tipChord: tipChord * 0.4, thickness: 0.1, up: V(-side, 0.25, 0).normalize(), stations: [{ t: 0 }, { t: 1 }], camber: 0 });
      add("body", finish(wl, MAT.paint, accent));
    }
    // Fighter wingtip launch rails.
    if (fighter) add("body", finish(cylinderBetween(V(side * (semi + 0.05), wingY, wingZ - Math.tan(sweep) * semi + 0.4), V(side * (semi + 0.05), wingY, wingZ - Math.tan(sweep) * semi - tipChord - 0.6), 0.07), MAT.paint, C("#e8ebee")));
    // Nav light (red left/port, green right/starboard) and strobe.
    const lightPos = tipLE.clone().add(V(side * 0.05, 0, -tipChord * 0.15));
    add("body", finish(new THREE.SphereGeometry(Math.max(0.07, D * 0.04), 10, 8), side > 0 ? MAT.navRed : MAT.navGreen, C("#ffffff"), T(lightPos.x, lightPos.y, lightPos.z)));
    add("strobe", finish(new THREE.SphereGeometry(Math.max(0.06, D * 0.035), 8, 6), MAT.white, C("#ffffff"), T(lightPos.x, lightPos.y, lightPos.z - 0.18)));
    // High-wing struts
    if (highWing) {
      add("body", finish(cylinderBetween(V(side * R * 0.85, cy - R * 0.45, wingZ - rootChord * 0.3), V(side * semi * 0.48, wingY - 0.04, wingZ - rootChord * 0.35), 0.045), MAT.paint, body));
    }
  }
  // Wing-to-body fairing for low wings
  if (!highWing && !fighter) {
    add("body", finish(new THREE.SphereGeometry(1, 20, 10), MAT.paint, belly, chain(T(0, wingY + R * 0.1, wingZ - rootChord * 0.45), S(R * 1.02, R * 0.42, rootChord * 0.75))));
  }

  // ---------------- tail
  const finRoot = L * (fighter ? 0.2 : 0.19);
  const finTip = finRoot * (s.tail === "t-tail" ? 0.65 : 0.55);
  const finH = L * (s.tail === "t-tail" ? 0.18 : 0.16) + 0.35;
  const finSweep = ((isProp ? 28 : fighter ? 47 : 40) * Math.PI) / 180;
  const finLEz = tailZ + finRoot * 1.05;
  const finBaseY = st[2][3] + st[2][2] * 0.7;
  const finRootLE = V(0, finBaseY, finLEz);
  const finTipLE = V(0, finBaseY + finH, finLEz - Math.tan(finSweep) * finH);
  const rf = 0.3;
  add("body", finish(surface({ rootLE: finRootLE, tipLE: finTipLE, rootChord: finRoot, tipChord: finTip, thickness: 0.11, up: V(1, 0, 0), stations: [{ t: 0, cut: 1 - rf }, { t: 1, cut: 1 - rf }], camber: 0 }), MAT.paint, stripe));
  {
    const a = finRootLE.clone().add(V(0, 0, -(1 - rf) * finRoot));
    const b = finTipLE.clone().add(V(0, 0, -(1 - rf) * finTip));
    const cs = controlSurface(a, b, rf * finRoot, rf * finTip, finRoot * 0.11 * 0.5);
    nodes.rudder = { parts: [finish(cs.geo, MAT.paint, stripe)], translation: cs.translation, rotation: cs.rotation };
  }
  add("beacon", finish(new THREE.SphereGeometry(Math.max(0.08, D * 0.05), 10, 8), MAT.navRed, C("#ffffff"), T(0, cy + R * 1.0, wingZ - rootChord * 0.4)));
  add("body", finish(new THREE.SphereGeometry(0.07, 8, 6), MAT.white, C("#ffffff"), T(0, finBaseY - 0.1, tailZ + 0.05)));

  // Horizontal tail
  const hsSemi = Math.max(1.6, semi * 0.36);
  const hsRoot = finRoot * 0.72;
  const hsTip = hsRoot * 0.55;
  const hsSweep = Math.min(sweep * 1.15 + 0.08, 0.7);
  let hsY = st[3][3] + R * 0.05;
  let hsZ = tailZ + hsRoot * 1.15;
  if (s.tail === "t-tail") {
    hsY = finTipLE.y - 0.04;
    hsZ = finTipLE.z + finTip * 0.05;
    add("body", finish(lathe([[0.001, -finTip * 0.55], [finTip * 0.09, -finTip * 0.35], [finTip * 0.1, finTip * 0.2], [0.001, finTip * 0.5]], 14), MAT.paint, stripe, T(0, hsY, hsZ - finTip * 0.45)));
  } else if (s.tail === "cruciform") {
    hsY = finBaseY + finH * 0.42;
    hsZ = finLEz - Math.tan(finSweep) * finH * 0.42;
  }
  const ef = 0.32;
  for (const side of [1, -1]) {
    const rootLE = V(side * (s.tail === "conventional" ? R * 0.2 : 0.05), hsY, hsZ);
    const tipLE = V(side * hsSemi, hsY + (s.tail === "conventional" ? 0.15 : 0), hsZ - Math.tan(hsSweep) * hsSemi);
    add("body", finish(surface({ rootLE, tipLE, rootChord: hsRoot, tipChord: hsTip, thickness: 0.1, stations: [{ t: 0, cut: 1 - ef }, { t: 1, cut: 1 - ef }], camber: 0 }), MAT.paint, s.tail === "t-tail" ? stripe : body));
    const a0 = rootLE.clone().add(V(0, 0, -(1 - ef) * hsRoot));
    const b0 = tipLE.clone().add(V(0, 0, -(1 - ef) * hsTip));
    const [a, b, ca, cb] = side > 0 ? [a0, b0, ef * hsRoot, ef * hsTip] : [b0, a0, ef * hsTip, ef * hsRoot];
    const cs = controlSurface(a, b, ca, cb, hsRoot * 0.1 * 0.5);
    nodes[side > 0 ? "elevL" : "elevR"] = { parts: [finish(cs.geo, MAT.paint, s.tail === "t-tail" ? stripe : body)], translation: cs.translation, rotation: cs.rotation };
  }

  // ---------------- engines
  const nacLen = Math.max(1.7, L * 0.17);
  const nacR = Math.max(0.36, L * 0.031 + 0.13);
  const nacelle = (pos, color) => {
    const prof = [[nacR * 0.86, -nacLen / 2], [nacR * 0.98, -nacLen * 0.25], [nacR, nacLen * 0.15], [nacR * 0.97, nacLen * 0.42], [nacR * 0.9, nacLen / 2]];
    add("body", finish(lathe(prof, 24), MAT.paint, color, T(pos.x, pos.y, pos.z)));
    add("body", finish(lathe([[nacR * 0.9, nacLen / 2], [nacR * 0.82, nacLen / 2 + 0.03], [nacR * 0.74, nacLen / 2 - 0.04]], 24), MAT.metal, C("#d7dbe0"), T(pos.x, pos.y, pos.z)));
    add("body", finish(new THREE.CircleGeometry(nacR * 0.76, 20), MAT.dark, C("#20252b"), chain(T(pos.x, pos.y, pos.z + nacLen / 2 - 0.08))));
    add("body", finish(lathe([[nacR * 0.6, -nacLen / 2 + 0.02], [nacR * 0.3, -nacLen / 2 - nacR * 0.6], [0.001, -nacLen / 2 - nacR * 0.75]], 16), MAT.metal, C("#8c939b"), T(pos.x, pos.y, pos.z)));
  };
  if (s.engines === "rear-twin" || s.engines === "rear-tri") {
    const ez = tailZ + L * 0.24;
    const ey = cy + R * 0.32;
    for (const side of [1, -1]) {
      const ex = side * (R * 0.92 + nacR * 1.15);
      nacelle(V(ex, ey, ez), accent);
      add("body", finish(new THREE.BoxGeometry(Math.abs(ex) - R * 0.6, nacR * 0.3, nacLen * 0.45), MAT.paint, body, T(side * (R * 0.6 + (Math.abs(ex) - R * 0.6) / 2), ey, ez)));
    }
    if (s.engines === "rear-tri") {
      nacelle(V(0, cy + R + nacR * 0.45, ez - nacLen * 0.1), accent);
    }
  } else if (s.engines === "over-wing") {
    for (const side of [1, -1]) {
      const t = 0.38;
      const x = side * semi * t;
      const z = wingZ - Math.tan(sweep) * semi * t - rootChord * 0.3;
      const y = wingY + Math.tan(dihedral) * semi * t + rootChord * thick * 0.6 + nacR * 1.3;
      nacelle(V(x, y, z), accent);
      add("body", finish(new THREE.BoxGeometry(0.14, nacR * 1.1, nacLen * 0.55), MAT.paint, body, T(x, y - nacR * 0.95, z - nacLen * 0.05)));
    }
  } else if (isProp) {
    const spinnerLen = R * 0.9;
    add("body", finish(lathe([[R * 0.42, 0], [R * 0.36, spinnerLen * 0.5], [R * 0.16, spinnerLen * 0.9], [0.001, spinnerLen]], 20), MAT.paint, accent, T(0, cy - R * 0.05, noseZ - 0.05)));
    // PC-12 exhaust stacks
    if (ac.id === "pc12") for (const side of [1, -1]) add("body", finish(cylinderBetween(V(side * R * 0.8, cy, noseZ - R * 1.4), V(side * R * 1.05, cy - 0.05, noseZ - R * 1.8), 0.12), MAT.metal, C("#5b6066")));
    const blades = ac.id === "pc12" ? 5 : 2;
    const bladeLen = ac.id === "pc12" ? 1.3 : 0.95;
    const parts = [];
    for (let i = 0; i < blades; i++) {
      const prof = [];
      const b = new THREE.BoxGeometry(0.18, bladeLen, 0.035, 1, 6, 1);
      const p = b.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k) + bladeLen / 2;
        const t = y / bladeLen;
        p.setX(k, p.getX(k) * (1 - 0.5 * t) * (t < 0.05 ? 0.6 : 1));
        p.setY(k, y);
        // twist
        const ang = (1 - t) * 0.5;
        const x = p.getX(k), z = p.getZ(k);
        p.setX(k, x * Math.cos(ang) - z * Math.sin(ang));
        p.setZ(k, x * Math.sin(ang) + z * Math.cos(ang));
      }
      void prof;
      b.computeVertexNormals();
      parts.push(finish(b, MAT.dark, C("#2c3036"), RZ((i / blades) * Math.PI * 2)));
    }
    nodes.prop = { parts, translation: [0, cy - R * 0.05, noseZ + spinnerLen * 0.35] };
  }

  // ---------------- landing gear (wheel bottoms at y = 0)
  const wr = Math.max(0.24, D * 0.16);
  const mainX = highWing ? 1.25 : Math.max(R * 1.25, semi * 0.24);
  const noseGearZ = noseZ - Math.max(D * 0.85, L * 0.12);
  const gearNode = s.fixedGear ? "body" : "gear";
  const wheel = (x, y, z, r, w) => {
    add(gearNode, finish(new THREE.TorusGeometry(r * 0.72, r * 0.3, 10, 20), MAT.rubber, C("#ffffff"), chain(T(x, y, z), RY(Math.PI / 2))));
    add(gearNode, finish(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w * 0.9, 16), MAT.metal, C("#c9ced4"), chain(T(x, y, z), RZ(Math.PI / 2))));
  };
  for (const side of [1, -1]) {
    wheel(side * mainX, wr, 0, wr, wr * 0.7);
    add(gearNode, finish(cylinderBetween(V(side * mainX, wr, 0), V(side * Math.min(mainX, R * 0.85), cy - R * 0.55, 0.15), wr * 0.2), MAT.metal, C("#aeb4bb")));
    if (s.fixedGear) add("body", finish(new THREE.SphereGeometry(1, 14, 10), MAT.paint, stripe, chain(T(side * mainX, wr * 1.1, 0), S(wr * 0.42, wr * 0.75, wr * 1.25))));
  }
  wheel(0, wr * 0.8, noseGearZ, wr * 0.8, wr * 0.55);
  add(gearNode, finish(cylinderBetween(V(0, wr * 0.8, noseGearZ), V(0, cy - R * 0.6, noseGearZ - 0.12), wr * 0.18), MAT.metal, C("#aeb4bb")));

  return nodes;
}

// ---------------------------------------------------------------- Chinook (tandem-rotor helicopter)

/**
 * Rounded-rectangle cross-section ring (flat sides and floor, rounded corners), centred on
 * x = 0 between y = bot and y = top. Same point count for every ring, so they loft cleanly.
 */
function boxRing(z, hw, bot, top, r, perCorner = 6, edgeSteps = 6) {
  r = Math.min(r, hw * 0.98, (top - bot) * 0.49);
  const pts = [];
  const corners = [
    [hw - r, top - r, 0],
    [-(hw - r), top - r, Math.PI / 2],
    [-(hw - r), bot + r, Math.PI],
    [hw - r, bot + r, (3 * Math.PI) / 2],
  ];
  for (let ci = 0; ci < 4; ci++) {
    const [cx, cy, a0] = corners[ci];
    for (let k = 0; k <= perCorner; k++) {
      const a = a0 + (k / perCorner) * (Math.PI / 2);
      pts.push(V(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z));
    }
    // Points along the straight edge to the next corner (so window edges can be painted cleanly).
    const end = pts[pts.length - 1];
    const [nx, ny, na] = corners[(ci + 1) % 4];
    const next = V(nx + Math.cos(na) * r, ny + Math.sin(na) * r, z);
    for (let k = 1; k < edgeSteps; k++) pts.push(end.clone().lerp(next, k / edgeSteps));
  }
  return pts;
}

/**
 * Loft rounded-rectangle stations [z, half-width, floor, roof, corner r], densified along z.
 * `step` is metres between rings, or a function of the two stations (fine where it curves).
 */
function boxLoft(stations, perCorner = 6, step = 0.15, edgeSteps = 6) {
  const dense = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    const st = typeof step === "function" ? step(a, b) : step;
    const n = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / st));
    for (let k = 0; k < n; k++) dense.push(a.map((v, j) => v + (b[j] - v) * (k / n)));
  }
  dense.push(stations[stations.length - 1]);
  return smooth(loft(dense.map(([z, hw, bot, top, r]) => boxRing(z, hw, bot, top, r, perCorner, edgeSteps))));
}

/** Boeing CH-47 Chinook, roughly to scale. Rotors are their own nodes (rotorF, rotorR) so the game can spin them. */
function buildChinook(ac) {
  const body = C(ac.livery.body);
  const stripe = C(ac.livery.stripe);
  const dark = C(ac.livery.accent);
  const belly = body.clone().lerp(C("#20261a"), 0.3);
  const glassC = C("#16222c");
  const metal = C("#55595e");
  const nodes = {};
  const add = (node, part) => (nodes[node] ??= { parts: [] }).parts.push(part);

  // Fuselage: boxy cabin with flat sides and floor, a rounded glazed nose, and the underside
  // sweeping up at the back to the loading ramp. [z, half-width, floor y, roof y, corner r]
  const fus = [
    [-7.8, 1.2, 2.75, 3.95, 0.45],
    [-7.1, 1.48, 1.95, 4.05, 0.55],
    [-5.7, 1.55, 1.05, 4.1, 0.6],
    [4.5, 1.55, 1.05, 4.1, 0.6],
    [5.6, 1.5, 1.1, 4.02, 0.68],
    [6.55, 1.36, 1.24, 3.8, 0.76],
    [7.25, 1.12, 1.45, 3.4, 0.72],
    [7.72, 0.78, 1.7, 2.92, 0.56],
    [7.95, 0.34, 1.98, 2.46, 0.22],
    [8.0, 0.04, 2.18, 2.26, 0.02],
  ];
  add("body", finish(boxLoft(fus, 8, (a, b) => (a[0] >= 4.4 ? 0.1 : b[0] <= -5.6 ? 0.25 : 1.2), 8), MAT.dark, (c) => {
    // Windscreen and cockpit side windows.
    if (c.z > 5.95 && c.y > 2.4 && c.y < 3.95 && !(c.z > 7.78)) return glassC;
    if (c.z > 5.1 && c.z < 6.2 && c.y > 2.55 && c.y < 3.75 && Math.abs(c.x) > 1.2) return glassC;
    if (c.z > 7.1 && c.y > 1.75 && c.y < 2.3 && Math.abs(c.x) < 0.7) return glassC; // chin window
    return c.y < 1.6 ? belly : body;
  }));
  // Cabin windows (square-ish) and the front door; the callsign on the back of the cabin.
  for (const side of [1, -1]) {
    for (let z = -4.3; z <= 3.4; z += 1.1) {
      add("body", finish(new THREE.BoxGeometry(0.05, 0.42, 0.46), MAT.glass, glassC, T(side * 1.56, 3.1, z)));
    }
    if (side < 0) add("body", finish(new THREE.BoxGeometry(0.05, 1.7, 0.95), MAT.dark, dark, T(-1.56, 2.1, 4.9)));
    for (const b of registration(REGISTRATION, side, () => 1.55, 3.78, -1.7, 0.4)) add("body", finish(b, MAT.dark, stripe));
    // Long boxy fuel pods along the lower sides.
    const pod = [[-4.5, 0.06, 1.25, 1.55, 0.03], [-4.1, 0.42, 1.05, 2.05, 0.2], [3.4, 0.42, 1.05, 2.05, 0.2], [4.05, 0.3, 1.12, 1.9, 0.14], [4.4, 0.04, 1.35, 1.6, 0.02]];
    add("body", finish(boxLoft(pod, 4, (a, b) => (Math.abs(b[0] - a[0]) > 2 ? 2 : 0.15), 2), MAT.dark, body, T(side * 1.9, 0, 0)));
  }
  // Loading ramp hinge line at the back.
  add("body", finish(new THREE.BoxGeometry(2.6, 0.08, 0.08), MAT.dark, dark, T(0, 1.95, -7.1)));

  // Front rotor tower over the cockpit, and the tall rear tower with the engines on its sides.
  const frontPylon = [[3.2, 0.5, 3.95, 4.12, 0.18], [4.2, 0.8, 3.95, 4.6, 0.32], [6.0, 0.86, 3.9, 4.85, 0.38], [6.9, 0.7, 3.8, 4.55, 0.32], [7.3, 0.36, 3.65, 3.95, 0.16]];
  add("body", finish(boxLoft(frontPylon, 5, 0.3, 2), MAT.dark, body));
  const rearPylon = [[-2.5, 0.5, 3.95, 4.15, 0.18], [-3.8, 0.85, 3.95, 4.95, 0.38], [-5.0, 0.95, 3.95, 5.6, 0.42], [-6.6, 0.95, 3.95, 5.8, 0.42], [-7.5, 0.82, 3.75, 5.65, 0.38], [-7.85, 0.5, 3.65, 5.35, 0.25], [-7.97, 0.08, 3.65, 4.9, 0.05]];
  add("body", finish(boxLoft(rearPylon, 5, 0.3, 2), MAT.dark, body));
  for (const side of [1, -1]) {
    const x = side * 1.5;
    const prof = [[0.08, -1.7], [0.44, -1.5], [0.55, -1.0], [0.55, 1.0], [0.46, 1.4], [0.36, 1.5]];
    add("body", finish(lathe(prof, 20), MAT.dark, body, T(x, 4.6, -5.95)));
    add("body", finish(new THREE.CircleGeometry(0.32, 16), MAT.dark, C("#16191c"), T(x, 4.6, -4.44)));
    add("body", finish(lathe([[0.34, -1.7], [0.3, -1.95], [0.22, -2.0]], 16), MAT.metal, metal, T(x, 4.6, -5.95)));
    add("body", finish(new THREE.BoxGeometry(0.6, 0.28, 1.5), MAT.dark, body, T(side * 1.1, 4.5, -5.95)));
  }
  // Rotor masts and heads.
  add("body", finish(cylinderBetween(V(0, 4.75, 6.3), V(0, 5.2, 6.3), 0.26, 14), MAT.metal, metal));
  add("body", finish(cylinderBetween(V(0, 5.7, -6.4), V(0, 6.15, -6.4), 0.26, 14), MAT.metal, metal));

  // Wheels: twin wheels each side at the front of the pods, single ones at the back.
  const wheel = (x, z, r, w) => {
    add("body", finish(new THREE.TorusGeometry(r * 0.68, r * 0.32, 10, 20), MAT.rubber, C("#ffffff"), chain(T(x, r, z), RY(Math.PI / 2))));
    add("body", finish(new THREE.CylinderGeometry(r * 0.46, r * 0.46, w, 14), MAT.metal, C("#b8bdc3"), chain(T(x, r, z), RZ(Math.PI / 2))));
  };
  for (const side of [1, -1]) {
    wheel(side * 1.72, 3.85, 0.45, 0.28);
    wheel(side * 2.1, 3.85, 0.45, 0.28);
    add("body", finish(cylinderBetween(V(side * 1.91, 0.45, 3.85), V(side * 1.9, 1.15, 3.7), 0.1), MAT.metal, metal));
    wheel(side * 1.9, -3.75, 0.48, 0.3);
    add("body", finish(cylinderBetween(V(side * 1.9, 0.48, -3.75), V(side * 1.9, 1.15, -3.6), 0.1), MAT.metal, metal));
  }
  // Lights.
  add("body", finish(new THREE.SphereGeometry(0.09, 8, 6), MAT.navRed, C("#ffffff"), T(2.33, 1.9, 0.4)));
  add("body", finish(new THREE.SphereGeometry(0.09, 8, 6), MAT.navGreen, C("#ffffff"), T(-2.33, 1.9, 0.4)));
  nodes.beacon = { parts: [finish(new THREE.SphereGeometry(0.12, 8, 6), MAT.navRed, C("#ffffff"))], translation: [0, 5.85, -5.0] };

  // Rotors: three long, wide blades each with yellow tips, drooping a little at rest.
  const rotor = (spin) => {
    const parts = [finish(new THREE.CylinderGeometry(0.45, 0.55, 0.4, 16), MAT.metal, metal)];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const len = 9.15;
      const root = 0.45;
      const blade = new THREE.BoxGeometry(len - root, 0.08, 0.8, 10, 1, 1);
      const pos = blade.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k) + (len - root) / 2 + root;
        pos.setX(k, x);
        pos.setY(k, pos.getY(k) - (x / len) ** 2 * 0.35);
      }
      blade.computeVertexNormals();
      parts.push(finish(blade, MAT.dark, (c) => (Math.hypot(c.x, c.z) > len - 0.6 ? stripe : C("#26292c")), RY(a + spin)));
    }
    return parts;
  };
  nodes.rotorF = { parts: rotor(0), translation: [0, 5.3, 6.3] };
  nodes.rotorR = { parts: rotor(Math.PI / 3), translation: [0, 6.25, -6.4] };
  return nodes;
}

function buildRing() {
  return { ring: { parts: [finish(new THREE.TorusGeometry(1, 0.07, 12, 56), MAT.paint, C("#ffffff"))] } };
}

function buildShadow() {
  // Soft dark disc (alpha in vertex colors) for a fake ground shadow.
  const seg = 32;
  const pos = [], col = [], nor = [];
  const rings = [0, 0.55, 1];
  const alpha = [0.55, 0.35, 0];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2;
      const pts = [
        [rings[r], a0, alpha[r]], [rings[r + 1], a0, alpha[r + 1]], [rings[r + 1], a1, alpha[r + 1]],
        [rings[r], a0, alpha[r]], [rings[r + 1], a1, alpha[r + 1]], [rings[r], a1, alpha[r]],
      ];
      for (const [rr, a, al] of pts) {
        pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        nor.push(0, 1, 0);
        col.push(0, 0, 0, al);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  return { shadow: { parts: [{ geo: g, material: 8 }] } };
}

function buildVaporCone() {
  // Transonic "vapor cone": a soft white bell around the fuselage, apex forward (+Z),
  // unit radius at the back. Alpha in vertex colors, streaky so it looks like condensation.
  const seg = 48;
  const st = 12;
  const pos = [], col = [], nor = [];
  const ring = (i) => {
    const u = i / (st - 1); // 0 front .. 1 back
    const z = 0.35 - u * 0.95;
    const r = 0.1 + 0.9 * u ** 0.55;
    const alpha = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 1.4 * 0.75;
    return { z, r, alpha };
  };
  for (let i = 0; i < st - 1; i++) {
    const A = ring(i), B = ring(i + 1);
    for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2;
      const streak = (a) => 0.7 + 0.3 * Math.sin(a * 9 + i * 1.7) * Math.sin(a * 4 + 0.6);
      const quad = [[A, a0], [B, a0], [B, a1], [A, a0], [B, a1], [A, a1]];
      for (const [R, a] of quad) {
        pos.push(Math.cos(a) * R.r, Math.sin(a) * R.r, R.z);
        nor.push(Math.cos(a), Math.sin(a), 0.3);
        col.push(1, 1, 1, Math.max(0, Math.min(1, R.alpha * streak(a))));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  return { cone: { parts: [{ geo: g, material: 8 }] } };
}

// ---------------------------------------------------------------- GLB writer

function writeGlb(nodes, file, extraMaterials = []) {
  const bufferParts = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const gltfNodes = [];
  const addView = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.byteLength % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    bufferParts.push(bytes);
    if (pad) bufferParts.push(new Uint8Array(pad));
    offset += bytes.byteLength + pad;
    return bufferViews.length - 1;
  };
  for (const [name, node] of Object.entries(nodes)) {
    const byMat = new Map();
    for (const p of node.parts) {
      if (!byMat.has(p.material)) byMat.set(p.material, []);
      byMat.get(p.material).push(p.geo);
    }
    const primitives = [];
    for (const [material, geos] of byMat) {
      const g = geos.length === 1 ? geos[0] : mergeGeometries(geos);
      const pos = new Float32Array(g.attributes.position.array);
      const nor = new Float32Array(g.attributes.normal.array);
      const colAttr = g.attributes.color;
      const comps = colAttr.itemSize;
      // Colors as normalized unsigned bytes (smaller files).
      const col = new Uint8Array(colAttr.count * 4);
      for (let i = 0; i < colAttr.count; i++) {
        col[i * 4] = Math.round(colAttr.array[i * comps] * 255);
        col[i * 4 + 1] = Math.round(colAttr.array[i * comps + 1] * 255);
        col[i * 4 + 2] = Math.round(colAttr.array[i * comps + 2] * 255);
        col[i * 4 + 3] = comps === 4 ? Math.round(colAttr.array[i * comps + 3] * 255) : 255;
      }
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[i + k]);
        max[k] = Math.max(max[k], pos[i + k]);
      }
      const count = pos.length / 3;
      const aPos = accessors.push({ bufferView: addView(pos, 34962), componentType: 5126, count, type: "VEC3", min, max }) - 1;
      const aNor = accessors.push({ bufferView: addView(nor, 34962), componentType: 5126, count, type: "VEC3" }) - 1;
      const aCol = accessors.push({ bufferView: addView(col, 34962), componentType: 5121, normalized: true, count, type: "VEC4" }) - 1;
      primitives.push({ attributes: { POSITION: aPos, NORMAL: aNor, COLOR_0: aCol }, material });
    }
    meshes.push({ name, primitives });
    const n = { name, mesh: meshes.length - 1 };
    if (node.translation) n.translation = node.translation;
    if (node.rotation) n.rotation = node.rotation;
    gltfNodes.push(n);
  }
  const json = {
    asset: { version: "2.0", generator: "playnes build-models.mjs" },
    scene: 0,
    scenes: [{ nodes: gltfNodes.map((_, i) => i) }],
    nodes: gltfNodes,
    meshes,
    materials: [...MATERIALS.map((m) => ({ ...m, doubleSided: true })), ...extraMaterials],
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonLen = jsonBytes.byteLength + jsonPad;
  const total = 12 + 8 + jsonLen + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.byteLength + i] = 0x20;
  let p = 20 + jsonLen;
  dv.setUint32(p, offset, true);
  dv.setUint32(p + 4, 0x004e4942, true);
  p += 8;
  for (const b of bufferParts) {
    out.set(b, p);
    p += b.byteLength;
  }
  writeFileSync(file, out);
  return total;
}

for (const ac of AIRCRAFT) {
  const bytes = writeGlb(ac.kind === "helicopter" ? buildChinook(ac) : buildAircraft(ac), join(outDir, `${ac.id}.glb`));
  console.log(`${ac.id}.glb  ${(bytes / 1024).toFixed(0)} KB`);
}
writeGlb(buildRing(), join(outDir, "ring.glb"));
writeGlb(buildShadow(), join(outDir, "shadow.glb"), [
  { name: "shadow", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, alphaMode: "BLEND", doubleSided: true },
]);
writeGlb(buildVaporCone(), join(outDir, "vaporcone.glb"), [
  { name: "vapor", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, emissiveFactor: [0.55, 0.55, 0.55], alphaMode: "BLEND", doubleSided: true },
]);
console.log("ring.glb, shadow.glb, vaporcone.glb");
