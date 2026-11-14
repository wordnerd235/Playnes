// Every spoken line in the game. Audio files are pre-generated from this list with free TTS
// (scripts/voice/), keyed by a hash of speaker + text. Any line without a file falls back to
// the device's built-in speech, so new lines work immediately.
// This file must stay free of DOM/browser imports: Node scripts import it too.

import { AIRCRAFT } from "./aircraft.ts";
import { AIRPORTS, LANDMARKS } from "./airports.ts";

export type Speaker = "copilot" | "tower";

export interface Line {
  who: Speaker;
  text: string;
}

export const CALLSIGN = "Playne one two three";

const c = (text: string): Line => ({ who: "copilot", text });
const t = (text: string): Line => ({ who: "tower", text });

export const LINES = {
  welcome: c("Hi Captain! I'm your co-pilot. Let's go flying!"),
  pickFlight: c("Where should we fly today?"),
  hangar: c("Welcome to the hangar! Tap a playne to pick it."),
  locked: c("We need more Wings for this playne. Let's fly some charters to earn them!"),
  bought: c("Wow! This playne is yours, Captain!"),
  school: c("Welcome to Flight School! Let's learn to fly."),
  schoolLocked: c("Let's finish the lesson before this one first."),
  lineup: c("We're on the runway. First, let's ask the tower if we can take off. Tap the radio!"),
  radioPrompt: c("Tap the radio button!"),
  throttleUp: c("Push the throttle all the way up!"),
  throttleHelp: c("I'll help you push the throttle."),
  airspeedAlive: c("Airspeed alive!"),
  eightyKnots: c("Eighty knots!"),
  rotate: c("Rotate! Pull back gently!"),
  rotateHelp: c("I'll help you pull back."),
  positiveRate: c("Positive rate! Gear up!"),
  fixedGear: c("Our wheels stay down on this playne. Some playnes keep their wheels out all the time!"),
  gearHelp: c("I'll put the gear up."),
  gearUpGood: c("Gear up! Nice job!"),
  hoops: c("Fly through the hoops! Tilt left and right to steer."),
  hoopGood1: c("Great!"),
  hoopGood2: c("Nice flying!"),
  hoopGood3: c("Right through the middle!"),
  hoopGood4: c("Awesome!"),
  steerLeft: c("Steer to the left!"),
  steerRight: c("Steer to the right!"),
  intoClouds: c("Here come the clouds! Let's climb above them."),
  cruise: c("We're above the clouds! Look how fast we're going!"),
  descend: c("Time to go down through the clouds!"),
  approach: c("There's the runway! Follow the hoops down."),
  gearDownPrompt: c("Gear down! Tap the wheels button."),
  gearDownGood: c("Three green! Our wheels are down."),
  gearDownHelp: c("I'll put the wheels down."),
  flapsPrompt: c("Flaps down! Move the flap lever all the way down. Flaps help us fly slow."),
  flapsGood: c("Flaps down. Good job!"),
  flapsHelp: c("I'll put the flaps down."),
  papi: c("See the lights next to the runway? Two red, two white, you're just right!"),
  flare: c("Almost there. Hold it, hold it..."),
  butter: c("Butter! That was super smooth!"),
  smooth: c("Nice and smooth landing!"),
  firm: c("Firm landing! We're down safe."),
  brakes: c("Now let's slow down and stop."),
  goAround: c("Let's go around and try again. Real pilots do that when it doesn't look right!"),
  terrain: c("Terrain! Pull up!"),
  wingsEarned: c("You earned Wings!"),
  newStamp: c("A new passport stamp!"),
  graduation: c("Congratulations, Captain! You graduated from Flight School! Here are your gold wings, and your very first jet!"),
  lessonDone: c("Lesson complete! Great job!"),
  timeToLand: c("That was so much fun! Time for a break, Captain."),
  needWifi: c("We need the internet to see the real world. The hangar still works!"),
  // Free flight
  freeIntro: c("Free flight! Fly anywhere you like. Tap the map to see where the airports are."),
  pullToTakeoff: c("Pull back to take off!"),
  crash: c("Oops! We crashed. Let's try that again!"),
  edge: c("That's the edge of our map. Let's turn around!"),
  mapAutopilot: c("The autopilot will fly while you look at the map."),
  flapsUp: c("Flaps up! Move the flap lever up so we can fly fast."),
  landingHelp: c("You're lined up with the runway. I'll help you land!"),
  reversers: c("Spoilers up, reversers, brakes! That's how big jets stop."),
  brakesOn: c("Brakes on! We're slowing down."),
  tooFast: c("We're too fast to land! Pull the throttle back."),
  tooFastBrakes: c("Too fast! Throttle back. I'll put out the speed brakes."),
  tooFastFlaps: c("Too fast for more flaps! Slow down first."),
  flapsRelief: c("We're going too fast for the flaps, so I'm bringing them up a notch."),
  speedbrakesOut: c("Speed brakes out. They help us slow down."),
  speedbrakesIn: c("Speed brakes in."),
  sonicBoom: c("Boom! We just broke the sound barrier!"),
  fighterFreeOnly: c("Fighter jets only have one seat, so we'll fly a playne with seats for charters."),
  emergencyLanding: c("We made it down safely! Great emergency landing."),
  routeCleared: c("Okay, no destination. Fly wherever you like!"),
  // Lesson 1: meet your plane
  l1Intro: c("This is your playne! Tap each part to learn its name."),
  l1Wings: c("These are the wings. Wings lift us up like a bird!"),
  l1Tail: c("This is the tail. It keeps us flying straight."),
  l1Prop: c("This is the propeller. It spins super fast to pull us forward!"),
  l1Wheels: c("These are the wheels. We roll on them before we fly."),
  l1Cockpit: c("This is the cockpit. That's where the pilots sit!"),
  l1Done: c("You know all the parts of your playne!"),
  // Lesson 2: go fast, go slow
  l2Intro: c("Let's learn to go fast and slow. Push the throttle up to go!"),
  l2Slow: c("Now pull the throttle all the way back to slow down."),
  l2Brake: c("Press the brakes to stop!"),
  l2Done: c("Great stopping! You're the boss of the throttle."),
  // Lesson 3: takeoff
  l3Intro: c("Today we learn to take off!"),
  l3Done: c("You did your first takeoff!"),
  // Lesson 4: turning
  l4Intro: c("Let's practice turning. Tilt the wings to turn, like leaning on a bike!"),
  l4Done: c("You're a turning pro!"),
  // Lesson 5: landing
  l5Intro: c("Now the most important part: landing! Steer toward the hoops."),
  l5Done: c("You landed the playne! Amazing!"),
} satisfies Record<string, Line>;

export type LineKey = keyof typeof LINES;

export interface Passenger {
  id: string;
  icon: string;
  /** Singular subject, e.g. "The Lopez family". */
  spoken: string;
  count: number;
}

export const PASSENGERS: Passenger[] = [
  { id: "family", icon: "👨‍👩‍👧‍👦", spoken: "The Lopez family", count: 4 },
  { id: "grandma", icon: "👵", spoken: "Grandma", count: 1 },
  { id: "team", icon: "🏀", spoken: "A basketball team", count: 9 },
  { id: "doctor", icon: "🩺", spoken: "A doctor with medicine", count: 2 },
  { id: "band", icon: "🎸", spoken: "A rock band", count: 5 },
  { id: "puppies", icon: "🐶", spoken: "A puppy rescue team", count: 3 },
  { id: "party", icon: "🎂", spoken: "A birthday party", count: 6 },
];

// ----- Templated lines -----

export const tpl = {
  readyForTakeoff: (tower: string, rwy: string) => c(`${tower}, ${CALLSIGN}, ready for takeoff, runway ${rwy}.`),
  clearedTakeoff: (tower: string, rwy: string) => t(`${CALLSIGN}, ${tower}, runway ${rwy}, cleared for takeoff.`),
  onFinal: (tower: string, rwy: string) => c(`${tower}, ${CALLSIGN}, on final, runway ${rwy}.`),
  clearedLand: (rwy: string) => t(`${CALLSIGN}, runway ${rwy}, cleared to land.`),
  welcomeTo: (airport: string) => t(`${CALLSIGN}, welcome to ${airport}!`),
  landmark: (name: string, fact: string) => c(`Look down! That's ${name}! ${fact}`),
  planeIntro: (spoken: string) => c(`This is the ${spoken}!`),
  planeWow: (wow: string) => c(wow),
  charter: (who: string, airport: string) => c(`${who} wants to fly to ${airport}!`),
  nextStop: (airport: string) => c(`Next stop, ${airport}!`),
};

/** Every concrete line the game can say, for the audio generator. */
export function allLines(): Line[] {
  const out: Line[] = Object.values(LINES);
  for (const a of AIRPORTS) {
    for (const end of a.runway.ends) {
      out.push(tpl.readyForTakeoff(a.towerName, end.spoken));
      out.push(tpl.clearedTakeoff(a.towerName, end.spoken));
      out.push(tpl.onFinal(a.towerName, end.spoken));
      out.push(tpl.clearedLand(end.spoken));
    }
    out.push(tpl.welcomeTo(a.spoken));
    out.push(tpl.nextStop(a.spoken));
    for (const p of PASSENGERS) out.push(tpl.charter(p.spoken, a.spoken));
  }
  for (const l of LANDMARKS) out.push(tpl.landmark(l.spoken, l.fact));
  for (const ac of AIRCRAFT) {
    out.push(tpl.planeIntro(ac.spoken));
    out.push(tpl.planeWow(ac.wow));
  }
  const seen = new Set<string>();
  return out.filter((l) => {
    const k = lineKey(l);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Stable id for a line's audio file (FNV-1a of speaker + text). */
export function lineKey(l: Line): string {
  const s = `${l.who}|${l.text}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Text as it should be pronounced (TTS has never heard of "Playne"). */
export function speakable(text: string): string {
  return text.replace(/([Pp])layne/g, "$1lane").replace(/Tri-Cities/g, "Tri Cities").replace(/\.\.\./g, ",");
}
