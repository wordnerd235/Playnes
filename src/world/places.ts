// Place-name labels (Google mode, optional): the names of the cities and towns around the
// playne, floating over each place, so you can tell where you are over a photo-real map.
// Data: public/world/places.json (GeoNames, cities with 1,000+ people, built by
// scripts/world/build-places.mjs). Only places near the playne get a label; bigger places show
// from farther away and in bigger letters. Drawn on top of the 3D map (never hidden by hills).

import { Cartesian3, Color, DistanceDisplayCondition, HorizontalOrigin, LabelCollection, LabelStyle, NearFarScalar, VerticalOrigin, type Label, type Scene } from "cesium";
import { LANDMARKS } from "../data/airports.ts";
import type { LatLon } from "../sim/geo.ts";

type Place = [name: string, state: string, lat: number, lon: number, population: number];

/** How far away (m) a place of this size is named. */
function reach(pop: number): number {
  return pop >= 200_000 ? 90_000 : pop >= 50_000 ? 55_000 : pop >= 10_000 ? 30_000 : pop >= 3_000 ? 16_000 : 9_000;
}

function font(pop: number): string {
  const px = pop >= 200_000 ? 26 : pop >= 50_000 ? 22 : pop >= 10_000 ? 19 : 16;
  return `${pop >= 50_000 ? 900 : 800} ${px}px system-ui, -apple-system, sans-serif`;
}

export class PlaceLabels {
  private labels: LabelCollection;
  private places: Place[] | null = null;
  private loading: Promise<void> | null = null;
  private live = new Map<number, Label>();
  private on = false;
  private lastUpdate = 0;
  private last: LatLon | null = null;

  constructor(private scene: Scene, private groundHeight: (lat: number, lon: number) => number) {
    this.labels = scene.primitives.add(new LabelCollection({ scene })) as LabelCollection;
    this.labels.show = false;
  }

  get visible(): boolean {
    return this.on;
  }

  /** Hidden with the ground (e.g. inside a cloud). */
  setGroundShown(v: boolean): void {
    this.ground = v;
    this.labels.show = this.on && v;
  }
  private ground = true;

  setVisible(on: boolean): void {
    this.on = on;
    this.labels.show = on && this.ground;
    if (on && !this.places) {
      this.loading ??= fetch("./world/places.json")
        .then((r) => r.json())
        .then((d: { places: Place[] }) => {
          // A landmark pin that already names the place ("City of Charlotte") wins.
          this.places = d.places.filter(([name, , lat, lon]) => !LANDMARKS.some((l) => l.spoken.toLowerCase().endsWith(name.toLowerCase()) && Math.abs(l.lat - lat) < 0.05 && Math.abs(l.lon - lon) < 0.05));
          this.lastUpdate = 0;
          if (this.last) this.update(this.last, true);
        })
        .catch((e) => console.warn("place names unavailable", e));
    }
  }

  /** Call every frame with the playne's position; re-picks the places nearby every 2 s. */
  update(p: LatLon, force = false): void {
    this.last = { lat: p.lat, lon: p.lon };
    if (!this.on || !this.places) return;
    const now = performance.now();
    if (!force && now - this.lastUpdate < 2000) return;
    this.lastUpdate = now;
    const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
    const want = new Set<number>();
    for (let i = 0; i < this.places.length; i++) {
      const [, , lat, lon, pop] = this.places[i];
      const r = reach(pop) * 1.15;
      const dy = (lat - p.lat) * 111_320;
      if (Math.abs(dy) > r) continue;
      const dx = (lon - p.lon) * kx;
      if (dx * dx + dy * dy < r * r) want.add(i);
    }
    for (const [i, l] of this.live) {
      if (want.has(i)) continue;
      this.labels.remove(l);
      this.live.delete(i);
    }
    for (const i of want) {
      if (this.live.has(i)) continue;
      const [name, , lat, lon, pop] = this.places[i];
      const far = reach(pop);
      this.live.set(
        i,
        this.labels.add({
          position: Cartesian3.fromDegrees(lon, lat, this.groundHeight(lat, lon) + 120),
          text: name,
          font: font(pop),
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString("#16324f"),
          outlineWidth: 5,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          distanceDisplayCondition: new DistanceDisplayCondition(0, far),
          scaleByDistance: new NearFarScalar(2_000, 1.0, far, 0.7),
          translucencyByDistance: new NearFarScalar(far * 0.75, 1.0, far, 0.0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }),
      );
    }
  }

  destroy(): void {
    this.scene.primitives.remove(this.labels);
  }
}
