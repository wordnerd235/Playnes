// Landmark markers: a golden star pin with the landmark's name floating above each one, so a
// lake or mountain that's hard to pick out of the terrain is easy to find (the minimap shows
// the same stars). Shown when within ~30 km; sized in screen pixels so they stay readable.

import {
  BillboardCollection,
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  type Scene,
} from "cesium";
import { LANDMARKS } from "../data/airports.ts";

/** Star-on-a-stem pin, drawn once. */
function pinImage(): string {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 150;
  const g = c.getContext("2d")!;
  // Stem.
  const stem = g.createLinearGradient(0, 70, 0, 150);
  stem.addColorStop(0, "rgba(255,255,255,0.95)");
  stem.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = stem;
  g.fillRect(45, 70, 6, 80);
  // Star with a dark rim.
  const star = (r: number, fill: string) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      g.lineTo(48 + Math.cos(a) * rr, 46 + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  star(44, "#7a4a00");
  star(38, "#ffc61a");
  star(24, "#ffe680");
  return c.toDataURL();
}

/** "the city of Charlotte" -> "City of Charlotte" */
function title(spoken: string): string {
  const s = spoken.replace(/^the /i, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class LandmarkMarkers {
  private pins: BillboardCollection;
  private labels: LabelCollection;

  constructor(private scene: Scene, groundHeight: (lat: number, lon: number) => number) {
    this.pins = scene.primitives.add(new BillboardCollection({ scene })) as BillboardCollection;
    this.labels = scene.primitives.add(new LabelCollection({ scene })) as LabelCollection;
    const img = pinImage();
    const show = new DistanceDisplayCondition(0, 32000);
    const scale = new NearFarScalar(1500, 1.0, 30000, 0.55);
    for (const l of LANDMARKS) {
      const pos = Cartesian3.fromDegrees(l.lon, l.lat, groundHeight(l.lat, l.lon) + 90);
      this.pins.add({
        position: pos,
        image: img,
        width: 64,
        height: 100,
        verticalOrigin: VerticalOrigin.BOTTOM,
        distanceDisplayCondition: show,
        scaleByDistance: scale,
        disableDepthTestDistance: 0,
      });
      this.labels.add({
        position: pos,
        text: title(l.spoken),
        font: "800 22px system-ui, -apple-system, sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString("#1d2733"),
        outlineWidth: 5,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.TOP,
        horizontalOrigin: HorizontalOrigin.CENTER,
        pixelOffset: new Cartesian2(0, 8),
        distanceDisplayCondition: show,
        scaleByDistance: scale,
      });
    }
  }

  setVisible(v: boolean): void {
    this.pins.show = v;
    this.labels.show = v;
  }

  destroy(): void {
    this.scene.primitives.remove(this.pins);
    this.scene.primitives.remove(this.labels);
  }
}
