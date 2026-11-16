// The player's plane on screen: model, moving control surfaces, blinking lights, ground
// shadow, and the camera (chase / cockpit, with drag-to-look offsets).

import { asset } from "../assets.ts";
import { Cartesian3, Cartesian4, Cartographic, Color, Matrix3, Matrix4, Model, Transforms, type ModelNode, type PerspectiveFrustum } from "cesium";
import { RIGS } from "../data/rigs.ts";
import type { AircraftDef } from "../data/aircraft.ts";
import { angleDiff, clamp, DEG, destination, type LatLon } from "../sim/geo.ts";
import { indicated, speedOfSound, type FlightState } from "../sim/physics.ts";
import type { World } from "../world/world.ts";

export type CameraMode = "chase" | "cockpit" | "window";

export interface SurfaceInputs {
  /** -1..1: roll command (positive = rolling right). */
  roll: number;
  /** -1..1: pitch command (positive = nose up). */
  pitch: number;
  /** -1..1: rudder (positive = yaw right). */
  yaw: number;
  /** 0..1: speedbrakes out (models that have them). */
  brake?: number;
}

const FLAP_DEG = [0, 10, 20, 35];

export class PlaneView {
  model: Model | null = null;
  private shadow: Model | null = null;
  private vapor: Model | null = null;
  private nodes: Record<string, ModelNode | null> = {};
  private originals: Record<string, Matrix4> = {};
  private propT = new Cartesian3();
  private propAngle = 0;
  private rotorT: Partial<Record<"rotorF" | "rotorR", Cartesian3>> = {};
  private rotorAngle = 0;
  private flapDeg = 0;
  /** Detailed models: gear position (1 = down, 0 = folded away), wheel spin, speedbrakes. */
  private gearT = 1;
  private wheelSpeed = 0;
  private wheelAngle = 0;
  private brakeT = 0;
  private ail = 0;
  private elev = 0;
  private rud = 0;
  private time = 0;
  private camHeading = 0;
  private camPitchSmooth = 0;
  lookYaw = 0;
  lookPitch = 0;
  mode: CameraMode = "chase";
  /** What the panel altimeter reads (feet above the sea), set by the flight each frame. */
  altimeterFt: number | null = null;
  /** Camera shake amount (meters), decays (crash effect). */
  shake = 0;

  constructor(private world: World, private ac: AircraftDef) {}

  async load(): Promise<void> {
    const scene = this.world.widget.scene;
    this.model = await Model.fromGltfAsync({ url: asset(`models/${this.ac.id}.glb`), minimumPixelSize: 48, maximumScale: 20000 });
    scene.primitives.add(this.model);
    this.world.exclude.push(this.model);
    this.model.readyEvent.addEventListener(() => {
      for (const n of ["gear", "prop", "flapL", "flapR", "ailL", "ailR", "elevL", "elevR", "rudder", "beacon", "strobe", "rotorF", "rotorR", "gearL", "gearR", "gearN", "wheelL", "wheelR", "wheelN", "gearDoors", "brakeLU", "brakeLD", "brakeRU", "brakeRD", "burner", "pilot", "canopy", "needleIas", "needleAlt", "attBall", "propDisc"]) {
        try {
          const node = this.model!.getNode(n) ?? null;
          this.nodes[n] = node;
          if (node) this.originals[n] = Matrix4.clone(node.originalMatrix);
        } catch {
          this.nodes[n] = null;
        }
      }
      if (this.originals.prop) Matrix4.getTranslation(this.originals.prop, this.propT);
      for (const r of ["rotorF", "rotorR"] as const) if (this.originals[r]) this.rotorT[r] = Matrix4.getTranslation(this.originals[r], new Cartesian3());
    });
    this.shadow = await Model.fromGltfAsync({ url: asset("models/shadow.glb"), color: Color.WHITE.withAlpha(0.8) });
    scene.primitives.add(this.shadow);
    this.world.exclude.push(this.shadow);
    // Only playnes that can get close to the speed of sound need the vapor cone.
    if (this.ac.mmo >= 0.95) {
      this.vapor = await Model.fromGltfAsync({ url: asset("models/vaporcone.glb"), color: Color.WHITE.withAlpha(0) });
      this.vapor.show = false;
      scene.primitives.add(this.vapor);
      this.world.exclude.push(this.vapor);
    }
  }

  /**
   * Vapor cone: near Mach 1 the air around the playne squeezes so hard that water vapor
   * condenses into a white cone (like the famous photos of fighters at the sound barrier).
   */
  private updateVapor(s: FlightState): void {
    const v = this.vapor;
    if (!v || !this.model) return;
    const mach = s.speed / speedOfSound(s.alt);
    const strength = clamp(1 - Math.abs(mach - 0.995) / 0.06, 0, 1);
    v.show = strength > 0.02 && this.model.show && !s.onGround;
    if (!v.show) return;
    const flicker = 0.8 + 0.2 * Math.random();
    v.color = Color.WHITE.withAlpha(Math.min(1, strength * 1.3) * flicker);
    const D = this.ac.shape.fuselageDiameter;
    const L = this.ac.shape.length;
    const f = frameVectors(s, s.alt, s.heading, s.pitch, s.bank);
    const left = Cartesian3.negate(f.right, new Cartesian3());
    const centre = Cartesian3.add(
      f.pos,
      Cartesian3.add(Cartesian3.multiplyByScalar(f.fwd, L * 0.04, new Cartesian3()), Cartesian3.multiplyByScalar(f.up, Math.max(0.6, D * 0.42) + D / 2, new Cartesian3()), new Cartesian3()),
      new Cartesian3(),
    );
    const k = Math.max(this.ac.shape.span * 0.42, D * 2.2) * (0.97 + 0.06 * Math.random());
    // prettier-ignore
    v.modelMatrix = new Matrix4(
      f.fwd.x * k, left.x * k, f.up.x * k, centre.x,
      f.fwd.y * k, left.y * k, f.up.y * k, centre.y,
      f.fwd.z * k, left.z * k, f.up.z * k, centre.z,
      0, 0, 0, 1,
    );
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
    this.updateVapor(s);
    const k = 1 - Math.exp(-dt * 8);
    this.flapDeg += (FLAP_DEG[s.flaps] - this.flapDeg) * (1 - Math.exp(-dt * 1.5));
    this.ail += (clamp(input.roll, -1, 1) * 18 - this.ail) * k;
    this.elev += (clamp(input.pitch, -1, 1) * 16 - this.elev) * k;
    this.rud += (clamp(input.yaw, -1, 1) * 20 - this.rud) * k;
    const n = this.nodes;
    this.hinge("flapL", -this.flapDeg);
    this.hinge("flapR", -this.flapDeg);
    // Flaperons (no separate flaps, e.g. the F-16): the ailerons droop together as flaps.
    const droop = n.flapL ? 0 : this.flapDeg * 0.55;
    this.hinge("ailL", -this.ail - droop);
    this.hinge("ailR", this.ail - droop);
    // A fighter's tailplanes also twist opposite ways to help it roll.
    const twist = this.ac.kind === "fighter" ? this.ail * 0.35 : 0;
    this.hinge("elevL", this.elev - twist);
    this.hinge("elevR", this.elev + twist);
    this.hinge("rudder", this.rud);
    if (n.gear) n.gear.show = s.gearDown;
    this.updateRig(s, dt, input);
    if (n.prop) {
      this.propAngle += dt * (10 + s.throttle * 55);
      n.prop.matrix = Matrix4.multiply(Matrix4.fromTranslation(this.propT), Matrix4.fromRotation(Matrix3.fromRotationZ(this.propAngle)), new Matrix4());
      // Once it's turning fast, show the blur disc; from the pilot's seat the blades vanish into it
      // (a single still frame of a 2,400 rpm propeller would otherwise look like a frozen blade).
      if (n.propDisc) {
        const fast = s.throttle > 0.15 || !s.onGround;
        n.propDisc.show = fast;
        n.prop.show = !(fast && this.mode === "cockpit");
      }
    }
    // Chinook: the two rotors turn opposite ways (a blur of blades, faster with more lift).
    if (n.rotorF && n.rotorR && this.rotorT.rotorF && this.rotorT.rotorR) {
      this.rotorAngle += dt * (7 + s.throttle * 4);
      n.rotorF.matrix = Matrix4.multiply(Matrix4.fromTranslation(this.rotorT.rotorF), Matrix4.fromRotation(Matrix3.fromRotationY(this.rotorAngle)), new Matrix4());
      n.rotorR.matrix = Matrix4.multiply(Matrix4.fromTranslation(this.rotorT.rotorR), Matrix4.fromRotation(Matrix3.fromRotationY(-this.rotorAngle)), new Matrix4());
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

  /** This playne has a modelled cockpit to sit in (the cockpit view shows the model itself). */
  get has3dCockpit(): boolean {
    return !!RIGS[this.ac.id]?.eye;
  }

  /** This playne has a modelled cabin seat for the passenger's window view. */
  get hasCabinSeat(): boolean {
    return !!RIGS[this.ac.id]?.windowEye;
  }

  /** Where the HUD glass is on screen right now (null if it isn't in view). */
  hudOnScreen(): { x: number; y: number; half: number; degHalf: number } | null {
    const rig = RIGS[this.ac.id];
    if (!rig?.hud || !rig.eye || !this.model) return null;
    const scene = this.world.widget.scene;
    // Model coordinates (x left, y up, z forward) -> Cesium's model frame (x forward, y left, z up).
    const toScreen = (p: number[]) => scene.cartesianToCanvasCoordinates(Matrix4.multiplyByPoint(this.model!.modelMatrix, new Cartesian3(p[2], p[0], p[1]), new Cartesian3()));
    const c = rig.hud.centre;
    const a = toScreen(c);
    const b = toScreen([c[0], c[1] + rig.hud.halfHeight, c[2]]);
    if (!a || !b) return null;
    const dist = Math.hypot(c[0] - rig.eye[0], c[1] - rig.eye[1], c[2] - rig.eye[2]);
    return { x: a.x, y: a.y, half: Math.hypot(b.x - a.x, b.y - a.y), degHalf: Math.atan(rig.hud.halfHeight / dist) / DEG };
  }

  /** Detailed models: legs that fold away, wheels that turn, speedbrakes, afterburner. */
  private updateRig(s: FlightState, dt: number, input: SurfaceInputs): void {
    const rig = RIGS[this.ac.id];
    if (!rig) return;
    const n = this.nodes;
    // Looking out through the pilot's eyes: no pilot in the way, and no tint from the glass.
    if (rig.eye) {
      const inside = this.mode === "cockpit";
      if (n.pilot) n.pilot.show = !inside;
      if (n.canopy) n.canopy.show = !inside && !(this.mode === "window" && rig.windowEye);
    }
    // Panel instruments that work: airspeed (one turn = 200 kt, nearly), altimeter (one turn of
    // the long hand = 1,000 ft), and the attitude ball (rolls opposite the bank, drops as the
    // nose rises). Turning about local Z is clockwise as the pilot sees it.
    const turn = (name: string, rad: number, dy = 0) => {
      const node = n[name], orig = this.originals[name];
      if (!node || !orig) return;
      const m = Matrix4.multiply(orig, Matrix4.fromRotation(Matrix3.fromRotationZ(rad)), new Matrix4());
      if (dy) Matrix4.multiply(m, Matrix4.fromTranslation(new Cartesian3(0, dy, 0)), m);
      node.matrix = m;
    };
    const kt = indicated(s.speed, s.alt) * 1.94384;
    turn("needleIas", (clamp(kt, 0, 200) / 200) * 330 * DEG);
    const ft = Math.max(0, this.altimeterFt ?? s.alt * 3.28084);
    turn("needleAlt", ((ft % 1000) / 1000) * 2 * Math.PI);
    turn("attBall", -s.bank * DEG, -clamp(s.pitch, -20, 20) * 0.0003);
    // Legs take about 2.5 s to travel. (dt 0 = placing the model: jump to where it should be.)
    const want = s.gearDown ? 1 : 0;
    this.gearT = dt === 0 ? want : clamp(this.gearT + Math.sign(want - this.gearT) * (dt / 2.5), 0, 1);
    const fold = 1 - this.gearT;
    const ease = fold * fold * (3 - 2 * fold);
    const out = this.gearT > 0.02;
    // On the ground the nose wheel steers with the rudder.
    const steer = s.onGround ? this.rud * 1.2 : 0;
    for (const leg of ["gearL", "gearR", "gearN"] as const) {
      const node = n[leg], orig = this.originals[leg];
      if (!node || !orig) continue;
      node.show = out;
      let m = Matrix4.multiply(orig, Matrix4.fromRotation(Matrix3.fromRotationX(ease * (rig.retractDeg[leg] ?? 90) * DEG)), new Matrix4());
      if (leg === "gearN" && steer) m = Matrix4.multiply(m, Matrix4.fromRotation(Matrix3.fromRotationY(-steer * DEG)), m);
      node.matrix = m;
    }
    if (n.gearDoors) n.gearDoors.show = out;
    // Wheels turn with the ground speed, and spin down after liftoff.
    if (s.onGround) this.wheelSpeed = s.speed;
    else this.wheelSpeed *= Math.exp(-dt * 0.8);
    this.wheelAngle += this.wheelSpeed * dt;
    for (const w of ["wheelL", "wheelR", "wheelN"] as const) {
      const node = n[w], orig = this.originals[w];
      if (!node || !orig) continue;
      node.show = out;
      node.matrix = Matrix4.multiply(orig, Matrix4.fromRotation(Matrix3.fromRotationX((this.wheelAngle / (rig.wheelRadius[w] ?? 0.3)) % (Math.PI * 2))), new Matrix4());
    }
    // Speedbrake petals open up and down.
    this.brakeT += (clamp(input.brake ?? 0, 0, 1) - this.brakeT) * (1 - Math.exp(-dt * 5));
    if (dt === 0) this.brakeT = clamp(input.brake ?? 0, 0, 1);
    for (const side of ["L", "R"]) {
      this.hinge(`brake${side}U`, this.brakeT * 50);
      this.hinge(`brake${side}D`, -this.brakeT * 50);
    }
    // Afterburner: lights at full power, flickering a little.
    if (n.burner && this.originals.burner) {
      const on = s.throttle > 0.93;
      n.burner.show = on;
      if (on) {
        const k = 0.85 + 0.15 * Math.sin(this.time * 47) * Math.sin(this.time * 31) + (s.throttle - 0.93) * 2;
        n.burner.matrix = Matrix4.multiply(this.originals.burner, Matrix4.fromScale(new Cartesian3(1, 1, k)), new Matrix4());
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
    // A modelled cabin is seen with a person's wide view from the seats (the chase view and the
    // other playnes keep the usual 60 degrees).
    const seatFov = this.mode !== "chase" ? RIGS[this.ac.id]?.fov : undefined;
    const fov = (seatFov ?? 60) * DEG;
    const frustum = scene.camera.frustum as PerspectiveFrustum;
    if (frustum.fov !== undefined && Math.abs(frustum.fov - fov) > 1e-6) frustum.fov = fov;

    if (this.mode === "window") {
      // A passenger's seat: left side of the cabin, ahead of the wing, looking out and back.
      const base = frameVectors(s, s.alt, s.heading, s.pitch, s.bank);
      const D = this.ac.shape.fuselageDiameter;
      const left = Cartesian3.negate(base.right, new Cartesian3());
      // A modelled cabin has a real seat; the others float just outside the skin.
      const seat = RIGS[this.ac.id]?.windowEye;
      const [sx, sy, sz] = seat ?? [D * 0.5 + 0.12, D * 0.75 + 0.75, L * 0.12];
      const eye = Cartesian3.add(
        base.pos,
        Cartesian3.add(
          Cartesian3.add(Cartesian3.multiplyByScalar(base.fwd, sz, new Cartesian3()), Cartesian3.multiplyByScalar(left, sx, new Cartesian3()), new Cartesian3()),
          Cartesian3.multiplyByScalar(base.up, sy, new Cartesian3()),
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
      const f = frameVectors(s, s.alt, s.heading - (seat ? 88 : 112) + this.lookYaw, s.pitch - 10 + this.lookPitch, s.bank);
      const ec = Cartographic.fromCartesian(eye);
      const safe = this.aboveTerrain(ec.latitude / DEG, ec.longitude / DEG, ec.height);
      const dest = safe === ec.height ? eye : Cartesian3.fromRadians(ec.longitude, ec.latitude, safe);
      scene.camera.setView({ destination: dest, orientation: { direction: f.fwd, up: f.up } });
      return { lat: ec.latitude / DEG, lon: ec.longitude / DEG, height: safe };
    }

    if (this.mode === "cockpit") {
      const f = frameVectors(s, s.alt, s.heading + this.lookYaw, s.pitch + this.lookPitch - (lookDown ? 35 : 0) - (RIGS[this.ac.id]?.eyePitch ?? 0), s.bank);
      const base = frameVectors(s, s.alt, s.heading, s.pitch, s.bank);
      // A 3D cockpit has a real seat to look out from; the others use a spot above the nose.
      const at = RIGS[this.ac.id]?.eye;
      const ahead = at ? at[2] : L * 0.36;
      const above = at ? at[1] : this.ac.shape.fuselageDiameter * 0.75 + 0.9;
      const eye = Cartesian3.add(
        base.pos,
        Cartesian3.add(Cartesian3.multiplyByScalar(base.fwd, ahead, new Cartesian3()), Cartesian3.multiplyByScalar(base.up, above, new Cartesian3()), new Cartesian3()),
        new Cartesian3(),
      );
      // A side-by-side cockpit: the pilot sits left of the middle (model +x is left).
      if (at?.[0]) Cartesian3.add(eye, Cartesian3.multiplyByScalar(base.right, -at[0], new Cartesian3()), eye);
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
    // Globe worlds: the height of the terrain actually drawn. Google's 3D world has no globe:
    // ask the world (measuring 3D tiles is costly, so only every few frames).
    const globe = this.world.widget.scene.globe as { show: boolean; getHeight(c: Cartographic): number | undefined } | undefined;
    let g: number | undefined;
    if (globe) g = globe.show ? globe.getHeight(Cartographic.fromDegrees(lon, lat)) : undefined;
    else {
      // Only matters when the camera is near the ground: high up, check once a second.
      const clearance = this.tileGround === undefined ? 0 : h - this.tileGround;
      const every = clearance < 60 ? 8 : clearance < 300 ? 20 : 60;
      if (this.tileGroundAge++ % every === 0) this.tileGround = this.world.groundHeight({ lat, lon });
      g = this.tileGround;
    }
    return g !== undefined && Number.isFinite(g) ? Math.max(h, g + 1.2) : h;
  }
  private tileGround: number | undefined;
  private tileGroundAge = 0;

  destroy(): void {
    const scene = this.world.widget.scene;
    const frustum = scene.camera.frustum as PerspectiveFrustum;
    if (frustum.fov !== undefined) frustum.fov = 60 * DEG;
    if (this.model) scene.primitives.remove(this.model);
    if (this.shadow) scene.primitives.remove(this.shadow);
    if (this.vapor) scene.primitives.remove(this.vapor);
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
