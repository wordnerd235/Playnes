// One flight: a charter (takeoff -> hoops -> above-the-clouds cruise -> approach -> landing)
// or a Flight School lesson built from the same pieces. Drives physics, the co-pilot,
// prompts, hoops, camera, scoring and the 3D models.

import {
  Cartesian3,
  Color,
  ColorBlendMode,
  Matrix4,
  Model,
  Transforms,
  Cartesian4,
  Matrix3,
  PointPrimitiveCollection,
  ClassificationType,
  type Entity,
  type ModelNode,
  type PointPrimitive,
} from "cesium";
import type { AircraftDef } from "../data/aircraft.ts";
import { AIRPORTS, airportByCode, LANDMARKS, type Airport, type Landmark } from "../data/airports.ts";
import { inRegion, REGION } from "../data/region.ts";
import { LINES, tpl, type Line, type Passenger } from "../data/lines.ts";
import type { Audio } from "../audio/audio.ts";
import type { Controls, ControlEvent } from "../input/controls.ts";
import { computeCommands, createMemory, type Guidance } from "../sim/assist.ts";
import {
  alongTrack,
  angleDiff,
  bearing,
  clamp,
  crossTrack,
  DEG,
  destination,
  distance,
  FT,
  interpolate,
  KT,
  NM,
  type LatLon,
} from "../sim/geo.ts";
import { createState, indicated, perfFor, step, type FlightState, type Perf } from "../sim/physics.ts";
import type { Hud, Prompt } from "../ui/hud.ts";
import { CloudDeck } from "../world/clouds.ts";
import { gfxOn } from "../world/safety.ts";
import type { World } from "../world/world.ts";
import { frameMatrix, PlaneView } from "./planeView.ts";
import { makeRunway, onRunwayArea, pickEnd, runwayCoords, runwayHeight, runwayPoint, type RunwayInUse } from "./runway.ts";

export type LessonId = "l2" | "l3" | "l4" | "l5";

export type Mission =
  | { kind: "charter"; from: string; to: string; passenger: Passenger }
  | { kind: "lesson"; lesson: LessonId; airport: string }
  | { kind: "sandbox"; airport: string };

export interface FlightResult {
  mission: Mission;
  completed: boolean;
  stars: number;
  landing: "butter" | "smooth" | "firm" | null;
  sinkFpm: number | null;
  centerline: boolean;
  zone: boolean;
  distanceNm: number;
}

type Phase =
  | "loading"
  | "lineup"
  | "roll"
  | "climb"
  | "toCruise"
  | "cruise"
  | "toApproach"
  | "approach"
  | "rollout"
  | "l2go"
  | "l2slow"
  | "l2brake"
  | "l4"
  | "free"
  | "crashed"
  | "done";

interface Hoop {
  pos: LatLon;
  alt: number;
  heading: number;
  pitch: number;
  radius: number;
  model: Model | null;
  state: "ahead" | "passed" | "missed";
}

interface TimedPrompt {
  prompt: Prompt;
  started: number;
  timeout: number;
  help: () => void;
  done: () => boolean;
}

export interface FlightDeps {
  world: World;
  audio: Audio;
  controls: Controls;
  hud: Hud;
  aircraft: AircraftDef;
  assistLevel: number;
  /** Free Flight only: crashing allowed. */
  crashes: boolean;
  /** Free Flight only: the lever picks a speed and the co-pilot works the power. */
  autoSpeed: boolean;
}

export interface FreeLanding {
  airport: Airport;
  stars: number;
  landing: "butter" | "smooth" | "firm";
}

const GLIDE = 3 * DEG;
const AIM = 305; // aiming point, meters past the threshold (1,000 ft markers)
const GEOID_GUESS = -32; // eastern US geoid undulation, used only if sampling fails

export class FlightSession {
  onDone: (r: FlightResult) => void = () => {};
  paused = false;
  /** Simulation steps per frame (1 in the game; tests raise it to fast-forward). */
  timeScale = 1;
  private accum = 0;

  private d: FlightDeps;
  private ac: AircraftDef;
  private p: Perf;
  private s!: FlightState;
  private mem = createMemory();
  private phase: Phase = "loading";
  private phaseTime = 0;
  private time = 0;
  private view: PlaneView;
  private lastCmd = { targetBank: 0, targetVs: 0 };
  private hoops: Hoop[] = [];
  private hoopIndex = 0;
  private hoopModels: Model[] = [];
  private dep!: RunwayInUse;
  private arr: RunwayInUse | null = null;
  private clouds: CloudDeck;
  private timed: TimedPrompt | null = null;
  private said = new Set<string>();
  private unsub: () => void;
  private groundCache = { h: 0, valid: false, frame: 0 };
  private frame = 0;
  private result: FlightResult;
  private destroyed = false;
  // cruise
  private cruise = {
    a: { lat: 0, lon: 0 } as LatLon,
    b: { lat: 0, lon: 0 } as LatLon,
    total: 1,
    progress: 0,
    duration: 120,
    dev: 0,
    offset: 0,
    altOffset: 0,
    alt: 0,
    cloudTop: 0,
    landmarks: [] as { lm: Landmark; at: number; shown: boolean }[],
    moment: 0,
    groundShown: false,
  };
  private routeTotal = 1;
  private origin: LatLon;
  private destinationLL: LatLon;
  private approachStarts = 0;
  private papi: PointPrimitiveCollection | null = null;
  private papiLights: { light: PointPrimitive; pos: LatLon; setting: number }[] = [];
  private entities: Entity[] = [];
  // Free Flight
  onLanded: (l: FreeLanding) => void = () => {};
  private allRunways: RunwayInUse[] = [];
  private autopilot: { heading: number; alt: number; ias: number } | null = null;
  private edgeTimer = 0;
  private navTarget: Airport | null = null;
  private landmarksSaid = new Set<string>();
  private landedAt: string | null = null;
  private airborneTime = 0;
  private crashTimer = 0;

  constructor(deps: FlightDeps, readonly mission: Mission) {
    this.d = deps;
    this.ac = deps.aircraft;
    this.p = perfFor(this.ac);
    this.clouds = new CloudDeck(deps.world.widget.scene);
    this.view = new PlaneView(deps.world, deps.aircraft);
    deps.hud.onLook = (dy, dp) => this.view.addLook(dy, dp);
    deps.hud.onLookReset = () => this.view.resetLook();
    this.unsub = deps.controls.on((e) => this.onControl(e));
    const from = airportByCode(mission.kind === "charter" ? mission.from : mission.airport);
    const to = airportByCode(mission.kind === "charter" ? mission.to : mission.airport);
    deps.hud.onOpenMap = () => this.openMap();
    this.origin = from;
    this.destinationLL = to;
    this.routeTotal = Math.max(1, distance(from, to));
    this.result = {
      mission,
      completed: false,
      stars: 0,
      landing: null,
      sinkFpm: null,
      centerline: false,
      zone: false,
      distanceNm: distance(from, to) / NM,
    };
  }

  // ------------------------------------------------------------------ setup

  async start(): Promise<void> {
    const m = this.mission;
    if (m.kind === "sandbox") return this.startSandbox(m.airport);
    const fromAp = airportByCode(m.kind === "charter" ? m.from : m.airport);
    const toAp = airportByCode(m.kind === "charter" ? m.to : m.airport);
    const course = m.kind === "charter" ? bearing(fromAp, toAp) : 0;

    const depPick = pickEnd(fromAp, m.kind === "charter" ? course : bearing(fromAp.runway.ends[0], fromAp.runway.ends[1]));
    const needArr = m.kind === "charter" || m.lesson === "l5";
    const arrPick = needArr ? pickEnd(toAp, m.kind === "charter" ? course : bearing(depPick.end, depPick.other)) : null;

    const pts: LatLon[] = [depPick.end, depPick.other];
    if (arrPick) pts.push(arrPick.end, arrPick.other);
    const hs = await this.d.world.sampleHeights(pts);
    const fallback = (ft: number) => (this.d.world.kind === "basic" ? 0 : ft * FT + GEOID_GUESS);
    const h = (i: number, ft: number) => hs[i] ?? fallback(ft);
    this.dep = makeRunway(fromAp, depPick.end, depPick.other, h(0, depPick.end.elevFt), h(1, depPick.other.elevFt));
    if (arrPick) this.arr = makeRunway(toAp, arrPick.end, arrPick.other, h(2, arrPick.end.elevFt), h(3, arrPick.other.elevFt));
    if (this.destroyed) return;
    this.addRunwayVisuals(this.dep);
    if (this.arr) {
      if (this.arr.airport.code !== this.dep.airport.code) this.addRunwayVisuals(this.arr);
      this.addPapi(this.arr);
    }

    await this.view.load();
    if (this.destroyed) return;

    this.d.audio.startEngine(this.ac.kind);
    this.d.hud.show(fromAp.code, toAp.code);
    this.preloadVoice();

    if (m.kind === "lesson" && m.lesson === "l4") this.startTurningLesson();
    else if (m.kind === "lesson" && m.lesson === "l5") this.startApproach(true);
    else this.startLineup();
  }

  /**
   * Crisp runway with markings for the offline worlds (the map tiles alone look blurry up close).
   * Cartoon world: draped on the terrain. Bare globe: flat at runway height.
   */
  private addRunwayVisuals(r: RunwayInUse): void {
    const kind = this.d.world.kind;
    if (kind !== "basic" && kind !== "cartoon") return;
    const draped = kind === "cartoon";
    if (!gfxOn("groundPolys")) return;
    const ents = this.d.world.widget.entities;
    const w = r.airport.runway.widthFt * FT;
    const rect = (s0: number, s1: number, x0: number, x1: number, color: Color) => {
      const pts = [runwayPoint(r, s0, x0), runwayPoint(r, s1, x0), runwayPoint(r, s1, x1), runwayPoint(r, s0, x1)];
      this.entities.push(
        ents.add({
          polygon: {
            hierarchy: Cartesian3.fromDegreesArray(pts.flatMap((c) => [c.lon, c.lat])),
            material: color,
            ...(draped ? { classificationType: ClassificationType.TERRAIN } : { height: runwayHeight(r, (s0 + s1) / 2) + 0.2 }),
          },
        }),
      );
    };
    const asphalt = Color.fromCssColorString("#44484f");
    const paint = Color.fromCssColorString("#f4f4f0");
    rect(-40, r.length + 40, -w / 2, w / 2, asphalt);
    rect(0, r.length, -w / 2 + 1, -w / 2 + 2, paint);
    rect(0, r.length, w / 2 - 2, w / 2 - 1, paint);
    for (let s = 120; s < r.length - 120; s += 66) rect(s, s + 36, -0.5, 0.5, paint);
    for (const [s0, dir] of [[6, 1], [r.length - 6, -1]] as const) {
      for (let k = 0; k < 8; k++) {
        const x = -w / 2 + 4 + k * ((w - 8) / 8) + (k >= 4 ? 4 : 0);
        rect(s0, s0 + dir * 45, x, x + 1.8, paint);
      }
      for (const x of [-w / 4 - 3, w / 4 - 3]) rect(s0 + dir * 300, s0 + dir * 345, x, x + 6, paint);
    }
  }

  /** PAPI: four lights left of the runway. On a 3 degree glide path: two red, two white. */
  private addPapi(r: RunwayInUse): void {
    const scene = this.d.world.widget.scene;
    this.papi = scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection;
    const half = (r.airport.runway.widthFt * FT) / 2;
    // Light nearest the runway has the highest setting.
    const settings = [3.5, 3.17, 2.83, 2.5];
    settings.forEach((setting, i) => {
      const pos = runwayPoint(r, AIM, -(half + 15 + i * 9));
      const light = this.papi!.add({
        position: Cartesian3.fromDegrees(pos.lon, pos.lat, runwayHeight(r, AIM) + 1.2),
        pixelSize: 11,
        color: Color.RED,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
      });
      this.papiLights.push({ light, pos, setting });
    });
  }

  private updatePapi(): void {
    if (!this.papi || !this.arr || !this.s) return;
    const show = this.phase === "approach" || this.phase === "rollout";
    this.papi.show = show;
    if (!show) return;
    const h0 = runwayHeight(this.arr, AIM);
    for (const l of this.papiLights) {
      const d = Math.max(1, distance(this.s, l.pos));
      const angle = Math.atan2(this.s.alt - h0, d) / DEG;
      l.light.color = angle > l.setting ? Color.WHITE : Color.RED;
    }
  }

  private preloadVoice(): void {
    const l = LINES;
    this.d.audio.preload([l.lineup, l.throttleUp, l.rotate, l.positiveRate, l.hoops, l.hoopGood1, l.hoopGood2, l.intoClouds, l.cruise, l.descend, l.approach, l.gearDownPrompt, l.flapsPrompt, l.papi, l.butter, l.smooth]);
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  private say(line: Line, interrupt = false): Promise<void> {
    return this.d.audio.say(line, { interrupt });
  }

  private sayOnce(key: string, line: Line, interrupt = false): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    void this.say(line, interrupt);
  }

  private ask(prompt: Prompt, timeout: number, done: () => boolean, help: () => void): void {
    this.timed = { prompt, started: this.time, timeout, done, help };
    this.d.hud.setPrompt(prompt);
  }

  // ------------------------------------------------------------------ phases

  private startLineup(): void {
    const r = this.dep;
    const pos = runwayPoint(r, 60);
    this.s = createState({ lat: pos.lat, lon: pos.lon, alt: runwayHeight(r, 60), heading: r.heading, flaps: 1, gearDown: true, onGround: true });
    this.view.resetCameraHeading(r.heading);
    this.d.controls.reset();
    this.setPhase("lineup");
    const m = this.mission;
    if (m.kind === "lesson" && m.lesson === "l2") {
      void this.say(LINES.l2Intro);
      this.setPhase("l2go");
      this.ask("throttle", 15, () => this.d.controls.state.throttle > 0.6, () => this.d.controls.setThrottle(0.8, false));
      return;
    }
    if (m.kind === "lesson" && m.lesson === "l3") void this.say(LINES.l3Intro);
    if (m.kind === "charter") void this.say(tpl.nextStop(airportByCode(m.to).spoken));
    void this.say(LINES.lineup);
    this.ask("radio", 12, () => false, () => this.radioTakeoff());
    this.buildClimbHoops(m.kind === "lesson" ? 3 : 9);
  }

  private radioDone = false;

  private radioTakeoff(): void {
    if (this.radioDone) return;
    this.radioDone = true;
    this.timed = null;
    this.d.hud.setPrompt(null);
    const tower = this.dep.airport.towerName;
    void this.say(tpl.readyForTakeoff(tower, this.dep.end.spoken));
    void this.say(tpl.clearedTakeoff(tower, this.dep.end.spoken)).then(() => {
      if (this.destroyed) return;
      void this.say(LINES.throttleUp);
      this.ask("throttle", 10, () => this.d.controls.state.throttle > 0.8, () => {
        void this.say(LINES.throttleHelp);
        this.d.controls.setThrottle(1, false);
      });
      this.setPhase("roll");
    });
  }

  private buildClimbHoops(count: number): void {
    // Fly an ideal takeoff with a robot pilot and drop hoops along its path: always flyable.
    const r = this.dep;
    const start = runwayPoint(r, 60);
    const s = createState({ lat: start.lat, lon: start.lon, alt: runwayHeight(r, 60), heading: r.heading, flaps: 1, gearDown: true });
    const mem = createMemory();
    const p = this.p;
    const course = this.mission.kind === "charter" ? bearing(r.end, airportByCode(this.mission.to)) : r.heading;
    let t = 0;
    let liftoff = -1;
    let nextDrop = 0;
    const dt = 1 / 30;
    const radius = this.hoopRadius();
    while (t < 200 && this.hoops.length < count) {
      if (!s.onGround && liftoff < 0) liftoff = t;
      const since = liftoff < 0 ? 0 : t - liftoff;
      if (since > 6) s.gearDown = false;
      if (since > 12) s.flaps = 0;
      const g: Guidance = {
        targetHeading: liftoff >= 0 && since > 10 ? course : r.heading,
        targetVs: p.climbMax * 0.7,
        targetSpeed: s.onGround ? null : Math.min(p.vclimb, p.speedLimit),
        agl: 1000,
        runwayAgl: null,
        landing: false,
        autoFlare: false,
        groundHeading: s.onGround ? r.heading : null,
        wantRotate: true,
        autoRotate: true,
      };
      const cmd = computeCommands(1, { roll: 0, pitch: 0, throttle: 1, brake: 0 }, g, s, p, mem, dt);
      step(s, cmd, p, { groundHeight: runwayHeight(r, 0) }, dt);
      t += dt;
      if (liftoff >= 0 && since > 3 && since >= nextDrop) {
        this.hoops.push({ pos: { lat: s.lat, lon: s.lon }, alt: s.alt + 4, heading: s.heading, pitch: s.gamma, radius, model: null, state: "ahead" });
        nextDrop = since + 4.5;
      }
    }
    this.hoopIndex = 0;
    void this.spawnHoopModels();
  }

  private hoopRadius(): number {
    return clamp(this.ac.shape.span * 1.6, 22, 55);
  }

  private async spawnHoopModels(): Promise<void> {
    for (const m of this.hoopModels) {
      this.d.world.widget.scene.primitives.remove(m);
    }
    this.hoopModels = [];
    for (const h of this.hoops) {
      const model = await Model.fromGltfAsync({ url: "./models/ring.glb", color: Color.fromCssColorString("#ffc21a"), colorBlendMode: ColorBlendMode.MIX, colorBlendAmount: 0.85 });
      if (this.destroyed) return;
      model.modelMatrix = frameMatrix(h.pos, h.alt, h.heading, h.pitch, 0, h.radius);
      this.d.world.widget.scene.primitives.add(model);
      this.d.world.exclude.push(model);
      h.model = model;
      this.hoopModels.push(model);
    }
  }

  private clearHoops(): void {
    for (const m of this.hoopModels) this.d.world.widget.scene.primitives.remove(m);
    this.hoopModels = [];
    this.hoops = [];
    this.hoopIndex = 0;
  }

  private startTurningLesson(): void {
    const r = this.dep;
    const startP = runwayPoint(r, r.length + 3000);
    const alt = runwayHeight(r, r.length) + 750;
    this.s = createState({ lat: startP.lat, lon: startP.lon, alt, heading: r.heading, onGround: false, speed: Math.min(this.p.vclimb, this.p.speedLimit) * 0.9, gearDown: this.ac.shape.fixedGear, flaps: 0 });
    this.view.resetCameraHeading(r.heading);
    this.d.controls.reset();
    this.d.controls.setThrottle(0.6, false);
    // S-turns: right, left, right.
    const s = { ...this.s };
    const radius = this.hoopRadius();
    const speed = s.speed;
    let hdg = s.heading;
    let pos: LatLon = { lat: s.lat, lon: s.lon };
    const turnRate = (9.81 * Math.tan(22 * DEG)) / speed / DEG;
    const plan: number[] = [0, 0, 1, 1, 1, -1, -1, -1, -1, -1, 1, 1, 1, 0];
    for (let i = 0; i < plan.length; i++) {
      for (let k = 0; k < 40; k++) {
        hdg += plan[i] * turnRate * 0.1;
        pos = destination(pos, hdg, speed * 0.1);
      }
      if (i >= 1) this.hoops.push({ pos, alt, heading: hdg, pitch: 0, radius, model: null, state: "ahead" });
    }
    void this.spawnHoopModels();
    this.setPhase("l4");
    void this.say(LINES.l4Intro);
    void this.say(LINES.hoops);
  }

  private startApproach(fresh: boolean): void {
    const r = this.arr!;
    this.approachStarts++;
    const dA = Math.max(2 * NM, this.p.vapp * 95);
    const pos = runwayPoint(r, AIM - dA);
    const alt = runwayHeight(r, 0) + dA * Math.tan(GLIDE);
    const speed = this.p.vapp + 12 * KT;
    if (fresh || !this.s) {
      this.s = createState({ lat: pos.lat, lon: pos.lon, alt, heading: r.heading, onGround: false, speed, gearDown: this.ac.shape.fixedGear, flaps: 1 });
    } else {
      Object.assign(this.s, { lat: pos.lat, lon: pos.lon, alt, heading: r.heading, onGround: false, speed, gearDown: this.ac.shape.fixedGear, flaps: 1, bank: 0, gamma: -3, pitch: 0 });
    }
    this.s.gamma = -3;
    this.s.vs = -speed * Math.tan(GLIDE);
    this.view.resetCameraHeading(r.heading);
    this.d.controls.setThrottle(0.4, false);
    this.clearHoops();
    const radius = this.hoopRadius();
    const spacing = Math.max(300, this.p.vapp * 6);
    for (let d = dA - spacing; d > 250; d -= spacing) {
      const p = runwayPoint(r, AIM - d);
      this.hoops.push({ pos: p, alt: runwayHeight(r, 0) + d * Math.tan(GLIDE) + 3, heading: r.heading, pitch: -3, radius, model: null, state: "ahead" });
    }
    void this.spawnHoopModels();
    this.setPhase("approach");
    this.said.delete("flare");
    this.said.delete("papi");
    const m = this.mission;
    if (m.kind === "lesson" && fresh) void this.say(LINES.l5Intro);
    else void this.say(LINES.approach);
    if (!this.ac.shape.fixedGear) {
      void this.say(LINES.gearDownPrompt);
      this.ask("gear", 9, () => this.s.gearDown, () => {
        void this.say(LINES.gearDownHelp);
        this.setGear(true);
        this.afterGearDown();
      });
    } else {
      void this.say(LINES.flapsPrompt);
      this.ask("flaps", 9, () => this.s.flaps >= 3, () => {
        void this.say(LINES.flapsHelp);
        this.s.flaps = 3;
      });
    }
  }

  private async enterCruise(): Promise<void> {
    if (["toCruise", "cruise", "toApproach", "approach", "rollout", "done"].includes(this.phase)) return;
    this.setPhase("toCruise");
    this.d.hud.setPrompt(null);
    void this.say(LINES.intoClouds);
    this.d.audio.sfx("whoosh");
    await this.d.hud.whiteout(true, 1200);
    if (this.destroyed) return;
    this.clearHoops();
    const to = airportByCode((this.mission as { to: string }).to);
    const arr = this.arr!;
    const dA = Math.max(2 * NM, this.p.vapp * 95);
    const b = runwayPoint(arr, AIM - dA - 1500);
    const a = { lat: this.s.lat, lon: this.s.lon };
    const total = Math.max(5000, distance(a, b));
    const c = this.cruise;
    c.a = a;
    c.b = b;
    c.total = total;
    c.progress = 0;
    c.duration = clamp(60 + (total / NM) * 0.1, 90, 240);
    c.dev = 0;
    c.offset = 0;
    c.altOffset = 0;
    c.alt = this.ac.cruiseAltFt * FT;
    c.cloudTop = Math.max(1500, c.alt - 650);
    c.landmarks = LANDMARKS.map((lm) => ({ lm, xt: Math.abs(crossTrack(a, b, lm)), at: alongTrack(a, b, lm) / total, shown: false }))
      .filter((x) => x.xt < 30 * NM && x.at > 0.12 && x.at < 0.88)
      .sort((x, y) => x.at - y.at)
      .slice(0, 2)
      .map(({ lm, at }) => ({ lm, at, shown: false }));
    c.moment = 0;
    c.groundShown = false;
    this.s.gearDown = this.ac.shape.fixedGear;
    this.s.flaps = 0;
    this.s.speed = this.ac.cruiseKt * KT;
    this.s.bank = 0;
    this.s.gamma = 0;
    this.s.vs = 0;
    this.s.alt = c.alt;
    this.d.world.setGroundVisible(false);
    this.clouds.opacity = 1;
    this.setPhase("cruise");
    await new Promise((r) => setTimeout(r, 400));
    await this.d.hud.whiteout(false, 1400);
    void this.say(LINES.cruise);
    void to;
  }

  private async enterApproach(): Promise<void> {
    if (["toApproach", "approach", "rollout", "done"].includes(this.phase)) return;
    this.setPhase("toApproach");
    void this.say(LINES.descend);
    this.d.audio.sfx("whoosh");
    await this.d.hud.whiteout(true, 1200);
    if (this.destroyed) return;
    this.clouds.opacity = 0;
    this.d.world.setGroundVisible(true);
    this.startApproach(false);
    this.updateCamera(0);
    // Give the ground a moment to load under the new position.
    const t0 = performance.now();
    while (!this.d.world.groundReady() && performance.now() - t0 < 5000) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (this.destroyed) return;
    await this.d.hud.whiteout(false, 1400);
  }

  private async goAround(): Promise<void> {
    this.setPhase("toApproach");
    void this.say(LINES.goAround, true);
    await this.d.hud.whiteout(true, 1000);
    if (this.destroyed) return;
    this.startApproach(false);
    await this.d.hud.whiteout(false, 1200);
  }


  // ------------------------------------------------------------------ free flight

  private async startSandbox(code: string): Promise<void> {
    const pts: LatLon[] = AIRPORTS.flatMap((a) => a.runway.ends);
    const hs = await this.d.world.sampleHeights(pts);
    if (this.destroyed) return;
    const fallback = (ft: number) => (this.d.world.kind === "basic" ? 0 : ft * FT + (this.d.world.kind === "cartoon" ? 0 : GEOID_GUESS));
    this.allRunways = AIRPORTS.map((a, i) => makeRunway(a, a.runway.ends[0], a.runway.ends[1], hs[2 * i] ?? fallback(a.runway.ends[0].elevFt), hs[2 * i + 1] ?? fallback(a.runway.ends[1].elevFt)));
    for (const r of this.allRunways) this.addRunwayVisuals(r);
    await this.view.load();
    if (this.destroyed) return;
    this.d.audio.startEngine(this.ac.kind);
    this.d.hud.show("FREE", "—");
    this.d.hud.setSandbox(true);
    this.startFreeAt(airportByCode(code));
    void this.say(LINES.freeIntro);
  }

  /** Line up on the airport's preferred runway, ready to go. */
  private startFreeAt(ap: Airport): void {
    const base = this.allRunways.find((r) => r.airport.code === ap.code)!;
    const pref = base.end.id === ap.runway.preferred ? base : makeRunway(ap, base.other, base.end, base.hOther, base.hEnd);
    this.dep = pref;
    const pos = runwayPoint(pref, 60);
    this.s = createState({ lat: pos.lat, lon: pos.lon, alt: runwayHeight(pref, 60), heading: pref.heading, flaps: 1, gearDown: true, onGround: true });
    this.view.resetCameraHeading(pref.heading);
    this.d.controls.reset();
    this.landedAt = ap.code;
    this.airborneTime = 0;
    this.autopilot = null;
    this.setPhase("free");
    this.d.hud.setPrompt(null);
  }

  setNavTarget(a: Airport | null): void {
    this.navTarget = a;
    this.d.hud.setRoute("FREE", a ? a.code : "—");
    if (a) void this.say(tpl.nextStop(a.spoken));
  }

  openMap(): void {
    if (this.mission.kind !== "sandbox" || !this.s) return;
    this.autopilot = { heading: this.s.heading, alt: Math.max(this.s.alt, this.groundHeightAt(this.s) + 150), ias: Math.max(indicated(this.s.speed, this.s.alt), this.p.vapp * 1.1) };
    if (!this.s.onGround) void this.say(LINES.mapAutopilot, true);
    this.d.hud.openBigMap({ pos: this.s, heading: this.s.heading, target: this.navTarget }, (a: Airport) => this.setNavTarget(a), () => {
      this.autopilot = null;
    });
  }

  /** Runway (either direction) the point is over or lined up with. */
  private runwayNear(p: LatLon, alongMargin: number, xMargin: number): { r: RunwayInUse; s: number; x: number; reversed: boolean } | null {
    let best: { r: RunwayInUse; s: number; x: number; reversed: boolean } | null = null;
    for (const r of this.allRunways) {
      if (distance(p, r.end) > r.length + alongMargin + 2000) continue;
      const c = runwayCoords(r, p);
      if (c.s > -alongMargin && c.s < r.length + alongMargin && Math.abs(c.x) < xMargin) {
        if (!best || Math.abs(c.x) < Math.abs(best.x)) best = { r, s: c.s, x: c.x, reversed: false };
      }
    }
    return best;
  }

  private updateFree(dt: number): void {
    const s = this.s;
    const c = this.d.controls.state;
    const p = this.p;
    const ground = this.groundHeightAt(s);
    const agl = s.alt - ground;
    const crashes = this.d.crashes;
    const ap = this.autopilot;
    const near = this.runwayNear(s, 7000, 400);
    // Which way along the runway are we pointing?
    let rwHdg: number | null = null;
    let rwyAgl: number | null = null;
    let aligned = false;
    if (near) {
      const fwd = near.r.heading;
      const back = (near.r.heading + 180) % 360;
      rwHdg = Math.abs(angleDiff(s.heading, fwd)) < Math.abs(angleDiff(s.heading, back)) ? fwd : back;
      aligned = Math.abs(angleDiff(s.heading, rwHdg)) < 35;
      rwyAgl = s.alt - runwayHeight(near.r, Math.max(0, Math.min(near.r.length, near.s)));
    }
    const overRunway = !!near && Math.abs(near.x) < near.r.airport.runway.widthFt * FT * 0.5 + 30 && near.s > -100 && near.s < near.r.length + 100;
    const landingZone = !!near && aligned && !s.onGround && (rwyAgl ?? 999) < 700;

    const g: Guidance = {
      targetHeading: null,
      targetVs: 0,
      targetSpeed: null,
      agl,
      runwayAgl: landingZone ? rwyAgl : null,
      landing: crashes || landingZone,
      autoFlare: this.d.assistLevel <= 3,
      groundHeading: null,
      wantRotate: true,
      autoRotate: false,
    };
    let roll = c.roll;
    let pitch = c.pitch;
    let level = Math.max(2, this.d.assistLevel);

    // Edge of the map: turn back toward the middle.
    if (!s.onGround && !inRegion(s.lat, s.lon, 0.06) && this.edgeTimer <= 0) {
      this.edgeTimer = 18;
      void this.say(LINES.edge, true);
    }
    if (this.edgeTimer > 0) {
      this.edgeTimer -= dt;
      roll = 0;
      g.targetHeading = bearing(s, { lat: (REGION.north + REGION.south) / 2, lon: (REGION.east + REGION.west) / 2 });
    }

    if (ap && !s.onGround) {
      roll = 0;
      pitch = 0;
      level = 1;
      if (this.edgeTimer <= 0) g.targetHeading = ap.heading;
      g.targetVs = clamp((ap.alt - s.alt) * 0.15, -5, 5);
      g.targetSpeed = ap.ias;
    }

    let throttle: number | null = c.throttle;
    let brake = c.brake;
    if (s.onGround) {
      if (ap) {
        throttle = 0;
        brake = 1;
      }
      // Centerline helper on a runway when the stick is centred.
      if (overRunway && rwHdg !== null && Math.abs(roll) < 0.1) g.groundHeading = rwHdg;
      // Taking off (power up, past rotation speed): hint to pull back.
      if (s.speed > p.vr && c.throttle > 0.5 && !this.said.has("pullHint")) {
        this.said.add("pullHint");
        void this.say(LINES.pullToTakeoff);
        this.d.hud.setPrompt("pull");
      }
      if (c.throttle <= 0.5 || s.speed < p.vr * 0.8) this.d.hud.setPrompt(null);
      if (s.speed < 25 * KT) brake = Math.max(brake, c.throttle < 0.05 ? 0.4 : 0);
    } else {
      if (ap) {
        throttle = null; // autopilot holds the speed it had when the map opened
      } else if (this.d.autoSpeed) {
        // Optional kid mode: the lever chooses a speed and the co-pilot works the power.
        const slow = p.vapp * 0.95;
        g.targetSpeed = slow + c.throttle * (p.speedLimit - slow);
        throttle = null;
      }
      // Otherwise the lever is the real throttle: idle power and the plane slows, then glides down.
      this.freeFlightHints(agl);
      // Lined up with a runway and stick centred: help down the glide path (unless powering up to go around).
      if (landingZone && near && Math.abs(pitch) < 0.08 && !ap && c.throttle < 0.8) {
        this.sayOnce(`land-${near.r.airport.code}-${Math.floor(this.time / 60)}`, LINES.landingHelp);
        const dir = rwHdg === near.r.heading ? 1 : -1;
        const sTd = dir > 0 ? near.s - AIM : near.r.length - AIM - near.s;
        const wantAlt = runwayHeight(near.r, dir > 0 ? 0 : near.r.length) + Math.max(0, -sTd) * Math.tan(GLIDE);
        g.targetVs = -s.speed * Math.tan(GLIDE) + clamp((wantAlt - s.alt) * 0.15, -4, 3);
        g.targetSpeed = Math.min(g.targetSpeed ?? Infinity, p.vapp + 5 * KT);
        throttle = null;
        if (Math.abs(roll) < 0.08) g.targetHeading = rwHdg! - clamp(near.x * (dir > 0 ? 0.12 : -0.12), -25, 25);
      }
    }

    const cmd = computeCommands(level, { roll, pitch, throttle, brake }, g, s, p, this.mem, dt);
    this.lastCmd = { targetBank: cmd.targetBank, targetVs: cmd.targetVs };
    const wasGround = s.onGround;
    const events = step(s, cmd, p, { groundHeight: ground }, dt);
    if (this.mem.terrainWarning) this.sayOnce(`terrain${Math.floor(this.time / 8)}`, LINES.terrain);

    for (const e of events) {
      if (e.type === "liftoff") {
        this.d.audio.sfx("chirp");
        this.said.delete("pullHint");
        this.said.delete("freeFlapsUp");
        if (!this.ac.shape.fixedGear) {
          void this.say(LINES.positiveRate, true);
          this.d.hud.setPrompt("gear");
        }
      }
      if (e.type === "touchdown") this.onFreeTouchdown(e.sinkFpm, overRunway, near);
    }
    if (!wasGround && !s.onGround) this.airborneTime += dt;
    if (s.onGround && this.phase === "free" && crashes && !overRunway && s.speed > 35 * KT) this.crash();

    // Landmarks close by get a shout-out.
    if (!s.onGround && agl < 3000) {
      for (const l of LANDMARKS) {
        if (!this.landmarksSaid.has(l.id) && distance(s, l) < 4000) {
          this.landmarksSaid.add(l.id);
          void this.say(tpl.landmark(l.spoken, l.fact));
        }
      }
    }
  }

  /** After takeoff: remind to raise the wheels and flaps (they add a lot of drag). */
  private freeFlightHints(agl: number): void {
    const s = this.s;
    if (this.timed) return;
    if (s.gearDown && !this.ac.shape.fixedGear && agl > 15 && agl < 600 && s.vs > 0) {
      this.d.hud.setPrompt("gear");
      return;
    }
    if (s.flaps > 0 && agl > 250 && (!s.gearDown || this.ac.shape.fixedGear) && s.vs > -1) {
      if (!this.said.has("freeFlapsUp")) {
        this.said.add("freeFlapsUp");
        void this.say(LINES.flapsUp);
      }
      this.d.hud.setPrompt("flaps");
      return;
    }
    this.d.hud.setPrompt(null);
  }

  private onFreeTouchdown(sink: number, overRunway: boolean, near: { r: RunwayInUse; s: number; x: number } | null): void {
    const s = this.s;
    const water = this.d.world.cartoon?.landAt(s.lat, s.lon) === 1;
    if (this.d.crashes && (!overRunway || sink > 900 || Math.abs(s.bank) > 25 || water)) {
      this.crash();
      return;
    }
    if (!overRunway || !near) {
      if (!this.d.crashes) {
        // Not a runway: the co-pilot bounces us back up.
        s.onGround = false;
        s.alt += 2;
        s.vs = 3;
        s.gamma = 4;
      }
      return;
    }
    this.d.audio.sfx("chirp");
    if (this.airborneTime < 15 && this.landedAt === near.r.airport.code) return;
    const soft = sink < 400;
    const landing = sink < 150 ? "butter" : soft ? "smooth" : "firm";
    const centre = Math.abs(near.x) < 8;
    const stars = (soft ? 1 : 0) + (centre ? 1 : 0) + 1;
    this.d.hud.toast(landing === "butter" ? "BUTTER!" : landing === "smooth" ? "Smooth!" : "Firm!", "big");
    void this.say(landing === "butter" ? LINES.butter : landing === "smooth" ? LINES.smooth : LINES.firm, true);
    void this.say(tpl.welcomeTo(near.r.airport.spoken));
    this.landedAt = near.r.airport.code;
    this.airborneTime = 0;
    if (this.navTarget?.code === near.r.airport.code) this.setNavTarget(null);
    this.onLanded({ airport: near.r.airport, stars, landing });
  }

  private crash(): void {
    if (this.phase === "crashed") return;
    this.setPhase("crashed");
    this.crashTimer = 3.5;
    this.s.speed = 0;
    this.s.throttle = 0;
    this.s.bank = 25;
    this.s.pitch = -8;
    this.d.audio.sfx("crash");
    this.d.audio.stopEngine();
    this.d.hud.toast("CRASH!", "big");
    void this.say(LINES.crash, true);
    this.view.shake = 1.2;
  }

  private updateCrashed(dt: number): void {
    this.crashTimer -= dt;
    if (this.crashTimer > 0) return;
    let best = AIRPORTS[0];
    for (const a of AIRPORTS) if (distance(this.s, a) < distance(this.s, best)) best = a;
    this.d.audio.startEngine(this.ac.kind);
    this.startFreeAt(best);
  }

  // ------------------------------------------------------------------ controls

  private setGear(down: boolean): void {
    if (this.ac.shape.fixedGear) return;
    if (this.s.gearDown === down) return;
    this.s.gearDown = down;
    this.d.audio.sfx("thunk");
  }

  private onControl(e: ControlEvent): void {
    if (this.paused || !this.s) return;
    this.d.audio.sfx("click");
    switch (e) {
      case "gear":
        if (this.ac.shape.fixedGear) {
          this.sayOnce("fixedGear", LINES.fixedGear);
          return;
        }
        if (this.s.onGround) return;
        this.setGear(!this.s.gearDown);
        if (this.s.gearDown && this.timed?.prompt === "gear") {
          this.timed = null;
          this.d.hud.setPrompt(null);
          void this.say(LINES.gearDownGood).then(() => this.afterGearDown());
        } else if (!this.s.gearDown && this.timed?.prompt === "gear") {
          this.timed = null;
          this.d.hud.setPrompt(null);
          void this.say(LINES.gearUpGood).then(() => this.afterGearUp());
        }
        break;
      case "flaps":
        // In flight above approach speed, one tap brings the flaps all the way up; otherwise
        // each tap lowers one more notch (and wraps back to up on the ground).
        if (!this.s.onGround && this.s.flaps > 0 && indicated(this.s.speed, this.s.alt) > this.p.vapp * 1.25) this.s.flaps = 0;
        else this.s.flaps = (this.s.flaps + 1) % 4;
        if (this.timed?.prompt === "flaps" && this.s.flaps >= 3) {
          this.timed = null;
          this.d.hud.setPrompt(null);
          void this.say(LINES.flapsGood);
        }
        break;
      case "camera":
        this.view.mode = this.view.mode === "chase" ? "cockpit" : "chase";
        this.view.resetLook();
        break;
      case "radio":
        if (this.phase === "lineup") this.radioTakeoff();
        else if (this.phase === "approach") this.radioLanding();
        break;
      default:
        break;
    }
  }

  private afterGearUp(): void {
    if (this.phase === "climb" && this.hoops.length) void this.say(LINES.hoops);
  }

  private afterGearDown(): void {
    if (this.phase !== "approach") return;
    void this.say(LINES.flapsPrompt);
    this.ask("flaps", 9, () => this.s.flaps >= 3, () => {
      void this.say(LINES.flapsHelp);
      this.s.flaps = 3;
    });
  }

  private landingCleared = false;

  private radioLanding(): void {
    if (this.landingCleared || !this.arr) return;
    this.landingCleared = true;
    if (this.timed?.prompt === "radio") {
      this.timed = null;
      this.d.hud.setPrompt(null);
    }
    void this.say(tpl.onFinal(this.arr.airport.towerName, this.arr.end.spoken));
    void this.say(tpl.clearedLand(this.arr.end.spoken));
  }

  // ------------------------------------------------------------------ frame update

  update(dtRaw: number): void {
    if (!this.s || this.phase === "loading" || this.destroyed) return;
    const dt = Math.min(dtRaw, 0.1);
    this.frame++;
    if (this.paused) {
      this.updateCamera(dt);
      return;
    }
    // Fixed 1/60 s physics steps, so the plane flies the same on fast and slow devices.
    const STEP = 1 / 60;
    this.accum = Math.min(this.accum + dt * Math.max(1, Math.round(this.timeScale)), 0.25 * Math.max(1, this.timeScale));
    let n = 0;
    while (this.accum >= STEP && n < 60 * Math.max(1, this.timeScale)) {
      this.simulate(STEP);
      this.accum -= STEP;
      n++;
    }
    this.updateModel(dt);
    this.updateCamera(dt);
    this.updateHud();
    if (this.phase !== "cruise" && this.phase !== "toCruise") this.d.world.updateScenery(this.s, this.s.alt, this.s.alt - this.groundHeightAt(this.s));
    this.d.audio.updateEngine(this.s.throttle, this.s.speed);
  }

  private simulate(dt: number): void {
    this.time += dt;
    this.phaseTime += dt;
    const c = this.d.controls;
    c.update(dt);
    if (this.d.hud.brakeHeld) c.state.brake = 1;

    // Timed prompts: if the player doesn't act, the co-pilot helps.
    if (this.timed) {
      if (this.timed.done()) {
        this.timed = null;
        this.d.hud.setPrompt(null);
      } else if (this.time - this.timed.started > this.timed.timeout) {
        const t = this.timed;
        this.timed = null;
        this.d.hud.setPrompt(null);
        t.help();
      }
    }

    if (this.phase === "free") this.updateFree(dt);
    else if (this.phase === "crashed") this.updateCrashed(dt);
    else if (this.phase === "cruise") this.updateCruise(dt);
    else if (this.phase !== "toCruise" && this.phase !== "toApproach" && this.phase !== "done") this.updatePhysics(dt);
    this.updatePapi();
  }

  private groundHeightAt(p: LatLon): number {
    for (const r of [this.dep, this.arr, ...this.allRunways]) {
      if (r && onRunwayArea(r, p)) return runwayHeight(r, runwayCoords(r, p).s);
    }
    if (this.frame - this.groundCache.frame >= 6 || !this.groundCache.valid) {
      const h = this.d.world.groundHeight(p);
      this.groundCache.frame = this.frame;
      if (h !== undefined && Number.isFinite(h)) {
        this.groundCache.h = h;
        this.groundCache.valid = true;
      }
    }
    if (this.groundCache.valid) return this.groundCache.h;
    const near = this.arr && distance(p, this.arr.end) < distance(p, this.dep.end) ? this.arr : this.dep;
    return runwayHeight(near, 0);
  }

  private updatePhysics(dt: number): void {
    const s = this.s;
    const c = this.d.controls.state;
    const p = this.p;
    const level = this.d.assistLevel;
    const ground = this.groundHeightAt(s);
    const agl = s.alt - ground;
    const landing = this.phase === "approach" || this.phase === "rollout";
    const g: Guidance = {
      targetHeading: null,
      targetVs: 0,
      targetSpeed: null,
      agl,
      runwayAgl: null,
      landing,
      autoFlare: level <= 3,
      groundHeading: null,
      wantRotate: false,
      autoRotate: false,
    };
    let throttle: number | null = c.throttle;
    let brake = c.brake;

    const hoop = this.hoops[this.hoopIndex];
    if (hoop && !s.onGround) {
      const dist = distance(s, hoop.pos);
      g.targetHeading = bearing(s, hoop.pos);
      const tt = Math.max(1.5, dist / Math.max(s.speed, 20));
      g.targetVs = clamp((hoop.alt - s.alt) / tt, -p.descentMax, p.climbMax);
    }

    switch (this.phase) {
      case "lineup":
        throttle = 0;
        brake = 1;
        g.groundHeading = this.dep.heading;
        break;
      case "l2go":
      case "l2slow":
      case "l2brake":
        g.groundHeading = this.dep.heading;
        throttle = c.throttle;
        // Keep the lesson on the ground: ease off power near rotation speed.
        if (s.speed > p.vr * 0.75) throttle = Math.min(throttle, 0.15);
        break;
      case "roll": {
        g.groundHeading = this.dep.heading;
        g.wantRotate = true;
        const vrNear = s.speed >= p.vr * 0.97;
        if (s.speed > 30 * KT && this.ac.kind !== "jet") this.sayOnce("alive", LINES.airspeedAlive);
        if (s.speed > 80 * KT && this.ac.kind === "jet") this.sayOnce("80", LINES.eightyKnots);
        if (vrNear && !this.said.has("rotate")) {
          this.sayOnce("rotate", LINES.rotate, true);
          this.ask("pull", 5, () => !this.s.onGround, () => {
            void this.say(LINES.rotateHelp);
            this.autoRotate = true;
          });
        }
        g.autoRotate = this.autoRotate;
        if (!s.onGround) g.targetSpeed = Math.min(p.vclimb, p.speedLimit);
        break;
      }
      case "climb":
        g.targetSpeed = Math.min(p.vclimb, p.speedLimit);
        throttle = null;
        if (!hoop) g.targetVs = p.climbMax * 0.5;
        break;
      case "l4":
        g.targetSpeed = s.speed;
        throttle = null;
        break;
      case "approach": {
        const r = this.arr!;
        const { s: along, x } = runwayCoords(r, s);
        const rwyH = runwayHeight(r, Math.max(0, along));
        const distAim = AIM - along;
        const wantAlt = runwayHeight(r, 0) + Math.max(0, distAim) * Math.tan(GLIDE);
        g.runwayAgl = s.alt - rwyH;
        g.targetVs = -s.speed * Math.tan(GLIDE) + clamp((wantAlt - s.alt) * 0.18, -4, 4);
        g.targetHeading = r.heading - clamp(x * 0.12, -25, 25);
        g.targetSpeed = s.flaps >= 3 ? p.vapp : p.vapp + 12 * KT;
        throttle = null;
        if (distAim < 2600 && !this.landingCleared && !this.timed) {
          void this.say(LINES.radioPrompt);
          this.ask("radio", 7, () => this.landingCleared, () => this.radioLanding());
        }
        if (distAim < 1500 && this.landingCleared) this.sayOnce("papi", LINES.papi);
        if (g.runwayAgl < 15 && along > -200) {
          this.sayOnce("flare", LINES.flare);
          g.targetSpeed = p.vapp * 0.97;
        }
        if (g.runwayAgl < 60 && Math.abs(x) > 150 && this.approachStarts < 4) {
          void this.goAround();
          return;
        }
        if (along > r.length * 0.6 && g.runwayAgl > 30) {
          void this.goAround();
          return;
        }
        break;
      }
      case "rollout":
        throttle = 0;
        brake = this.phaseTime > 1.5 ? Math.max(brake, 0.7) : brake;
        g.groundHeading = this.arr!.heading;
        break;
      default:
        break;
    }

    const cmd = computeCommands(level, { roll: c.roll, pitch: c.pitch, throttle, brake }, g, s, p, this.mem, dt);
    if (this.phase === "lineup") cmd.throttle = 0;
    if (this.phase === "rollout") cmd.throttle = 0;
    this.lastCmd = { targetBank: cmd.targetBank, targetVs: cmd.targetVs };
    const events = step(s, cmd, p, { groundHeight: ground }, dt);

    for (const e of events) {
      if (e.type === "liftoff") this.onLiftoff();
      if (e.type === "touchdown") this.onTouchdown(e.sinkFpm);
    }
    if (this.mem.terrainWarning) this.sayOnce(`terrain${Math.floor(this.time / 8)}`, LINES.terrain);

    this.checkHoops();
    this.phaseLogic();
  }

  private autoRotate = false;

  private onLiftoff(): void {
    this.setPhase("climb");
    this.d.audio.sfx("chirp");
    if (this.ac.shape.fixedGear) {
      void this.say(LINES.hoops);
    } else {
      void this.say(LINES.positiveRate, true);
      this.ask("gear", 8, () => !this.s.gearDown, () => {
        void this.say(LINES.gearHelp);
        this.setGear(false);
        this.afterGearUp();
      });
    }
  }

  private onTouchdown(sink: number): void {
    if (this.phase !== "approach") {
      // Ground Buddy should prevent this; treat it as a soft bounce.
      this.s.onGround = false;
      this.s.alt += 2;
      this.s.vs = 3;
      this.s.gamma = 3;
      return;
    }
    const r = this.arr!;
    const { s: along, x } = runwayCoords(r, this.s);
    this.d.audio.sfx("chirp");
    this.result.sinkFpm = Math.round(sink);
    this.result.centerline = Math.abs(x) < 8;
    this.result.zone = along > 120 && along < 900;
    const soft = sink < 400;
    this.result.landing = sink < 150 ? "butter" : soft ? "smooth" : "firm";
    this.result.stars = (soft ? 1 : 0) + (this.result.centerline ? 1 : 0) + (this.result.zone ? 1 : 0);
    if (this.result.landing === "butter") {
      this.d.hud.toast("BUTTER!", "big");
      void this.say(LINES.butter, true);
    } else if (this.result.landing === "smooth") {
      this.d.hud.toast("Smooth!", "big");
      void this.say(LINES.smooth, true);
    } else {
      this.d.hud.toast("Firm!", "big");
      void this.say(LINES.firm, true);
    }
    this.clearHoops();
    this.setPhase("rollout");
  }

  private checkHoops(): void {
    const h = this.hoops[this.hoopIndex];
    if (!h) return;
    const s = this.s;
    const along = alongTrackLocal(h, s);
    if (along < 0) return;
    const lateral = distance(s, h.pos);
    const vertical = s.alt - h.alt;
    const miss = Math.hypot(lateral, vertical);
    const passed = miss < h.radius * 1.2;
    h.state = passed ? "passed" : "missed";
    if (h.model) {
      h.model.color = passed ? Color.fromCssColorString("#2ee66b") : Color.fromCssColorString("#ffffff").withAlpha(0.35);
      const model = h.model;
      setTimeout(() => {
        model.show = false;
      }, passed ? 700 : 300);
    }
    if (passed) {
      this.d.audio.sfx("hoop");
      if (!this.d.audio.busy && Math.random() < 0.6) {
        const praise = [LINES.hoopGood1, LINES.hoopGood2, LINES.hoopGood3, LINES.hoopGood4];
        void this.say(praise[this.hoopIndex % praise.length]);
      }
    }
    this.hoopIndex++;
  }

  private phaseLogic(): void {
    const m = this.mission;
    const s = this.s;
    const c = this.d.controls.state;
    switch (this.phase) {
      case "l2go":
        if (s.speed > 22 * KT && !this.said.has("l2slow")) {
          this.sayOnce("l2slow", LINES.l2Slow, true);
          this.setPhase("l2slow");
          this.ask("throttle-back", 12, () => c.throttle < 0.1, () => this.d.controls.setThrottle(0, false));
        }
        break;
      case "l2slow":
        if (c.throttle < 0.1) {
          this.sayOnce("l2brake", LINES.l2Brake);
          this.setPhase("l2brake");
          this.ask("brake", 12, () => s.speed < 1, () => (this.d.hud.brakeHeld = true));
        }
        break;
      case "l2brake":
        if (s.speed < 0.5) {
          this.d.hud.brakeHeld = false;
          void this.finish(true, LINES.l2Done);
        }
        break;
      case "climb":
        if (this.hoopIndex >= this.hoops.length && this.hoops.length > 0) {
          if (m.kind === "lesson") void this.finish(true, LINES.l3Done);
          else void this.enterCruise();
        } else if (this.hoops.length === 0 && this.phaseTime > 30) {
          if (m.kind === "charter") void this.enterCruise();
        }
        break;
      case "l4":
        if (this.hoopIndex >= this.hoops.length) void this.finish(true, LINES.l4Done);
        else this.steerHint();
        break;
      case "rollout":
        if (s.speed < 4 && !this.said.has("rolloutDone")) {
          this.said.add("rolloutDone");
          if (m.kind === "charter") {
            void this.say(tpl.welcomeTo(this.arr!.airport.spoken)).then(() => this.finish(true));
          } else void this.finish(true, LINES.l5Done);
        }
        break;
      default:
        break;
    }
    if (this.phase === "climb" || this.phase === "approach") this.steerHint();
  }

  private steerHint(): void {
    if (this.timed) return;
    const h = this.hoops[this.hoopIndex];
    if (!h || this.s.onGround) {
      this.d.hud.setPrompt(null);
      return;
    }
    const err = angleDiff(bearing(this.s, h.pos), this.s.heading);
    if (Math.abs(err) > 25) this.d.hud.setPrompt(err < 0 ? "steer-left" : "steer-right");
    else this.d.hud.setPrompt(null);
  }

  private updateCruise(dt: number): void {
    const c = this.cruise;
    const s = this.s;
    const ctl = this.d.controls.state;
    // Landmark moments: slow down, open the clouds, look down.
    let warpScale = 1;
    const next = c.landmarks.find((l) => !l.shown && c.progress >= l.at);
    if (next && c.moment <= 0) {
      next.shown = true;
      c.moment = 10;
      this.d.world.setGroundVisible(true);
      void this.say(tpl.landmark(next.lm.spoken, next.lm.fact));
    }
    if (c.moment > 0) {
      c.moment -= dt;
      warpScale = 0.12;
      this.clouds.opacity = clamp(this.clouds.opacity - dt / 1.2, 0, 1);
      if (c.moment <= 0) c.moment = -2; // fade back in
    } else if (c.moment < 0) {
      c.moment += dt;
      this.clouds.opacity = clamp(this.clouds.opacity + dt / 1.5, 0, 1);
      if (c.moment >= 0) {
        c.moment = 0;
        this.clouds.opacity = 1;
        this.d.world.setGroundVisible(false);
      }
    }

    const warp = (c.total / c.duration) * warpScale;
    c.progress = Math.min(1, c.progress + (warp * dt) / c.total);

    // Gentle steering for fun; the co-pilot brings us back to the route.
    const realSpeed = this.ac.cruiseKt * KT;
    const neutral = Math.abs(ctl.roll) < 0.08;
    const targetBank = neutral ? clamp(-c.dev * 1.0 - c.offset * 0.004, -20, 20) : ctl.roll * 30;
    s.bank += clamp(targetBank - s.bank, -this.p.rollRate * dt, this.p.rollRate * dt);
    c.dev = clamp(c.dev + ((9.81 * Math.tan(s.bank * DEG)) / realSpeed / DEG) * dt, -45, 45);
    c.offset = clamp(c.offset + Math.sin(c.dev * DEG) * realSpeed * dt, -3000, 3000);
    if (this.d.assistLevel >= 2) c.altOffset = clamp(c.altOffset + ctl.pitch * 8 * dt, -300, 300);
    c.altOffset *= 1 - dt * 0.15;

    const along = interpolate(c.a, c.b, c.progress);
    const routeHdg = bearing(along, c.b);
    const pos = destination(along, routeHdg + 90, c.offset);
    s.lat = pos.lat;
    s.lon = pos.lon;
    s.heading = routeHdg + c.dev;
    s.alt = c.alt + c.altOffset;
    s.pitch = 2 + (ctl.pitch * 3) * (this.d.assistLevel >= 2 ? 1 : 0);
    s.speed = realSpeed;
    s.throttle = 0.85;

    if (c.progress >= 1) void this.enterApproach();
  }

  // ------------------------------------------------------------------ rendering

  private updateModel(dt: number): void {
    const s = this.s;
    const c = this.d.controls.state;
    const rollCmd = clamp((this.lastCmd.targetBank - s.bank) / 12, -1, 1);
    const pitchCmd = s.onGround ? (s.pitch > 1 ? 1 : c.pitch) : clamp((this.lastCmd.targetVs - s.vs) / 4, -1, 1);
    const yaw = s.onGround ? c.roll : rollCmd * 0.2;
    const ground = this.phase === "cruise" || this.phase === "toCruise" ? null : this.groundHeightAt(s);
    this.view.update(s, dt, { roll: rollCmd, pitch: pitchCmd, yaw }, ground);
  }

  private updateCamera(dt: number): void {
    const s = this.s;
    const moment = this.phase === "cruise" && this.cruise.moment !== 0;
    const cam = this.view.updateCamera(s, dt, moment);
    // Cloud deck follows the camera; scroll the pattern to show speed.
    if (this.phase === "cruise" || this.phase === "toCruise") {
      const v = this.ac.cruiseKt * KT * 1.3 * dt;
      this.clouds.update(cam, this.cruise.cloudTop, Math.sin(s.heading * DEG) * v, Math.cos(s.heading * DEG) * v);
    }
  }

  private updateHud(): void {
    const s = this.s;
    if (this.mission.kind === "sandbox") this.d.hud.updateMaps({ pos: s, heading: s.heading, target: this.navTarget });
    const ref = this.arr && this.cruiseProgressFraction() > 0.5 ? this.arr : this.dep;
    const altFt = (s.alt + ref.mslOffset) / FT;
    const inCruise = this.phase === "cruise";
    this.d.hud.update({
      speedKt: indicated(s.speed, s.alt) / KT,
      groundKt: s.speed * Math.cos(s.gamma * DEG) / KT,
      altFt: inCruise ? this.ac.cruiseAltFt + this.cruise.altOffset / FT : altFt,
      heading: s.heading,
      bank: s.bank,
      pitch: s.pitch,
      throttle: this.playerPower() ? this.d.controls.state.throttle : s.throttle,
      gearDown: s.gearDown,
      fixedGear: this.ac.shape.fixedGear,
      flaps: s.flaps,
      onGround: s.onGround,
      progress: this.mission.kind === "charter" ? this.cruiseProgressFraction() : null,
      from: this.dep.airport.code,
      to: (this.arr ?? this.dep).airport.code,
      warp: inCruise && this.cruise.moment === 0,
      terrain: this.mem.terrainWarning,
      hoopsLeft: this.hoops.length ? this.hoops.length - this.hoopIndex : null,
    });
  }

  /** Phases where the lever is the player's, not the co-pilot's. */
  private playerPower(): boolean {
    return ["lineup", "roll", "l2go", "l2slow", "l2brake"].includes(this.phase) && this.s.onGround;
  }

  private cruiseProgressFraction(): number {
    const d = distance(this.origin, this.s);
    return clamp(d / this.routeTotal, 0, 1);
  }

  private async finish(completed: boolean, line?: Line): Promise<void> {
    if (this.phase === "done") return;
    this.setPhase("done");
    this.result.completed = completed;
    this.d.hud.setPrompt(null);
    if (line) await this.say(line);
    if (this.mission.kind === "lesson") await this.say(LINES.lessonDone);
    if (!this.destroyed) this.onDone(this.result);
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  destroy(): void {
    this.destroyed = true;
    this.unsub();
    this.d.audio.stopEngine();
    this.d.audio.stopVoice();
    this.clearHoops();
    this.view.destroy();
    this.d.hud.setSandbox(false);
    this.d.hud.onOpenMap = () => {};
    this.d.hud.onLook = () => {};
    this.d.hud.onLookReset = () => {};
    if (this.papi) this.d.world.widget.scene.primitives.remove(this.papi);
    for (const e of this.entities) this.d.world.widget.entities.remove(e);
    this.d.world.exclude.length = 0;
    this.clouds.destroy();
    this.d.world.setGroundVisible(true);
    this.d.hud.hide();
    void this.d.hud.whiteout(false, 10);
  }
}

// ------------------------------------------------------------------ math helpers

/** Signed distance of the aircraft past the plane of a hoop (positive = gone through). */
function alongTrackLocal(h: Hoop, s: LatLon): number {
  const b = bearing(h.pos, s);
  const d = distance(h.pos, s);
  return d * Math.cos(angleDiff(b, h.heading) * DEG);
}
