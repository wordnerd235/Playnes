// In-flight heads-up display and touch controls: yoke pad, throttle lever, big buttons,
// kid-readable instruments, co-pilot caption, prompts and the cloud "whiteout".

import type { Line } from "../data/lines.ts";
import type { Controls } from "../input/controls.ts";
import { ICONS } from "./icons.ts";
import { BigMap, Minimap, type MapState } from "./maps.ts";
import type { Airport } from "../data/airports.ts";

export type Prompt = "radio" | "throttle" | "throttle-back" | "pull" | "gear" | "flaps" | "brake" | "steer-left" | "steer-right" | null;

export interface HudData {
  speedKt: number;
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
  terrain: boolean;
  hoopsLeft: number | null;
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
  private alt: HTMLElement;
  private ball: SVGGElement;
  private progressBar: HTMLElement;
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
  private buttons: Record<string, HTMLButtonElement> = {};
  private toastEl: HTMLElement;
  private whiteEl: HTMLElement;
  private terrainEl: HTMLElement;
  private warpEl: HTMLElement;
  private hoopsEl: HTMLElement;
  private hintEl: HTMLElement;
  private prompt: Prompt = null;
  private lookReset: HTMLButtonElement;
  /** Look-around drag (degrees of yaw and pitch to add). */
  onLook: (dYaw: number, dPitch: number) => void = () => {};
  onLookReset: () => void = () => {};
  onOpenMap: () => void = () => {};
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
    const speedBox = el("div", "gauge", `<div class="gauge-k">SPEED</div><div class="gauge-v">0</div><div class="gauge-u">knots</div>`);
    this.speed = speedBox.querySelector(".gauge-v") as HTMLElement;
    left.append(speedBox);

    const center = el("div", "hud-route");
    this.fromLabel = el("div", "route-code");
    this.toLabel = el("div", "route-code");
    const track = el("div", "route-track");
    this.progressBar = el("div", "route-fill");
    this.progressPlane = el("div", "route-plane", ICONS.plane);
    track.append(this.progressBar, this.progressPlane);
    center.append(this.fromLabel, track, this.toLabel);

    const right = el("div", "hud-instruments right");
    const altBox = el("div", "gauge", `<div class="gauge-k">HEIGHT</div><div class="gauge-v">0</div><div class="gauge-u">feet</div>`);
    this.alt = altBox.querySelector(".gauge-v") as HTMLElement;
    const pause = this.button("pause", ICONS.pause, "Pause", "small");
    right.append(altBox, pause);
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
      this.button("flaps", ICONS.flaps, "Flaps"),
      this.button("brake", ICONS.brake, "Brakes"),
      this.button("camera", ICONS.camera, "Camera", "small"),
    );
    this.lever = el("div", "lever");
    this.lever.innerHTML = `<div class="lever-notches"><span>GO!</span><span></span><span></span><span>STOP</span></div><div class="lever-track"><div class="lever-fill"></div></div>`;
    this.leverHandle = el("div", "lever-handle");
    this.lever.append(this.leverHandle);
    this.setupLever();
    rightCtl.append(btnCol, this.lever);

    this.toastEl = el("div", "toast");
    this.whiteEl = el("div", "whiteout");
    this.terrainEl = el("div", "terrain-warn", "PULL UP!");
    this.terrainEl.hidden = true;
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
    this.minimap.el.hidden = true;
    this.bigmap = new BigMap(parent);

    this.root.append(top, this.caption, this.yoke, rightCtl, look, this.minimap.el, this.toastEl, this.terrainEl, this.warpEl, this.hoopsEl, this.hintEl);
    parent.append(this.root, this.whiteEl);
  }

  private button(id: string, icon: string, label: string, size = ""): HTMLButtonElement {
    const b = el("button", `hud-btn ${size}`, `${icon}<span>${label}</span>`) as HTMLButtonElement;
    b.type = "button";
    b.id = `hud-${id}`;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (id === "brake") {
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

  show(from: string, to: string): void {
    this.root.hidden = false;
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

  setRoute(from: string, to: string): void {
    this.fromLabel.textContent = from;
    this.toLabel.textContent = to;
  }

  updateMaps(s: MapState): void {
    if (!this.minimap.el.hidden) this.minimap.update(s);
    this.bigmap.update(s);
  }

  openBigMap(s: MapState, onPick: (a: Airport) => void, onClose: () => void): void {
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
    this.speed.textContent = String(Math.round(d.speedKt));
    this.alt.textContent = d.altFt >= 18000 ? `FL${Math.round(d.altFt / 100)}` : String(Math.round(d.altFt / 10) * 10);
    this.ball.setAttribute("transform", `rotate(${-d.bank}) translate(0 ${Math.max(-40, Math.min(40, d.pitch * 1.6))})`);
    if (d.progress !== null) {
      const pct = Math.max(0, Math.min(1, d.progress)) * 100;
      this.progressBar.style.width = `${pct}%`;
      this.progressPlane.style.left = `${pct}%`;
    }
    if (!this.leverDragging) {
      this.leverHandle.style.bottom = `calc(${d.throttle * 100}% * 0.86 + 2%)`;
      (this.lever.querySelector(".lever-fill") as HTMLElement).style.height = `${d.throttle * 100}%`;
    } else {
      this.leverHandle.style.bottom = `calc(${this.controls.state.throttle * 100}% * 0.86 + 2%)`;
      (this.lever.querySelector(".lever-fill") as HTMLElement).style.height = `${this.controls.state.throttle * 100}%`;
    }
    this.buttons.gear.classList.toggle("on", d.gearDown);
    this.buttons.gear.classList.toggle("fixed", d.fixedGear);
    this.buttons.flaps.classList.toggle("on", d.flaps >= 2);
    this.buttons.flaps.dataset.level = String(d.flaps);
    this.buttons.brake.hidden = !d.onGround;
    this.terrainEl.hidden = !d.terrain;
    this.warpEl.hidden = !d.warp;
    if (d.hoopsLeft !== null && d.hoopsLeft > 0) {
      this.hoopsEl.hidden = false;
      this.hoopsEl.textContent = `◯ × ${d.hoopsLeft}`;
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
