// The player's plane on screen: model, moving control surfaces, blinking lights, ground
// shadow, and the camera (chase / cockpit, with drag-to-look offsets).

import { Cartesian3, Cartesian4, Cartographic, Color, Matrix3, Matrix4, Model, Transforms, type ModelNode } from "cesium";
import type { AircraftDef } from "../data/aircraft.ts";
import { angleDiff, clamp, DEG, destination, type LatLon } from "../sim/geo.ts";
import type { FlightState } from "../sim/physics.ts";
import type { World } from "../world/world.ts";

export type CameraMode = "chase" | "cockpit";

export interface SurfaceInputs {
  /** -1..1: roll command (positive = rolling right). */
  roll: number;
  /** -1..1: pitch command (positive = nose up). */
  pitch: number;
  /** -1..1: rudder (positive = yaw right). */
  yaw: number;
}

const FLAP_DEG = [0, 10, 20, 35];

export class PlaneView {
  model: Model | null = null;
  private shadow: Model | null = null;
  private nodes: Record<string, ModelNode | null> = {};
  private originals: Record<string, Matrix4> = {};
  private propT = new Cartesian3();
  private propAngle = 0;
  private flapDeg = 0;
  private ail = 0;
  private elev = 0;
  private rud = 0;
  private time = 0;
  private camHeading = 0;
  private camPitchSmooth = 0;
  lookYaw = 0;
  lookPitch = 0;
  mode: CameraMode = "chase";
  /** Camera shake amount (meters), decays (crash effect). */
  shake = 0;

  constructor(private world: World, private ac: AircraftDef) {}

  async load(): Promise<void> {
    const scene = this.world.widget.scene;
    this.model = await Model.fromGltfAsync({ url: `./models/${this.ac.id}.glb`, minimumPixelSize: 48, maximumScale: 20000 });
    scene.primitives.add(this.model);
    this.world.exclude.push(this.model);
    this.model.readyEvent.addEventListener(() => {
      for (const n of ["gear", "prop", "flapL", "flapR", "ailL", "ailR", "elevL", "elevR", "rudder", "beacon", "strobe"]) {
        try {
          const node = this.model!.getNode(n) ?? null;
          this.nodes[n] = node;
          if (node) this.originals[n] = Matrix4.clone(node.originalMatrix);
        } catch {
          this.nodes[n] = null;
        }
      }
      if (this.originals.prop) Matrix4.getTranslation(this.originals.prop, this.propT);
    });
    this.shadow = await Model.fromGltfAsync({ url: "./models/shadow.glb", color: Color.WHITE.withAlpha(0.8) });
    scene.primitives.add(this.shadow);
    this.world.exclude.push(this.shadow);
  }

  resetCameraHeading(h: number): void {
    this.camHeading = h;
  }

  resetLook(): void {
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  addLook(dYaw: number, dPitch: number): void {
    this.lookYaw = ((this.lookYaw + dYaw + 540) % 360) - 180;
    this.lookPitch = clamp(this.lookPitch + dPitch, this.mode === "cockpit" ? -60 : -25, this.mode === "cockpit" ? 45 : 70);
  }

  /** Update the model pose, control surfaces, lights and shadow. groundHeight null = hide shadow. */
  update(s: FlightState, dt: number, input: SurfaceInputs, groundHeight: number | null): void {
    if (!this.model) return;
    this.time += dt;
    this.model.modelMatrix = frameMatrix(s, s.alt, s.heading, s.pitch, s.bank, 1);
    const k = 1 - Math.exp(-dt * 8);
    this.flapDeg += (FLAP_DEG[s.flaps] - this.flapDeg) * (1 - Math.exp(-dt * 1.5));
    this.ail += (clamp(input.roll, -1, 1) * 18 - this.ail) * k;
    this.elev += (clamp(input.pitch, -1, 1) * 16 - this.elev) * k;
    this.rud += (clamp(input.yaw, -1, 1) * 20 - this.rud) * k;
    const n = this.nodes;
    this.hinge("flapL", -this.flapDeg);
    this.hinge("flapR", -this.flapDeg);
    this.hinge("ailL", -this.ail);
    this.hinge("ailR", this.ail);
    this.hinge("elevL", this.elev);
    this.hinge("elevR", this.elev);
    this.hinge("rudder", this.rud);
    if (n.gear) n.gear.show = s.gearDown;
    if (n.prop) {
      this.propAngle += dt * (10 + s.throttle * 55);
      n.prop.matrix = Matrix4.multiply(Matrix4.fromTranslation(this.propT), Matrix4.fromRotation(Matrix3.fromRotationZ(this.propAngle)), new Matrix4());
    }
    if (n.beacon) n.beacon.show = this.time % 1.3 < 0.18;
    if (n.strobe) n.strobe.show = (this.time + 0.4) % 1.1 < 0.07;

    if (this.shadow) {
      const agl = groundHeight === null ? Infinity : s.alt - groundHeight;
      const show = agl < 150;
      this.shadow.show = show;
      if (show && groundHeight !== null) {
        const a = clamp(1 - agl / 150, 0, 1) * 0.85;
        this.shadow.color = Color.WHITE.withAlpha(a);
        const f = frameVectors(s, groundHeight + 0.25, s.heading, 0, 0);
        const sx = this.ac.shape.length * 0.5;
        const sy = this.ac.shape.span * 0.48;
        // prettier-ignore
        this.shadow.modelMatrix = new Matrix4(
          f.fwd.x * sx, -f.right.x * sy, f.up.x, f.pos.x,
          f.fwd.y * sx, -f.right.y * sy, f.up.y, f.pos.y,
          f.fwd.z * sx, -f.right.z * sy, f.up.z, f.pos.z,
          0, 0, 0, 1,
        );
      }
    }
  }

  private hinge(name: string, deg: number): void {
    const node = this.nodes[name];
    const orig = this.originals[name];
    if (!node || !orig) return;
    node.matrix = Matrix4.multiply(orig, Matrix4.fromRotation(Matrix3.fromRotationX(deg * DEG)), new Matrix4());
  }

  /**
   * Place the camera. Chase view keeps the plane in the lower part of the screen so you can see
   * where you're going. `lookDown` tilts the view toward the ground (landmark moments).
   * Returns the camera position (used for the cloud deck).
   */
  updateCamera(s: FlightState, dt: number, lookDown = false): LatLon & { height: number } {
    const scene = this.world.widget.scene;
    const L = this.ac.shape.length;
    const k = dt === 0 ? 1 : 1 - Math.exp(-dt * 2.5);
    this.camHeading += angleDiff(s.heading, this.camHeading) * k;

    if (this.mode === "cockpit") {
      const f = frameVectors(s, s.alt, s.heading + this.lookYaw, s.pitch + this.lookPitch - (lookDown ? 35 : 0), s.bank);
      const base = frameVectors(s, s.alt, s.heading, s.pitch, s.bank);
      const eye = Cartesian3.add(
        base.pos,
        Cartesian3.add(Cartesian3.multiplyByScalar(base.fwd, L * 0.36, new Cartesian3()), Cartesian3.multiplyByScalar(base.up, this.ac.shape.fuselageDiameter * 0.75 + 0.9, new Cartesian3()), new Cartesian3()),
        new Cartesian3(),
      );
      const ec = Cartographic.fromCartesian(eye);
      const safe = this.aboveTerrain(ec.latitude / DEG, ec.longitude / DEG, ec.height);
      const dest = safe === ec.height ? eye : Cartesian3.fromRadians(ec.longitude, ec.latitude, safe);
      scene.camera.setView({ destination: dest, orientation: { direction: f.fwd, up: f.up } });
      return { lat: ec.latitude / DEG, lon: ec.longitude / DEG, height: safe };
    }

    const dist = Math.max(18, L * 2.4);
    const elevTarget = 11 + this.lookPitch + (lookDown ? 35 : 0);
    this.camPitchSmooth += (elevTarget - this.camPitchSmooth) * k;
    const elev = clamp(this.camPitchSmooth, -20, 80) * DEG;
    const camHdg = this.camHeading + 180 + this.lookYaw;
    const horiz = dist * Math.cos(elev);
    const ground = destination(s, camHdg, horiz);
    const camAlt = this.aboveTerrain(ground.lat, ground.lon, s.alt + L * 0.15 + dist * Math.sin(elev));
    this.shake = Math.max(0, this.shake - dt * 0.4);
    const j = this.shake * 3;
    const eye = Cartesian3.fromDegrees(ground.lon + (Math.random() - 0.5) * j * 1e-5, ground.lat + (Math.random() - 0.5) * j * 1e-5, camAlt + (Math.random() - 0.5) * j);
    // Aim above the plane so it sits in the lower part of the screen.
    const aimAbove = dist * 0.15 * Math.cos(elev);
    const target = Cartesian3.fromDegrees(s.lon, s.lat, s.alt + L * 0.12 + aimAbove);
    const dir = Cartesian3.normalize(Cartesian3.subtract(target, eye, new Cartesian3()), new Cartesian3());
    const upGeo = Cartesian3.normalize(eye, new Cartesian3());
    const right = Cartesian3.normalize(Cartesian3.cross(dir, upGeo, new Cartesian3()), new Cartesian3());
    const up = Cartesian3.cross(right, dir, new Cartesian3());
    scene.camera.setView({ destination: eye, orientation: { direction: dir, up } });
    return { lat: ground.lat, lon: ground.lon, height: camAlt };
  }

  /**
   * Keep the camera above the terrain that is loaded right now. While detailed terrain tiles
   * stream in, the coarse ones can sit a few meters above the runway; a camera under them
   * would see the underside of the world (a green or black sky).
   */
  private aboveTerrain(lat: number, lon: number, h: number): number {
    const globe = this.world.widget.scene.globe;
    const g = globe.show ? globe.getHeight(Cartographic.fromDegrees(lon, lat)) : undefined;
    return g !== undefined && Number.isFinite(g) ? Math.max(h, g + 1.2) : h;
  }

  destroy(): void {
    const scene = this.world.widget.scene;
    if (this.model) scene.primitives.remove(this.model);
    if (this.shadow) scene.primitives.remove(this.shadow);
  }
}

/** Position + orientation vectors (world) for a body at lat/lon/alt with heading/pitch/bank. */
export function frameVectors(p: LatLon, alt: number, heading: number, pitch: number, bank: number) {
  const pos = Cartesian3.fromDegrees(p.lon, p.lat, alt);
  const enu = Transforms.eastNorthUpToFixedFrame(pos);
  const col = (i: number) => {
    const c = Matrix4.getColumn(enu, i, new Cartesian4());
    return new Cartesian3(c.x, c.y, c.z);
  };
  const E = col(0);
  const N = col(1);
  const U = col(2);
  const h = heading * DEG;
  const th = pitch * DEG;
  const ph = bank * DEG;
  const comb = (e: number, n: number, u: number) =>
    Cartesian3.add(Cartesian3.add(Cartesian3.multiplyByScalar(E, e, new Cartesian3()), Cartesian3.multiplyByScalar(N, n, new Cartesian3()), new Cartesian3()), Cartesian3.multiplyByScalar(U, u, new Cartesian3()), new Cartesian3());
  const fwd = comb(Math.sin(h) * Math.cos(th), Math.cos(h) * Math.cos(th), Math.sin(th));
  const right0 = comb(Math.cos(h), -Math.sin(h), 0);
  const up0 = Cartesian3.cross(right0, fwd, new Cartesian3());
  const right = Cartesian3.subtract(Cartesian3.multiplyByScalar(right0, Math.cos(ph), new Cartesian3()), Cartesian3.multiplyByScalar(up0, Math.sin(ph), new Cartesian3()), new Cartesian3());
  const up = Cartesian3.add(Cartesian3.multiplyByScalar(up0, Math.cos(ph), new Cartesian3()), Cartesian3.multiplyByScalar(right0, Math.sin(ph), new Cartesian3()), new Cartesian3());
  return { pos, fwd, right, up };
}

/**
 * Model matrix for a glTF built with nose +Z, up +Y, left +X. Cesium converts glTF axes so the
 * model's own frame is X forward, Y left, Z up; the columns map those to world vectors.
 */
export function frameMatrix(p: LatLon, alt: number, heading: number, pitch: number, bank: number, scale: number): Matrix4 {
  const f = frameVectors(p, alt, heading, pitch, bank);
  const left = Cartesian3.negate(f.right, new Cartesian3());
  const s = scale;
  // prettier-ignore
  return new Matrix4(
    f.fwd.x * s, left.x * s, f.up.x * s, f.pos.x,
    f.fwd.y * s, left.y * s, f.up.y * s, f.pos.y,
    f.fwd.z * s, left.z * s, f.up.z * s, f.pos.z,
    0, 0, 0, 1,
  );
}
