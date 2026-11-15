// Playnes entry point: boots the world, menus, flights and saving.
import "./cesium-base.ts";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles.css";

import { Cartesian3, Math as CMath } from "cesium";
import { aircraftById } from "./data/aircraft.ts";
import { airportByCode, type Airport } from "./data/airports.ts";
import { LINES, type Line } from "./data/lines.ts";
import { Audio } from "./audio/audio.ts";
import { FlightSession, type FlightResult, type FreeLanding, type FreeSnapshot, type Mission } from "./game/flight.ts";
import { charterKey, charterPlaneId, charterRewards, freeLandingRewards, landingRewards, loadProgress, ringRewards, takeoffBonus, total, requestPersistence, saveProgress, type Progress, type Reward } from "./game/progress.ts";
import { googleKey, ionToken, loadSettings, resolveWorld, saveSettings, type Settings } from "./game/settings.ts";
import { Controls } from "./input/controls.ts";
import { destination } from "./sim/geo.ts";
import { Hud } from "./ui/hud.ts";
import { TOUR } from "./ui/tour.ts";
import { LESSONS, Screens, type ScreenHost } from "./ui/screens.ts";
import { createWorld, setGraphicsRecoveredHandler, type World } from "./world/world.ts";

const app = document.getElementById("app") as HTMLElement;

// iPad Safari ignores "user-scalable=no" in the browser, so stop pinch and double-tap zoom
// ourselves (quick taps on the yoke, throttle and buttons would otherwise zoom the page).
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = performance.now();
    // A second tap within 300 ms is what Safari treats as "double-tap to zoom".
    if (now - lastTouchEnd < 300 && e.touches.length === 0) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
const worldEl = document.getElementById("world") as HTMLElement;

class Game implements ScreenHost {
  progress: Progress = loadProgress();
  settings: Settings = loadSettings();
  worldKind = "basic";
  audio = new Audio();
  controls = new Controls();
  hud: Hud;
  screens: Screens;
  world: World | null = null;
  flight: FlightSession | null = null;
  lastMission: Mission | null = null;
  sessionStart = performance.now();
  freeSave: FreeSnapshot | null = loadFreeSave();
  /** Playne of the current flight, and bonuses already paid during it. */
  private flightPlane = "c172";
  private flightBonuses: Reward[] = [];
  private lastFreeSave = 0;
  private orbit = 0;
  private frameErrors = 0;
  private lastFrame = performance.now();

  constructor() {
    this.hud = new Hud(app, this.controls);
    this.screens = new Screens(app, this);
    this.screens.onParent = () => this.openParent();
    this.audio.onCaption = (l) => this.hud.setCaption(l);
    this.audio.volume = this.settings.volume;
    this.applyControlSettings();
    this.controls.on((e) => {
      if (e === "pause" && this.flight) this.togglePause();
    });
    void this.audio.init();
    setGraphicsRecoveredHandler((msg) => this.hud.toast(msg, "info"));
    this.screens.title(() => void this.begin());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.flight && !this.flight.paused) this.togglePause();
    });
  }

  private applyControlSettings(): void {
    this.controls.tiltEnabled = this.settings.tilt;
    this.controls.invertPitch = this.settings.invertPitch;
    this.controls.tiltFlipPitch = this.settings.tiltFlipPitch;
  }

  async begin(): Promise<void> {
    this.audio.unlock();
    if (this.settings.tilt) await Controls.requestMotionPermission();
    void requestPersistence();
    this.screens.loading("Getting the airport ready...");
    await this.loadWorld();
    this.say(LINES.welcome);
    this.screens.home();
  }

  private async loadWorld(): Promise<void> {
    this.world?.destroy();
    this.world = null;
    let kind = resolveWorld(this.settings);
    if (kind !== "basic" && !navigator.onLine) kind = "basic";
    try {
      this.world = await createWorld(worldEl, kind, { googleKey: googleKey(this.settings), ionToken: ionToken(this.settings), quality: this.settings.quality });
    } catch (err) {
      console.warn("World failed to load, using the simple globe", err);
      this.world?.destroy();
      this.world = await createWorld(worldEl, "basic", { quality: this.settings.quality });
      kind = "basic";
    }
    this.worldKind = kind;
    this.world.widget.scene.preUpdate.addEventListener(() => {
      // A bug in game code must never stop the 3D view from rendering.
      try {
        this.frame();
      } catch (err) {
        this.frameErrors++;
        if (this.frameErrors < 5) console.error("frame error", err);
        recordFrameError(err);
      }
    });
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.flight) {
      this.flight.update(dt);
      // Keep a Free Flight saved every few seconds, so it survives leaving or closing the app.
      if (now - this.lastFreeSave > 5000) {
        this.lastFreeSave = now;
        this.storeFreeSave(this.flight.snapshot());
      }
      return;
    }
    // Menu background: slowly circle the current airport.
    if (!this.world) return;
    this.orbit += dt * 4;
    const ap = airportByCode(this.progress.currentAirport);
    const flat = this.worldKind === "basic";
    const range = flat ? 9000 : 2600;
    const eyeLL = destination(ap, this.orbit, range);
    const eyeH = (flat ? 0 : ap.elevFt * 0.3048) + (flat ? 5000 : 900);
    this.world.updateScenery(ap, ap.elevFt * 0.3048, 900);
    const eye = Cartesian3.fromDegrees(eyeLL.lon, eyeLL.lat, eyeH);
    this.world.widget.scene.camera.setView({
      destination: eye,
      orientation: { heading: CMath.toRadians(this.orbit + 180), pitch: CMath.toRadians(flat ? -35 : -18), roll: 0 },
    });
  }

  // ----- ScreenHost -----

  say(line: Line, interrupt = false): void {
    void this.audio.say(line, { interrupt });
  }

  sfx(name: "click" | "cash" | "star" | "ding"): void {
    this.audio.sfx(name);
  }

  saveProgress(): void {
    saveProgress(this.progress);
  }

  saveSettings(reloadWorld: boolean): void {
    saveSettings(this.settings);
    this.audio.setVolume(this.settings.volume);
    this.applyControlSettings();
    if (this.settings.tilt) void Controls.requestMotionPermission();
    if (reloadWorld) {
      this.screens.loading("Changing the world map...");
      void this.loadWorld().then(() => this.screens.home());
    }
  }

  startMission(m: Mission): void {
    if (!this.world) return;
    if (this.breakDue()) return;
    this.lastMission = m;
    this.screens.loading(m.kind === "charter" ? `Flying to ${airportByCode(m.to).spoken}...` : m.kind === "sandbox" ? "Getting ready for free flight..." : "Heading to the runway...");
    const planeId = m.kind === "lesson" ? "c172" : m.kind === "sandbox" ? (m.resume ? m.resume.aircraft : this.progress.selectedPlane) : charterPlaneId(this.progress);
    const ac = aircraftById(planeId);
    const flight = new FlightSession(
      { world: this.world, audio: this.audio, controls: this.controls, hud: this.hud, aircraft: ac, assistLevel: this.settings.assistLevel, crashes: this.settings.crashes, autoSpeed: this.settings.freeAutoSpeed, solo: m.kind === "charter" && this.settings.soloCharters !== false && this.progress.chartersDone.includes(charterKey(m.from, m.to)) },
      m,
    );
    this.flight = flight;
    flight.onDone = (r) => this.finishFlight(r);
    flight.onLanded = (l) => this.freeLanding(l);
    flight.onTakeoff = (code) => this.takeoff(code);
    flight.onArrived = (a) => this.showArrival(a);
    flight.onHelp = () => void this.showTour();
    this.flightPlane = ac.id;
    this.flightBonuses = [];
    flight
      .start()
      .then(() => flight.settleGround())
      .then(() => {
        if (this.flight !== flight) return;
        this.screens.hide();
        // First flight ever: show what everything on the screen does.
        if (!this.progress.tourDone && !(m.kind === "sandbox" && m.resume)) {
          void this.showTour();
          return;
        }
        // A resumed Free Flight starts paused, so the pilot can get ready.
        if (m.kind === "sandbox" && m.resume) this.togglePause();
      })
      .catch((err) => {
        console.error(err);
        this.endFlight();
        this.screens.home();
      });
  }

  completeLesson1(): void {
    const reward = this.markLesson("l1");
    this.screens.debrief({ mission: { kind: "lesson", lesson: "l2", airport: this.progress.currentAirport }, completed: true, stars: 0, landing: null, sinkFpm: null, centerline: false, zone: false, distanceNm: 0, hoopsPassed: 0, hoopsTotal: 0 }, reward, false, () => this.screens.school(), () => this.screens.home());
  }

  // ----- flights -----

  private markLesson(id: string): Reward[] {
    const p = this.progress;
    const first = !p.lessonsDone.includes(id);
    if (first) p.lessonsDone.push(id);
    const wings = first ? (id === "l5" ? 50 : 25) : 5;
    p.wings += wings;
    const title = LESSONS.find((l) => l.id === id)?.title ?? "Lesson";
    this.saveProgress();
    return [{ label: `${first ? "" : "Practice: "}${title}`, wings }];
  }

  private finishFlight(r: FlightResult): void {
    const p = this.progress;
    let rewards: Reward[] = [];
    let newStamp = false;
    if (r.mission.kind === "charter" && r.completed) {
      newStamp = !p.airportsVisited.includes(r.mission.to);
      rewards = charterRewards({
        from: r.mission.from,
        to: r.mission.to,
        distanceNm: r.distanceNm,
        seats: aircraftById(this.flightPlane).seats,
        stars: r.stars,
        butter: r.landing === "butter",
        newLanding: newStamp,
      });
      if (newStamp) p.airportsVisited.push(r.mission.to);
      // Next time on this route: solo (no tips or co-pilot help).
      const key = charterKey(r.mission.from, r.mission.to);
      if (!p.chartersDone.includes(key)) p.chartersDone.push(key);
      p.currentAirport = r.mission.to;
      p.flights++;
      if (r.landing === "butter") p.butterLandings++;
      p.wings += total(rewards);
      this.saveProgress();
    } else if (r.mission.kind === "lesson") {
      rewards = this.markLesson(r.mission.lesson);
      const rings = ringRewards(r.hoopsPassed, r.hoopsTotal);
      if (rings.length) {
        rewards.push(...rings);
        p.wings += total(rings);
        this.saveProgress();
      }
      if (r.landing) {
        // Good landings pay in lessons too (same as charters).
        const extra = landingRewards(r.stars, r.landing === "butter");
        rewards.push(...extra);
        p.wings += extra.reduce((a, b) => a + b.wings, 0);
        if (r.landing === "butter") p.butterLandings++;
        this.saveProgress();
      }
    }
    // Takeoff bonuses were paid at liftoff; list them too.
    rewards.push(...this.flightBonuses);
    this.endFlight();
    const graduatedNow = !p.graduated && LESSONS.every((l) => p.lessonsDone.includes(l.id));
    if (graduatedNow) {
      p.graduated = true;
      if (!p.planes.includes("phenom100")) p.planes.push("phenom100");
      p.selectedPlane = "phenom100";
      this.saveProgress();
    }
    const again = () => (this.lastMission?.kind === "charter" ? this.screens.charters() : this.screens.school());
    this.screens.debrief(r, rewards, newStamp, graduatedNow ? () => this.screens.graduation(() => this.screens.hangar()) : again, graduatedNow ? () => this.screens.graduation(() => this.screens.hangar()) : () => this.screens.home());
    this.say(LINES.wingsEarned);
    if (newStamp) this.say(LINES.newStamp);
  }

  /** Free Flight: landing at an airport stamps the passport and pays a little. */
  private freeLanding(l: FreeLanding): void {
    const p = this.progress;
    const first = !p.airportsVisited.includes(l.airport.code);
    const rewards = freeLandingRewards({
      from: l.from?.code ?? null,
      to: l.airport.code,
      distanceNm: l.distanceNm,
      stars: l.stars,
      butter: l.landing === "butter",
      newLanding: first,
    });
    if (first) {
      p.airportsVisited.push(l.airport.code);
      setTimeout(() => this.say(LINES.newStamp), 2500);
    }
    const wings = total(rewards);
    p.wings += wings;
    p.currentAirport = l.airport.code;
    if (l.landing === "butter") p.butterLandings++;
    this.saveProgress();
    const trip = l.from && l.from.code !== l.airport.code ? ` · ${Math.round(l.distanceNm)} nm trip` : "";
    setTimeout(() => this.hud.toast(`+${wings} Wings${trip}${first ? " · new stamp!" : ""}`, "good"), 2800);
  }

  /** First takeoff from an airport (any mode): one-time bonus. */
  private takeoff(code: string): number {
    const bonus = takeoffBonus(this.progress, code);
    if (bonus > 0) {
      this.flightBonuses.push({ label: `First takeoff from ${code}`, wings: bonus });
      this.saveProgress();
    }
    return bonus;
  }

  storeFreeSave(snap: FreeSnapshot | null): void {
    if (!snap) return;
    this.freeSave = snap;
    try {
      localStorage.setItem(FREE_SAVE_KEY, JSON.stringify(snap));
    } catch {
      /* storage unavailable */
    }
  }

  clearFreeSave(): void {
    this.freeSave = null;
    try {
      localStorage.removeItem(FREE_SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private endFlight(): void {
    if (this.flight) this.storeFreeSave(this.flight.snapshot());
    this.flight?.destroy();
    this.flight = null;
    this.hidePause();
  }

  private breakDue(): boolean {
    const mins = this.settings.sessionMinutes;
    if (!mins) return false;
    if ((performance.now() - this.sessionStart) / 60000 < mins) return false;
    this.screens.breakTime(() => {
      this.sessionStart = performance.now();
      this.screens.home();
    });
    return true;
  }

  // ----- pause -----

  private pauseEl: HTMLElement | null = null;

  private togglePause(): void {
    if (!this.flight || this.touring) return;
    if (this.pauseEl?.classList.contains("arrival")) return;
    if (this.flight.paused) return this.hidePause();
    this.flight.setPaused(true);
    this.audio.stopVoice();
    const el = document.createElement("div");
    el.className = "pause-overlay";
    const free = this.flight.mission.kind === "sandbox";
    el.innerHTML = `<div class="pause-card"><h1>Paused</h1>${free ? '<p class="pause-note">Your free flight is saved. You can come back to it from the Free Flight menu.</p>' : ""}<div class="pause-actions"><button type="button" class="btn secondary" data-a="home">${free ? "Save &amp; go home" : "Go home"}</button><button type="button" class="btn primary" data-a="go">Keep flying</button></div></div>`;
    el.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("button")?.dataset.a;
      if (a === "go") this.hidePause();
      if (a === "home") {
        this.endFlight();
        this.screens.home();
      }
    });
    app.append(el);
    this.pauseEl = el;
  }

  /** Interface tour (paused while it runs). */
  private touring = false;
  private async showTour(): Promise<void> {
    const flight = this.flight;
    if (!flight || this.touring || this.pauseEl) return;
    this.touring = true;
    flight.setPaused(true);
    this.audio.stopVoice();
    await this.hud.runTour(TOUR, (line) => void this.audio.say(line, { interrupt: true }));
    this.audio.stopVoice();
    this.touring = false;
    this.progress.tourDone = true;
    this.saveProgress();
    if (this.flight === flight && !this.pauseEl) flight.setPaused(false);
  }

  /** Free Flight: stopped safely on the runway. Welcome, and what next? */
  private showArrival(a: Airport): void {
    const flight = this.flight;
    if (!flight) return;
    this.pauseEl?.remove();
    const el = document.createElement("div");
    el.className = "pause-overlay arrival";
    el.innerHTML = `<div class="pause-card"><div class="arrival-icon">${a.icon}</div><h1>Welcome to ${a.spoken}!</h1><p class="pause-note">You landed safely at ${a.name}. What would you like to do next?</p><div class="pause-actions arrival-actions"><button type="button" class="btn secondary" data-a="home">Go home</button><button type="button" class="btn secondary" data-a="pick">Pick another airport</button><button type="button" class="btn primary" data-a="again">Fly again from here</button></div></div>`;
    el.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("button")?.dataset.a;
      if (!act) return;
      this.audio.sfx("click");
      el.remove();
      this.pauseEl = null;
      if (act === "again") {
        flight.flyAgainFromHere();
        return;
      }
      // The trip is over: no "keep flying" save for it.
      this.endFlight();
      this.clearFreeSave();
      if (act === "pick") this.screens.freeFlight();
      else this.screens.home();
    });
    app.append(el);
    this.pauseEl = el;
  }

  private hidePause(): void {
    this.pauseEl?.remove();
    this.pauseEl = null;
    this.flight?.setPaused(false);
  }

  // ----- parent corner -----

  private openParent(): void {
    this.screens.parentGate(
      () => this.screens.parentCorner(() => this.screens.home()),
      () => this.screens.home(),
    );
  }
}

const FREE_SAVE_KEY = "playnes.freeSave.v1";

function loadFreeSave(): FreeSnapshot | null {
  try {
    const raw = localStorage.getItem(FREE_SAVE_KEY);
    const snap = raw ? (JSON.parse(raw) as FreeSnapshot) : null;
    return snap && snap.v === 1 && Number.isFinite(snap.lat) ? snap : null;
  } catch {
    return null;
  }
}

function recordFrameError(err: unknown): void {
  try {
    const msg = err instanceof Error ? `${err.name}: ${err.message} @ ${(err.stack ?? "").split("\n")[1]?.trim() ?? ""}` : String(err);
    localStorage.setItem("playnes.lastFrameError", msg.slice(0, 400));
  } catch {
    /* storage unavailable */
  }
}

const game = new Game();
(window as unknown as { playnes: Game }).playnes = game;

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((reg) => reg.update())
      .catch(() => {});
    // When a new version's service worker takes over, reload once to run the new code
    // (only from the title screen, never mid-flight).
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded || game.flight) return;
      reloaded = true;
      location.reload();
    });
  });
}
