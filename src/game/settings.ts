// Parent-controlled settings, saved on this device.

export type WorldChoice = "auto" | "google" | "ion" | "basic";
export type Quality = "auto" | "high" | "low";

export interface Settings {
  world: WorldChoice;
  googleKey: string;
  ionToken: string;
  quality: Quality;
  tilt: boolean;
  invertPitch: boolean;
  tiltFlipPitch: boolean;
  volume: number;
  assistLevel: number;
  /** Minutes before "time to land" reminder; 0 = off. */
  sessionMinutes: number;
}

const KEY = "playnes.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  world: "auto",
  googleKey: "",
  ionToken: "",
  quality: "auto",
  tilt: false,
  invertPitch: false,
  tiltFlipPitch: false,
  volume: 0.9,
  assistLevel: 1,
  sessionMinutes: 0,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Google key from the parent corner, or one baked in at build time (VITE_GOOGLE_MAPS_API_KEY). */
export function googleKey(s: Settings): string {
  return s.googleKey.trim() || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || "";
}

export function ionToken(s: Settings): string {
  return s.ionToken.trim() || (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim() || "";
}

/** Which world actually loads, given the settings and available keys. */
export function resolveWorld(s: Settings): "google" | "ion" | "basic" {
  if (s.world === "google") return googleKey(s) ? "google" : "basic";
  if (s.world === "ion") return ionToken(s) ? "ion" : "basic";
  if (s.world === "basic") return "basic";
  if (googleKey(s)) return "google";
  if (ionToken(s)) return "ion";
  return "basic";
}
