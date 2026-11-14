// Real airport buildings (terminals, hangars, towers...) for the offline world, from the
// footprints in public/world/buildings.json (Overture Maps / OpenStreetMap, built by
// scripts/world/airport_buildings.py). Each airport's buildings become one batched primitive,
// built when the playne comes near and dropped again when it leaves.

import {
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  Cartesian3,
  type Scene,
} from "cesium";
import { distance, type LatLon } from "../sim/geo.ts";
import type { CartoonData } from "./cartoon.ts";
import { gfxOn } from "./safety.ts";

interface BuildingRec {
  /** Footprint: [dLon, dLat, dLon, dLat, ...] in millionths of a degree from the airport. */
  p: number[];
  /** Footprint area, m². */
  a: number;
  /** Height in meters, when known. */
  h?: number;
  /** Overture class (hangar, terminal, ...). */
  c?: string;
  /** Name. */
  n?: string;
}

interface AirportRec {
  lon: number;
  lat: number;
  b: BuildingRec[];
}

const BUILD_KM = 22;
const DROP_KM = 34;

function hash(s: number): number {
  const x = Math.sin(s * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** A sensible height for a building whose real height isn't in the data. */
export function guessHeight(b: Pick<BuildingRec, "a" | "c" | "n" | "h">): number {
  if (b.h && b.h > 0) return Math.min(b.h, 80);
  const name = (b.n ?? "").toLowerCase();
  if (b.c === "control_tower" || /\btower\b/.test(name)) return 38;
  if (b.c === "hangar" || /hangar/.test(name)) return 13;
  if (b.c === "parking" || b.c === "garage" || /parking|garage|deck/.test(name)) return 11;
  if (/terminal|concourse/.test(name)) return 16;
  if (b.a > 9000) return 14;
  if (b.a > 2500) return 10;
  return 6.5;
}

function wallColor(b: BuildingRec, i: number): Color {
  const name = (b.n ?? "").toLowerCase();
  if (b.c === "hangar" || /hangar/.test(name)) return Color.fromCssColorString(hash(i) > 0.5 ? "#d5dde6" : "#c9d3de");
  if (/terminal|concourse/.test(name) || b.a > 9000) return Color.fromCssColorString("#eef0f2");
  if (b.c === "control_tower" || /\btower\b/.test(name)) return Color.fromCssColorString("#f7f7f2");
  const palette = ["#e9dfcf", "#dfe5ea", "#efe6d6", "#d9d2c6", "#e4e9ee"];
  return Color.fromCssColorString(palette[Math.floor(hash(i + 7) * palette.length)]);
}

function roofColor(b: BuildingRec): Color {
  const name = (b.n ?? "").toLowerCase();
  if (b.c === "hangar" || /hangar/.test(name)) return Color.fromCssColorString("#8f9aa6");
  if (b.a > 9000) return Color.fromCssColorString("#a9b0b8");
  return Color.fromCssColorString("#8e857b");
}

export class AirportBuildings {
  private data: Record<string, AirportRec> | null = null;
  private loading = false;
  private built = new Map<string, Primitive>();
  private visible = true;

  constructor(private scene: Scene, private cartoon: CartoonData) {}

  setVisible(v: boolean): void {
    this.visible = v;
    for (const p of this.built.values()) p.show = v;
  }

  update(p: LatLon): void {
    if (!gfxOn("props")) {
      if (this.built.size) this.clear();
      return;
    }
    if (!this.data) {
      void this.load();
      return;
    }
    for (const [code, ap] of Object.entries(this.data)) {
      const d = distance(p, ap) / 1000;
      if (d < BUILD_KM && !this.built.has(code)) this.build(code, ap);
      else if (d > DROP_KM && this.built.has(code)) {
        this.scene.primitives.remove(this.built.get(code)!);
        this.built.delete(code);
      }
    }
  }

  private async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      const r = await fetch("./world/buildings.json");
      if (!r.ok) return;
      const json = (await r.json()) as { airports: Record<string, AirportRec> };
      this.data = json.airports;
    } catch {
      /* no building data: fine, the airports just stay flat */
    }
  }

  private build(code: string, ap: AirportRec): void {
    const instances: GeometryInstance[] = [];
    ap.b.forEach((b, i) => {
      const ring: LatLon[] = [];
      for (let k = 0; k + 1 < b.p.length; k += 2) ring.push({ lon: ap.lon + b.p[k] / 1e6, lat: ap.lat + b.p[k + 1] / 1e6 });
      if (ring.length < 3) return;
      // Sit on the lowest ground under the footprint (a little sunk in, so no gaps show).
      let base = Infinity;
      for (const c of ring) base = Math.min(base, this.cartoon.height(c.lat, c.lon));
      base -= 0.8;
      const top = base + 0.8 + guessHeight(b);
      const hierarchy = new PolygonHierarchy(Cartesian3.fromDegreesArray(ring.flatMap((c) => [c.lon, c.lat])));
      instances.push(
        new GeometryInstance({
          geometry: new PolygonGeometry({ polygonHierarchy: hierarchy, height: base, extrudedHeight: top, vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(wallColor(b, i)) },
        }),
        // A slightly darker roof cap.
        new GeometryInstance({
          geometry: new PolygonGeometry({ polygonHierarchy: hierarchy, height: top, extrudedHeight: top + 0.5, vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(roofColor(b)) },
        }),
      );
    });
    if (!instances.length) return;
    const prim = new Primitive({
      geometryInstances: instances,
      appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
      shadows: 0,
    });
    prim.show = this.visible;
    this.scene.primitives.add(prim);
    this.built.set(code, prim);
  }

  clear(): void {
    for (const p of this.built.values()) this.scene.primitives.remove(p);
    this.built.clear();
  }

  destroy(): void {
    this.clear();
  }
}
