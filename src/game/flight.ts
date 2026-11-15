// One flight: a charter (takeoff -> hoops -> above-the-clouds cruise -> approach -> landing)
// or a Flight School lesson built from the same pieces. Drives physics, the co-pilot,
// prompts, hoops, camera, scoring and the 3D models.

import {
  Cartesian3,
  Cartographic,
  Color,
  ColorBlendMode,
  Matrix4,
  Model,
  Transforms,
  Cartesian4,
  Matrix3,
  PointPrimitiveCollection,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  type Entity,
  type ModelNode,
  type PointPrimitive,
} from "cesium";
import { CHINOOK_PERF, isHelicopter, type AircraftDef } from "../data/aircraft.ts";
import { stepHeli } from "../sim/heli.ts";
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
import { hoopGuidance, sTurnCourse } from "../sim/course.ts";
import { Cockpit, PassengerWindow } from "../ui/cockpit.ts";
import { createState, densityRatio, indicated, perfFor, speedOfSound, step, type Commands, type FlightState, type Perf } from "../sim/physics.ts";
import type { Hud, Prompt } from "../ui/hud.ts";
import { CloudDeck } from "../world/clouds.ts";
import { gfxOn } from "../world/safety.ts";
import type { World } from "../world/world.ts";
import { frameMatrix, PlaneView } from "./planeView.ts";
import { makeRunway, onRunwayArea, pickEnd, runwayCoords, runwayHeight, runwayPoint, type RunwayInUse } from "./runway.ts";

/** Instruction lines the co-pilot keeps to itself on a solo charter. */
const SOLO_QUIET = new Set<Line>([
  LINES.lineup, LINES.radioPrompt, LINES.throttleUp, LINES.throttleHelp, LINES.airspeedAlive, LINES.eightyKnots,
  LINES.rotate, LINES.rotateHelp, LINES.positiveRate, LINES.gearHelp, LINES.gearUpGood, LINES.hoops,
  LINES.steerLeft, LINES.steerRight, LINES.approach, LINES.gearDownPrompt, LINES.gearDownGood, LINES.gearDownHelp,
  LINES.flapsPrompt, LINES.flapsGood, LINES.flapsHelp, LINES.papi, LINES.flare, LINES.brakes, LINES.flapsUp,
  LINES.tooFast, LINES.tooFastBrakes, LINES.tooFastFlaps, LINES.flapsRelief, LINES.reversers, LINES.brakesOn,
  LINES.descend, LINES.intoClouds,
]);

/** Runway surfaces sit this far above the runway's slope (so wheels sit on the paint). */
const RUNWAY_LIFT = 0.12;

/**
 * Runway shader: Cesium's flat-colour one, with the runway drawn a touch nearer the camera
 * than it really is: ~4 cm at chase-camera distance, ~5 m at 4 km, ~18 m at 15 km. Far-off
 * terrain is drawn with coarse, simplified shapes that can cut through a flat runway (and
 * Cesium's depth mode ignores ordinary polygon offset); this keeps the runway on top without
 * ever covering the playne's wheels close up. Paint is nudged slightly more than asphalt.
 */
function runwayVertexShader(pull: number): string {
  return `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
in float batchId;
out vec4 v_color;
void main()
{
    vec4 p = czm_computePosition();
    v_color = color;
    vec4 eye = czm_modelViewRelativeToEye * p;
    float d = length(eye.xyz);
    eye.xyz -= eye.xyz / max(d, 0.001) * (d * ${(0.0012 * pull).toFixed(5)});
    gl_Position = czm_projection * eye;
}
`;
}
const RUNWAY_ASPHALT = Color.fromCssColorString("#44484f");
const RUNWAY_PAINT = Color.fromCssColorString("#f4f4f0");

export type LessonId = "l2" | "l3" | "l4" | "l5";

export type Mission =
  | { kind: "charter"; from: string; to: string; passenger: Passenger }
  | { kind: "lesson"; lesson: LessonId; airport: string }
  | { kind: "sandbox"; airport: string; resume?: FreeSnapshot };

/** A saved Free Flight, so the player can leave to the menu and come back later. */
export interface FreeSnapshot {
  v: 1;
  aircraft: string;
  airport: string;
  worldKind: string;
  /** Runway height at `airport` in the world it was saved in (to re-anchor heights in another world). */
  refHeight: number;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  pitch: number;
  bank: number;
  gamma: number;
  speed: number;
  vs: number;
  throttle: number;
  flaps: number;
  gearDown: boolean;
  onGround: boolean;
  navTarget: string | null;
  landedAt: string | null;
  /** Airport this Free Flight trip took off from. */
  from?: string | null;
  savedAt: number;
}

export interface FlightResult {
  mission: Mission;
  completed: boolean;
  stars: number;
  landing: "butter" | "smooth" | "firm" | null;
  sinkFpm: number | null;
  centerline: boolean;
  zone: boolean;
  distanceNm: number;
  /** Hoops flown through, and hoops judged (passed or missed). */
  hoopsPassed: number;
  hoopsTotal: number;
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
  /** Charter route already completed: no tips, no co-pilot assistance (silent last-resort help only). */
  solo?: boolean;
}

export interface FreeLanding {
  airport: Airport;
  stars: number;
  landing: "butter" | "smooth" | "firm";
  /** Where this trip took off (null if from a field or started in the air). */
  from: Airport | null;
  /** Straight-line distance from `from` to `airport`, nautical miles. */
  distanceNm: number;
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
  private cockpit: Cockpit;
  private paxWindow: PassengerWindow;
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
  private groundCache = { h: 0, valid: false, frame: 0, lat: 0, lon: 0 };
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
  private runwayPrims: Primitive[] = [];
  // Free Flight
  onLanded: (l: FreeLanding) => void = () => {};
  /** The "?" button: show the interface tour. */
  onHelp: () => void = () => {};
  /** Free Flight: stopped safely on a runway after landing. */
  onArrived: (a: Airport) => void = () => {};
  /** Free Flight: stopped safely after an emergency landing in a field. `earned`: it counts
   *  for a reward (a real flight first, not a hop). */
  onFieldStop: (nearest: Airport, earned: boolean) => void = () => {};
  /** First takeoff from an airport earns a bonus: returns the Wings (0 if not new). */
  onTakeoff: (code: string) => number = () => 0;
  private allRunways: RunwayInUse[] = [];
  private autopilot: { heading: number; alt: number; ias: number } | null = null;
  /** Speedbrakes extended (jets). */
  private speedbrakeOut = false;
  /** Turning lesson: the indicated airspeed the co-pilot holds. */
  private lessonIas = 0;
  /** Free Flight: airport the current trip took off from. */
  private freeFrom: Airport | null = null;
  /** Landed safely at an airport and still rolling: waiting for the full stop. */
  private arrival: { airport: Airport; runway: RunwayInUse } | null = null;
  /** Rolling out after a safe emergency landing (true = earned a reward). */
  private fieldStop: { earned: boolean } | null = null;
  private arrivedRunway: RunwayInUse | null = null;
  private lastMach = 0;
  private lastBoom = -100;
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
    this.cockpit = new Cockpit(deps.hud.root, deps.aircraft);
    this.paxWindow = new PassengerWindow(deps.hud.root);
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
      hoopsPassed: 0,
      hoopsTotal: 0,
    };
  }

  // ------------------------------------------------------------------ setup

  async start(): Promise<void> {
    const m = this.mission;
    if (m.kind === "sandbox") return this.startSandbox(m.airport, m.resume);
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

    await Promise.all([this.view.load(), this.groundShapesReady()]);
    if (this.destroyed) return;

    this.d.audio.startEngine(this.ac.kind);
    this.d.hud.show(fromAp.code, toAp.code);
    this.preloadVoice();

    if (m.kind === "lesson" && m.lesson === "l4") this.startTurningLesson();
    else if (m.kind === "lesson" && m.lesson === "l5") this.startApproach(true);
    else this.startLineup();
  }

  /**
   * Hold (paused, camera in place) until the detailed ground under the playne has loaded:
   * the first terrain tiles are coarse and can sit metres above the runway, hiding the playne.
   */
  async settleGround(maxMs = 6000): Promise<void> {
    if (!this.s) return;
    const was = this.paused;
    this.paused = true;
    const t0 = performance.now();
    const globe = this.d.world.widget.scene.globe as { show: boolean; getHeight(c: Cartographic): number | undefined } | undefined;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.destroyed || performance.now() - t0 > maxMs) return resolve();
        const s = this.s;
        // Google's 3D world has no globe: wait for its tiles instead.
        const gh = globe && globe.show ? globe.getHeight(Cartographic.fromDegrees(s.lon, s.lat)) : undefined;
        const settled = gh === undefined ? this.d.world.groundReady() : s.onGround ? Math.abs(gh - this.groundHeightAt(s)) < 1.5 : s.alt > gh + 10;
        if (settled && performance.now() - t0 > 300) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
    if (!this.destroyed) this.paused = was;
  }

  /** Resolves once the runway shapes are built (they are made in the background), max 8 s. */
  private groundShapesReady(): Promise<void> {
    const t0 = performance.now();
    return new Promise((resolve) => {
      const check = () => {
        if (this.destroyed || this.runwayPrims.every((p) => p.ready) || performance.now() - t0 > 8000) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }

  /**
   * Crisp runway with markings for the offline worlds (the map tiles alone look blurry up close).
   * Flat surfaces just above the runway's slope (the offline map flattens the ground along
   * runways the same way), split into short pieces so they follow the Earth's curve, and drawn
   * with a depth offset so the terrain never pokes through or smears them. Not draped: a draped
   * shape is a tall invisible volume, and a cockpit camera inside it smears the whole sky.
   */
  private addRunwayVisuals(r: RunwayInUse): void {
    const kind = this.d.world.kind;
    if (kind !== "basic" && kind !== "cartoon") return;
    if (!gfxOn("groundPolys")) return;
    const w = r.airport.runway.widthFt * FT;
    const asphaltParts: GeometryInstance[] = [];
    const paintParts: GeometryInstance[] = [];
    const rect = (s0: number, s1: number, x0: number, x1: number, paint: boolean) => {
      const lo = Math.min(s0, s1);
      const hi = Math.max(s0, s1);
      for (let a = lo; a < hi - 0.01; a += 300) {
        const b = Math.min(hi, a + 300);
        const lift = RUNWAY_LIFT + (paint ? 0.04 : 0);
        const pts = ([[a, x0], [b, x0], [b, x1], [a, x1]] as const).map(([sa, xa]) => ({ ...runwayPoint(r, sa, xa), h: runwayHeight(r, sa) + lift }));
        (paint ? paintParts : asphaltParts).push(
          new GeometryInstance({
            geometry: new PolygonGeometry({
              polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArrayHeights(pts.flatMap((c) => [c.lon, c.lat, c.h]))),
              perPositionHeight: true,
              vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
            }),
            attributes: { color: ColorGeometryInstanceAttribute.fromColor(paint ? RUNWAY_PAINT : RUNWAY_ASPHALT) },
          }),
        );
      }
    };
    rect(-40, r.length + 40, -w / 2, w / 2, false);
    rect(0, r.length, -w / 2 + 1, -w / 2 + 2, true);
    rect(0, r.length, w / 2 - 2, w / 2 - 1, true);
    for (let s = 120; s < r.length - 120; s += 66) rect(s, s + 36, -0.5, 0.5, true);
    for (const [s0, dir] of [[6, 1], [r.length - 6, -1]] as const) {
      for (let k = 0; k < 8; k++) {
        const x = -w / 2 + 4 + k * ((w - 8) / 8) + (k >= 4 ? 4 : 0);
        rect(s0, s0 + dir * 45, x, x + 1.8, true);
      }
      for (const x of [-w / 4 - 3, w / 4 - 3]) rect(s0 + dir * 300, s0 + dir * 345, x, x + 6, true);
    }
    const scene = this.d.world.widget.scene;
    for (const [parts, pull] of [[asphaltParts, 1], [paintParts, 1.15]] as const) {
      const prim = new Primitive({
        geometryInstances: parts,
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
          vertexShaderSource: runwayVertexShader(pull),
        }),
        shadows: 0,
      });
      scene.primitives.add(prim);
      this.runwayPrims.push(prim);
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
    if (this.solo && SOLO_QUIET.has(line)) return Promise.resolve();
    return this.d.audio.say(line, { interrupt });
  }

  private sayOnce(key: string, line: Line, interrupt = false): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    void this.say(line, interrupt);
  }

  private ask(prompt: Prompt, timeout: number, done: () => boolean, help: () => void): void {
    // Solo: no prompt, and the co-pilot only steps in (silently) after a long wait.
    this.timed = { prompt, started: this.time, timeout: this.solo ? Math.max(30, timeout * 4) : timeout, done, help };
    this.hudPrompt(prompt);
  }

  /** Button highlights and steering arrows (none when flying solo). */
  private hudPrompt(p: Prompt): void {
    if (this.solo && p) return;
    this.d.hud.setPrompt(p);
  }

  /** Solo charters: the co-pilot doesn't give tips. */
  private get solo(): boolean {
    return !!this.d.solo && this.mission.kind === "charter";
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
    if (this.solo) void this.say(LINES.soloCharter);
    // The radio wakes up once the co-pilot has asked for it (not while still talking).
    this.setRadio(false);
    void this.say(LINES.lineup).then(() => {
      if (this.destroyed || this.phase !== "lineup" || this.radioDone) return;
      this.setRadio(true);
      this.ask("radio", 12, () => false, () => this.radioTakeoff());
    });
    this.buildClimbHoops(m.kind === "lesson" ? 3 : 9);
  }

  private radioDone = false;

  /** Charters and lessons: the radio only works when the co-pilot has asked you to call. */
  private radioReady = false;
  private setRadio(on: boolean): void {
    this.radioReady = on;
    this.d.hud.setRadioEnabled(on);
  }

  private radioTakeoff(): void {
    if (this.radioDone) return;
    this.radioDone = true;
    this.setRadio(false);
    this.timed = null;
    this.hudPrompt(null);
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
    // Flight school hoops are extra big.
    if (this.mission.kind === "lesson") return clamp(this.ac.shape.span * 3, 40, 70);
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
    // A slow, steady speed (a little above approach speed, flaps 1) so turns are tight.
    this.lessonIas = this.p.vapp * 1.2;
    const tas = this.lessonIas / Math.sqrt(densityRatio(alt));
    this.s = createState({ lat: startP.lat, lon: startP.lon, alt, heading: r.heading, onGround: false, speed: tas, gearDown: this.ac.shape.fixedGear, flaps: 1 });
    this.view.resetCameraHeading(r.heading);
    this.d.controls.reset();
    this.d.controls.setThrottle(0.6, false);
    // S-turns: right, left, right.
    const s = { ...this.s };
    const radius = this.hoopRadius();
    const speed = s.speed;
    const hdg = s.heading;
    const pos: LatLon = { lat: s.lat, lon: s.lon };
    for (const c of sTurnCourse(pos, hdg, speed, this.p.rollRate)) {
      this.hoops.push({ pos: c.pos, alt, heading: c.heading, pitch: 0, radius, model: null, state: "ahead" });
    }
    void this.spawnHoopModels();
    this.setPhase("l4");
    void this.say(LINES.l4Intro);
    void this.say(LINES.hoops);
  }

  private startApproach(fresh: boolean): void {
    const r = this.arr!;
    this.approachStarts++;
    if (!this.landingCleared) {
      this.setRadio(false);
      this.radioAsked = false;
    }
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
    this.hudPrompt(null);
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

  private async startSandbox(code: string, resume?: FreeSnapshot): Promise<void> {
    const pts: LatLon[] = AIRPORTS.flatMap((a) => a.runway.ends);
    const hs = await this.d.world.sampleHeights(pts);
    if (this.destroyed) return;
    const fallback = (ft: number) => (this.d.world.kind === "basic" ? 0 : ft * FT + (this.d.world.kind === "cartoon" ? 0 : GEOID_GUESS));
    this.allRunways = AIRPORTS.map((a, i) => makeRunway(a, a.runway.ends[0], a.runway.ends[1], hs[2 * i] ?? fallback(a.runway.ends[0].elevFt), hs[2 * i + 1] ?? fallback(a.runway.ends[1].elevFt)));
    // The departure runway first (the loading screen waits for it), then all the others.
    const startRwy = this.allRunways.find((r) => r.airport.code === code);
    if (startRwy) this.addRunwayVisuals(startRwy);
    await Promise.all([this.view.load(), this.groundShapesReady()]);
    if (this.destroyed) return;
    for (const r of this.allRunways) if (r !== startRwy) this.addRunwayVisuals(r);
    this.d.audio.startEngine(this.ac.kind);
    this.d.hud.show("FREE", "—");
    this.d.hud.setSandbox(true);
    this.d.hud.setHeli(this.heli);
    this.startFreeAt(airportByCode(code));
    if (resume) this.applySnapshot(resume);
    else void this.say(LINES.freeIntro);
  }

  /** Where the Free Flight is right now (null when not in a resumable state). */
  snapshot(): FreeSnapshot | null {
    if (this.mission.kind !== "sandbox" || this.phase !== "free" || !this.s) return null;
    const s = this.s;
    return {
      v: 1,
      aircraft: this.ac.id,
      airport: this.dep.airport.code,
      worldKind: this.d.world.kind,
      refHeight: this.dep.hEnd,
      lat: s.lat,
      lon: s.lon,
      alt: s.alt,
      heading: s.heading,
      pitch: s.pitch,
      bank: s.bank,
      gamma: s.gamma,
      speed: s.speed,
      vs: s.vs,
      throttle: s.throttle,
      flaps: s.flaps,
      gearDown: s.gearDown,
      onGround: s.onGround,
      navTarget: this.navTarget?.code ?? null,
      landedAt: this.landedAt,
      from: this.freeFrom?.code ?? null,
      savedAt: Date.now(),
    };
  }

  private applySnapshot(r: FreeSnapshot): void {
    const s = this.s;
    // Different worlds measure height differently (sea level vs. the ellipsoid): re-anchor.
    const shift = r.worldKind === this.d.world.kind ? 0 : this.dep.hEnd - r.refHeight;
    Object.assign(s, {
      lat: r.lat,
      lon: r.lon,
      alt: r.alt + shift,
      heading: r.heading,
      pitch: r.pitch,
      bank: r.bank,
      gamma: r.gamma,
      speed: r.speed,
      vs: r.vs,
      throttle: r.throttle,
      flaps: r.flaps,
      gearDown: r.gearDown,
      onGround: r.onGround,
    });
    if (s.onGround) s.alt = this.groundHeightAt(s);
    else s.alt = Math.max(s.alt, this.groundHeightAt(s) + 30);
    this.d.controls.setThrottle(r.throttle, false);
    this.view.resetCameraHeading(r.heading);
    this.landedAt = r.landedAt;
    this.freeFrom = r.from ? AIRPORTS.find((a) => a.code === r.from) ?? null : null;
    this.airborneTime = s.onGround ? 0 : 30;
    if (r.navTarget) {
      this.navTarget = AIRPORTS.find((a) => a.code === r.navTarget) ?? null;
      this.d.hud.setRoute("FREE", this.navTarget ? this.navTarget.code : "—");
    }
  }

  /** Line up on the airport's preferred runway, ready to go. */
  private startFreeAt(ap: Airport): void {
    const base = this.allRunways.find((r) => r.airport.code === ap.code)!;
    const pref = base.end.id === ap.runway.preferred ? base : makeRunway(ap, base.other, base.end, base.hOther, base.hEnd);
    this.lineUp(pref);
  }

  /** Free Flight: lined up at the start of this runway, engine idling, ready to go. */
  private lineUp(r: RunwayInUse): void {
    const ap = r.airport;
    this.dep = r;
    const pos = runwayPoint(r, 60);
    this.s = createState({ lat: pos.lat, lon: pos.lon, alt: this.groundHeightAt(pos), heading: r.heading, flaps: this.heli ? 0 : 1, gearDown: true, onGround: true });
    this.view.resetCameraHeading(r.heading);
    this.d.controls.reset();
    this.speedbrakeOut = false;
    this.arrival = null;
    this.fieldStop = null;
    this.freeFrom = null;
    this.landedAt = ap.code;
    this.airborneTime = 0;
    this.autopilot = null;
    this.setPhase("free");
    this.hudPrompt(null);
  }

  /** After arriving: line up again at the start of the runway we landed on. */
  flyAgainFromHere(): void {
    // The Chinook just lifts off again from where it landed.
    if (this.heli) {
      this.paused = false;
      return;
    }
    if (!this.arrivedRunway) return;
    this.lineUp(this.arrivedRunway);
    this.d.audio.startEngine(this.ac.kind);
    this.paused = false;
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
    this.d.hud.openBigMap({ pos: this.s, heading: this.s.heading, target: this.navTarget }, (a: Airport | null) => {
      this.setNavTarget(a);
      if (!a) void this.say(LINES.routeCleared, true);
    }, () => {
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

  /** The Chinook flies with its own helicopter controls (src/sim/heli.ts). */
  private get heli(): boolean {
    return isHelicopter(this.ac);
  }

  private updateFree(dt: number): void {
    if (this.heli) {
      this.updateHeli(dt);
      return;
    }
    const s = this.s;
    // Breaking the sound barrier (the fighter can).
    const mach = s.speed / speedOfSound(s.alt);
    if (mach >= 1 && this.lastMach < 1 && this.time - this.lastBoom > 20) {
      this.lastBoom = this.time;
      this.d.audio.sfx("boom");
      this.d.hud.toast("SONIC BOOM!", "big");
      this.view.shake = 0.4;
      void this.say(LINES.sonicBoom, true);
    }
    this.lastMach = mach;
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
    // Wheels down, power back, landing speed: the pilot means to land (maybe in a field), so
    // Ground Buddy steps aside and the co-pilot flares over whatever ground is below.
    const landingConfig = !s.onGround && !landingZone && (s.gearDown || this.ac.shape.fixedGear) && c.throttle < 0.25 && indicated(s.speed, s.alt) < p.vapp * 1.5;

    const g: Guidance = {
      targetHeading: null,
      targetVs: 0,
      targetSpeed: null,
      agl,
      runwayAgl: landingZone ? rwyAgl : landingConfig ? agl : null,
      landing: crashes || landingZone || landingConfig,
      autoFlare: this.d.assistLevel <= 3,
      groundHeading: null,
      wantRotate: true,
      autoRotate: false,
      powerGlide: !landingZone && !this.d.autoSpeed,
      // Free Flight: full stick is a 60-degree steep turn (the fighter can roll much further).
      maxBank: this.ac.kind === "fighter" ? 80 : 60,
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
        this.hudPrompt("pull");
      }
      if (c.throttle <= 0.5 || s.speed < p.vr * 0.8) this.hudPrompt(null);
      if (s.speed < 25 * KT) brake = Math.max(brake, c.throttle < 0.15 ? 0.4 : 0);
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
    this.slowingDown(cmd, landingZone, c.throttle);
    this.flapRelief();
    this.lastCmd = { targetBank: cmd.targetBank, targetVs: cmd.targetVs };
    const wasGround = s.onGround;
    const events = step(s, cmd, p, { groundHeight: ground, surface: overRunway || !s.onGround ? "runway" : "grass" }, dt);

    for (const e of events) {
      if (e.type === "liftoff") {
        this.freeFrom = overRunway && near ? near.r.airport : null;
        if (this.freeFrom) this.takeoffFrom(this.freeFrom);
        this.said.delete("pullHint");
        this.said.delete("freeFlapsUp");
        if (!this.ac.shape.fixedGear) {
          void this.say(LINES.positiveRate, true);
          this.hudPrompt("gear");
        }
      }
      if (e.type === "touchdown") this.onFreeTouchdown(e.sinkFpm, overRunway, near);
    }
    if (!wasGround && !s.onGround) this.airborneTime += dt;
    this.checkFreeStops();
    // Rolling over rough ground (steep, water, or into something) is a crash; a flat open field is fine.
    if (s.onGround && this.phase === "free" && crashes && !overRunway && s.speed > 20 * KT && this.frame % 4 === 0 && !this.fieldOk(s)) this.crash();
    // Bumping into trees, houses and airport buildings (crashes on; only near the ground).
    if (crashes && this.phase === "free" && s.speed > 20 * KT && agl < 90) {
      const top = this.d.world.obstacleTop(s, this.ac.shape.span * 0.4);
      if (top !== null && s.alt < top - 0.5) this.crash();
    }

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

  /** Stopped safely after a landing: at an airport (welcome!) or in a field. What next? */
  private checkFreeStops(): void {
    const s = this.s;
    if (this.arrival && s.onGround && s.speed < 0.5 && this.phase === "free") {
      const a = this.arrival;
      this.arrival = null;
      this.arrivedRunway = a.runway;
      this.paused = true;
      this.onArrived(a.airport);
    }
    if (this.arrival && !s.onGround) this.arrival = null;
    if (this.fieldStop && s.onGround && s.speed < 0.5 && this.phase === "free") {
      const earned = this.fieldStop.earned;
      this.fieldStop = null;
      this.paused = true;
      this.onFieldStop(this.nearestAirport(), earned);
    }
    if (this.fieldStop && !s.onGround) this.fieldStop = null;
  }

  /**
   * Free Flight in the Chinook: lever = lift, stick = forward/slow and turn. Lifts off and lands
   * anywhere flat (airports, fields, big flat roofs); not on water or steep slopes.
   */
  private updateHeli(dt: number): void {
    const s = this.s;
    const c = this.d.controls.state;
    const crashes = this.d.crashes;
    let ground = this.groundHeightAt(s);
    // Roofs and treetops count as the ground once you're above them (land on a big building!).
    // With crashes on, flying into the side of one is a crash.
    const top = this.d.world.obstacleTop(s, 8);
    let onTop = false;
    if (top !== null && top > ground) {
      if (crashes && !s.onGround && s.alt < top - 1 && s.speed > 8 * KT) {
        this.crash();
        return;
      }
      if (s.alt >= top - 2.5) {
        ground = top;
        onTop = true;
      }
    }
    let collective = c.throttle;
    let fwd = -c.pitch;
    let turn = c.roll;
    const ap = this.autopilot;
    if (ap && !s.onGround) {
      // Big map open: keep going the same way at the same height.
      fwd = 0;
      turn = clamp(angleDiff(ap.heading, s.heading) / 30, -1, 1);
      collective = clamp(0.5 + (ap.alt - s.alt) * 0.01, 0.1, 0.9);
    }
    if (!s.onGround && !inRegion(s.lat, s.lon, 0.06) && this.edgeTimer <= 0) {
      this.edgeTimer = 18;
      void this.say(LINES.edge, true);
    }
    if (this.edgeTimer > 0) {
      this.edgeTimer -= dt;
      const home = bearing(s, { lat: (REGION.north + REGION.south) / 2, lon: (REGION.east + REGION.west) / 2 });
      turn = clamp(angleDiff(home, s.heading) / 30, -1, 1);
    }
    const wasGround = s.onGround;
    const events = stepHeli(s, { collective, fwd, turn }, CHINOOK_PERF, { groundHeight: ground, cushion: !crashes }, dt);
    for (const e of events) {
      if (e.type === "liftoff") {
        const near = this.airportWithin(2000);
        this.freeFrom = near;
        if (near) this.takeoffFrom(near);
        this.sayOnce("heliLiftoff", LINES.heliLiftoff);
      }
      if (e.type === "touchdown") this.onHeliTouchdown(e.sinkFpm, e.speedKt, onTop);
    }
    if (!wasGround && !s.onGround) this.airborneTime += dt;
    this.checkFreeStops();
    if (!s.onGround && s.alt - ground < 3000) {
      for (const l of LANDMARKS) {
        if (!this.landmarksSaid.has(l.id) && distance(s, l) < 4000) {
          this.landmarksSaid.add(l.id);
          void this.say(tpl.landmark(l.spoken, l.fact));
        }
      }
    }
  }

  private airportWithin(m: number): Airport | null {
    const a = this.nearestAirport();
    return distance(this.s, a) < m ? a : null;
  }

  private onHeliTouchdown(sink: number, speedKt: number, onTop: boolean): void {
    const s = this.s;
    const crashes = this.d.crashes;
    const bounce = (line: Line) => {
      s.onGround = false;
      s.alt += 3;
      s.vs = 2;
      void this.say(line, true);
    };
    const water = this.d.world.cartoon?.landAt(s.lat, s.lon) === 1;
    if (water) {
      if (crashes) this.crash();
      else bounce(LINES.heliWater);
      return;
    }
    if (crashes && (sink > 900 || speedKt > 45)) {
      this.crash();
      return;
    }
    if (!onTop && !this.fieldOkHeli(s)) {
      if (crashes && (sink > 500 || speedKt > 25)) this.crash();
      else bounce(LINES.heliRough);
      return;
    }
    this.d.audio.sfx("thunk");
    const airport = this.airportWithin(2000);
    const hop = this.airborneTime < 15;
    this.airborneTime = s.onGround ? 0 : this.airborneTime;
    if (airport) {
      if (hop && this.landedAt === airport.code) return;
      const landing = sink < 120 ? "butter" : sink < 300 ? "smooth" : "firm";
      const stars = 1 + (sink < 300 ? 1 : 0) + (speedKt < 8 ? 1 : 0);
      this.d.hud.toast(landing === "butter" ? "BUTTER!" : landing === "smooth" ? "Smooth!" : "Firm!", "big");
      void this.say(LINES.heliLanded, true);
      void this.say(tpl.welcomeTo(airport.spoken));
      this.landedAt = airport.code;
      if (this.navTarget?.code === airport.code) this.setNavTarget(null);
      const from = this.freeFrom;
      this.freeFrom = null;
      const r = this.allRunways.find((x) => x.airport.code === airport.code) ?? null;
      this.arrival = r ? { airport, runway: r } : null;
      this.onLanded({ airport, stars, landing, from, distanceNm: from ? distance(from, airport) / NM : 0 });
      if (!r) {
        this.paused = true;
        this.onArrived(airport);
      }
      return;
    }
    // Anywhere else flat: a field landing. Small reward after a real flight (not a hop).
    this.d.hud.toast("Safe landing!", "big");
    void this.say(LINES.heliLanded, true);
    this.fieldStop = { earned: !hop };
    this.freeFrom = null;
  }

  /** Flat enough and clear enough for the Chinook's wheels (its rotors overhang, so obstacles count). */
  private fieldOkHeli(p: LatLon): boolean {
    const data = this.d.world.cartoon;
    if (data) {
      const h = (dx: number, dy: number) => data.height(p.lat + dy / 111320, p.lon + dx / (111320 * Math.cos(p.lat * DEG)));
      const c = h(0, 0);
      const slope = Math.max(Math.abs(h(15, 0) - c), Math.abs(h(-15, 0) - c), Math.abs(h(0, 15) - c), Math.abs(h(0, -15) - c)) / 15;
      if (slope > 0.12) return false;
    }
    return true;
  }

  /**
   * How real playnes slow down. In the air: idle power, then speedbrakes (jets). On the runway
   * with the power at idle: ground spoilers dump the lift, the reversers roar and the
   * autobrakes squeeze, just like an airliner's landing roll (and a rejected takeoff).
   */
  private slowingDown(cmd: Commands, landingZone: boolean, lever: number): void {
    const s = this.s;
    const p = this.p;
    const ias = indicated(s.speed, s.alt);
    if (s.onGround) {
      this.speedbrakeOut = false;
      // After a landing the autobrakes hold on all the way to a stop (lever near idle).
      if ((s.speed > 25 * KT || this.arrival || this.fieldStop) && (lever < 0.15 || this.fieldStop) && !this.autopilot) {
        cmd.brake = Math.max(cmd.brake, s.speed > 25 * KT ? 0.6 : 0.45);
        cmd.spoilers = 1;
        cmd.reverse = s.speed > 40 * KT;
        if (this.arrival || this.fieldStop) cmd.throttle = 0;
        if (!this.said.has("autobrake") && s.speed > 50 * KT) {
          this.said.add("autobrake");
          void this.say(p.reversers ? LINES.reversers : LINES.brakesOn);
        }
      }
      if (s.speed < 5 * KT) this.said.delete("autobrake");
      return;
    }
    // Fast on final: the co-pilot helps with the speedbrakes (and says so).
    if (landingZone && ias > p.vapp * 1.35) {
      if (!this.said.has("tooFast")) {
        this.said.add("tooFast");
        void this.say(p.speedbrakes ? LINES.tooFastBrakes : LINES.tooFast);
      }
      if (p.speedbrakes) this.speedbrakeOut = true;
    }
    if (!landingZone) this.said.delete("tooFast");
    // Pushing the power up puts the speedbrakes away, as on real jets.
    if (this.speedbrakeOut && (lever > 0.7 || (landingZone && ias < p.vapp * 1.1))) this.speedbrakeOut = false;
    cmd.spoilers = this.speedbrakeOut ? 1 : 0;
  }

  /** After takeoff: remind to raise the wheels and flaps (they add a lot of drag). */
  private freeFlightHints(agl: number): void {
    const s = this.s;
    if (this.timed) return;
    if (s.gearDown && !this.ac.shape.fixedGear && agl > 15 && agl < 600 && s.vs > 0) {
      this.hudPrompt("gear");
      return;
    }
    if (s.flaps > 0 && agl > 250 && (!s.gearDown || this.ac.shape.fixedGear) && s.vs > -1) {
      if (!this.said.has("freeFlapsUp")) {
        this.said.add("freeFlapsUp");
        void this.say(LINES.flapsUp);
      }
      this.hudPrompt("flaps");
      return;
    }
    this.hudPrompt(null);
  }

  /**
   * Could a playne land here? Flat (under ~5 degrees), dry, and clear of trees and buildings.
   */
  private fieldOk(p: LatLon): boolean {
    const data = this.d.world.cartoon;
    if (data) {
      if (data.landAt(p.lat, p.lon) === 1) return false;
      const h = (dx: number, dy: number) => data.height(p.lat + dy / 111320, p.lon + dx / (111320 * Math.cos(p.lat * DEG)));
      const c = h(0, 0);
      const slope = Math.max(Math.abs(h(40, 0) - c), Math.abs(h(-40, 0) - c), Math.abs(h(0, 40) - c), Math.abs(h(0, -40) - c)) / 40;
      if (slope > 0.09) return false;
    }
    const top = this.d.world.obstacleTop(p, this.ac.shape.span * 0.6);
    return top === null || top < this.s.alt - 1;
  }

  private onFreeTouchdown(sink: number, overRunway: boolean, near: { r: RunwayInUse; s: number; x: number } | null): void {
    const s = this.s;
    const gentle = sink < 700 && Math.abs(s.bank) < 15;
    if (!overRunway || !near) {
      // Off the runway: an emergency landing works on flat, open, dry ground.
      if (gentle && this.fieldOk(s)) {
        this.d.audio.sfx("thunk");
        this.d.hud.toast("Safe landing!", "big");
        void this.say(LINES.emergencyLanding, true);
        // The brakes bring it to a stop; then a pop-up offers what's next. A short hop
        // (under 20 s in the air) doesn't earn the reward again.
        this.fieldStop = { earned: this.airborneTime > 20 };
        this.airborneTime = 0;
        this.freeFrom = null;
        return;
      }
      if (this.d.crashes) this.crash();
      else {
        // Not a safe place: the co-pilot bounces us back up.
        s.onGround = false;
        s.alt += 2;
        s.vs = 3;
        s.gamma = 4;
      }
      return;
    }
    if (this.d.crashes && (sink > 900 || Math.abs(s.bank) > 25)) {
      this.crash();
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
    const from = this.freeFrom;
    this.freeFrom = null;
    // Which way did we land? Line up the same way for the next takeoff.
    const landedHdg = Math.abs(angleDiff(s.heading, near.r.heading)) < 90;
    this.arrival = { airport: near.r.airport, runway: landedHdg ? near.r : makeRunway(near.r.airport, near.r.other, near.r.end, near.r.hOther, near.r.hEnd) };
    this.onLanded({ airport: near.r.airport, stars, landing, from, distanceNm: from ? distance(from, near.r.airport) / NM : 0 });
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
    this.d.audio.startEngine(this.ac.kind);
    this.startFreeAt(this.nearestAirport());
  }

  private nearestAirport(): Airport {
    let best = AIRPORTS[0];
    for (const a of AIRPORTS) if (distance(this.s, a) < distance(this.s, best)) best = a;
    return best;
  }

  /** Free Flight, after an emergency landing: start again on the nearest airport's runway. */
  flyFromNearest(): void {
    this.d.audio.startEngine(this.ac.kind);
    this.startFreeAt(this.nearestAirport());
    this.paused = false;
  }

  /** Free Flight, after an emergency landing: carry on, taking off from the field. */
  continueFromField(): void {
    this.paused = false;
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
          this.hudPrompt(null);
          void this.say(LINES.gearDownGood).then(() => this.afterGearDown());
        } else if (!this.s.gearDown && this.timed?.prompt === "gear") {
          this.timed = null;
          this.hudPrompt(null);
          void this.say(LINES.gearUpGood).then(() => this.afterGearUp());
        }
        break;
      case "flaps-up":
        // Like a real flap lever: one notch up at a time, any time.
        if (this.s.flaps > 0) this.s.flaps--;
        break;
      case "speedbrake":
        if (!this.p.speedbrakes || this.s.onGround) return;
        this.speedbrakeOut = !this.speedbrakeOut;
        void this.say(this.speedbrakeOut ? LINES.speedbrakesOut : LINES.speedbrakesIn, true);
        break;
      case "flaps":
        // One notch down, unless we're faster than that notch allows (real flaps have a speed limit).
        if (this.s.flaps >= 3) return;
        if (!this.s.onGround && indicated(this.s.speed, this.s.alt) > this.flapLimit(this.s.flaps + 1)) {
          void this.say(LINES.tooFastFlaps, true);
          this.d.hud.flash("flaps");
          return;
        }
        this.s.flaps++;
        if (this.timed?.prompt === "flaps" && this.s.flaps >= 3) {
          this.timed = null;
          this.hudPrompt(null);
          void this.say(LINES.flapsGood);
        }
        break;
      case "camera":
        // Chase → cockpit → passenger window → chase.
        this.view.mode = this.view.mode === "chase" ? "cockpit" : this.view.mode === "cockpit" && this.ac.seats > 1 ? "window" : "chase";
        this.view.resetLook();
        break;
      case "help":
        this.onHelp();
        break;
      case "radio":
        // Only once the co-pilot has asked for the call.
        if (!this.radioReady) break;
        if (this.phase === "lineup") this.radioTakeoff();
        else if (this.phase === "approach") this.radioLanding();
        break;
      default:
        break;
    }
  }

  private takeoffFrom(a: Airport): void {
    const bonus = this.onTakeoff(a.code);
    if (bonus > 0) {
      setTimeout(() => {
        if (this.destroyed) return;
        this.d.hud.toast(`First takeoff from ${a.code}! +${bonus} Wings`, "good");
        void this.say(LINES.newTakeoff);
      }, 3500);
    }
  }

  /** Fastest indicated airspeed (m/s) allowed with this flap notch out (like a real Vfe). */
  private flapLimit(notch: number): number {
    return this.p.vapp * ([Infinity, 1.7, 1.5, 1.33][notch] ?? Infinity);
  }

  /** Flaps out while going much too fast: bring them up a notch (flap load relief). */
  private flapRelief(): void {
    const s = this.s;
    if (s.onGround || s.flaps === 0) return;
    if (indicated(s.speed, s.alt) > this.flapLimit(s.flaps) * 1.08) {
      s.flaps--;
      this.sayOnce(`flapRelief${Math.floor(this.time / 20)}`, LINES.flapsRelief);
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

  private radioAsked = false;

  private radioLanding(): void {
    if (this.landingCleared || !this.arr) return;
    this.landingCleared = true;
    this.setRadio(false);
    if (this.timed?.prompt === "radio") {
      this.timed = null;
      this.hudPrompt(null);
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
        this.hudPrompt(null);
      } else if (this.time - this.timed.started > this.timed.timeout) {
        const t = this.timed;
        this.timed = null;
        this.hudPrompt(null);
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
    // On a runway: the offline worlds draw their own flat runway, so use its exact height.
    // Google / Cesium ion show the real runway in their own data: sit on what's really there
    // (measured below), unless that measurement is way off (e.g. it hit a parked airplane).
    let runwayPlane: number | null = null;
    for (const r of [this.dep, this.arr, ...this.allRunways]) {
      if (r && onRunwayArea(r, p)) {
        runwayPlane = runwayHeight(r, runwayCoords(r, p).s) + (this.runwayPrims.length ? RUNWAY_LIFT : 0);
        break;
      }
    }
    const drawsRunways = this.d.world.kind === "cartoon" || this.d.world.kind === "basic";
    if (runwayPlane !== null && drawsRunways) return runwayPlane;
    // Re-read every few frames, or right away if the playne has jumped (resume, respawn, line-up):
    // a stale height from somewhere else could put the ground above the playne.
    const gc = this.groundCache;
    const moved = gc.valid ? Math.abs(p.lat - gc.lat) * 111320 + Math.abs(p.lon - gc.lon) * 91000 : Infinity;
    if (this.frame - gc.frame >= 6 || !gc.valid || moved > 200) {
      const h = this.d.world.groundHeight(p);
      this.groundCache.frame = this.frame;
      gc.lat = p.lat;
      gc.lon = p.lon;
      if (h !== undefined && Number.isFinite(h)) {
        this.groundCache.h = h;
        this.groundCache.valid = true;
      }
    }
    if (runwayPlane !== null) return this.groundCache.valid && Math.abs(this.groundCache.h - runwayPlane) < 12 ? this.groundCache.h : runwayPlane;
    if (this.groundCache.valid) return this.groundCache.h;
    const near = this.arr && distance(p, this.arr.end) < distance(p, this.dep.end) ? this.arr : this.dep;
    return runwayHeight(near, 0);
  }

  private updatePhysics(dt: number): void {
    const s = this.s;
    const c = this.d.controls.state;
    const p = this.p;
    // Solo: the player flies up and down too (no co-pilot holding the climb or glide path).
    const level = this.solo ? Math.max(2, this.d.assistLevel) : this.d.assistLevel;
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
      autoFlare: level <= 3 && !this.solo,
      groundHeading: null,
      wantRotate: false,
      autoRotate: false,
      // Flight school keeps turns gentle; charters allow a normal steep turn.
      maxBank: this.mission.kind === "lesson" ? 30 : 45,
    };
    let throttle: number | null = c.throttle;
    let brake = c.brake;

    const hoop = this.hoops[this.hoopIndex];
    if (hoop && !s.onGround) {
      const dist = distance(s, hoop.pos);
      const prev = this.hoopIndex > 0 ? this.hoops[this.hoopIndex - 1] : null;
      const hg = hoopGuidance(s, s.speed, hoop, prev);
      g.targetHeading = hg.heading;
      g.courseBank = hg.bank;
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
        // Hold one steady (slow) speed for the whole course.
        g.targetSpeed = this.lessonIas;
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
        if (distAim < 2600 && !this.landingCleared && !this.timed && !this.radioAsked) {
          this.radioAsked = true;
          void this.say(LINES.radioPrompt).then(() => {
            if (this.destroyed || this.phase !== "approach" || this.landingCleared) return;
            this.setRadio(true);
            this.ask("radio", 7, () => this.landingCleared, () => this.radioLanding());
          });
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

    if (this.solo && !s.onGround) {
      // No hands-off steering toward hoops or the runway, and letting go holds level flight.
      g.targetHeading = null;
      g.courseBank = undefined;
      if (this.phase === "approach" || this.hoops.length) g.targetVs = 0;
    }
    const cmd = computeCommands(level, { roll: c.roll, pitch: c.pitch, throttle, brake }, g, s, p, this.mem, dt);
    if (this.phase === "lineup") cmd.throttle = 0;
    if (this.phase !== "cruise" && this.phase !== "toCruise") this.flapRelief();
    if (this.phase === "rollout") {
      cmd.throttle = 0;
      cmd.spoilers = 1;
      cmd.reverse = s.speed > 40 * KT;
    }
    this.lastCmd = { targetBank: cmd.targetBank, targetVs: cmd.targetVs };
    const events = step(s, cmd, p, { groundHeight: ground }, dt);

    for (const e of events) {
      if (e.type === "liftoff") this.onLiftoff();
      if (e.type === "touchdown") this.onTouchdown(e.sinkFpm);
    }

    this.checkHoops();
    this.phaseLogic();
  }

  private autoRotate = false;

  private onLiftoff(): void {
    this.setPhase("climb");
    this.takeoffFrom(this.dep.airport);
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
    this.result.hoopsTotal++;
    if (passed) this.result.hoopsPassed++;
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
      this.hudPrompt(null);
      return;
    }
    const err = angleDiff(bearing(this.s, h.pos), this.s.heading);
    if (Math.abs(err) > 25) this.hudPrompt(err < 0 ? "steer-left" : "steer-right");
    else this.hudPrompt(null);
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
    // Never let the camera fly through a hoop (it would fill the screen with a yellow flash).
    for (const h of this.hoops) {
      if (!h.model || !h.model.show || h.state === "ahead") continue;
      const d = Math.hypot(distance(cam, h.pos), cam.height - h.alt);
      if (d < h.radius * 1.6) h.model.show = false;
    }
    // Cloud deck follows the camera; scroll the pattern to show speed.
    if (this.phase === "cruise" || this.phase === "toCruise") {
      const v = this.ac.cruiseKt * KT * 1.3 * dt;
      this.clouds.update(cam, this.cruise.cloudTop, Math.sin(s.heading * DEG) * v, Math.cos(s.heading * DEG) * v);
    }
  }

  private updateCockpit(): void {
    const s = this.s;
    const inside = this.view.mode === "cockpit";
    if (this.cockpit.visible !== inside) this.cockpit.show(inside);
    const pax = this.view.mode === "window";
    if (this.paxWindow.visible !== pax) this.paxWindow.show(pax);
    if (this.view.model) this.view.model.show = !inside;
    if (!inside) return;
    const ref = this.arr && this.cruiseProgressFraction() > 0.5 ? this.arr : this.dep;
    this.cockpit.update({
      iasKt: indicated(s.speed, s.alt) / KT,
      altFt: this.phase === "cruise" ? this.ac.cruiseAltFt + this.cruise.altOffset / FT : (s.alt + ref.mslOffset) / FT,
      heading: s.heading,
      pitch: s.pitch,
      bank: s.bank,
      vsFpm: (s.vs / FT) * 60,
      throttle: s.throttle,
      flaps: s.flaps,
      gearDown: s.gearDown,
      fixedGear: this.ac.shape.fixedGear,
    });
  }

  private updateHud(): void {
    this.updateCockpit();
    const s = this.s;
    if (this.mission.kind === "sandbox") this.d.hud.updateMaps({ pos: s, heading: s.heading, target: this.navTarget });
    const ref = this.arr && this.cruiseProgressFraction() > 0.5 ? this.arr : this.dep;
    const altFt = (s.alt + ref.mslOffset) / FT;
    const inCruise = this.phase === "cruise";
    // Above the ground right below: shown in the air within 2,500 ft of it (not in the
    // charter's fast-forwarded cruise, which flies at a pretend height).
    const aglFt = (s.alt - this.groundHeightAt(s)) / FT;
    const showAgl = !s.onGround && !inCruise && this.phase !== "crashed" && aglFt < 2500;
    this.d.hud.update({
      speedKt: indicated(s.speed, s.alt) / KT,
      groundKt: s.speed * Math.cos(s.gamma * DEG) / KT,
      altFt: inCruise ? this.ac.cruiseAltFt + this.cruise.altOffset / FT : altFt,
      aglFt: showAgl ? Math.max(0, aglFt) : null,
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
      hoopsLeft: this.hoops.length ? this.hoops.length - this.hoopIndex : null,
      airbrake: this.p.speedbrakes ? this.speedbrakeOut : null,
      cruiseAltFt: this.ac.cruiseAltFt,
      flapLimitsKt: [1, 2, 3].map((n) => this.flapLimit(n) / KT),
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
    this.hudPrompt(null);
    if (line) await this.say(line);
    if (this.mission.kind === "lesson") await this.say(LINES.lessonDone);
    if (!this.destroyed) this.onDone(this.result);
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  destroy(): void {
    this.destroyed = true;
    this.cockpit.el.remove();
    this.paxWindow.el.remove();
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
    for (const p of this.runwayPrims) this.d.world.widget.scene.primitives.remove(p);
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
