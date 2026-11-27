// Builds public/world/places.json: names of cities and towns in the game's region, for the
// optional place-name labels in Google mode. Source: GeoNames' "cities with 1,000+ people"
// (CC BY 4.0, credited in the game), as packed in the all-the-cities npm package (3.1.0).
// Usage: node scripts/world/build-places.mjs <path to all-the-cities/cities.pbf>
import fs from "node:fs";

const [src] = process.argv.slice(2);
const buf = fs.readFileSync(src);
let pos = 0;
const varint = () => {
  let v = 0, shift = 0, b;
  do { b = buf[pos++]; v += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80);
  return v;
};
const svarint = () => { const v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2; };
const str = () => { const n = varint(); const s = buf.toString("utf8", pos, pos + n); pos += n; return s; };
let lastLat = 0, lastLon = 0;
const out = [];
// The lower 48 states (the 3D map covers the whole country).
const box = { s: 24.3, n: 49.6, w: -125.0, e: -66.8 };
while (pos < buf.length) {
  const end = varint() + pos;
  const c = { name: "", country: "", admin: "", code: "", pop: 0, lat: 0, lon: 0 };
  while (pos < end) {
    const key = varint(), tag = key >> 3, type = key & 7;
    if (tag === 1) svarint();
    else if (tag === 2) c.name = str();
    else if (tag === 3) c.country = str();
    else if (tag === 7) c.code = str();
    else if (tag === 8) c.admin = str();
    else if (tag === 9) c.pop = varint();
    else if (tag === 10) { lastLon += svarint(); c.lon = lastLon / 1e5; }
    else if (tag === 11) { lastLat += svarint(); c.lat = lastLat / 1e5; }
    else if (type === 2) str();
    else if (type === 0) varint();
    else throw new Error(`unexpected field ${tag}/${type}`);
  }
  if (c.country !== "US" || c.lat < box.s || c.lat > box.n || c.lon < box.w || c.lon > box.e) continue;
  // Populated places only (not "section of a city" PPLX, or abandoned/historical ones).
  if (!/^PPL(A\d?|C)?$/.test(c.code)) continue;
  out.push([c.name, c.admin, +c.lat.toFixed(4), +c.lon.toFixed(4), c.pop]);
}
// GeoNames gives a couple of tiny places their whole metro area's population (two Kentucky
// villages share Ashland's): drop places sharing a big population with another.
const seen = new Map();
for (const p of out) seen.set(p[4], (seen.get(p[4]) ?? 0) + 1);
for (let i = out.length - 1; i >= 0; i--) if (out[i][4] > 15000 && seen.get(out[i][4]) > 1) out.splice(i, 1);
out.sort((a, b) => b[4] - a[4]);
fs.writeFileSync("public/world/places.json", JSON.stringify({ source: "GeoNames (CC BY 4.0), cities with 1,000+ people", places: out }));
console.log(out.length, "places;", out.slice(0, 8).map((p) => `${p[0]} ${p[1]} ${p[4]}`).join(", "));
