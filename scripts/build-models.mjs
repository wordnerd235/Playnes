// Builds simple "toy-real" GLB models for every aircraft in src/data/aircraft.ts, plus a hoop ring.
// Real silhouettes and features (engine layout, tail type, oval windows, winglets) in chunky,
// bright shapes. No third-party model licensing needed.
//
// glTF conventions used: +Y up, nose toward +Z, left wing toward +X.
// Origin is the point where the main wheels touch the ground, under the wing.
// Node "gear" holds the landing gear (hidden when retracted); node "prop" spins.
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

const C = (hex) => new THREE.Color(hex);
const GLASS = C("#1d2733");
const TIRE = C("#1b1b1b");
const METAL = C("#9aa3ad");
const DARK = C("#3b4048");

/** Prepare a geometry for merging: indexed, normals, a flat vertex color, no uv. */
function part(geo, color, matrix) {
  let g = geo.index ? geo : mergeVerticesSimple(geo);
  if (matrix) g.applyMatrix4(matrix);
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function mergeVerticesSimple(geo) {
  const n = geo.attributes.position.count;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  geo.setIndex(idx);
  return geo;
}

const M = () => new THREE.Matrix4();
const T = (x, y, z) => M().makeTranslation(x, y, z);
const RX = (a) => M().makeRotationX(a);
const RY = (a) => M().makeRotationY(a);
const RZ = (a) => M().makeRotationZ(a);
const S = (x, y, z) => M().makeScale(x, y, z);
const chain = (...ms) => ms.reduce((acc, m) => acc.multiply(m), M());

/** A tapered, swept slab: used for wings, tailplanes and fins. Built along +X from the root. */
function slab({ span, rootChord, tipChord, sweep, thickness, tipThickness, dihedral = 0 }) {
  const t0 = thickness / 2;
  const t1 = (tipThickness ?? thickness * (tipChord / rootChord)) / 2;
  const dz = -Math.tan(sweep) * span;
  const dy = Math.tan(dihedral) * span;
  // Root at x=0 (z from +rootChord/2 to -rootChord/2), tip at x=span.
  const v = [
    // root: leading top, trailing top, trailing bottom, leading bottom
    [0, t0, rootChord / 2], [0, t0 * 0.4, -rootChord / 2], [0, -t0 * 0.4, -rootChord / 2], [0, -t0, rootChord / 2],
    [span, dy + t1, dz + tipChord / 2], [span, dy + t1 * 0.4, dz - tipChord / 2], [span, dy - t1 * 0.4, dz - tipChord / 2], [span, dy - t1, dz + tipChord / 2],
  ];
  const f = [
    [0, 4, 5, 1], [3, 2, 6, 7], [0, 3, 7, 4], [1, 5, 6, 2], [0, 1, 2, 3], [4, 7, 6, 5],
  ];
  const pos = [];
  const index = [];
  for (const q of f) {
    const b = pos.length / 3;
    for (const i of q) pos.push(...v[i]);
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  // Fix winding so faces point outward.
  g.computeVertexNormals();
  return ensureOutward(g);
}

function ensureOutward(g) {
  // Flip triangles whose normal points toward the centroid.
  const p = g.attributes.position;
  const idx = g.index.array;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, i));
  c.divideScalar(p.count);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(p, idx[i]);
    b.fromBufferAttribute(p, idx[i + 1]);
    d.fromBufferAttribute(p, idx[i + 2]);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const mid = a.clone().add(b).add(d).divideScalar(3);
    if (n.dot(mid.sub(c)) < 0) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  return g;
}

/** Fuselage: lathe profile along Z (nose +Z), with an upswept tail cone. */
function fuselage(L, D, opts) {
  const R = D / 2;
  const pts = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 = tail, 1 = nose
    let r;
    if (t < 0.3) r = R * (0.18 + 0.82 * Math.sin((t / 0.3) * Math.PI / 2) ** 0.9);
    else if (t < 0.8) r = R;
    else r = R * Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2.2));
    if (i === N) r = 0.001;
    pts.push(new THREE.Vector2(Math.max(r, 0.001), (t - 0.5) * L));
  }
  const g = new THREE.LatheGeometry(pts, 24);
  g.applyMatrix4(RX(Math.PI / 2)); // lathe axis Y -> Z
  // LatheGeometry after RX(+90) maps +Y to +Z? ensure nose is +Z
  const p = g.attributes.position;
  let maxZ = -Infinity;
  for (let i = 0; i < p.count; i++) maxZ = Math.max(maxZ, p.getZ(i));
  if (maxZ < L * 0.4) g.applyMatrix4(RY(Math.PI));
  // Upswept tail, slightly flattened sides.
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const tz = (-z - L * 0.2) / (L * 0.3); // 0 at start of tail cone, 1 at tail tip
    if (tz > 0) p.setY(i, p.getY(i) + R * 0.55 * tz * tz);
    p.setX(i, p.getX(i) * opts.widthScale);
  }
  return g;
}

function nacelle(len, rad) {
  const pts = [
    new THREE.Vector2(rad * 0.82, -len / 2),
    new THREE.Vector2(rad * 0.95, -len * 0.3),
    new THREE.Vector2(rad, 0),
    new THREE.Vector2(rad * 1.0, len * 0.38),
    new THREE.Vector2(rad * 0.92, len / 2),
    new THREE.Vector2(rad * 0.7, len / 2 - 0.01),
  ];
  const g = new THREE.LatheGeometry(pts, 18);
  g.applyMatrix4(RX(Math.PI / 2));
  return g;
}

function wheel(r, w) {
  const g = new THREE.CylinderGeometry(r, r, w, 14);
  g.applyMatrix4(RZ(Math.PI / 2));
  return g;
}

function strut(x0, y0, z0, x1, y1, z1, r) {
  const a = new THREE.Vector3(x0, y0, z0);
  const b = new THREE.Vector3(x1, y1, z1);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 8);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return g;
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

  const gearH = s.wing === "high" ? 0.95 : Math.max(0.55, D * 0.42);
  const cy = gearH + R; // fuselage centerline height
  const parts = [];
  const gearParts = [];
  const propParts = [];

  // Fuselage (body color) + belly stripe band drawn as a slightly larger thin ring segment.
  parts.push(part(fuselage(L, D, { widthScale: 1 }), body, T(0, cy, 0)));
  const band = fuselage(L * 0.97, D * 1.012, { widthScale: 1 });
  {
    // keep only a horizontal band of the lathe: squash vertically into a stripe
    const p = band.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setY(i, -R * 0.12 + y * 0.12);
    }
  }
  parts.push(part(band, stripe, T(0, cy, -L * 0.005)));

  // Cockpit windshield: dark wedge near the nose.
  const noseZ = L / 2;
  const wsZ = noseZ - Math.max(D * 1.05, L * 0.1);
  const ws = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4);
  parts.push(part(ws, GLASS, chain(T(0, cy + R * 0.18, wsZ), S(R * 0.86, R * 0.78, D * 0.75))));

  // Cabin windows.
  const oval = ac.maker === "Gulfstream";
  const nWin = Math.max(3, Math.round(L / (oval ? 2.6 : 1.9)) - 3);
  const winStart = wsZ - D * 0.9;
  const winSpacing = (L * 0.42) / nWin;
  for (let i = 0; i < nWin; i++) {
    const z = winStart - i * winSpacing;
    for (const side of [1, -1]) {
      const w = new THREE.CylinderGeometry(1, 1, 0.06, 12);
      const ww = oval ? D * 0.13 : D * 0.08;
      const wh = oval ? D * 0.11 : D * 0.085;
      parts.push(part(w, GLASS, chain(T(side * R * 0.985, cy + R * 0.12, z), RZ(Math.PI / 2), S(wh, 1, ww))));
    }
  }

  // Wings.
  const rootChord = Math.max(1.4, L * (s.wing === "high" ? 0.18 : 0.2));
  const tipChord = rootChord * (s.engines === "prop-nose" && s.wing === "high" ? 0.95 : 0.42);
  const wingZ = s.wing === "high" ? L * 0.12 : L * 0.05;
  const wingY = s.wing === "high" ? cy + R * 0.95 : cy - R * 0.55;
  const dihedral = s.wing === "high" ? (1.5 * Math.PI) / 180 : (4 * Math.PI) / 180;
  const wingThick = rootChord * 0.14;
  for (const side of [1, -1]) {
    const w = slab({ span: semi, rootChord, tipChord, sweep, thickness: wingThick, dihedral });
    if (side < 0) w.applyMatrix4(S(-1, 1, 1));
    parts.push(part(ensureOutward(w), body, T(0, wingY, wingZ)));
    const tipX = side * semi;
    const tipY = wingY + Math.tan(dihedral) * semi;
    const tipZ = wingZ - Math.tan(sweep) * semi;
    if (s.winglets) {
      const wl = slab({ span: Math.max(0.6, semi * 0.14), rootChord: tipChord * 0.9, tipChord: tipChord * 0.45, sweep: (35 * Math.PI) / 180, thickness: tipChord * 0.1 });
      parts.push(part(wl, accent, chain(T(tipX, tipY, tipZ), RZ(side > 0 ? Math.PI / 2 - 0.25 : Math.PI / 2 + 0.25))));
    }
    // Nav lights: red on the left (port) wingtip, green on the right (starboard).
    const light = new THREE.SphereGeometry(Math.max(0.08, D * 0.05), 8, 6);
    parts.push(part(light, side > 0 ? C("#ff2a2a") : C("#22e05a"), T(tipX + side * 0.05, tipY, tipZ)));
    // C172 wing struts.
    if (s.wing === "high") {
      parts.push(part(strut(side * R * 0.9, cy - R * 0.4, wingZ, side * semi * 0.45, wingY - 0.05, wingZ - 0.1, 0.05), body));
    }
  }

  // Tail.
  const finH = L * (s.tail === "t-tail" ? 0.19 : 0.16) + 0.3;
  const finRoot = L * 0.2;
  const finTip = finRoot * (s.tail === "t-tail" ? 0.62 : 0.5);
  const finSweep = ((s.kind === "piston" ? 30 : 42) * Math.PI) / 180;
  const tailZ = -L / 2 + finRoot * 0.55;
  const tailBaseY = cy + R * 0.45;
  {
    const fin = slab({ span: finH, rootChord: finRoot, tipChord: finTip, sweep: finSweep, thickness: finRoot * 0.12 });
    parts.push(part(fin, stripe, chain(T(0, tailBaseY, tailZ), RZ(Math.PI / 2))));
  }
  const hsSemi = Math.max(1.6, semi * 0.36);
  const hsRoot = finRoot * 0.75;
  let hsY = cy + R * 0.3;
  let hsZ = tailZ - finRoot * 0.05;
  if (s.tail === "t-tail") {
    hsY = tailBaseY + finH - 0.05;
    hsZ = tailZ - Math.tan(finSweep) * finH;
  } else if (s.tail === "cruciform") {
    hsY = tailBaseY + finH * 0.45;
    hsZ = tailZ - Math.tan(finSweep) * finH * 0.45;
  }
  for (const side of [1, -1]) {
    const hs = slab({ span: hsSemi, rootChord: hsRoot, tipChord: hsRoot * 0.5, sweep: sweep * 1.1 + 0.05, thickness: hsRoot * 0.1, dihedral: s.tail === "conventional" ? 0.05 : 0 });
    if (side < 0) hs.applyMatrix4(S(-1, 1, 1));
    parts.push(part(ensureOutward(hs), s.tail === "t-tail" ? stripe : body, T(0, hsY, hsZ)));
  }

  // Engines.
  const nacLen = Math.max(1.6, L * 0.17);
  const nacRad = Math.max(0.35, L * 0.032 + 0.12);
  if (s.engines === "rear-twin" || s.engines === "rear-tri") {
    const ez = -L * 0.27;
    const ey = cy + R * 0.25;
    for (const side of [1, -1]) {
      const ex = side * (R + nacRad * 1.25);
      parts.push(part(nacelle(nacLen, nacRad), accent, T(ex, ey, ez)));
      parts.push(part(new THREE.BoxGeometry(nacRad * 1.2, nacRad * 0.35, nacLen * 0.45), body, T(side * (R + nacRad * 0.4), ey, ez)));
    }
    if (s.engines === "rear-tri") {
      // Third engine at the base of the tail, fed by an S-duct.
      parts.push(part(nacelle(nacLen * 0.9, nacRad * 0.95), accent, T(0, cy + R + nacRad * 0.55, ez - nacLen * 0.15)));
    }
  } else if (s.engines === "over-wing") {
    for (const side of [1, -1]) {
      const x = side * semi * 0.36;
      const z = wingZ - Math.tan(sweep) * semi * 0.36 - rootChord * 0.15;
      const y = wingY + Math.tan(dihedral) * semi * 0.36 + wingThick * 0.5 + nacRad * 1.35;
      parts.push(part(nacelle(nacLen, nacRad), accent, T(x, y, z)));
      parts.push(part(new THREE.BoxGeometry(0.12, nacRad * 1.1, nacLen * 0.5), body, T(x, y - nacRad * 0.9, z)));
    }
  } else if (s.engines === "prop-nose") {
    parts.push(part(new THREE.ConeGeometry(R * 0.35, R * 0.7, 14), accent, chain(T(0, cy, noseZ + R * 0.25), RX(Math.PI / 2))));
    const blades = ac.id === "pc12" ? 5 : 2;
    const bladeLen = ac.id === "pc12" ? 1.3 : 0.95;
    for (let i = 0; i < blades; i++) {
      const b = new THREE.BoxGeometry(0.16, bladeLen, 0.04);
      b.applyMatrix4(T(0, bladeLen / 2, 0));
      propParts.push(part(b, DARK, RZ((i / blades) * Math.PI * 2)));
    }
  }

  // Landing gear (wheel bottoms at y = 0). Main gear just behind the origin, nose gear forward.
  const wr = Math.max(0.22, D * 0.17);
  const mainX = s.wing === "high" ? 1.2 : Math.max(R * 1.2, semi * 0.24);
  const mainZ = 0;
  const noseGearZ = noseZ - Math.max(D * 0.8, L * 0.12);
  const gearTarget = s.fixedGear ? parts : gearParts;
  for (const side of [1, -1]) {
    gearTarget.push(part(wheel(wr, wr * 0.7), TIRE, T(side * mainX, wr, mainZ)));
    gearTarget.push(part(strut(side * mainX, wr, mainZ, side * Math.min(mainX, R * 0.8), cy - R * 0.5, mainZ + 0.1, wr * 0.22), METAL));
  }
  gearTarget.push(part(wheel(wr * 0.8, wr * 0.55), TIRE, T(0, wr * 0.8, noseGearZ)));
  gearTarget.push(part(strut(0, wr * 0.8, noseGearZ, 0, cy - R * 0.6, noseGearZ - 0.1, wr * 0.2), METAL));
  if (s.fixedGear) {
    // wheel fairings
    for (const side of [1, -1]) parts.push(part(new THREE.SphereGeometry(1, 10, 8), stripe, chain(T(side * mainX, wr * 1.05, mainZ), S(wr * 0.55, wr * 0.9, wr * 1.5))));
  }

  const nodes = [{ name: "body", geo: mergeGeometries(parts) }];
  if (gearParts.length) nodes.push({ name: "gear", geo: mergeGeometries(gearParts) });
  if (propParts.length) nodes.push({ name: "prop", geo: mergeGeometries(propParts), translation: [0, cy, noseZ + R * 0.45] });
  return nodes;
}

function buildRing() {
  const g = new THREE.TorusGeometry(1, 0.07, 10, 48);
  return [{ name: "ring", geo: part(g, C("#ffffff")) }];
}

/** Minimal GLB writer: one mesh per node, vertex colors, a single PBR material. */
function writeGlb(nodes, file) {
  const bufferParts = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const gltfNodes = [];

  function addView(typed, target) {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.byteLength % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    bufferParts.push(bytes);
    if (pad) bufferParts.push(new Uint8Array(pad));
    offset += bytes.byteLength + pad;
    return bufferViews.length - 1;
  }

  for (const n of nodes) {
    const g = n.geo;
    const pos = g.attributes.position.array instanceof Float32Array ? g.attributes.position.array : new Float32Array(g.attributes.position.array);
    const nor = new Float32Array(g.attributes.normal.array);
    const col = new Float32Array(g.attributes.color.array);
    const idx = new Uint32Array(g.index.array);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[i + k]);
        max[k] = Math.max(max[k], pos[i + k]);
      }
    }
    const count = pos.length / 3;
    const aPos = accessors.push({ bufferView: addView(new Float32Array(pos), 34962), componentType: 5126, count, type: "VEC3", min, max }) - 1;
    const aNor = accessors.push({ bufferView: addView(nor, 34962), componentType: 5126, count, type: "VEC3" }) - 1;
    const aCol = accessors.push({ bufferView: addView(col, 34962), componentType: 5126, count, type: "VEC3" }) - 1;
    const aIdx = accessors.push({ bufferView: addView(idx, 34963), componentType: 5125, count: idx.length, type: "SCALAR" }) - 1;
    meshes.push({ name: n.name, primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor, COLOR_0: aCol }, indices: aIdx, material: 0 }] });
    const node = { name: n.name, mesh: meshes.length - 1 };
    if (n.translation) node.translation = n.translation;
    gltfNodes.push(node);
  }

  const json = {
    asset: { version: "2.0", generator: "playnes build-models.mjs" },
    scene: 0,
    scenes: [{ nodes: gltfNodes.map((_, i) => i) }],
    nodes: gltfNodes,
    meshes,
    materials: [{ name: "paint", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.15, roughnessFactor: 0.42 }, doubleSided: true }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonChunkLen = jsonBytes.byteLength + jsonPad;
  const total = 12 + 8 + jsonChunkLen + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonChunkLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.byteLength + i] = 0x20;
  let p = 20 + jsonChunkLen;
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
  // Prop blades are built around their hub; the node translation places the hub on the nose.
  const nodes = buildAircraft(ac);
  const bytes = writeGlb(nodes, join(outDir, `${ac.id}.glb`));
  console.log(`${ac.id}.glb  ${(bytes / 1024).toFixed(0)} KB`);
}
writeGlb(buildRing(), join(outDir, "ring.glb"));
console.log("ring.glb");
