// Menu screens: title, home, Flight School, charter board, hangar, debrief, parent corner.
// Big touch targets, icons first, every important thing also spoken by the co-pilot.

import { AIRCRAFT, aircraftById, carriesPassengers, type AircraftDef } from "../data/aircraft.ts";
import { AIRPORTS, airportByCode } from "../data/airports.ts";
import { LINES, PASSENGERS, tpl, type Line, type Passenger } from "../data/lines.ts";
import type { FlightResult, FreeSnapshot, LessonId, Mission } from "../game/flight.ts";
import { buy, canBuy, charterKey, charterPlaneId, charterRewards, exportCode, REWARDS, importCode, owns, type Progress, type Reward } from "../game/progress.ts";
import type { Settings } from "../game/settings.ts";
import { distance, NM } from "../sim/geo.ts";
import { saveForOffline } from "../game/offline.ts";
import { MEET_SPOTS } from "../data/meetSpots.ts";
import { FEATURE_NAMES, resetSafety, safetyReport } from "../world/safety.ts";
import { clear, h } from "./dom.ts";
import { ICONS } from "./icons.ts";

export interface ScreenHost {
  progress: Progress;
  settings: Settings;
  worldKind: string;
  worldNote: string;
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
  { id: "l1", title: "Meet your playne", icon: "✈️" },
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
        h("p.tagline", {}, "Fly real playnes across North America"),
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
    // A picture rendered from the real Cessna model, with a glowing spot on each part to tap.
    const stage = h("div.meet-stage", {}, [h("img.meet-pic", { src: "./models/thumbs/meet-c172.webp", alt: "A Cessna 172 with parts to tap", draggable: false })]);
    for (const part of parts) {
      const at = MEET_SPOTS[part.id];
      if (!at) continue;
      stage.append(h("button.meet-spot.hot", { type: "button", "aria-label": part.label, style: { left: `${at.x}%`, top: `${at.y}%` } }, [h("span.meet-spot-label", {}, part.label)]));
      (stage.lastElementChild as HTMLElement).dataset.part = part.id;
    }
    const wrap = h("div.meet", {}, [stage]);
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
    this.show(h("div.lesson-meet", {}, [this.topBar("Meet your playne", () => this.school()), wrap, labels]));
  }

  // ------------------------------------------------------------ charters

  charters(): void {
    const p = this.host.progress;
    const plane = aircraftById(charterPlaneId(p));
    if (plane.id !== p.selectedPlane) this.host.say(LINES.fighterFreeOnly);
    const here = airportByCode(p.currentAirport);
    const dests = AIRPORTS.filter((a) => a.code !== here.code && distance(here, a) / NM <= plane.rangeNm);
    const fits = PASSENGERS.filter((x) => x.count <= plane.seats);
    const seed = p.flights * 7 + here.code.charCodeAt(0);
    const cards = dests.slice(0, 3).map((a, i) => {
      const pax: Passenger = fits[(seed + i * 3) % fits.length];
      const nm = Math.round(distance(here, a) / NM);
      const reward = charterRewards({ from: here.code, to: a.code, distanceNm: nm, seats: plane.seats, stars: 0, butter: false, newLanding: false })[0].wings;
      const firstVisit = !p.airportsVisited.includes(a.code);
      const solo = this.host.settings.soloCharters !== false && p.chartersDone.includes(charterKey(here.code, a.code));
      const mission: Mission = { kind: "charter", from: here.code, to: a.code, passenger: pax };
      const card = h("button.charter-card", { type: "button" }, [
        h("div.charter-top", {}, [h("span.charter-pax", {}, pax.icon), h("span.charter-dest", {}, a.icon)]),
        h("div.charter-route", {}, [h("b", {}, here.code), h("span.charter-line"), h("b", {}, a.code)]),
        h("div.charter-name", {}, a.spoken),
        h("div.charter-blurb", {}, a.blurb),
        h("div.charter-meta", {}, [h("span", {}, `${nm} nm`), h("span.reward", {}, [h("span.wing-icon", { html: ICONS.wing }), `+${reward}${firstVisit ? ` +${REWARDS.newLanding}` : ""}`])]),
        solo ? h("div.charter-solo", { title: "You've flown this trip: no co-pilot help this time" }, "✈ Solo flight") : null,
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

  /** Stat bars (compared with the fastest / farthest / highest-climbing playne in the hangar). */
  private planeStats(ac: AircraftDef, big = false): HTMLElement {
    const max = (f: (a: AircraftDef) => number) => Math.max(...AIRCRAFT.map(f));
    const rows: [string, string, number][] = [
      ["Cruise", `${ac.cruiseKt.toLocaleString()} kt`, ac.cruiseKt / max((a) => a.cruiseKt)],
      ["Range", `${ac.rangeNm.toLocaleString()} nm`, ac.rangeNm / max((a) => a.rangeNm)],
      ["Climb", `${ac.climbFpm.toLocaleString()} ft/min`, Math.sqrt(ac.climbFpm / max((a) => a.climbFpm))],
      ["Seats", String(ac.seats), ac.seats / max((a) => a.seats)],
    ];
    if (big) rows.push(["Flies up to", `${ac.cruiseAltFt.toLocaleString()} ft`, ac.cruiseAltFt / max((a) => a.cruiseAltFt)]);
    return h(`div.plane-stats${big ? ".big" : ""}`, {}, rows.map(([label, value, f]) =>
      h("div.stat", {}, [
        h("span.stat-label", {}, label),
        h("span.stat-bar", {}, [h("span.stat-fill", { style: { width: `${Math.max(6, Math.round(f * 100))}%` } })]),
        h("span.stat-value", {}, value),
      ]),
    ));
  }

  /** A rendered picture of the playne (from its 3D model) on a sky-and-livery background. */
  private planePicture(ac: AircraftDef, big = false): HTMLElement {
    const img = h("img.plane-pic", { src: `./models/thumbs/${ac.id}.webp`, alt: `${ac.maker} ${ac.model}`, draggable: false, loading: "lazy" });
    return h(`div.plane-swatch${big ? ".big" : ""}`, { style: { background: `linear-gradient(160deg, #d8ecfb 0%, #f4f9fd 60%, ${ac.livery.stripe}22 100%)` } }, [img]);
  }

  private planeCard(ac: AircraftDef): HTMLElement {
    const p = this.host.progress;
    const mine = owns(p, ac);
    const selected = p.selectedPlane === ac.id;
    let status: HTMLElement;
    if (mine) status = h("span.plane-status.mine", {}, selected ? "✓ Flying this one" : "In your hangar");
    else if (ac.unlock.type === "graduation") status = h("span.plane-status", {}, "🎓 Graduate Flight School");
    else if (ac.unlock.type === "wings") status = h(`span.plane-status${canBuy(p, ac) ? ".buy" : ""}`, {}, [h("span.wing-icon", { html: ICONS.wing }), `${ac.unlock.price}`]);
    else status = h("span.plane-status", {}, "Special");
    const card = h(`button.plane-card${mine ? "" : ".locked"}${selected ? ".selected" : ""}`, { type: "button" }, [
      this.planePicture(ac),
      h("div.plane-maker", {}, ac.maker),
      h("div.plane-model", {}, ac.model),
      h("div.plane-facts", {}, ac.category),
      this.planeStats(ac),
      status,
    ]);
    card.addEventListener("click", () => {
      this.host.sfx("click");
      this.planeDetails(ac);
    });
    return card;
  }

  /** Details card for one playne, with the choices (buy / fly / close). Nothing happens without a tap. */
  private planeDetails(ac: AircraftDef, justBought = false): void {
    const p = this.host.progress;
    this.layer.querySelector(".plane-sheet")?.remove();
    const mine = owns(p, ac);
    const selected = p.selectedPlane === ac.id;
    const close = () => sheet.remove();
    const actions: HTMLElement[] = [];
    const btn = (cls: string, label: (string | HTMLElement)[] | string, onclick: () => void) => h(`button.btn.${cls}`, { type: "button", onclick }, label);
    let note = "";
    if (justBought) {
      note = "It's yours! Do you want to fly it now?";
      actions.push(btn("secondary", "Maybe later", close));
      actions.push(btn("primary", [h("span", { html: ICONS.plane }), "Fly it now"], () => this.choosePlane(ac, close)));
    } else if (mine) {
      if (selected) {
        note = "You're flying this one.";
        actions.push(btn("primary", "OK", close));
      } else {
        note = carriesPassengers(ac) ? "This playne is in your hangar." : "Fighter jets have one seat, so they fly in Free Flight only.";
        actions.push(btn("secondary", "Close", close));
        actions.push(btn("primary", [h("span", { html: ICONS.plane }), "Fly this playne"], () => this.choosePlane(ac, close)));
      }
    } else if (ac.unlock.type === "wings") {
      const price = ac.unlock.price;
      actions.push(btn("secondary", "Close", close));
      if (canBuy(p, ac)) {
        note = `You have ${p.wings} Wings.`;
        actions.push(btn("primary.buy-btn", [h("span.wing-icon", { html: ICONS.wing }), `Buy for ${price} Wings`], () => {
          buy(p, ac);
          this.host.saveProgress();
          this.host.sfx("cash");
          this.host.say(LINES.bought, true);
          this.hangarRefresh();
          this.planeDetails(ac, true);
        }));
      } else {
        note = `You need ${price - p.wings} more Wings. Fly charters to earn them!`;
        actions.push(h("button.btn.primary", { type: "button", disabled: true }, [h("span.wing-icon", { html: ICONS.wing }), `${price} Wings`]));
      }
    } else {
      note = ac.unlock.type === "graduation" ? "Finish all of Flight School to unlock this playne." : "A special playne.";
      actions.push(btn("primary", "OK", close));
    }
    const sheet = h("div.plane-sheet", { onclick: (e: Event) => e.target === sheet && close() }, [
      h("div.plane-sheet-card", {}, [
        this.planePicture(ac, true),
        h("div.plane-maker", {}, ac.maker),
        h("h2.plane-sheet-title", {}, ac.model),
        h("div.plane-facts", {}, (() => {
          const engine = ac.kind === "piston" ? "propeller" : ac.kind === "turboprop" ? "turboprop" : "jet";
          return ac.category.toLowerCase().includes(engine) ? ac.category : `${ac.category} · ${engine}`;
        })()),
        this.planeStats(ac, true),
        h("p.plane-wow", {}, ac.wow),
        note ? h("p.plane-note", {}, note) : null,
        h("div.plane-sheet-actions", {}, actions),
      ]),
    ]);
    this.layer.append(sheet);
    if (!justBought) {
      this.host.say(tpl.planeIntro(ac.spoken), true);
      this.host.say(tpl.planeWow(ac.wow));
    }
  }

  private choosePlane(ac: AircraftDef, close: () => void): void {
    this.host.progress.selectedPlane = ac.id;
    this.host.saveProgress();
    this.host.sfx("ding");
    close();
    this.hangarRefresh();
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
    const solo = check("set-solo", s.soloCharters !== false);
    const unlock = check("set-unlock", p.unlockAll);
    const volume = h("input", { id: "set-volume", type: "range", min: "0", max: "1", step: "0.05", value: String(s.volume) });
    const minutes = sel("set-minutes", String(s.sessionMinutes), [["0", "Off"], ["15", "15 minutes"], ["20", "20 minutes"], ["30", "30 minutes"], ["45", "45 minutes"]]);
    const code = h("textarea", { id: "set-code", rows: 3, spellcheck: false, placeholder: "Backup code" });
    const msg = h("p.field-msg", { role: "status" });
    const offlineMsg = h("p.field-msg", { role: "status" }, "Downloads about 25 MB so the cartoon world works in the car or on a playne. Install to the Home Screen first.");

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
      s.soloCharters = solo.checked;
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
      Object.assign(p, { wings: 0, planes: ["c172"], selectedPlane: "c172", lessonsDone: [], graduated: false, airportsVisited: ["TRI"], airportsDeparted: [], chartersDone: [], tourDone: false, currentAirport: "TRI", flights: 0, butterLandings: 0, unlockAll: false });
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
            field("Map source", world, `Now showing: ${({ google: "Google Photorealistic 3D", ion: "Cesium ion", cartoon: "offline cartoon map", basic: "simple globe" } as Record<string, string>)[this.host.worldKind] ?? this.host.worldKind}. Google and Cesium need internet; the cartoon world works anywhere.`),
            this.host.worldNote ? h("p.field-msg.warn", {}, this.host.worldNote) : null,
            field("Google Maps API key", gkey, "See docs/SETUP.md. Restrict the key to this site and the Map Tiles API."),
            field("Cesium ion token (optional)", ion),
            field("Graphics quality", quality),
            h("div.code-row", {}, [
              h("button.btn.secondary", {
                type: "button",
                onclick: async (e: Event) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.disabled = true;
                  offlineMsg.textContent = "Downloading the map, playnes and voices...";
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
                rep.lastError ? h("p.field-help", {}, `Last rendering error${rep.when ? ` (${new Date(rep.when).toLocaleString()}, version ${rep.build ?? "?"})` : ""}: ${rep.lastError}`) : null,
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
            h("label.check", {}, [crashes, "Free Flight: allow crashes (off = the co-pilot always saves the playne)"]),
            h("label.check", {}, [autoSpeed, "Free Flight: co-pilot holds the speed (off = the lever is a real throttle)"]),
            h("label.check", {}, [solo, "Charters already flown are solo: no tips or co-pilot help (off = the co-pilot always helps)"]),
            field("Volume", volume),
            field("Break reminder", minutes),
          ]),
          h("section", {}, [
            h("h2", {}, "Progress"),
            h("p.field-help", {}, `${p.wings} Wings · ${p.planes.length} playnes · ${p.flights} flights · ${p.lessonsDone.length}/5 lessons`),
            h("label.check", {}, [unlock, "Unlock all playnes (special days)"]),
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
          h("p.field-help", {}, `Playnes is a private family game. Map data © Google or Cesium as credited on screen; offline map from AWS Terrain Tiles and Natural Earth; airport buildings © OpenStreetMap contributors via Overture Maps. Version ${__BUILD__}.`),
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

