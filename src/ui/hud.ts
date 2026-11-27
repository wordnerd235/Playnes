// In-flight heads-up display and touch controls: yoke pad, throttle lever, big buttons,
// kid-readable instruments, co-pilot caption, prompts and the cloud "whiteout".

import type { Line } from "../data/lines.ts";
import type { Controls } from "../input/controls.ts";
import { ICONS } from "./icons.ts";
import { setAttr, setStyle, setText } from "./dom.ts";
import { BigMap, Minimap, type MapState } from "./maps.ts";
import type { Airport } from "../data/airports.ts";

export type Prompt = "radio" | "throttle" | "throttle-back" | "pull" | "gear" | "flaps" | "brake" | "steer-left" | "steer-right" | null;

export interface TourStep {
  /** CSS selector inside the HUD (null = a message in the middle of the screen). */
  target: string | null;
  line: Line;
  /** A table of keys and what they do, shown under the words. */
  keys?: [string, string][];
  /** Only on computers (a mouse and keyboard, not a touch screen). */
  desktopOnly?: boolean;
}

/** A mouse (or trackpad) and, nearly always, a keyboard: not a phone or tablet. */
export function hasKeyboardAndMouse(): boolean {
  return matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export interface HudData {
  speedKt: number;
  /** Speed over the ground (airspeed plus the wind), knots. */
  groundKt: number;
  /** Free Flight wind, e.g. "wind 15 kt from W" (null = calm). */
  windText?: string | null;
  altFt: number;
  heading: number;
  bank: number;
  pitch: number;
  throttle: number;
  gearDown: boolean;
  fixedGear: boolean;
  flaps: number;
  onGround: boolean;
  progress: number | null;
  from: string;
  to: string;
  warp: boolean;
  hoopsLeft: number | null;
  /** Cruising altitude for this playne/flight (feet): the height bar fills toward it. */
  cruiseAltFt: number;
  /** Height above the ground right below, feet (null = don't show: on the ground or high up). */
  aglFt: number | null;
  /** Speedbrakes: null = this playne has none, else whether they're out. */
  airbrake: boolean | null;
  /** Fastest indicated airspeed (kt) allowed for flap notches 1, 2 and FULL. */
  flapLimitsKt: number[];
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class Hud {
  root: HTMLElement;
  private speed: HTMLElement;
  private groundSpeed: HTMLElement;
  private windLine: HTMLElement;
  private alt: HTMLElement;
  private ball: SVGGElement;
  private progressBar: HTMLElement;
  private routeEl!: HTMLElement;
  private progressPlane: HTMLElement;
  private fromLabel: HTMLElement;
  private toLabel: HTMLElement;
  private caption: HTMLElement;
  private captionText: HTMLElement;
  private captionWho: HTMLElement;
  private yoke: HTMLElement;
  private knob: HTMLElement;
  private lever: HTMLElement;
  private leverHandle: HTMLElement;
  private buttons: Record<string, HTMLElement> = {};
  private flapLever!: HTMLElement;
  private altBox!: HTMLElement;
  private altFill!: HTMLElement;
  private altTarget!: HTMLElement;
  private flapHandle!: HTMLElement;
  private altAgl!: HTMLElement;
  private leverFill: HTMLElement | null = null;
  private flapDetents: { det: HTMLElement; hint: HTMLElement | null }[] | null = null;
  private flapLevel = 0;
  private airMode = false;
  private toastEl: HTMLElement;
  private whiteEl: HTMLElement;
  private warpEl: HTMLElement;
  private hoopsEl: HTMLElement;
  private hintEl: HTMLElement;
  private prompt: Prompt = null;
  private lookReset: HTMLButtonElement;
  /** Look-around drag (degrees of yaw and pitch to add). */
  onLook: (dYaw: number, dPitch: number) => void = () => {};
  onLookReset: () => void = () => {};
  onOpenMap: () => void = () => {};
  /** The "Names" button (Google mode): town and city names on or off. */
  onPlaceNames: () => void = () => {};
  private namesBtn!: HTMLButtonElement;
  private minimap: Minimap;
  private bigmap: BigMap;
  private leverDragging = false;

  constructor(parent: HTMLElement, private controls: Controls) {
    this.root = el("div", "hud");
    this.root.hidden = true;

    // Top bar
    const top = el("div", "hud-top");
    const left = el("div", "hud-instruments");
    left.innerHTML = `
      <svg class="att" viewBox="-50 -50 100 100" aria-label="Artificial horizon">
        <defs><clipPath id="attclip"><circle r="46"/></clipPath></defs>
        <g clip-path="url(#attclip)"><g class="att-ball">
          <rect x="-120" y="-240" width="240" height="240" fill="#3d8de0"/>
          <rect x="-120" y="0" width="240" height="240" fill="#a0652f"/>
          <line x1="-120" y1="0" x2="120" y2="0" stroke="#fff" stroke-width="2"/>
          <line x1="-14" y1="-16" x2="14" y2="-16" stroke="#fff" stroke-width="1.5"/>
          <line x1="-14" y1="16" x2="14" y2="16" stroke="#fff" stroke-width="1.5"/>
        </g></g>
        <circle r="46" fill="none" stroke="#fff" stroke-width="4"/>
        <path d="M-30 4 L-10 4 L0 12 L10 4 L30 4" fill="none" stroke="#ffcc00" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    this.ball = left.querySelector(".att-ball") as SVGGElement;
    const speedBox = el("div", "gauge gauge-speed", `<div class="gauge-k">SPEED</div><div class="gauge-v">0</div><div class="gauge-u">knots</div><div class="gauge-sub">ground 0</div><div class="gauge-sub gauge-wind" hidden></div>`);
    this.speed = speedBox.querySelector(".gauge-v") as HTMLElement;
    this.groundSpeed = speedBox.querySelector(".gauge-sub") as HTMLElement;
    this.windLine = speedBox.querySelector(".gauge-wind") as HTMLElement;
    left.append(speedBox);

    const center = el("div", "hud-route");
    this.routeEl = center;
    this.fromLabel = el("div", "route-code");
    this.toLabel = el("div", "route-code");
    const track = el("div", "route-track");
    this.progressBar = el("div", "route-fill");
    this.progressPlane = el("div", "route-plane", ICONS.plane);
    track.append(this.progressBar, this.progressPlane);
    center.append(this.fromLabel, track, this.toLabel);

    const right = el("div", "hud-instruments right");
    const altBox = el("div", "gauge gauge-alt", `<div class="gauge-k">HEIGHT</div><div class="gauge-v">0</div><div class="gauge-u">feet</div><div class="alt-bar"><div class="alt-fill"></div></div><div class="alt-target"></div><div class="alt-agl" hidden></div>`);
    this.alt = altBox.querySelector(".gauge-v") as HTMLElement;
    this.altBox = altBox;
    this.altFill = altBox.querySelector(".alt-fill") as HTMLElement;
    this.altTarget = altBox.querySelector(".alt-target") as HTMLElement;
    this.altAgl = altBox.querySelector(".alt-agl") as HTMLElement;
    const pause = this.button("pause", ICONS.pause, "Pause", "small");
    const help = this.button("help", `<svg viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="18" text-anchor="middle" font-size="18" font-weight="900" fill="currentColor" font-family="system-ui, sans-serif">?</text></svg>`, "Help", "small");
    right.append(altBox, help, pause);
    top.append(left, center, right);

    // Caption
    this.caption = el("div", "caption");
    this.captionWho = el("div", "caption-who");
    this.captionText = el("div", "caption-text");
    this.caption.append(this.captionWho, this.captionText);
    this.caption.hidden = true;

    // Yoke pad (bottom-left)
    this.yoke = el("div", "yoke");
    this.yoke.innerHTML = `
      <div class="yoke-label up">nose down</div>
      <div class="yoke-label down">pull to climb</div>
      <div class="yoke-ring"></div>`;
    this.knob = el("div", "yoke-knob", `<svg viewBox="0 0 80 50" aria-hidden="true"><path d="M8 14 Q8 6 16 6 L64 6 Q72 6 72 14 L72 30 Q72 44 58 44 L52 44 L52 30 L28 30 L28 44 L22 44 Q8 44 8 30 Z" fill="#1f2a37" stroke="#fff" stroke-width="3"/><circle cx="40" cy="20" r="6" fill="#ffcc00"/></svg>`);
    this.yoke.append(this.knob);
    this.setupYoke();

    // Throttle + buttons (bottom-right)
    const rightCtl = el("div", "right-controls");
    const btnCol = el("div", "btn-col");
    btnCol.append(
      this.button("radio", ICONS.radio, "Radio"),
      this.button("gear", ICONS.gear, "Wheels"),
      this.button("brake", ICONS.brake, "Brakes"),
      this.button("camera", ICONS.camera, "Camera"),
    );
    const flaps = this.buildFlapLever();
    this.lever = el("div", "lever");
    // Five notch labels: top, three between, bottom (the middle one is HOVER on the helicopter).
    this.lever.innerHTML = `<div class="lever-notches"><span>GO!</span><span></span><span></span><span></span><span>STOP</span></div><div class="lever-track"><div class="lever-fill"></div></div>`;
    this.leverHandle = el("div", "lever-handle");
    this.lever.append(this.leverHandle);
    this.setupLever();
    // Helicopter only: hold to slide sideways (in place of the flap lever).
    const slide = el("div", "heli-slide");
    slide.id = "hud-slide";
    const slideBtn = (dir: -1 | 1, label: string, arrow: string) => {
      const b = el("button", `slide-btn ${dir < 0 ? "left" : "right"}`, `<b>${arrow}</b><span>${label}</span>`) as HTMLButtonElement;
      b.type = "button";
      b.setAttribute("aria-label", dir < 0 ? "Slide left" : "Slide right");
      const up = () => {
        if (this.controls.touchSlide === dir) this.controls.touchSlide = 0;
        b.classList.remove("on");
      };
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        this.controls.touchSlide = dir;
        b.classList.add("on");
      });
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("lostpointercapture", up);
      return b;
    };
    slide.append(slideBtn(-1, "Slide", "◀"), slideBtn(1, "Slide", "▶"));
    rightCtl.append(btnCol, flaps, slide, this.lever);

    this.toastEl = el("div", "toast");
    this.whiteEl = el("div", "whiteout");
    this.warpEl = el("div", "warp", "▶▶ zooming");
    this.warpEl.hidden = true;
    this.hoopsEl = el("div", "hoops-left");
    this.hoopsEl.hidden = true;
    this.hintEl = el("div", "hint-arrow");
    this.hintEl.hidden = true;

    // Look-around bubble and reset-view button (bottom centre).
    const look = el("div", "look");
    const pad = el("div", "look-pad", ICONS.eye);
    pad.setAttribute("aria-label", "Drag to look around");
    this.lookReset = el("button", "look-reset", ICONS.reset) as HTMLButtonElement;
    this.lookReset.type = "button";
    this.lookReset.setAttribute("aria-label", "Reset view");
    this.lookReset.hidden = true;
    this.lookReset.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.onLookReset();
      this.lookReset.hidden = true;
    });
    let last: { x: number; y: number; id: number } | null = null;
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      pad.classList.add("active");
    });
    pad.addEventListener("pointermove", (e) => {
      if (!last || last.id !== e.pointerId) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.onLook(dx * 0.5, -dy * 0.35);
      this.lookReset.hidden = false;
    });
    const end = () => {
      last = null;
      pad.classList.remove("active");
    };
    pad.addEventListener("pointerup", end);
    pad.addEventListener("pointercancel", end);
    look.append(pad, this.lookReset);

    this.minimap = new Minimap(() => this.onOpenMap());
    this.namesBtn = el("button", "names-btn", `${ICONS.pin}<span>Names</span>`) as HTMLButtonElement;
    this.namesBtn.type = "button";
    this.namesBtn.setAttribute("aria-label", "Show the names of towns and cities");
    this.namesBtn.hidden = true;
    this.namesBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.onPlaceNames();
    });
    this.minimap.el.hidden = true;
    this.bigmap = new BigMap(parent);

    this.root.append(top, this.caption, this.yoke, rightCtl, look, this.minimap.el, this.namesBtn, this.toastEl, this.warpEl, this.hoopsEl, this.hintEl);
    parent.append(this.root, this.whiteEl);
  }

  private button(id: string, icon: string, label: string, size = ""): HTMLButtonElement {
    const b = el("button", `hud-btn ${size}`, `${icon}<span>${label}</span>`) as HTMLButtonElement;
    b.type = "button";
    b.id = `hud-${id}`;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (b.classList.contains("off")) return;
      if (id === "brake") {
        // On the ground: wheel brakes (hold). In the air: speedbrakes (tap to toggle).
        if (this.airMode) {
          this.controls.emit("speedbrake");
          return;
        }
        this.controls.state.brake = 1;
        this.brakeHeld = true;
        return;
      }
      this.controls.emit(id as "gear");
    });
    if (id === "brake") {
      const up = () => (this.brakeHeld = false);
      b.addEventListener("pointerup", up);
      b.addEventListener("pointerleave", up);
      b.addEventListener("pointercancel", up);
    }
    this.buttons[id] = b;
    return b;
  }

  brakeHeld = false;

  /**
   * Flap lever with real detents (UP, 1, 2, FULL). Tap a notch or drag the handle; the lever
   * moves one notch at a time, and the playne refuses a notch it's too fast for.
   */
  private buildFlapLever(): HTMLElement {
    const lever = el("div", "flap-lever");
    lever.id = "hud-flaps";
    lever.setAttribute("aria-label", "Flap lever");
    lever.innerHTML = `<div class="flap-title">FLAPS</div><div class="flap-track"></div>`;
    const track = lever.querySelector(".flap-track") as HTMLElement;
    ["UP", "1", "2", "FULL"].forEach((label, i) => {
      const d = el("div", "flap-detent", `<span>${label}</span><em></em>`);
      d.dataset.n = String(i);
      track.append(d);
    });
    this.flapHandle = el("div", "flap-handle");
    track.append(this.flapHandle);
    const pick = (e: PointerEvent) => {
      const r = track.getBoundingClientRect();
      const f = (e.clientY - r.top) / r.height;
      return Math.max(0, Math.min(3, Math.floor(f * 4)));
    };
    let want = -1;
    const go = (n: number) => {
      if (n === want) return;
      want = n;
      const steps = n - this.flapLevel;
      for (let k = 0; k < Math.abs(steps); k++) this.controls.emit(steps > 0 ? "flaps" : "flaps-up");
    };
    lever.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      lever.setPointerCapture(e.pointerId);
      want = -1;
      go(pick(e));
    });
    lever.addEventListener("pointermove", (e) => {
      if (lever.hasPointerCapture(e.pointerId)) go(pick(e));
    });
    this.flapLever = lever;
    this.buttons.flaps = lever;
    return lever;
  }

  /**
   * Interface tour: a ring around each part of the screen with a bubble explaining it (the
   * co-pilot reads it out). Steps whose element isn't on screen are skipped.
   */
  runTour(steps: TourStep[], say: (line: Line) => void): Promise<void> {
    return new Promise((resolve) => {
      const desktop = hasKeyboardAndMouse();
      const live = steps.filter((st) => {
        if (st.desktopOnly && !desktop) return false;
        if (!st.target) return true;
        const e = this.root.querySelector<HTMLElement>(st.target);
        return !!e && !e.closest("[hidden]") && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
      });
      const overlay = el("div", "tour");
      const ring = el("div", "tour-ring");
      const bubble = el("div", "tour-bubble");
      overlay.append(ring, bubble);
      document.body.append(overlay);
      // The bubble already shows what the co-pilot says.
      this.root.classList.add("touring");
      let i = 0;
      const finish = () => {
        overlay.remove();
        this.root.classList.remove("touring");
        window.removeEventListener("resize", show);
        resolve();
      };
      function place(): void {
        const st = live[i];
        const target = st.target ? document.querySelector<HTMLElement>(`.hud ${st.target}`) : null;
        const W = innerWidth;
        const H = innerHeight;
        if (target) {
          const r = target.getBoundingClientRect();
          const pad = 8;
          Object.assign(ring.style, { display: "block", left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
          const bw = Math.min(380, W - 32);
          bubble.style.width = `${bw}px`;
          const below = r.top + r.height / 2 < H / 2;
          const bx = Math.max(16, Math.min(W - bw - 16, r.left + r.width / 2 - bw / 2));
          bubble.style.left = `${bx}px`;
          bubble.style.top = below ? `${Math.min(H - 200, r.bottom + 18)}px` : "";
          bubble.style.bottom = below ? "" : `${Math.max(16, H - r.top + 18)}px`;
        } else {
          ring.style.display = "none";
          const bw = Math.min(st.keys ? 560 : 440, W - 32);
          Object.assign(bubble.style, { width: `${bw}px`, left: `${(W - bw) / 2}px`, top: `${st.keys ? Math.max(16, H * 0.06) : H * 0.32}px`, bottom: "" });
        }
      }
      function show(): void {
        const st = live[i];
        bubble.innerHTML = `<button type="button" class="tour-close" data-t="skip" aria-label="Close the tour">✕</button><div class="tour-text">${st.line.text}</div>${st.keys ? `<table class="tour-keys">${st.keys.map(([k, what]) => `<tr><td>${k.split(" ").map((x) => (x === "or" || x === "/" ? `<span>${x}</span>` : `<kbd>${x}</kbd>`)).join(" ")}</td><td>${what}</td></tr>`).join("")}</table>` : ""}<div class="tour-foot"><span class="tour-count">${i + 1} / ${live.length}</span><span class="tour-btns">${i > 0 ? '<button type="button" class="btn secondary" data-t="back">Back</button>' : '<button type="button" class="btn link" data-t="skip">Skip</button>'}<button type="button" class="btn primary" data-t="next">${i === live.length - 1 ? "Let's fly!" : "Next"}</button></span></div>`;
        place();
        say(st.line);
      }
      overlay.addEventListener("click", (e) => {
        const t = (e.target as HTMLElement).closest("button")?.dataset.t;
        if (t === "next") {
          if (i === live.length - 1) finish();
          else {
            i++;
            show();
          }
        } else if (t === "back" && i > 0) {
          i--;
          show();
        } else if (t === "skip") finish();
      });
      window.addEventListener("resize", show);
      show();
    });
  }

  /** Briefly flash a control (e.g. the flap lever when the playne is too fast for more flaps). */
  flash(id: string): void {
    const b = this.buttons[id];
    if (!b) return;
    b.classList.remove("flash");
    void b.offsetWidth;
    b.classList.add("flash");
  }

  private setupYoke(): void {
    let active: number | null = null;
    const move = (e: PointerEvent) => {
      const r = this.yoke.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const rad = r.width * 0.36;
      let dx = (e.clientX - cx) / rad;
      let dy = (e.clientY - cy) / rad;
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx * rad}px), calc(-50% + ${dy * rad}px)) rotate(${dx * 35}deg)`;
      // Dragging toward you (down the screen) = pull back = nose up.
      this.controls.setTouchYoke(dx, dy, true);
    };
    const end = () => {
      active = null;
      this.knob.style.transform = "translate(-50%, -50%)";
      this.controls.setTouchYoke(0, 0, false);
    };
    this.yoke.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      active = e.pointerId;
      this.yoke.setPointerCapture(e.pointerId);
      move(e);
    });
    this.yoke.addEventListener("pointermove", (e) => {
      if (active === e.pointerId) move(e);
    });
    this.yoke.addEventListener("pointerup", end);
    this.yoke.addEventListener("pointercancel", end);
  }

  private setupLever(): void {
    const setFrom = (e: PointerEvent) => {
      const track = this.lever.querySelector(".lever-track") as HTMLElement;
      const r = track.getBoundingClientRect();
      const v = 1 - (e.clientY - r.top) / r.height;
      this.controls.setThrottle(v);
    };
    this.lever.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.leverDragging = true;
      this.lever.setPointerCapture(e.pointerId);
      setFrom(e);
    });
    this.lever.addEventListener("pointermove", (e) => {
      if (this.leverDragging) setFrom(e);
    });
    const end = () => (this.leverDragging = false);
    this.lever.addEventListener("pointerup", end);
    this.lever.addEventListener("pointercancel", end);
  }

  /**
   * Helicopter controls: the lever is UP / HOVER / DOWN (lift), the stick is forward / slow
   * down and turn, and there are no flaps, wheel or brake buttons.
   */
  /** The radio is greyed out (and does nothing) until the co-pilot asks you to use it. */
  setRadioEnabled(on: boolean): void {
    const b = this.buttons.radio;
    if (!b) return;
    b.classList.toggle("off", !on);
    b.setAttribute("aria-disabled", on ? "false" : "true");
  }

  /** Flaps that work by themselves (the F-16): no flap lever. */
  setAutoFlaps(on: boolean): void {
    this.root.classList.toggle("autoflaps", on);
  }

  /** "Realistic details" in a playne: the side buttons work the rudder. */
  setRudder(on: boolean): void {
    this.root.classList.toggle("rudder", on);
    for (const b of this.root.querySelectorAll(".slide-btn")) {
      const span = b.querySelector("span");
      if (span) span.textContent = on ? "Rudder" : "Slide";
      b.setAttribute("aria-label", `${on ? "Rudder" : "Slide"} ${b.classList.contains("left") ? "left" : "right"}`);
    }
  }

  setHeli(on: boolean): void {
    this.root.classList.toggle("heli", on);
    const notches = this.lever.querySelectorAll(".lever-notches span");
    if (notches[0]) notches[0].textContent = on ? "UP" : "GO!";
    if (notches[2]) notches[2].textContent = on ? "HOVER" : "";
    if (notches[4]) notches[4].textContent = on ? "DOWN" : "STOP";
    const up = this.yoke.querySelector(".yoke-label.up");
    const down = this.yoke.querySelector(".yoke-label.down");
    if (up) up.textContent = on ? "fly forward" : "nose down";
    if (down) down.textContent = on ? "slow down" : "pull to climb";
  }

  show(from: string, to: string): void {
    this.setHeli(false);
    this.setRadioEnabled(true);
    this.root.hidden = false;
    this.routeEl.style.visibility = "";
    this.lookReset.hidden = true;
    this.fromLabel.textContent = from;
    this.toLabel.textContent = to;
    this.setPrompt(null);
    this.toastEl.classList.remove("on");
  }

  setSandbox(on: boolean): void {
    this.minimap.el.hidden = !on;
    if (!on) this.bigmap.close();
  }

  /** The "Names" button: shown only where place names exist (Google mode); lit when on. */
  setPlaceNames(available: boolean, on: boolean): void {
    this.namesBtn.hidden = !available;
    this.namesBtn.classList.toggle("on", on);
    this.namesBtn.setAttribute("aria-pressed", String(on));
  }

  /** Show or hide the trip bar at the top (Free Flight hides it with no destination). */
  setRouteShown(on: boolean): void {
    // (Kept in the layout, so the gauges either side don't move.)
    this.routeEl.style.visibility = on ? "" : "hidden";
  }

  setRoute(from: string, to: string): void {
    this.fromLabel.textContent = from;
    this.toLabel.textContent = to;
  }

  updateMaps(s: MapState): void {
    if (!this.minimap.el.hidden) this.minimap.update(s);
    this.bigmap.update(s);
  }

  openBigMap(s: MapState, onPick: (a: Airport | null) => void, onClose: () => void): void {
    this.bigmap.onPick = onPick;
    this.bigmap.onClose = () => {
      this.bigmap.close();
      onClose();
    };
    this.bigmap.open(s);
  }

  hide(): void {
    this.root.hidden = true;
    this.bigmap.close();
    this.caption.hidden = true;
  }

  setCaption(line: Line | null): void {
    if (!line) {
      this.caption.hidden = true;
      return;
    }
    this.caption.hidden = false;
    this.caption.classList.toggle("tower", line.who === "tower");
    this.captionWho.textContent = line.who === "tower" ? "🗼" : "🧑‍✈️";
    this.captionText.textContent = line.text;
  }

  setPrompt(p: Prompt): void {
    if (p === this.prompt) return;
    this.prompt = p;
    for (const b of Object.values(this.buttons)) b.classList.remove("pulse");
    this.lever.classList.remove("pulse", "pulse-down");
    this.yoke.classList.remove("pulse");
    this.hintEl.hidden = true;
    this.hintEl.className = "hint-arrow";
    if (!p) return;
    if (p === "throttle") this.lever.classList.add("pulse");
    else if (p === "throttle-back") this.lever.classList.add("pulse-down");
    else if (p === "pull") {
      this.yoke.classList.add("pulse");
      this.hintEl.hidden = false;
      this.hintEl.classList.add("pull");
      this.hintEl.textContent = "⬇";
    } else if (p === "steer-left" || p === "steer-right") {
      this.hintEl.hidden = false;
      this.hintEl.classList.add(p);
      this.hintEl.textContent = p === "steer-left" ? "⬅" : "➡";
    } else this.buttons[p]?.classList.add("pulse");
  }

  update(d: HudData): void {
    // Only changed values are written (see dom.ts): this runs every frame.
    setText(this.speed, String(Math.round(d.speedKt)));
    setText(this.groundSpeed, `ground ${Math.round(d.groundKt)}`);
    const wt = d.windText ?? "";
    setText(this.windLine, wt);
    if (this.windLine.hidden !== !wt) this.windLine.hidden = !wt;
    setText(this.alt, d.altFt >= 18000 ? `FL${Math.round(d.altFt / 100)}` : String(Math.round(d.altFt / 10) * 10));
    // Progress toward cruising height.
    const frac = Math.max(0, Math.min(1, d.altFt / Math.max(1, d.cruiseAltFt)));
    setStyle(this.altFill, "width", `${Math.round(frac * 100)}%`);
    const cruising = frac >= 0.97;
    this.altBox.classList.toggle("cruising", cruising);
    setText(this.altTarget, cruising ? "cruising!" : `cruise ${d.cruiseAltFt >= 18000 ? `FL${Math.round(d.cruiseAltFt / 100)}` : d.cruiseAltFt.toLocaleString()}`);
    // Radio altimeter: how high above the ground right below (the big number is above sea level).
    const agl = d.aglFt;
    this.altAgl.hidden = agl === null;
    if (agl !== null) {
      const shown = agl < 100 ? Math.max(0, Math.round(agl / 5) * 5) : Math.round(agl / 10) * 10;
      setText(this.altAgl, `↓ ${shown.toLocaleString()} ft above ground`);
      this.altAgl.classList.toggle("low", agl < 500 && agl >= 150);
      this.altAgl.classList.toggle("danger", agl < 150);
    }
    setAttr(this.ball, "transform", `rotate(${(-d.bank).toFixed(1)}) translate(0 ${Math.max(-40, Math.min(40, d.pitch * 1.6)).toFixed(1)})`);
    if (d.progress !== null) {
      const pct = (Math.max(0, Math.min(1, d.progress)) * 100).toFixed(1);
      setStyle(this.progressBar, "width", `${pct}%`);
      setStyle(this.progressPlane, "left", `${pct}%`);
    }
    const thr = ((this.leverDragging ? this.controls.state.throttle : d.throttle) * 100).toFixed(1);
    setStyle(this.leverHandle, "bottom", `calc(${thr}% * 0.86 + 2%)`);
    this.leverFill ??= this.lever.querySelector(".lever-fill") as HTMLElement;
    setStyle(this.leverFill, "height", `${thr}%`);
    this.buttons.gear.classList.toggle("on", d.gearDown);
    this.buttons.gear.classList.toggle("fixed", d.fixedGear);
    this.flapLevel = d.flaps;
    setAttr(this.flapLever, "data-level", String(d.flaps));
    // Show which notches the current speed allows: too fast = red, with the speed to slow to.
    this.flapDetents ??= [...this.flapLever.querySelectorAll<HTMLElement>(".flap-detent")].map((det) => ({ det, hint: det.querySelector("em") }));
    for (let n = 1; n <= 3; n++) {
      const lim = d.flapLimitsKt[n - 1];
      const blocked = !d.onGround && d.speedKt > lim;
      const det = this.flapDetents[n];
      if (!det) continue;
      det.det.classList.toggle("blocked", blocked);
      if (det.hint) setText(det.hint, blocked ? `slow to ${Math.floor(lim / 5) * 5}` : `${Math.floor(lim / 5) * 5} kt`);
    }
    setStyle(this.flapHandle, "top", `${d.flaps * 25}%`);
    // The brakes button: wheel brakes on the ground, speedbrakes in the air (if the playne has
    // them). Fades out but keeps its spot otherwise, so the other buttons don't jump.
    const air = !d.onGround;
    if (air !== this.airMode) {
      this.airMode = air;
      const label = this.buttons.brake.querySelector("span");
      if (label) label.textContent = air ? "Air brake" : "Brakes";
    }
    this.buttons.brake.classList.toggle("gone", air && d.airbrake === null);
    this.buttons.brake.classList.toggle("on", air && d.airbrake === true);
    this.warpEl.hidden = !d.warp;
    if (d.hoopsLeft !== null && d.hoopsLeft > 0) {
      this.hoopsEl.hidden = false;
      setText(this.hoopsEl, `◯ × ${d.hoopsLeft}`);
    } else this.hoopsEl.hidden = true;
  }

  toast(text: string, kind: "big" | "good" | "info" = "good"): void {
    this.toastEl.textContent = text;
    this.toastEl.className = `toast ${kind}`;
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("on");
    clearTimeout((this as unknown as { _tt?: number })._tt);
    (this as unknown as { _tt?: number })._tt = window.setTimeout(() => this.toastEl.classList.remove("on"), kind === "big" ? 2600 : 1300);
  }

  /** Fade to white (on=true) or back. Resolves when the fade finishes. */
  whiteout(on: boolean, ms = 900): Promise<void> {
    this.whiteEl.style.transitionDuration = `${ms}ms`;
    this.whiteEl.classList.toggle("on", on);
    return new Promise((r) => setTimeout(r, ms + 30));
  }
}
