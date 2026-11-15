// The interface tour: what each part of the flying screen does (shown on the first flight, and
// any time from the "?" button). Steps whose element isn't on screen are skipped.

import { LINES } from "../data/lines.ts";
import type { TourStep } from "./hud.ts";

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
  { target: "#hud-help", line: LINES.tourHelp },
  { target: null, line: LINES.tourDone },
];

/** The Chinook tour: shown on its first flight, and from the "?" button while flying it. */
export const HELI_TOUR: TourStep[] = [
  { target: null, line: LINES.heliIntro },
  { target: ".lever", line: LINES.heliLever },
  { target: ".yoke", line: LINES.heliYoke },
  { target: "#hud-slide", line: LINES.heliSlide },
  { target: null, line: LINES.heliLand },
  { target: null, line: LINES.heliDone },
];
