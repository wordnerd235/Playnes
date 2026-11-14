// Menu screens: title, home, Flight School, charter board, hangar, debrief, parent corner.
// Big touch targets, icons first, every important thing also spoken by the co-pilot.

import { AIRCRAFT, aircraftById, type AircraftDef } from "../data/aircraft.ts";
import { AIRPORTS, airportByCode } from "../data/airports.ts";
import { LINES, PASSENGERS, tpl, type Line, type Passenger } from "../data/lines.ts";
import type { FlightResult, FreeSnapshot, LessonId, Mission } from "../game/flight.ts";
import { buy, canBuy, exportCode, importCode, owns, type Progress, type Reward } from "../game/progress.ts";
import type { Settings } from "../game/settings.ts";
import { distance, NM } from "../sim/geo.ts";
import { saveForOffline } from "../game/offline.ts";
import { FEATURE_NAMES, resetSafety, safetyReport } from "../world/safety.ts";
import { clear, h } from "./dom.ts";
import { ICONS } from "./icons.ts";

export interface ScreenHost {
  progress: Progress;
  settings: Settings;
  worldKind: string;
  say(line: Line, interrupt?: boolean): void;
  sfx(name: "click" | "cash" | "star" | "ding"): void;
  saveProgress(): void;
  saveSettings(reloadWorld: boolean): void;
  startMission(m: Mission): void;
  freeSave: FreeSnapshot | null;
  clearFreeSave(): void;
  completeLesson1(): void;
}

export const LESSONS: { id: string; title: string; icon: string }[] = [
  { id: "l1", title: "Meet your plane", icon: "✈️" },
  { id: "l2", title: "Go fast, go slow", icon: "🏁" },
  { id: "l3", title: "Takeoff!", icon: "🛫" },
  { id: "l4", title: "Turning", icon: "↪️" },
  { id: "l5", title: "Landing", icon: "🛬" },
];

export class Screens {
  root: HTMLElement;
  private layer: HTMLElement;

  constructor(parent: HTMLElement, private host: ScreenHost) {
    this.root = h("div.screens");
    this.layer = h("div.screen-layer");
    this.root.append(this.layer);
    parent.append(this.root);
  }

  hide(): void {
    this.root.hidden = true;
  }

  private show(content: HTMLElement): void {
    this.root.hidden = false;
    clear(this.layer);
    this.layer.append(content);
  }

  private topBar(title: string, back?: () => void): HTMLElement {
    const p = this.host.progress;
    return h("div.topbar", {}, [
      back ? h("button.round-btn", { type: "button", "aria-label": "Back", html: ICONS.back, onclick: () => { this.host.sfx("click"); back(); } }) : h("div.round-spacer"),
      h("h1.screen-title", {}, title),
      h("div.wings-pill", { title: "Wings" }, [h("span.wing-icon", { html: ICONS.wing }), h("b", {}, String(p.wings))]),
    ]);
  }

  // ------------------------------------------------------------ title

  title(onStart: () => void): void {
    const btn = h("button.big-go", { type: "button", onclick: () => onStart() }, [h("span", { html: ICONS.plane }), "Tap to fly!"]);
    this.show(
      h("div.title-screen", {}, [
        h("div.logo", {}, [h("span.logo-word", {}, "Playnes")]),
        h("p.tagline", {}, "Fly real planes across North America"),
        btn,
        h("p.version", {}, `Version ${__BUILD__}`),
      ]),
    );
  }

  loading(text: string): void {
    this.show(h("div.loading", {}, [h("div.loading-plane", { html: ICONS.plane }), h("p", {}, text)]));
  }

  // ------------------------------------------------------------ home

  onParent: () => void = () => {};

  home(): void {
    const onParent = this.onParent;
    const p = this.host.progress;
    const plane = aircraftById(p.selectedPlane);
    const ap = airportByCode(p.currentAirport);
    const card = (cls: string, icon: string, label: string, sub: string, onclick: () => void) =>
      h(`button.home-card.${cls}`, { type: "button", onclick: () => { this.host.sfx("click"); onclick(); } }, [h("span.home-icon", { html: icon }), h("span.home-label", {}, label), h("span.home-sub", {}, sub)]);
    const nextLesson = LESSONS.find((l) => !p.lessonsDone.includes(l.id));
    const gate = h("button.parent-btn", { type: "button", "aria-label": "Grown-ups: hold to open settings", html: ICONS.gearSettings });
    holdToOpen(gate, onParent);
    this.show(
      h("div.home", {}, [
        h("div.topbar", {}, [gate, h("h1.screen-title", {}, `At ${ap.spoken}`), h("div.wings-pill", {}, [h("span.wing-icon", { html: ICONS.wing }), h("b", {}, String(p.wings))])]),
        h("div.home-grid", {}, [
          card("school", ICONS.school, "Flight School", nextLesson ? `Next: ${nextLesson.title}` : "All done! ⭐", () => this.school()),
          card("charter", ICONS.map, "Charter Flights", p.graduated ? "Fly passengers" : "Fly passengers", () => this.charters()),
          card("free", ICONS.compass, "Free Flight", this.host.freeSave ? "Keep flying or pick an airport" : "Explore the map", () => this.freeFlight()),
          card("hangar", ICONS.plane, "Hangar", `${plane.maker} ${plane.model}`, () => this.hangar()),
        ]),
        this.host.worldKind === "basic"
          ? h("p.world-note", {}, "Simple globe mode: the offline map didn't load. A grown-up can add a Google Maps key in settings (gear, hold) for the real 3D world.")
          : null,
      ]),
    );
  }

  // ------------------------------------------------------------ flight school

  school(): void {
    const p = this.host.progress;
    this.host.say(LINES.school, true);
    const tiles = LESSONS.map((l, i) => {
      const done = p.lessonsDone.includes(l.id);
      const unlocked = i === 0 || p.lessonsDone.includes(LESSONS[i - 1].id);
      const next = unlocked && !done;
      return h(
        `button.lesson${done ? ".done" : ""}${next ? ".next" : ""}${unlocked ? "" : ".locked"}`,
        {
          type: "button",
          onclick: () => {
            this.host.sfx("click");
            if (!unlocked) return this.host.say(LINES.schoolLocked, true);
            if (l.id === "l1") return this.lessonMeet();
            this.host.startMission({ kind: "lesson", lesson: l.id as LessonId, airport: p.currentAirport });
          },
        },
        [
          h("span.lesson-num", {}, String(i + 1)),
          h("span.lesson-icon", {}, l.icon),
          h("span.lesson-title", {}, l.title),
          h("span.lesson-state", { html: done ? ICONS.check : unlocked ? "" : ICONS.lock }),
        ],
      );
    });
    this.show(h("div.school", {}, [this.topBar("Flight School", () => this.home()), h("div.lesson-row", {}, tiles), h("p.hint", {}, "Finish all five to graduate and get your first jet!")]));
  }

  lessonMeet(): void {
    const parts: { id: string; line: Line; label: string }[] = [
      { id: "wings", line: LINES.l1Wings, label: "Wings" },
      { id: "tail", line: LINES.l1Tail, label: "Tail" },
      { id: "prop", line: LINES.l1Prop, label: "Propeller" },
      { id: "wheels", line: LINES.l1Wheels, label: "Wheels" },
      { id: "cockpit", line: LINES.l1Cockpit, label: "Cockpit" },
    ];
    const found = new Set<string>();
    const wrap = h("div.meet");
    wrap.innerHTML = MEET_SVG;
    const labels = h("div.meet-labels");
    for (const part of parts) {
      const hot = wrap.querySelector(`[data-part="${part.id}"]`);
      const chip = h("span.meet-chip", {}, part.label);
      labels.append(chip);
      hot?.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.host.say(part.line, true);
        hot.classList.add("found");
        chip.classList.add("found");
        if (!found.has(part.id)) {
          found.add(part.id);
          this.host.sfx("star");
          if (found.size === parts.length) {
            setTimeout(() => {
              this.host.say(LINES.l1Done);
              this.host.completeLesson1();
            }, 2600);
          }
        }
      });
    }
    this.host.say(LINES.l1Intro, true);
    this.show(h("div.lesson-meet", {}, [this.topBar("Meet your plane", () => this.school()), wrap, labels]));
  }

  // ------------------------------------------------------------ charters

  charters(): void {
    const p = this.host.progress;
    const plane = aircraftById(p.selectedPlane);
    const here = airportByCode(p.currentAirport);
    const dests = AIRPORTS.filter((a) => a.code !== here.code && distance(here, a) / NM <= plane.rangeNm);
    const fits = PASSENGERS.filter((x) => x.count <= plane.seats);
    const seed = p.flights * 7 + here.code.charCodeAt(0);
    const cards = dests.slice(0, 3).map((a, i) => {
      const pax: Passenger = fits[(seed + i * 3) % fits.length];
      const nm = Math.round(distance(here, a) / NM);
      const reward = 10 + Math.min(30, Math.floor(nm / 50));
      const firstVisit = !p.airportsVisited.includes(a.code);
      const mission: Mission = { kind: "charter", from: here.code, to: a.code, passenger: pax };
      const card = h("button.charter-card", { type: "button" }, [
        h("div.charter-top", {}, [h("span.charter-pax", {}, pax.icon), h("span.charter-dest", {}, a.icon)]),
        h("div.charter-route", {}, [h("b", {}, here.code), h("span.charter-line"), h("b", {}, a.code)]),
        h("div.charter-name", {}, a.spoken),
        h("div.charter-blurb", {}, a.blurb),
        h("div.charter-meta", {}, [h("span", {}, `${nm} nm`), h("span.reward", {}, [h("span.wing-icon", { html: ICONS.wing }), `+${reward}${firstVisit ? " +15" : ""}`])]),
        h("div.charter-go", {}, "Let's go!"),
      ]);
      let armed = false;
      card.addEventListener("click", () => {
        this.host.sfx("click");
        if (!armed) {
          armed = true;
          for (const c of Array.from(card.parentElement?.children ?? [])) c.classList.remove("armed");
          card.classList.add("armed");
          this.host.say(tpl.charter(pax.spoken, a.spoken), true);
          return;
        }
        this.host.startMission(mission);
      });
      return card;
    });
    this.host.say(LINES.pickFlight, true);
    this.show(
      h("div.charters", {}, [
        this.topBar("Charter Flights", () => this.home()),
        h("p.hint", {}, `Flying the ${plane.maker} ${plane.model} from ${here.spoken}. Tap a card, then tap again to go!`),
        h("div.charter-row", {}, cards),
      ]),
    );
  }

  // ------------------------------------------------------------ free flight

  freeFlight(): void {
    const p = this.host.progress;
    const save = this.host.freeSave;
    let resume: HTMLElement | null = null;
    if (save) {
      let near = AIRPORTS[0];
      for (const a of AIRPORTS) if (distance(save, a) < distance(save, near)) near = a;
      const nm = Math.round(distance(save, near) / NM);
      const plane = aircraftById(save.aircraft);
      const where = save.onGround && nm < 2 ? `On the ground at ${near.spoken}` : `${nm} nm from ${near.spoken}, ${Math.round(save.alt / 0.3048 / 100) * 100} ft`;
      resume = h("div.free-resume", {}, [
        h("button.free-resume-go", {
          type: "button",
          onclick: () => {
            this.host.sfx("click");
            this.host.startMission({ kind: "sandbox", airport: save.airport, resume: save });
          },
        }, [
          h("span.free-resume-icon", { html: ICONS.plane }),
          h("span.free-resume-text", {}, [h("b", {}, "Keep flying"), h("span", {}, `${plane.maker} ${plane.model} · ${where}`)]),
        ]),
        h("button.btn.link.free-resume-clear", {
          type: "button",
          onclick: () => {
            this.host.clearFreeSave();
            this.freeFlight();
          },
        }, "Start over"),
      ]);
    }
    const grid = h("div.airport-grid", {}, AIRPORTS.map((a) =>
      h(`button.airport-card${a.code === p.currentAirport ? ".here" : ""}`, {
        type: "button",
        onclick: () => {
          this.host.sfx("click");
          this.host.startMission({ kind: "sandbox", airport: a.code });
        },
      }, [
        h("span.airport-icon", {}, a.icon),
        h("span.airport-code", {}, a.code),
        h("span.airport-name", {}, a.spoken),
        h("span.airport-blurb", {}, a.code === p.currentAirport ? "You are here" : a.home ? "Home base" : a.blurb),
      ]),
    ));
    this.show(
      h("div.free-pick", {}, [
        this.topBar("Free Flight", () => this.home()),
        resume,
        h("p.hint", {}, "Pick an airport to take off from:"),
        grid,
      ]),
    );
  }

  // ------------------------------------------------------------ hangar

  hangar(): void {
    const p = this.host.progress;
    this.host.say(LINES.hangar, true);
    const grid = h("div.hangar-grid");
    for (const ac of AIRCRAFT) grid.append(this.planeCard(ac));
    this.show(h("div.hangar", {}, [this.topBar("Hangar", () => this.home()), grid]));
    void p;
  }

  private planeCard(ac: AircraftDef): HTMLElement {
    const p = this.host.progress;
    const mine = owns(p, ac);
    const selected = p.selectedPlane === ac.id;
    let status: HTMLElement;
    if (mine) status = h("span.plane-status.mine", {}, selected ? "Flying this one" : "Tap to fly");
    else if (ac.unlock.type === "graduation") status = h("span.plane-status", {}, "🎓 Graduate Flight School");
    else if (ac.unlock.type === "wings") status = h(`span.plane-status${canBuy(p, ac) ? ".buy" : ""}`, {}, [h("span.wing-icon", { html: ICONS.wing }), `${ac.unlock.price}`]);
    else status = h("span.plane-status", {}, "Special");
    const card = h(`button.plane-card${mine ? "" : ".locked"}${selected ? ".selected" : ""}`, { type: "button" }, [
      h("div.plane-swatch", { style: { background: `linear-gradient(135deg, ${ac.livery.body} 55%, ${ac.livery.stripe} 55% 70%, ${ac.livery.accent} 70%)` } }, [h("span", { html: ICONS.plane })]),
      h("div.plane-maker", {}, ac.maker),
      h("div.plane-model", {}, ac.model),
      h("div.plane-facts", {}, `${ac.category} · ${ac.seats} seats · ${ac.rangeNm.toLocaleString()} nm`),
      status,
    ]);
    card.addEventListener("click", () => {
      this.host.sfx("click");
      if (mine) {
        p.selectedPlane = ac.id;
        this.host.saveProgress();
        this.host.say(tpl.planeIntro(ac.spoken), true);
        this.host.say(tpl.planeWow(ac.wow));
        this.hangarRefresh();
      } else if (canBuy(p, ac)) {
        buy(p, ac);
        p.selectedPlane = ac.id;
        this.host.saveProgress();
        this.host.sfx("cash");
        this.host.say(LINES.bought, true);
        this.host.say(tpl.planeWow(ac.wow));
        this.hangarRefresh();
      } else {
        this.host.say(tpl.planeIntro(ac.spoken), true);
        this.host.say(ac.unlock.type === "graduation" ? LINES.school : LINES.locked);
      }
    });
    return card;
  }

  private hangarRefresh(): void {
    const grid = this.layer.querySelector(".hangar-grid");
    if (!grid) return;
    clear(grid as HTMLElement);
    for (const ac of AIRCRAFT) grid.append(this.planeCard(ac));
    const pill = this.layer.querySelector(".wings-pill b");
    if (pill) pill.textContent = String(this.host.progress.wings);
  }

  // ------------------------------------------------------------ debrief

  debrief(r: FlightResult, rewards: Reward[], newStamp: boolean, onAgain: () => void, onHome: () => void): void {
    const total = rewards.reduce((a, b) => a + b.wings, 0);
    const stars = h("div.stars");
    if (r.landing) {
      for (let i = 0; i < 3; i++) {
        const lit = i < r.stars;
        const s = h(`span.star${lit ? ".lit" : ""}`, { html: ICONS.star, style: { animationDelay: `${0.35 + i * 0.35}s` } });
        stars.append(s);
        if (lit) setTimeout(() => this.host.sfx("star"), 350 + i * 350);
      }
    }
    const word = r.landing === "butter" ? "BUTTER!" : r.landing === "smooth" ? "Smooth landing!" : r.landing === "firm" ? "Firm landing!" : "Great job!";
    const details = r.landing
      ? h("ul.landing-checks", {}, [
          h(`li${r.landing !== "firm" ? ".ok" : ""}`, {}, `Soft touchdown${r.sinkFpm !== null ? ` (${r.sinkFpm} ft/min)` : ""}`),
          h(`li${r.centerline ? ".ok" : ""}`, {}, "On the centerline"),
          h(`li${r.zone ? ".ok" : ""}`, {}, "In the touchdown zone"),
        ])
      : null;
    const list = h("ul.rewards", {}, rewards.map((x) => h("li", {}, [h("span", {}, x.label), h("b", {}, [h("span.wing-icon", { html: ICONS.wing }), `+${x.wings}`])])));
    this.show(
      h("div.debrief", {}, [
        h("h1.debrief-word", {}, word),
        stars,
        details,
        list,
        h("div.debrief-total", {}, [h("span.wing-icon", { html: ICONS.wing }), `+${total} Wings`]),
        newStamp ? h("div.stamp", {}, [h("span", {}, "✈ PASSPORT"), h("b", {}, airportByCode((r.mission as { to: string }).to).code)]) : null,
        h("div.debrief-actions", {}, [
          h("button.btn.secondary", { type: "button", onclick: onHome }, [h("span", { html: ICONS.home }), "Home"]),
          h("button.btn.primary", { type: "button", onclick: onAgain }, [h("span", { html: ICONS.plane }), "Fly again"]),
        ]),
      ]),
    );
    setTimeout(() => this.host.sfx("cash"), 1600);
  }

  graduation(onDone: () => void): void {
    this.host.say(LINES.graduation, true);
    this.show(
      h("div.graduation", {}, [
        h("div.gold-wings", { html: ICONS.wing }),
        h("h1", {}, "You graduated!"),
        h("p", {}, "Here are your gold pilot wings and your very first jet:"),
        h("div.grad-plane", {}, "Embraer Phenom 100EX"),
        h("button.btn.primary", { type: "button", onclick: onDone }, [h("span", { html: ICONS.plane }), "Go to the hangar"]),
      ]),
    );
  }

  breakTime(onParentContinue: () => void): void {
    this.host.say(LINES.timeToLand, true);
    const btn = h("button.btn.secondary", { type: "button" }, "Grown-ups: hold to keep playing");
    holdToOpen(btn, onParentContinue);
    this.show(h("div.break", {}, [h("div.break-icon", {}, "😴"), h("h1", {}, "Time for a break, Captain!"), btn]));
  }

  // ------------------------------------------------------------ parent corner

  parentGate(onPass: () => void, onCancel: () => void): void {
    const a = 3 + Math.floor(Math.random() * 6);
    const b = 4 + Math.floor(Math.random() * 5);
    const answer = a * b;
    const options = shuffle([answer, answer + a, answer - b, answer + 7]);
    this.show(
      h("div.gate", {}, [
        h("h1", {}, "For grown-ups"),
        h("p", {}, `What is ${a} × ${b}?`),
        h("div.gate-options", {}, options.map((o) => h("button.btn.secondary", { type: "button", onclick: () => (o === answer ? onPass() : onCancel()) }, String(o)))),
        h("button.btn.link", { type: "button", onclick: onCancel }, "Back"),
      ]),
    );
  }

  parentCorner(onClose: () => void): void {
    const s = this.host.settings;
    const p = this.host.progress;
    const field = (label: string, input: HTMLElement, help?: string) => h("label.field", {}, [h("span.field-label", {}, label), input, help ? h("span.field-help", {}, help) : null]);
    const sel = (id: string, value: string, opts: [string, string][]) => {
      const e = h("select", { id }, opts.map(([v, t]) => h("option", { value: v, selected: v === value }, t)));
      return e;
    };
    const world = sel("set-world", s.world, [["auto", "Automatic (Google if a key is set)"], ["google", "Google Photorealistic 3D"], ["ion", "Cesium ion"], ["basic", "Cartoon world (no key, works offline)"]]);
    const gkey = h("input", { id: "set-gkey", type: "password", value: s.googleKey, placeholder: "Google Maps Platform API key", autocomplete: "off", spellcheck: false });
    const ion = h("input", { id: "set-ion", type: "password", value: s.ionToken, placeholder: "Cesium ion access token", autocomplete: "off", spellcheck: false });
    const quality = sel("set-quality", s.quality, [["auto", "Automatic"], ["high", "High (computer)"], ["low", "Low (older iPad)"]]);
    const assist = sel("set-assist", String(s.assistLevel), [["1", "1 · You steer (co-pilot does the rest)"], ["2", "2 · Up & down too"]]);
    const check = (id: string, v: boolean) => h("input", { id, type: "checkbox", checked: v });
    const tilt = check("set-tilt", s.tilt);
    const invert = check("set-invert", s.invertPitch);
    const flip = check("set-flip", s.tiltFlipPitch);
    const crashes = check("set-crashes", s.crashes);
    const autoSpeed = check("set-autospeed", s.freeAutoSpeed);
    const unlock = check("set-unlock", p.unlockAll);
    const volume = h("input", { id: "set-volume", type: "range", min: "0", max: "1", step: "0.05", value: String(s.volume) });
    const minutes = sel("set-minutes", String(s.sessionMinutes), [["0", "Off"], ["15", "15 minutes"], ["20", "20 minutes"], ["30", "30 minutes"], ["45", "45 minutes"]]);
    const code = h("textarea", { id: "set-code", rows: 3, spellcheck: false, placeholder: "Backup code" });
    const msg = h("p.field-msg", { role: "status" });
    const offlineMsg = h("p.field-msg", { role: "status" }, "Downloads about 25 MB so the cartoon world works in the car or on a plane. Install to the Home Screen first.");

    const save = () => {
      const worldChanged = world.value !== s.world || gkey.value !== s.googleKey || ion.value !== s.ionToken || quality.value !== s.quality;
      s.world = world.value as Settings["world"];
      s.googleKey = gkey.value.trim();
      s.ionToken = ion.value.trim();
      s.quality = quality.value as Settings["quality"];
      s.assistLevel = Number(assist.value);
      s.tilt = tilt.checked;
      s.invertPitch = invert.checked;
      s.tiltFlipPitch = flip.checked;
      s.crashes = crashes.checked;
      s.freeAutoSpeed = autoSpeed.checked;
      s.volume = Number(volume.value);
      s.sessionMinutes = Number(minutes.value);
      p.unlockAll = unlock.checked;
      this.host.saveProgress();
      this.host.saveSettings(worldChanged);
      onClose();
    };
    let resetArmed = false;
    const resetBtn = h("button.btn.danger", { type: "button" }, "Reset all progress");
    resetBtn.addEventListener("click", () => {
      if (!resetArmed) {
        resetArmed = true;
        resetBtn.textContent = "Tap again to erase everything";
        return;
      }
      Object.assign(p, { wings: 0, planes: ["c172"], selectedPlane: "c172", lessonsDone: [], graduated: false, airportsVisited: ["TRI"], currentAirport: "TRI", flights: 0, butterLandings: 0, unlockAll: false });
      this.host.saveProgress();
      msg.textContent = "Progress reset.";
      resetBtn.textContent = "Reset all progress";
      resetArmed = false;
    });

    this.show(
      h("div.parent", {}, [
        h("div.topbar", {}, [h("button.round-btn", { type: "button", "aria-label": "Close", html: ICONS.back, onclick: onClose }), h("h1.screen-title", {}, "Grown-up settings"), h("div.round-spacer")]),
        h("div.parent-body", {}, [
          h("section", {}, [
            h("h2", {}, "World map"),
            field("Map source", world, `Now showing: ${this.host.worldKind}. Google and Cesium need internet; the cartoon world works anywhere.`),
            field("Google Maps API key", gkey, "See docs/SETUP.md. Restrict the key to this site and the Map Tiles API."),
            field("Cesium ion token (optional)", ion),
            field("Graphics quality", quality),
            h("div.code-row", {}, [
              h("button.btn.secondary", {
                type: "button",
                onclick: async (e: Event) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.disabled = true;
                  offlineMsg.textContent = "Downloading the map, planes and voices...";
                  const r = await saveForOffline((d, t) => (offlineMsg.textContent = `Saving for offline: ${d} of ${t}...`));
                  offlineMsg.textContent = r.failed ? `Saved ${r.ok} files; ${r.failed} failed. Try again on Wi-Fi.` : `All set! The cartoon world now works with no internet (${r.ok} files).`;
                  btn.disabled = false;
                },
              }, "Save for offline play"),
            ]),
            offlineMsg,
            (() => {
              const rep = safetyReport();
              let frameErr = "";
              try {
                frameErr = localStorage.getItem("playnes.lastFrameError") ?? "";
              } catch {
                /* none */
              }
              if (!rep.lastError && !frameErr) return h("p.field-help", {}, "Graphics: no problems recorded.");
              const box = h("div.gfx-report", {}, [
                h("p.field-help", {}, `Graphics safety: ${rep.off.length ? `turned off ${rep.off.map((f) => FEATURE_NAMES[f]).join(", ")}` : "nothing turned off"}.`),
                rep.lastError ? h("p.field-help", {}, `Last rendering error: ${rep.lastError}`) : null,
                frameErr ? h("p.field-help", {}, `Last game error: ${frameErr}`) : null,
                h("button.btn.secondary", {
                  type: "button",
                  onclick: () => {
                    resetSafety();
                    try {
                      localStorage.removeItem("playnes.lastFrameError");
                    } catch {
                      /* none */
                    }
                    box.textContent = "Graphics safety reset. Reload the game to try everything again.";
                  },
                }, "Reset graphics safety"),
              ]);
              return box;
            })(),
          ]),
          h("section", {}, [
            h("h2", {}, "Flying"),
            field("Co-pilot help", assist),
            h("label.check", {}, [tilt, "Tilt the iPad to steer"]),
            h("label.check", {}, [flip, "Tilt: flip up and down (if it feels backwards)"]),
            h("label.check", {}, [invert, "Invert up/down on the yoke"]),
            h("label.check", {}, [crashes, "Free Flight: allow crashes (off = the co-pilot always saves the plane)"]),
            h("label.check", {}, [autoSpeed, "Free Flight: co-pilot holds the speed (off = the lever is a real throttle)"]),
            field("Volume", volume),
            field("Break reminder", minutes),
          ]),
          h("section", {}, [
            h("h2", {}, "Progress"),
            h("p.field-help", {}, `${p.wings} Wings · ${p.planes.length} planes · ${p.flights} flights · ${p.lessonsDone.length}/5 lessons`),
            h("label.check", {}, [unlock, "Unlock all planes (special days)"]),
            h("div.code-row", {}, [
              h("button.btn.secondary", {
                type: "button",
                onclick: async () => {
                  code.value = exportCode(p);
                  try {
                    await navigator.clipboard.writeText(code.value);
                    msg.textContent = "Backup code copied. Keep it somewhere safe.";
                  } catch {
                    code.select();
                    msg.textContent = "Backup code shown below. Copy it somewhere safe.";
                  }
                },
              }, "Make backup code"),
              h("button.btn.secondary", {
                type: "button",
                onclick: () => {
                  const restored = importCode(code.value);
                  if (!restored) {
                    msg.textContent = "That code didn't work. Check that it was copied completely.";
                    return;
                  }
                  Object.assign(p, restored);
                  this.host.saveProgress();
                  msg.textContent = "Progress restored.";
                },
              }, "Restore from code"),
            ]),
            code,
            msg,
            resetBtn,
          ]),
          h("div.parent-actions", {}, [h("button.btn.primary", { type: "button", onclick: save }, "Save")]),
          h("p.field-help", {}, `Playnes is a private family game. Map data © Google or Cesium as credited on screen. Version ${__BUILD__}.`),
        ]),
      ]),
    );
  }
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Press and hold for 1.5 s to activate (keeps small hands out of settings). */
function holdToOpen(btn: HTMLElement, fn: () => void): void {
  let t: number | undefined;
  const start = (e: Event) => {
    e.preventDefault();
    btn.classList.add("holding");
    t = window.setTimeout(() => {
      btn.classList.remove("holding");
      fn();
    }, 1500);
  };
  const stop = () => {
    btn.classList.remove("holding");
    clearTimeout(t);
  };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") fn();
  });
}

// Side view of a Cessna-style trainer with tappable parts for Lesson 1.
const MEET_SVG = `
<svg viewBox="0 0 640 300" class="meet-svg" role="img" aria-label="A small airplane with tappable parts">
  <ellipse cx="330" cy="272" rx="250" ry="12" fill="rgba(0,0,0,.15)"/>
  <g data-part="tail" class="hot">
    <path d="M70 150 L40 60 L95 60 L150 150 Z" fill="#c8262e" stroke="#7a1218" stroke-width="3"/>
    <path d="M40 150 L150 150 L150 165 L40 165 Z" fill="#e8e8e2" stroke="#9a9a92" stroke-width="3"/>
  </g>
  <path d="M90 150 Q120 128 230 125 L470 120 Q540 122 560 150 Q560 185 520 195 L240 196 Q140 190 90 165 Z" fill="#f7f7f2" stroke="#8b8f96" stroke-width="3"/>
  <path d="M110 170 L540 172" stroke="#1d3f8f" stroke-width="7"/>
  <g data-part="cockpit" class="hot">
    <path d="M440 128 L500 128 Q530 135 540 150 L440 150 Z" fill="#26384d" stroke="#0f1b29" stroke-width="3"/>
    <rect x="370" y="130" width="58" height="22" rx="6" fill="#26384d"/>
  </g>
  <g data-part="wings" class="hot">
    <path d="M300 112 L520 108 L530 118 L300 122 Z" fill="#ececE6" stroke="#8b8f96" stroke-width="3"/>
    <path d="M330 122 L420 175" stroke="#8b8f96" stroke-width="5"/>
  </g>
  <g data-part="prop" class="hot">
    <path d="M560 150 Q590 150 595 158 Q590 166 560 166 Z" fill="#1d3f8f"/>
    <rect x="590" y="88" width="12" height="140" rx="6" fill="#3b4048"/>
  </g>
  <g data-part="wheels" class="hot">
    <path d="M400 195 L392 238" stroke="#9aa3ad" stroke-width="6"/>
    <circle cx="390" cy="246" r="22" fill="#1b1b1b"/><circle cx="390" cy="246" r="8" fill="#9aa3ad"/>
    <path d="M520 195 L522 238" stroke="#9aa3ad" stroke-width="6"/>
    <circle cx="522" cy="250" r="17" fill="#1b1b1b"/><circle cx="522" cy="250" r="6" fill="#9aa3ad"/>
  </g>
</svg>`;
