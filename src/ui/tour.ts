// The interface tour: what each part of the flying screen does (shown on the first flight, and
// any time from the "?" button). Steps whose element isn't on screen are skipped.

import { LINES } from "../data/lines.ts";
import type { TourStep } from "./hud.ts";

/** Keyboard keys for the playnes (see src/input/controls.ts). */
export const PLANE_KEYS: [string, string][] = [
  ["← → or A D", "Turn left / right"],
  ["↓ or S", "Pull back: nose up, climb"],
  ["↑ or W", "Push: nose down, dive"],
  ["Shift or + or PgUp", "More power (hold)"],
  ["Ctrl or − or PgDn", "Less power (hold)"],
  ["Space", "Wheel brakes (hold)"],
  ["F / V", "Flaps down / up one notch"],
  ["G", "Wheels up / down"],
  ["B", "Speedbrakes"],
  ["C", "Change camera"],
  ["R or T", "Radio"],
  ["P or Esc", "Pause"],
  ["H or ?", "This help"],
];

/** Keyboard keys for the Chinook. */
export const HELI_KEYS: [string, string][] = [
  ["Shift or + or PgUp", "Lever up: go up (middle = hover)"],
  ["Ctrl or − or PgDn", "Lever down: come down"],
  ["↑ or W", "Fly forward"],
  ["↓ or S", "Slow down, then fly backward"],
  ["← → or A D", "Turn left / right"],
  ["Q / E", "Slide left / right"],
  ["C", "Change camera"],
  ["P or Esc", "Pause"],
  ["H or ?", "This help"],
];

export const TOUR: TourStep[] = [
  { target: null, line: LINES.tourIntro },
  { target: ".gauge-speed", line: LINES.tourSpeed },
  { target: ".att", line: LINES.tourBall },
  { target: ".gauge-alt", line: LINES.tourHeight },
  { target: ".hud-route", line: LINES.tourRoute },
  { target: ".minimap", line: LINES.tourMap },
  { target: ".yoke", line: LINES.tourYoke },
  { target: ".lever", line: LINES.tourThrottle },
  { target: "#hud-flaps", line: LINES.tourFlaps },
  { target: "#hud-gear", line: LINES.tourWheels },
  { target: "#hud-brake", line: LINES.tourBrakes },
  { target: "#hud-radio", line: LINES.tourRadio },
  { target: "#hud-camera", line: LINES.tourCamera },
  { target: ".look-pad", line: LINES.tourLook },
  { target: null, line: LINES.tourKeys, keys: PLANE_KEYS, desktopOnly: true },
  { target: "#hud-help", line: LINES.tourHelp },
  { target: null, line: LINES.tourDone },
];

/** The Chinook tour: shown on its first flight, and from the "?" button while flying it. */
export const HELI_TOUR: TourStep[] = [
  { target: null, line: LINES.heliIntro },
  { target: ".lever", line: LINES.heliLever },
  { target: ".yoke", line: LINES.heliYoke },
  { target: "#hud-slide", line: LINES.heliSlide },
  { target: null, line: LINES.heliKeys, keys: HELI_KEYS, desktopOnly: true },
  { target: null, line: LINES.heliLand },
  { target: null, line: LINES.heliDone },
];
