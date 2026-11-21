// Playnes entry point: boots the world, menus, flights and saving.
import "./testCopy.ts";
import "./cesium-base.ts";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles.css";

import { Cartesian3, Math as CMath } from "cesium";
import { aircraftById, isHelicopter } from "./data/aircraft.ts";
import { airportByCode, type Airport } from "./data/airports.ts";
import { LINES, type Line } from "./data/lines.ts";
import { Audio } from "./audio/audio.ts";
import { FlightSession, type FlightResult, type FreeLanding, type FreeSnapshot, type Mission } from "./game/flight.ts";
import { charterKey, charterPlaneId, charterRewards, freeLandingRewards, landedBefore, landingRewards, loadProgress, recordLanding, REWARDS, ringRewards, takeoffBonus, total, requestPersistence, saveProgress, type Progress, type Reward } from "./game/progress.ts";
import { googleKey, ionToken, loadSettings, resolveWorld, saveSettings, type Settings } from "./game/settings.ts";
import { Controls } from "./input/controls.ts";
import { destination } from "./sim/geo.ts";
import { Hud } from "./ui/hud.ts";
import { ICONS } from "./ui/icons.ts";
import { HELI_TOUR, TOUR } from "./ui/tour.ts";
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
// Full screen (iPad Safari): a downward swipe the page doesn't use (dragging the yoke or lever
// down, pulling down on a menu that's already at the top) makes Safari leave full screen.
// While full screen, keep those swipes in the game; real scrolling of a menu still works.
let touchStartY = 0;
document.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
}, { passive: true });
const isFullscreen = () => !!(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement);
function canScroll(target: EventTarget | null, dy: number): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
      // Finger moving down = scrolling up: only if not already at the top (and vice versa).
      return dy > 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    }
  }
  return false;
}
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) {
    e.preventDefault();
    return;
  }
  if (isFullscreen()) {
    const dy = e.touches[0].clientY - touchStartY;
    if (!canScroll(e.target, dy)) e.preventDefault();
  }
}, { passive: false });
const worldEl = document.getElementById("world") as HTMLElement;

class Game implements ScreenHost {
  progress: Progress = loadProgress();
  settings: Settings = loadSettings();
  worldKind = "basic";
  /** Why a chosen map didn't load (shown in grown-up settings). */
  worldNote = "";
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
    this.worldNote = "";
    this.world?.destroy();
    this.world = null;
    let kind = resolveWorld(this.settings);
    if (kind !== "basic" && !navigator.onLine) kind = "basic";
    try {
      this.world = await createWorld(worldEl, kind, { googleKey: googleKey(this.settings), ionToken: ionToken(this.settings), quality: this.settings.quality });
    } catch (err) {
      console.warn("World failed to load, using the simple globe", err);
      const msg = err instanceof Error ? err.message : String(err);
      // Google says exactly why it refused (blocked website, API not enabled, billing...): ask it.
      const why = kind === "google" ? await googleRefusal(googleKey(this.settings)) : "";
      this.worldNote = `${kind === "google" ? "Google" : "Cesium ion"} didn't load (${msg.slice(0, 160)}), so the offline map is showing.${why ? ` Google says: "${why}"` : kind === "google" ? " Check the key, that the Map Tiles API is enabled, and that the key allows this website." : ""}`;
      this.world?.destroy();
      this.world = await createWorld(worldEl, "basic", { quality: this.settings.quality });
      kind = "basic";
    }
    this.worldKind = this.world.kind;
    this.world.setClouds(this.settings.clouds !== false);
    this.world.widget.scene.preUpdate.addEventListener(() => {
      // A bug in game code must never stop the 3D view from rendering.
      this.cpuStart = performance.now();
      try {
        this.frame();
        this.gameMs = performance.now() - this.cpuStart;
      } catch (err) {
        this.frameErrors++;
        if (this.frameErrors < 5) console.error("frame error", err);
        recordFrameError(err);
      }
    });
    // Processor time per frame (game + map work, up to handing the picture to the graphics
    // chip). Much less than the frame time means the graphics chip is the bottleneck.
    this.world.widget.scene.postRender.addEventListener(() => {
      if (this.settings.perfStats && this.cpuStart) this.perfCpu.push([performance.now() - this.cpuStart, this.gameMs]);
    });
  }

  // ----- optional performance readout -----
  private perfEl: HTMLElement | null = null;
  private perfAt = 0;
  private perfStart = 0;
  private perfFrames: number[] = [];
  /** Last 10 s of frame times (ms, not capped) for the low frame rate and hitch count. */
  private perfRecent: { t: number; ms: number }[] = [];
  private perfCpu: [number, number][] = [];
  private cpuStart = 0;
  private gameMs = 0;

  private updatePerf(now: number, frameMs: number): void {
    if (!this.settings.perfStats || !this.world) {
      this.perfEl?.remove();
      this.perfEl = null;
      return;
    }
    this.perfFrames.push(frameMs);
    this.perfRecent.push({ t: now, ms: frameMs });
    while (this.perfRecent.length && now - this.perfRecent[0].t > 10_000) this.perfRecent.shift();
    if (now - this.perfAt < 1000) return;
    this.perfAt = now;
    if (!this.perfEl) {
      this.perfEl = document.createElement("pre");
      this.perfEl.className = "perf-stats";
      document.body.append(this.perfEl);
      this.perfStart = now;
    }
    const f = this.perfFrames.sort((a, b) => a - b);
    this.perfFrames = [];
    const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
    // Lowest frame rate = the single slowest frame in the last 10 s (a menu or a hidden tab
    // over a second doesn't count); hitches = frames slower than 50 ms (a visible stutter).
    const recent = this.perfRecent.filter((r) => r.ms < 1000);
    const slowest = recent.reduce((m, r) => Math.max(m, r.ms), 0);
    const hitches = recent.filter((r) => r.ms > 50).length;
    const cpu = this.perfCpu.splice(0);
    const cpuAvg = cpu.length ? cpu.reduce((a, c) => a + c[0], 0) / cpu.length : 0;
    const cpuMax = cpu.reduce((m, c) => Math.max(m, c[0]), 0);
    const gameAvg = cpu.length ? cpu.reduce((a, c) => a + c[1], 0) / cpu.length : 0;
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const mins = Math.floor((now - this.perfStart) / 60000);
    const secs = Math.floor(((now - this.perfStart) / 1000) % 60);
    const lines = [
      `${avg ? Math.round(1000 / avg) : 0} fps  low ${slowest ? Math.round(1000 / slowest) : 0} fps  hitches ${hitches} (10 s)  ${mins}:${String(secs).padStart(2, "0")}  ${this.world.kind}`,
      `frame ${avg.toFixed(0)} ms  slowest ${Math.round(slowest)}  cpu ${cpuAvg.toFixed(0)} (max ${Math.round(cpuMax)}, game ${gameAvg.toFixed(0)})`,
      ...(this.world.perfStats ? [this.world.perfStats()] : []),
      ...(heap ? [`js ${Math.round(heap / 1048576)} MB`] : []),
      // Which version is running (the offline cache can keep an older one for a launch).
      `version ${typeof __BUILD__ === "string" ? __BUILD__.split(" ")[0] : "?"}`,
    ];
    this.perfEl.textContent = lines.join("\n");
  }

  private frame(): void {
    const now = performance.now();
    const rawMs = now - this.lastFrame;
    const dt = Math.min(0.1, rawMs / 1000);
    this.lastFrame = now;
    if (this.flight) {
      this.flight.update(dt);
      this.updatePerf(now, rawMs);
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
    this.world?.setClouds(this.settings.clouds !== false);
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
      { world: this.world, audio: this.audio, controls: this.controls, hud: this.hud, aircraft: ac, assistLevel: this.settings.assistLevel, crashes: this.settings.crashes, autoSpeed: this.settings.freeAutoSpeed, solo: m.kind === "charter" && this.settings.soloCharters !== false && landedBefore(this.progress, m.to), firstLanding: (code) => !this.progress.freeLandedAt.includes(code), freeHelp: this.settings.freeLandingHelp === true, realControls: this.settings.realControls === true, realStalls: this.settings.realStalls === true, realism: this.settings.realism === true, wind: this.settings.wind ?? "off", freeTips: this.settings.freeTips === true },
      m,
    );
    this.flight = flight;
    flight.onDone = (r) => this.finishFlight(r);
    flight.onLanded = (l) => this.freeLanding(l);
    flight.onTakeoff = (code) => this.takeoff(code);
    flight.onArrived = (a) => this.showArrival(a);
    flight.onFieldStop = (a, earned) => this.showFieldStop(a, earned);
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
        // First flight in the Chinook: how a helicopter flies.
        if (isHelicopter(ac) && !this.progress.heliTourDone && !(m.kind === "sandbox" && m.resume)) {
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
      const key = charterKey(r.mission.from, r.mission.to);
      if (!p.chartersDone.includes(key)) p.chartersDone.push(key);
      // Next charter to this airport: solo (no rings, tips or co-pilot help).
      recordLanding(p, r.mission.to, false);
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
    recordLanding(p, l.airport.code, true);
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
    this.perfEl?.remove();
    this.perfEl = null;
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
    const heli = isHelicopter(aircraftById(this.flightPlane));
    // The first time ever, the general tour comes first; the Chinook's own tour after it.
    const steps = heli && this.progress.tourDone ? HELI_TOUR : heli ? [...TOUR.filter((st) => st.target !== ".yoke" && st.target !== ".lever" && st.line !== LINES.tourDone && st.line !== LINES.tourKeys), ...HELI_TOUR.slice(1)] : TOUR;
    // Seen once is enough: even if the flight is left mid-tour it won't pop up again
    // (the ? button brings it back any time; ✕ closes it).
    this.progress.tourDone = true;
    if (heli) this.progress.heliTourDone = true;
    this.saveProgress();
    await this.hud.runTour(steps, (line) => void this.audio.say(line, { interrupt: true }));
    this.audio.stopVoice();
    this.touring = false;
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

  /** Free Flight: stopped safely after an emergency landing in a field. Small reward; what next? */
  private showFieldStop(nearest: Airport, earned: boolean): void {
    const flight = this.flight;
    if (!flight) return;
    this.pauseEl?.remove();
    const wings = earned ? REWARDS.emergencyLanding : 0;
    if (wings) {
      this.progress.wings += wings;
      this.saveProgress();
      this.audio.sfx("cash");
    }
    const el = document.createElement("div");
    el.className = "pause-overlay arrival";
    const heli = isHelicopter(aircraftById(this.flightPlane));
    const note = heli ? "You landed the Chinook out in the open. Helicopters can land almost anywhere!" : "You landed safely in a field, just like a real pilot in an emergency. Great flying!";
    el.innerHTML = `<div class="pause-card"><div class="arrival-icon">${heli ? "🚁" : "🌾"}</div><h1>Safe landing!</h1><p class="pause-note">${note}</p>${wings ? `<p class="arrival-reward"><span class="wing-icon">${ICONS.wing}</span> +${wings} Wings</p>` : ""}<div class="pause-actions arrival-actions"><button type="button" class="btn secondary" data-a="home">Go home</button><button type="button" class="btn secondary" data-a="field">Take off from here</button><button type="button" class="btn primary" data-a="nearest">Fly from ${nearest.spoken}</button></div></div>`;
    el.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("button")?.dataset.a;
      if (!act) return;
      this.audio.sfx("click");
      el.remove();
      this.pauseEl = null;
      if (act === "nearest") flight.flyFromNearest();
      else if (act === "field") flight.continueFromField();
      else {
        this.endFlight();
        this.clearFreeSave();
        this.screens.home();
      }
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

/** Google's own error message for a refused Map Tiles request ("" if none). */
async function googleRefusal(key: string): Promise<string> {
  if (!key) return "No key is set.";
  try {
    const r = await fetch(`https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(key)}`);
    if (r.ok) return "";
    const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    return (body?.error?.message ?? `HTTP ${r.status}`).slice(0, 300);
  } catch {
    return "";
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
