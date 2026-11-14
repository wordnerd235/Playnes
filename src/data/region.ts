// The playable region: the area covered by the offline cartoon map and the sandbox mode.
// Must stay free of DOM imports (used by Node scripts too).
export const REGION = { south: 33.0, north: 37.5, west: -85.5, east: -78.0 };

export function inRegion(lat: number, lon: number, margin = 0): boolean {
  return lat > REGION.south + margin && lat < REGION.north - margin && lon > REGION.west + margin && lon < REGION.east - margin;
}
