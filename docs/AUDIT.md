# Audit of the game so far (November 2026)

What was checked: every aircraft's numbers in `src/data/aircraft.ts`, the flight physics
(`src/sim/physics.ts`, `src/sim/heli.ts`), the control layer (`src/sim/assist.ts`), and the shape
of the code. Figures were checked against what is widely published for each type; where a web
search confirmed a figure it says so, otherwise it is from general knowledge and should be
confirmed against a manufacturer sheet before it is treated as certain.

## 1. Aircraft numbers

Most of the data is right: cruise speeds, ranges, lengths, spans, seats and speed limits match
the published figures for nearly every type. These are the things that are off:

| Playne | What's there | Should be | Status |
|---|---|---|---|
| Pilatus PC-24 | Mmo 0.76 | **0.74** (confirmed by search) | fixed in the test copy |
| Challenger 3500 | Mmo 0.85 | **0.83** (confirmed by search) | fixed in the test copy |
| HondaJet Elite II | tail "conventional" | **T-tail** | not fixed (needs the model rebuilt) |
| Citation Latitude | tail "t-tail" | **cruciform** (tailplane part-way up the fin) | not fixed; confirm first |
| Pilatus PC-24 | winglets: no | has small winglets | not fixed; cosmetic |
| Global 8000 | span 32.4 m | about 31.7 m (104 ft) | not fixed; confirm first |
| Phenom 300E | span 16.2 m | about 15.9 m | not fixed; cosmetic |
| PC-12 NGX | Vmo 236 kt | 240 kt | not fixed; tiny |
| F-16 | "cruise 1000 kt" | that is its top speed (about Mach 2 high up); it cruises near 500 kt | wording only: shown on the hangar card |
| F-16 | roll rate 180 deg/s | the real one manages 240+ | a deliberate softening; could be raised |
| Chinook | ceiling 4,600 m | service ceiling is about 6,100 m (20,000 ft) | not fixed; minor |

Things every playne gets that only some should have (see section 3):

- **Thrust reversers** are given to every jet. The Phenom 100, Phenom 300, HondaJet and PC-24
  have none in real life (from general knowledge; the Praetor 600's were confirmed by search).
  The Falcon 8X has one, on the middle engine only.
- **A flap lever with three notches** is given to the F-16. The real one has no flap lever: its
  flaps move by themselves when the wheels go down.

## 2. Controls: how realistic are they?

The controls are an honest simplification, closer to an airliner's autopilot knobs than to a
real stick:

- **Left/right** sets a *bank angle* (full stick = 45 degrees, 60 in Free Flight, 75 in the
  fighter) and **letting go levels the wings**. A real playne keeps the bank it has until you
  roll it back.
- **Up/down** sets a *climb or descent rate*, and letting go returns to level flight. A real
  stick sets the nose attitude, and the playne stays where you put it (with trim).
- **The lever** is a real throttle (in Free Flight). That part is realistic, including gliding
  down when the power is off.
- **Rudder** isn't a control at all (turns are always perfectly coordinated).
- **Flaps, wheels, speedbrakes, brakes**: real and done properly (speed limits on the flaps,
  wheels can't retract on the ground, brakes bite harder with spoilers).

**Suggestion:** keep these as the "Easy" controls and add a grown-up setting, "Real controls":
stick sideways = roll *rate* (it stays banked), stick back = pitch *rate* (it stays where you
put it, with speed-stable trim), plus optional rudder on the keyboard. That is a contained
change in `src/sim/assist.ts` (a second `computeCommands`), with no change to the physics.

## 3. Physics: what's real and what isn't

**Real and done well**
- Standard atmosphere: air thins with height, so thrust falls, true speed rises for the same
  indicated speed, and the speed of sound drops (Mach limits work as they should).
- Each playne is calibrated to *its own book numbers*: it climbs at its published rate at its
  published climb speed, and cruises at its published speed at its cruise height.
- Drag has both parts (the part that grows with speed and the part from making lift), so there
  is a real best-glide speed and gliding with the power off behaves correctly.
- Turns use the real formula (turn rate = g x tan(bank) / speed): fast playnes turn wide.
- Flaps and wheels add drag; flaps lower the stall speed; speedbrakes work better when fast.

**Simplified in ways that matter for "accurate"** (ranked by how much realism each would add)

1. **Turning costs nothing.** A steep turn should need more lift, which makes more drag: at
   60 degrees of bank a playne pulls 2 g and that drag quadruples. Here speed and height are
   unaffected, so the F-16 can hold a 75-degree turn forever. Fix: multiply the lift-drag term
   by (1 / cos bank) squared. Small change, big gain, and the fighter will finally bleed speed
   in hard turns as the real one does.
2. **Stall speed doesn't rise in a turn.** It should go up with the square root of the g being
   pulled. Fix alongside (1): scale the low-speed protection the same way.
3. **No g limit.** The fighter's nose moves at a fixed 20 degrees a second, which is about 7 g
   at 400 kt (right) but 14 g at 800 kt (impossible). Fix: cap the rate at
   (g limit x 9.81 / speed): 9 g for the F-16, 2.5 to 3.8 g for the others.
4. **Stalls can't happen at all.** The co-pilot always lowers the nose first. That is true to
   life for the fly-by-wire types (F-16, Falcon 8X, G650/G700, Global 8000) but not for the
   Cessna, PC-12 and the smaller jets. Fix: a grown-up setting, "real stalls", for those types:
   nose drops, height is lost, recover by lowering the nose and adding power.
5. **No wind.** No headwind, tailwind, crosswind or bumps. Runway choice uses a "prevailing
   wind end" but the air itself is still. A gentle steady wind per airport would be a good next
   step (crosswind landings are a core pilot skill).
6. **The takeoff roll is boosted by 30 percent** on purpose, so a small child isn't waiting.
   Fix: make it part of "Easy" only.
7. **Engines answer instantly** (full power in about 0.6 s). Real jets take 5 to 8 seconds to
   spool up from idle; pistons are quick. Fix: a per-type spool time.
8. **No ground effect, no bounce** on a hard landing, and the landing check is only "how fast
   were you sinking".

**Behaviours particular to each type that could be added** (all from general knowledge)

- **Cessna 172:** pulls gently left at full power in the climb (needs a little right rudder);
  floats in the flare if you come in fast; a gentle, forgiving stall.
- **PC-12:** strong pull to one side at takeoff power; a stick shaker and pusher before the
  stall; reverse pitch on the propeller for stopping (already has reversers).
- **Phenom 100 / 300, HondaJet, PC-24:** no thrust reversers: they stop with brakes and
  spoilers only, so landings roll longer. The PC-24 is built for short and unpaved strips.
- **Falcon 8X:** one reverser (centre engine); slats let it approach unusually slowly (its low
  approach speed is already in the data).
- **G650ER / G700 / Global 8000:** fly-by-wire, so the "can't stall" protection is realistic.
- **F-16:** fly-by-wire with a 9 g and angle-of-attack limiter (so no stall is realistic);
  flaps are automatic; no reversers (correct already); pilots hold the nose high after
  touchdown to slow down ("aerobraking") before lowering it and braking.
- **Chinook:** it *can* land on calm water (the hull is sealed), which the game currently
  refuses; it taxis on its wheels; with two rotors turning opposite ways it needs no tail rotor.

## 4. The code

**In good shape**
- Clear split: `sim/` (pure physics, no graphics, unit-tested), `world/` (maps), `game/`
  (flights), `ui/`, `data/`. 75 unit tests plus scripted in-browser tests under `tools/`.
- Versions are pinned exactly (Cesium 1.146.0, three 0.186.1), which matters because of the
  next point.

**Risks**
- **The game reaches into Cesium's private internals in about ten places** (`_statistics`,
  `_memoryAdjustedScreenSpaceError`, `_contentState`, `_cache`, patched `prePassesUpdate`,
  `Statistics.clone`, `scene.getHeight`). These are what made Google mode stable, and each is
  guarded, but any Cesium upgrade can silently break them. Before upgrading Cesium, re-run
  `tools/diag-google.cjs` and read `src/world/governor.ts`, `tilePruner.ts` and the Google part
  of `world.ts` against the new source.
- **`src/game/flight.ts` is 2,300 lines** in one class (lessons, charters, Free Flight, the
  helicopter, landing logic, route following, HUD updates). It works, but it is the hardest
  file to change safely. Worth splitting by mode (lesson / charter / free / helicopter) with
  the shared parts kept in a base; no behaviour change intended.
- There is no working lint setup (ESLint has no config file), so style and unused-code checks
  rely on TypeScript alone.

**Could be faster or smaller, with nothing lost**
- The published site is about 60 MB, most of it Cesium's own asset folder (many files the
  game never loads) and the voice clips. Only what is used gets downloaded, so this costs
  disk on the server, not the player.
- Thirteen of the fifteen aircraft models are stored without shared corners (about 1.2 MB
  each); the new builder's shared-corner format made the F-16 smaller even with a whole
  cockpit added. Rebuilding the others the same way would cut roughly 5 MB of downloads.
- `tools/` has 35 scripts with a lot of repeated start-up code (open the page, press Tap to
  fly, start a mission); a shared helper would make new tests quicker to write.

## 5. Suggested order

1. Physics items 1 to 3 (turn drag, turn stall speed, g limit): small, contained, and they make
   every playne fly more truthfully. Test copy first; the fighter will feel different.
2. Per-type truth: reversers only where real; F-16 flaps automatic; Chinook water landings.
3. "Real controls" and "real stalls" as grown-up settings, leaving Easy as the default.
4. Wind.
5. Split `flight.ts`; add lint.
