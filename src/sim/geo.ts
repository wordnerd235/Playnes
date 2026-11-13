// Small geodesy helpers on a spherical Earth (good enough for game navigation)
// plus WGS84 meters-per-degree for moving the aircraft each physics step.

export const DEG = Math.PI / 180;
export const NM = 1852; // meters per nautical mile
export const FT = 0.3048; // meters per foot
export const KT = NM / 3600; // m/s per knot
export const EARTH_R = 6371008.8;

export interface LatLon {
  lat: number; // degrees
  lon: number; // degrees
}

export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed smallest difference a-b in degrees, in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = wrap360(a - b);
  if (d > 180) d -= 360;
  return d;
}

/** Great-circle distance in meters. */
export function distance(a: LatLon, b: LatLon): number {
  const la1 = a.lat * DEG;
  const la2 = b.lat * DEG;
  const dla = la2 - la1;
  const dlo = (b.lon - a.lon) * DEG;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial true bearing from a to b, degrees 0..360. */
export function bearing(a: LatLon, b: LatLon): number {
  const la1 = a.lat * DEG;
  const la2 = b.lat * DEG;
  const dlo = (b.lon - a.lon) * DEG;
  const y = Math.sin(dlo) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo);
  return wrap360(Math.atan2(y, x) / DEG);
}

/** Point reached from `p` travelling `dist` meters on true bearing `brg` degrees. */
export function destination(p: LatLon, brg: number, dist: number): LatLon {
  const d = dist / EARTH_R;
  const t = brg * DEG;
  const la1 = p.lat * DEG;
  const lo1 = p.lon * DEG;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(t));
  const lo2 = lo1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: la2 / DEG, lon: ((lo2 / DEG + 540) % 360) - 180 };
}

/** Point a fraction f (0..1) of the way along the great circle from a to b. */
export function interpolate(a: LatLon, b: LatLon, f: number): LatLon {
  const d = distance(a, b);
  if (d < 1) return { ...a };
  return destination(a, bearing(a, b), d * f);
}

/** Signed cross-track distance (m) of p from the great circle a→b. Positive = right of track. */
export function crossTrack(a: LatLon, b: LatLon, p: LatLon): number {
  const d13 = distance(a, p) / EARTH_R;
  const t13 = bearing(a, p) * DEG;
  const t12 = bearing(a, b) * DEG;
  return Math.asin(Math.sin(d13) * Math.sin(t13 - t12)) * EARTH_R;
}

/** Along-track distance (m) of p's projection on the great circle a→b, measured from a. */
export function alongTrack(a: LatLon, b: LatLon, p: LatLon): number {
  const d13 = distance(a, p) / EARTH_R;
  const xt = crossTrack(a, b, p) / EARTH_R;
  const v = Math.cos(d13) / Math.cos(xt);
  const at = Math.acos(Math.max(-1, Math.min(1, v))) * EARTH_R;
  const t13 = bearing(a, p);
  const t12 = bearing(a, b);
  return Math.abs(angleDiff(t13, t12)) > 90 ? -at : at;
}

/** WGS84 meters per degree of latitude and longitude at a latitude. */
export function metersPerDegree(latDeg: number): { lat: number; lon: number } {
  const a = 6378137;
  const e2 = 0.00669437999014;
  const s = Math.sin(latDeg * DEG);
  const w = Math.sqrt(1 - e2 * s * s);
  const mLat = (a * (1 - e2)) / (w * w * w);
  const mLon = (a * Math.cos(latDeg * DEG)) / w;
  return { lat: mLat * DEG, lon: mLon * DEG };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `current` toward `target` by at most `maxStep`. */
export function approach(current: number, target: number, maxStep: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}
