// Graphics safety: if the GPU/browser throws a rendering error, turn off the newest, most
// demanding features one at a time and restart rendering. Remembered on this device; the
// grown-up settings show what happened and can reset it.

export type GfxFeature = "cumulus" | "props" | "cloudDeck" | "groundPolys" | "terrainDepth" | "msaa";

/** Order in which features are switched off after repeated errors. */
const ORDER: GfxFeature[] = ["cumulus", "props", "cloudDeck", "groundPolys", "terrainDepth", "msaa"];
const KEY = "playnes.gfxsafety.v1";

interface SafetyState {
  off: GfxFeature[];
  lastError: string;
}

function load(): SafetyState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { off: [], lastError: "", ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { off: [], lastError: "" };
}

const state = load();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

export function gfxOn(f: GfxFeature): boolean {
  return !state.off.includes(f);
}

/** Record an error and switch off the next feature. Returns the feature turned off (or null). */
export function degrade(error: unknown): GfxFeature | null {
  const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  state.lastError = msg.slice(0, 400);
  const next = ORDER.find((f) => !state.off.includes(f)) ?? null;
  if (next) state.off.push(next);
  save();
  return next;
}

export function safetyReport(): { off: GfxFeature[]; lastError: string } {
  return { off: [...state.off], lastError: state.lastError };
}

export function resetSafety(): void {
  state.off = [];
  state.lastError = "";
  save();
}

export const FEATURE_NAMES: Record<GfxFeature, string> = {
  cumulus: "puffy clouds",
  props: "trees and buildings",
  cloudDeck: "cruise cloud layer",
  groundPolys: "painted runways",
  terrainDepth: "terrain hiding",
  msaa: "edge smoothing",
};
