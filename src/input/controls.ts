// One control state fed by every input method: on-screen yoke + throttle lever (touch/mouse),
// tilt (device motion), keyboard and game controller. Taps on buttons arrive as events.

import { clamp } from "../sim/geo.ts";

export type ControlEvent = "gear" | "flaps" | "camera" | "radio" | "pause" | "throttle-full";

export interface ControlState {
  roll: number;
  pitch: number;
  /** Lever position 0..1 (absolute). */
  throttle: number;
  brake: number;
  /** True once the player has touched the throttle since it was last reset. */
  throttleTouched: boolean;
}

type Listener = (e: ControlEvent) => void;

export class Controls {
  state: ControlState = { roll: 0, pitch: 0, throttle: 0, brake: 0, throttleTouched: false };
  invertPitch = false;
  tiltEnabled = false;
  /** Some browsers report gravity with the opposite sign; parents can flip tilt up/down. */
  tiltFlipPitch = false;

  private touchRoll = 0;
  private touchPitch = 0;
  private touchActive = false;
  private keys = new Set<string>();
  private tiltRoll = 0;
  private tiltPitch = 0;
  private tiltCal: { roll: number; pitch: number } | null = null;
  private listeners: Listener[] = [];
  private padPrev: boolean[] = [];
  private lastTiltRaw: { roll: number; pitch: number } | null = null;

  constructor() {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
    window.addEventListener("blur", () => this.keys.clear());
    window.addEventListener("devicemotion", (e) => this.onMotion(e));
  }

  on(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  emit(e: ControlEvent): void {
    for (const l of this.listeners) l(e);
  }

  setThrottle(v: number, fromPlayer = true): void {
    this.state.throttle = clamp(v, 0, 1);
    if (fromPlayer) this.state.throttleTouched = true;
  }

  setTouchYoke(roll: number, pitch: number, active: boolean): void {
    this.touchRoll = clamp(roll, -1, 1);
    this.touchPitch = clamp(pitch, -1, 1);
    this.touchActive = active;
  }

  /** Ask iOS for motion permission. Must be called from a tap. */
  static async requestMotionPermission(): Promise<boolean> {
    const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === "function") {
      try {
        return (await DME.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
    return typeof window.DeviceMotionEvent !== "undefined";
  }

  /** Use the way the device is held right now as "neutral". */
  calibrateTilt(): void {
    this.tiltCal = this.lastTiltRaw ? { ...this.lastTiltRaw } : null;
  }

  private onMotion(e: DeviceMotionEvent): void {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x === null || g.y === null || g.z === null) return;
    // Rotate gravity into screen coordinates for the current orientation.
    const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    const r = (angle * Math.PI) / 180;
    const sx = g.x * Math.cos(r) - g.y * Math.sin(r);
    const sy = g.x * Math.sin(r) + g.y * Math.cos(r);
    // Steering-wheel roll: rotation of the gravity vector within the screen plane.
    // Turning the iPad clockwise (like a wheel to the right) gives positive roll. Browsers
    // disagree on the sign of gravity readings, which only adds a constant offset here,
    // and calibration removes it.
    const roll = Math.atan2(-sx, sy);
    // Pitch: tilting the top edge toward/away from the player.
    const pitch = Math.atan2(g.z, Math.hypot(sx, sy));
    this.lastTiltRaw = { roll, pitch };
    if (!this.tiltCal) this.tiltCal = { roll, pitch };
    const wrapPi = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
    const dr = wrapPi(roll - this.tiltCal.roll);
    const dp = (pitch - this.tiltCal.pitch) * (this.tiltFlipPitch ? -1 : 1);
    const deadzone = (v: number, dz: number) => (Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz));
    this.tiltRoll = clamp(deadzone(clamp(dr / 0.45, -1, 1), 0.08), -1, 1);
    this.tiltPitch = clamp(deadzone(clamp(dp / 0.35, -1, 1), 0.1), -1, 1);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down) {
      if (!this.keys.has(k)) {
        if (k === "g") this.emit("gear");
        if (k === "f") this.emit("flaps");
        if (k === "c") this.emit("camera");
        if (k === "r" || k === "t") this.emit("radio");
        if (k === "p" || k === "Escape") this.emit("pause");
      }
      this.keys.add(k);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "PageUp", "PageDown"].includes(k)) e.preventDefault();
    } else {
      this.keys.delete(k);
    }
  }

  /** Call once per frame. Merges all sources into `state`. */
  update(dt: number): void {
    const k = this.keys;
    let roll = 0;
    let pitch = 0;
    if (k.has("ArrowLeft") || k.has("a")) roll -= 1;
    if (k.has("ArrowRight") || k.has("d")) roll += 1;
    // Arrow down / S = pull back (nose up), like a real yoke.
    if (k.has("ArrowDown") || k.has("s")) pitch += 1;
    if (k.has("ArrowUp") || k.has("w")) pitch -= 1;
    if (k.has("PageUp") || k.has("=") || k.has("+") || k.has("Shift")) this.setThrottle(this.state.throttle + dt * 0.6);
    if (k.has("PageDown") || k.has("-") || k.has("Control")) this.setThrottle(this.state.throttle - dt * 0.6);
    let brake = k.has(" ") ? 1 : 0;

    // Game controller (standard mapping).
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
      roll += dz(pad.axes[0] ?? 0);
      pitch += dz(pad.axes[1] ?? 0); // stick back (positive y) = pull back
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      if (rt > 0.05) this.setThrottle(this.state.throttle + rt * dt * 0.7);
      if (lt > 0.05) this.setThrottle(this.state.throttle - lt * dt * 0.7);
      if (pad.buttons[1]?.pressed && pad.buttons[5]?.pressed) brake = 1;
      const map: [number, ControlEvent][] = [[0, "gear"], [1, "flaps"], [3, "camera"], [2, "radio"], [9, "pause"]];
      for (const [i, ev] of map) {
        const pressed = !!pad.buttons[i]?.pressed;
        if (pressed && !this.padPrev[i]) this.emit(ev);
        this.padPrev[i] = pressed;
      }
      break;
    }

    if (this.touchActive) {
      roll += this.touchRoll;
      pitch += this.touchPitch;
    }
    if (this.tiltEnabled && !this.touchActive) {
      roll += this.tiltRoll;
      pitch += this.tiltPitch;
    }
    if (this.invertPitch) pitch = -pitch;
    this.state.roll = clamp(roll, -1, 1);
    this.state.pitch = clamp(pitch, -1, 1);
    this.state.brake = brake;
  }

  reset(): void {
    this.state = { roll: 0, pitch: 0, throttle: 0, brake: 0, throttleTouched: false };
    this.touchActive = false;
  }
}
