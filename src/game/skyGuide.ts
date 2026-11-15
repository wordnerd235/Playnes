// A faint glowing line in the sky to follow to a runway: shown in Free Flight on the way to an
// airport you've never landed at. It follows the planned route at sensible heights: easing from
// the playne's height to ~1,000 ft above the runway at the start of final, then down a normal
// 3 degree glide slope to the touchdown point. Only the part ahead of the playne is drawn.

import { Cartesian3, Color, Material, PolylineCollection, type Scene, type Polyline } from "cesium";
import { distance, type LatLon } from "../sim/geo.ts";

const GLIDE = (3 * Math.PI) / 180;
/** Touchdown aim point past the threshold, metres, and the threshold crossing height. */
const AIM = 300;
const TCH = 15;

export class SkyGuide {
  private lines: PolylineCollection;
  private line: Polyline | null = null;
  private pts: { p: LatLon; h: number }[] = [];

  constructor(private scene: Scene) {
    this.lines = scene.primitives.add(new PolylineCollection()) as PolylineCollection;
  }

  /**
   * New route. `startAlt` is the playne's height now; `thresholdH` the runway threshold's
   * ground height (both metres, same datum as the world); `finalIndex` where the final starts.
   */
  set(route: LatLon[], finalIndex: number, startAlt: number, thresholdH: number): void {
    const n = route.length;
    // Distance to go along the route, from each point to the threshold.
    const toGo = new Array<number>(n).fill(0);
    for (let i = n - 2; i >= 0; i--) toGo[i] = toGo[i + 1] + distance(route[i], route[i + 1]);
    const glideAlt = (d: number) => thresholdH + TCH + Math.max(0, d) * Math.tan(GLIDE);
    const fafAlt = glideAlt(Math.max(0, toGo[finalIndex] - AIM));
    const curveLen = Math.max(1, toGo[0] - toGo[finalIndex]);
    this.pts = route.map((p, i) => {
      if (i >= finalIndex) return { p, h: glideAlt(Math.max(0, toGo[i] - AIM)) };
      // Ease from the current height to the final approach height along the curve.
      const t = (toGo[0] - toGo[i]) / curveLen;
      const k = t * t * (3 - 2 * t);
      return { p, h: startAlt + (fafAlt - startAlt) * k };
    });
    this.draw(0);
  }

  /** Draw from route point `from` onward (the part still ahead). */
  draw(from: number): void {
    const pts = this.pts.slice(Math.max(0, from));
    if (pts.length < 2) {
      this.clear();
      return;
    }
    const positions = pts.map((q) => Cartesian3.fromDegrees(q.p.lon, q.p.lat, q.h));
    if (!this.line) {
      this.line = this.lines.add({
        positions,
        width: 10,
        material: Material.fromType(Material.PolylineGlowType, { color: Color.fromCssColorString("#ff2fa0").withAlpha(0.55), glowPower: 0.22, taperPower: 1 }),
      });
    } else this.line.positions = positions;
  }

  clear(): void {
    this.lines.removeAll();
    this.line = null;
    this.pts = [];
  }

  destroy(): void {
    this.scene.primitives.remove(this.lines);
  }
}
