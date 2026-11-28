# Handoff: the detailed-models work (for whoever continues it)

Written at the end of the first stage of the "make the graphics excellent" work. Read this
first, then `docs/AUDIT.md` (what is and isn't realistic in the game, with a suggested order)
and the model section of `docs/SETUP.md`.

## Where things stand

- **Two published copies.** The stable game is at `.../Playnes/` and is built from the commit
  named in `.stable-ref` (currently `d16eec6`). Everything newer is published as the **test
  copy** at `.../Playnes/test/`. All work goes on branch `claude/awesome-pasteur-jvhruw`; the
  deploy workflow (`.github/workflows/deploy.yml`, run by hand with the GitHub tool) builds
  both. **Never change `.stable-ref` unless the owner says to promote the test copy.**
- The test copy keeps its own saved progress (`src/testCopy.ts` renames every `playnes.*`
  storage key to `playnes-test.*`) and has a service worker that caches nothing.
- **Done in the test copy:** the F-16 rebuilt from its real dimensions with a modelled cockpit,
  moving gear, wheels, speedbrakes, afterburner, HUD figures; soft shadows baked into the
  model; 1.5x drawing resolution in the cartoon world on phones and tablets; two Mmo
  corrections from the audit.
- **Also done in the test copy:** the audit's physics items 1 to 3 (turns now cost energy,
  stall speed rises in a turn, g limits; `src/sim/physics.ts`, with tests), and the cartoon
  map's trees and buildings (see "Trees and buildings" below).
- **Also done in the test copy:** the Cessna 172 (`scripts/model-c172.mjs`), built from its
  real dimensions: fuselage with see-through cabin glass, strut-braced high wing with flaps and
  ailerons, fixed gear with teardrop wheel covers, a steering nose wheel and turning wheels, a
  full cabin (panel with six dials, radios, two yokes, pedals, two front seats and a rear
  bench, a pilot). The airspeed, altimeter and attitude dials move with the flight. The
  propeller becomes a faint blur disc once it is turning fast, and from the pilot's seat only
  the disc shows. The passenger-window view sits on the rear bench (`rig.windowEye`) instead of
  the drawn porthole. "Meet your playne" and the hangar picture were re-rendered.
- **Also done in the test copy:** the Phenom 300E (`scripts/model-phenom300.mjs`), the first
  passenger cabin. Real window openings: the skin is a grid over (station, angle) with every
  window's edges on grid lines, so each window is a clean rectangular hole; a frame patch (the
  rectangle minus the rounded window, laid onto the curved skin) fills the corners; glass sits
  just inside; a reveal tube joins the skin to a cabin lining that has the same holes. The
  windshield uses free-form outlines inside one big cut-out (`polys`). `refine()` splits long
  triangle edges so flat shapes laid onto the skin follow its curve. Cabin: club four with
  tables, two forward-facing seats, refreshment centre, aft lavatory wall, dropped aisle.
  Cockpit: three big screens, glareshield, pedestal, control wheels, pilot. `rig.eyePitch`
  tilts the cockpit view down a little so the screens show.
- **Now detailed:** every playne (the jet kit covers the business jets and the PC-12; the
  Cessna, F-16, Phenom 300E and Chinook are hand-built).
- **The Chinook** (`scripts/model-ch47.mjs`): measured on side photos (overlay checked; heights
  taken from the level photos, not the one shot from below, which stretches them). Boxy
  superellipse sections `[z, half width, top, waist, bottom, top/bottom squareness]` with the
  waist fixed, so the belly can sweep up into the ramp without bulging the sides. Round bubble
  windows: square cut in the (station, angle) grid, a square-minus-circle plate on the skin and
  on the lining, rubber rings, a reveal, a domed glass. Pods are a lofted profile whose inner
  edge sits between the skin and the lining. Pylons and the roof tunnel follow the roof just
  under the skin (`roofY`), so they never show inside. Rotor nodes keep their names and hub
  positions (the game spins them); blades have a real airfoil, twist and the leading edge on
  the side each rotor turns toward. Cockpit: five screens (attBall/attBall2 live), console,
  overhead panel, armoured seats, cyclic/collective/pedals, a helmeted pilot in the right-hand
  seat (helicopter captains sit right; `rig.eye` x is negative). Cabin: red troop seats on tube
  frames along both walls, frames, floor treadways, closed ramp. The window view sits on the
  right-hand troop seats looking across the cabin and out of the windows opposite.
- **"Real controls"** (grown-up setting, Free Flight only; `REAL_CONTROLS` level in
  `src/sim/assist.ts`, tests in `tests/realControls.test.ts`): the stick sets roll and pitch
  rates; let go and the playne stays banked / keeps its climb (as if trimmed); a steep bank
  without back pressure lets the nose drop; no extra push on the takeoff roll; engines take
  their real time to wind up (`spoolRate`: a jet about 4 s from idle). Easy stays the default. The co-pilot's landing help
  still flies the glide path while the stick is centred (`Guidance.glidePath`).
- **Reversers** only where real (`AircraftDef.reverser`): none on the Phenoms, HondaJet and
  PC-24; a third of the effect on the Falcon 8X (centre engine only).
- **F-16 automatic flaps:** no flap lever (`hud.setAutoFlaps`); the flaperons droop with the
  wheels down below 240 kt (`Flight.autoFlapStep`).
- **Chinook water landings:** gently (under 600 fpm and 25 kt) it sets down and floats; harder
  it bounces back up (or crashes, with crashes on). Cartoon world only (Google mode has no
  water map, so water there is just ground).
- **"Real stalls"** (grown-up setting, Free Flight; `StepEnv.realStall`, `FlightState.stalled`):
  below the stall speed (raised by flaps up and by turning) the wing lets go: a wing drops, the
  nose falls and it sinks; held back it stays stalled near the stall speed, sinking about 14 m/s;
  nose down to 1.2 x the stall speed recovers. Warning, "STALL!" and recovery lines. Fly-by-wire
  types (`AircraftDef.flyByWire`: F-16, Praetor 600, Falcon 8X, G650ER, G700, Global 8000) stay
  protected. Ground Buddy doesn't pull while stalled.
- **Speedbrakes you can see:** `wingSpoilers()` in the kit (spoiler panels ahead of the flaps,
  node `spoilerL/R`, raised 45 degrees by `PlaneView` with the speedbrakes and as ground
  spoilers on the landing roll); the HondaJet's are tail-cone petals (`speedbrake: "tail"`,
  nodes `brakeLU/RU`), as on the real one.
- **Gear folds checked:** `GEAR_CHECK=1 node scripts/build-models.mjs` folds every detailed
  model's gear in steps and lists any point with nothing above it (poking out of the wing or the
  body). The kit chooses each fold (inward, down, forward) to hide the wheels.
- **Wind** (grown-up setting, Free Flight in the playnes; `src/sim/wind.ts`, tests in
  `tests/wind.test.ts`): off / light (6 to 11 kt) / strong and gusty (14 to 22 kt), mostly
  westerly, new each flight. The flight model stays in the air (airspeed, heading);
  `Flight.blowWind` moves the playne over the ground with the wind and adds gusts (fading out in
  the last 30 m). The HUD shows ground speed with the wind and "wind 15 kt from SW". The
  co-pilot's landing help crabs into a crosswind. Not on the Chinook yet.
- **"Realistic details"** (grown-up setting, Free Flight; `StepEnv.realism`, tests in
  `tests/realism.test.ts`): rudder (`Commands.rudder` from `controls.state.slide`: on-screen
  Rudder buttons, Q / E, a controller's right stick) yaws and gently rolls; propellers pull left
  at full power (`Perf.propSwing`; strongest for the PC-12 on the takeoff run); ground effect
  within half a wingspan (the sink eases, extra speed floats it); bounces on arrivals between
  450 and 1,500 fpm; the F-16 rolls at 240 deg/s and aerobrakes (stick back at idle after
  touchdown: nose 13 degrees up, air braking); the Chinook taxis on its wheels (`HeliEnv.taxi`).
  With "real stalls", the PC-12's stick pusher shoves the nose down instead of stalling
  (`Perf.stickPusher`), and the stall warning shakes the view. Wind now blows the Chinook too.
  Slats on the Falcon 8X and Global 8000 (`slatL/R`, droop with the flaps) are on whatever the
  setting.
- The owner has seen the F-16 exterior pictures and the first cockpit; they have **not yet
  reported on the test copy on an iPad or in Google mode**. Ask before assuming it is fine.

## What the owner asked for, and how they like to work

- Graphics that are "truly excellent": sharper models, animations (wheels, gear), realistic
  cockpits, full and accurate passenger and crew interiors, and a better cartoon map, with **no
  significant cost in performance**, all in the test copy first.
- Realism matters to them now (see the audit), but the player is a five-year-old: keep the
  easy controls as the default and add realism as grown-up settings. No weapons on the models
  (the F-16 has wingtip rails but no missiles).
- Clean look with a light touch of realism: accurate shapes, real materials, panel lines and
  markings, **no weathering**.
- Plain-language replies. Check things in the headless browser and send pictures. Commit and
  push every step. Never commit map keys. Callsign is always `PLAYNE123`.
- For reference photos they said "search online". Web search works here; the cloud machine's
  own network is locked down (it can reach Google's tile server with the saved key and the
  package registries, not much else, and not `github.io`).

## The technique (what carried over from the "gaussian splat" idea, and what didn't)

The idea the owner brought: describe each object in code as simple shapes, and bake the
lighting in. **That half is used.** The splat *rendering* half is not: splats are soft blobs
(wrong for crisp aircraft) and costly to draw on an iPad that is already at its limit in
Google mode. So models stay ordinary glTF meshes, and the gains come from:

1. **Shapes written as data.** A fuselage is a table of stations
   `[z, half-width, top, bottom, roundness]` run through a smooth curve and lofted. Wings and
   fins are lofted aerofoils. Everything is in metres from the real aircraft's dimensions.
2. **Baked soft shadows ("ambient occlusion").** After the model is assembled, every vertex
   casts 40 rays over its half of the sky; the more that hit nearby surfaces, the darker its
   colour. Creases, wheel wells, the cockpit tub and the places parts meet look solid, at no
   cost while flying. Overlapping solids are fine (no need for clean joins): the shadow in the
   join reads as a fillet.
3. **Shared corners.** Models are written with indexed geometry and a colour per vertex, which
   is why the new F-16 with a whole cockpit is about the size of the old plain one.

## The builder (`scripts/build-models.mjs` and `scripts/model-f16.mjs`)

`node scripts/build-models.mjs [id]` builds one model (or all). An aircraft listed in
`DETAILED` gets its own builder file (`scripts/model-<id>.mjs`, exporting
`build<Name>(ac, kit)` that returns `{ nodes, extraMaterials, rig }`); the rest still use the
old generic `buildAircraft`. The build also writes `src/data/rigs.ts` (do not edit by hand).

**Conventions:** +Y up, nose toward +Z, left wing toward +X, origin on the ground between the
main wheels. Colours from `C("#hex")` are already in the linear space glTF wants.

**The kit** (helpers passed to a model file):

| Helper | What it does |
|---|---|
| `curve(keys)` | smooth function through rows `[z, a, b, ...]`; returns `f(z) -> [a, b, ...]` |
| `loft(rings, {capStart, capEnd})` | skin through closed rings (same point count each) |
| `sheet(rows)` | open sheet through rows of points (glass, thin strips) |
| `surface({...})` | a wing, fin or tailplane: aerofoil sections with `cut` to leave room for a control surface |
| `controlSurface(a, b, chordA, chordB, thickness)` | a hinged wedge; returns geometry plus node translation and rotation |
| `lathe(profile, segments, matrix)` | turned shapes along Z (nozzles, cones) |
| `cylinderBetween(p0, p1, r)` | struts, legs, probes |
| `part(geo, material, colour, opts)` | **every piece goes through this**: shared corners, a colour per vertex; `colour` may be a function `(position, normal)` |
| `faceted(geo)` | flat-shaded copy (nozzle petals) |
| `asNode(parts, pivot, xAxis, yAxis, extra)` | turn parts *built in model space* into a node with its own pivot and axes |
| `registration(text, side, xAt, y, zMid, height)` | the PLAYNE123 letters; `xAt(z, y)` must give the fuselage half-width at that spot |

**Flags on a part** (`opts`): `noAO` keeps its colour (lights, glass, glowing screens);
`noOcclude` stops it casting shadow (glass, the flame, thin decals).
**Flags on a node:** `moving: true` for gear, wheels and doors (they receive shadow but don't
shade the body, so there is no ghost shadow when they're folded away); `parent: "name"` makes
it move with another node.

**Node names the game animates** (`src/game/planeView.ts`, `updateRig`):
`gearL gearR gearN` (turn about their own X by `rig.retractDeg`), `wheelL wheelR wheelN`
(children of the legs; spin about their own X; `rig.wheelRadius`), `gearDoors` (shown while the
gear is out), `ailL ailR elevL elevR rudder flapL flapR` (hinges: for surfaces whose hinge points
toward +X, negative = trailing edge down; rudder positive = trailing edge right),
`brakeLU brakeLD brakeRU brakeRD`, `burner` (shown above 93% power), `strobe`, `beacon`,
`prop`, `pilot` and `canopy` (hidden in the cockpit view), and on the Cessna `needleIas`,
`needleAlt`, `attBall` (panel dials, turned about local Z) and `propDisc` (the blur disc). Old models keep the single `gear`
node that is just shown or hidden.

**The 3D cockpit:** if a rig has `eye` (the pilot's eye in model coordinates) the cockpit view
looks out from there with the model shown, instead of hiding the model and drawing the flat
panel (`flight.ts`, `updateCockpit`). If it has `hud` (the glass's centre and half-height),
`PlaneView.hudOnScreen()` projects it to the screen each frame and `src/ui/hudGlass.ts` draws
green figures over it, with a pitch ladder scaled so its horizon lines up with the real one.
Model coordinates `(x, y, z)` become Cesium model-frame `(z, x, y)` (forward, left, up).

## Recipe for the next aircraft

1. Gather its real dimensions: length, span, height, wheelbase and track, wing position and
   sweep, tail layout, cabin cross-section, window count and positions, door position.
2. Copy `scripts/model-f16.mjs` to `scripts/model-<id>.mjs`, register it in `DETAILED`.
3. Fuselage stations first, then wings, tail, engines. Look at it early and often:
   `node tools/preview-model.cjs <id> out.png "dir=-1,0.4,0.9;dir=-1,0.05,0;dir=0.001,1,0"`
   (views are separated by `;`; each takes `dir`, `zoom`, `look`, `hide`, `rot=node:deg`, or
   `eye=x,y,z&at=x,y,z&fov=60` for a view from inside).
4. Gear: put the wheel where it really touches the ground; choose where it should end up when
   folded (inside the body); the hinge axis is the cross product of the two directions and the
   angle between them goes in `rig.retractDeg`. Check the folded pose with
   `rot=gearL:<deg>,...&hide=gearDoors` from underneath: nothing should poke out.
5. Interior: cut the cabin or cockpit into the fuselage rings (see `tubRing`), then seats,
   panels, people. **Check clearances against the outer skin with numbers, not by eye**: at the
   seat's top corners, work out the canopy or cabin height at that exact x and z.
6. In the game: `node tools/shot-plane.cjs http://127.0.0.1:<port>/?nooit <dir> <id>` takes
   pictures parked, on the takeoff roll, gear up, cruising and from the cockpit.
7. Hangar picture: render `tools/render-plane.html?id=<id>&view=hero` at 640x400 and save it as
   `public/models/thumbs/<id>.webp`. Then unit tests, commit, deploy, and tell the owner what
   was and wasn't tested.

**Interior lighting:** a closed cabin bakes almost black with the full shadow strength. Give
interior parts `aoStrength` (the Cessna uses 0.42); `bakeAO` reads it per part.

**For passenger cabins** (the Cessna's rear bench and `rig.windowEye` prove the window view;
a jet cabin is not started): the same trick as the cockpit tub should work. Cut the
cabin into the fuselage rings, cut real window openings (or use a see-through material for the
window band), put seats and a floor inside, and add `rig.windowEye` for the passenger-window
view so it looks out from a real seat. Draw the interior only when the camera is close or
inside (a node shown by distance) if the triangle count gets large.

## Trees and buildings (done)

They are still flat camera-facing pictures (one billboard collection, same cost as before),
but the pictures are now renders of small 3D models: `tools/bake-props.html` builds four
trees, three houses and four blocks in three.js, lights them once, and renders each from four
looking-down angles (8, 40, 65 and 85 degrees) into one sheet, `public/sprites/props.webp`,
with sizes in the generated `src/data/propSprites.ts`. Run `node tools/bake-props.cjs`, then
convert the PNG it writes to WebP. In `src/world/scenery.ts`, `buildProps` picks, for every
tree and building, the picture whose angle matches how steeply the playne is looking down at
it, and rebuilds when the playne has moved 450 m or changed height by a fifth.
`node tools/shot-props.cjs <url> <dir> [airport]` takes pictures from several heights.

Two things to know. The side-on picture stands on its bottom edge; the other three are centred
on the spot the thing stands on, and a centred picture would be cut off by the ground in
front of it, so those get an `eyeOffset` toward the camera of about the footprint's depth.
And Cesium only lets a billboard be anchored at its bottom, centre or top (its `pixelOffset`
stays in pixels even when the size is in metres), which is why the frames are laid out that way.

## The jet kit (scripts/jet-kit.mjs)

Every business jet after the Phenom 300E is built by one shared builder from a measured spec
(`scripts/spec-<id>.mjs`, registered in `KIT` in `build-models.mjs`). A spec gives the fuselage
cross-sections, floor height, windows, cockpit windows and windshield outline, cabin layout
(rows facing forward or aft, tables, a divan, galley, lavatory wall, the window-seat station),
door and exits, wing (sweep, dihedral, chords, flaps, ailerons, winglet), wing-body fairing,
fin, dorsal, strakes, tailplane (T-tail, cruciform or low: decided by its height), engines
(rear-mounted on pylons, `mount: "wing"` for the HondaJet, `centreEngine` for the Falcon 8X's
S-duct third engine, `prop` for a nose propeller), registration (on a nacelle or the
fuselage), cheatline, antennas, pitot, gear (single or twin wheels), and optional cockpit
details (`sidestick`, `extraScreens`, `floorDrop`, `seatWidth`, `backLen`).
`spec-phenom300.mjs` rebuilds the Phenom through the kit as a check (`KIT_CHECK=1 node
scripts/build-models.mjs phenom300`); the hand-built Phenom stays the live model.

**How each jet was checked** (do the same for any new one):
1. Measure a side-on photo on a pixel grid (`$S/grid.py`-style), scaled by the published
   length (or by a height when the photo is a wide-angle shot that stretches lengthways).
2. Build, render a near-flat side view (`eye=±100,y,0&at=0,y,0&fov=10`), and overlay its
   outline on the photo. Fix what doesn't line up (this found a backwards fin, a fin half a
   metre too tall, a too-thin tailcone, a backwards intake, a too-low nose).
3. The build prints any interior part that pokes through the skin; fix them all.
4. Render the pilot's view, the cabin and the window seat; then in the game at phone size:
   from behind, in the cockpit and at the window (the window seat must face a window).

| Jet | Measured from | Notes |
|---|---|---|
| PC-24 | side photo | blunt tailcone; cockpit floor a step below the cabin |
| Praetor 600 | side photo | side-sticks; twin nose wheels |
| Citation Latitude | side photo (by height) | cruciform tail (data corrected) |
| Challenger 3500 | wide-angle side photo | nose rises steeply (the first try gave a slot windshield) |
| Phenom 100 | side photo | small cockpit seats |
| Falcon 8X | side photo | S-duct third engine, twin main wheels, divan |
| HondaJet | published dimensions + photos | over-wing engines; T-tail (data corrected); low cabin |
| Global 8000 | Bombardier side drawing | the drawing's 8.2 m height confirms the scale |
| PC-12 NGX | side photo | turboprop: `prop` (five blades, blur disc), rear cargo door |
| G650ER | side photo | big oval windows, side-sticks, twin wheels |
| G700 | built from the G650ER spec | cabin 3.07 m longer, ten windows a side, bigger wing and engines |

**Keeping them light:** window frames are rings between the window outline and its cut-out
(sampled in the same directions), not split-up flat patches; the windshield's cut-out hugs the
panes; rows along the straight cabin tube are 28 cm apart (nose rows 8 cm, so the cheatline
follows the curve without blotches); window edges at nearly the same height share grid
columns. `KIT_STATS=<id> node scripts/build-models.mjs <id>` prints the vertex count of each
section (and any single part over 3,000) and stops. The kit jets now range from 33,000
(Phenom 100) to 88,000 vertices (Global 8000); the first Global was 204,000 and 11 MB.

## Ground handling and suspension (test copy)

- **Shock absorbers** (`PlaneView.update`): on the ground a sudden step in the ground height
  is taken up by the legs: the body keeps its height and settles on a damped spring (8 cm of
  stroke), the wheel nodes move the other way so they stay on the ground, and on touchdown the
  legs take the sink rate. The spring is stepped implicitly so it cannot ring on slow frames
  (an explicit version did, at one frame a second in headless tests).
- **Google / ion runways** (`Flight.groundHeightAt`): the playne rides the runway's surveyed
  slope plus the scan's offset from it, taken as the middle of the last five readings and
  followed briskly. Measured at TRI in Google mode: raw readings jump by up to 0.5 m between
  frames, and the scan drifts 1.3 m from the published slope along the runway.
- **Clouds, trees and buildings** are billboards with `alignedAxis` set to the local up, so
  they tilt with the horizon when the playne banks (they used to stay level with the screen).

## Pitfalls already hit (so you don't hit them again)

- **Wheels all appeared at one spot under the belly.** `asNode` assumes its parts were built
  in model space and moves them back by the pivot. Wheel parts are built around their own
  centre, so give them `translation` directly instead of `asNode`.
- **Letters sunk into the fuselage.** The body narrows toward the top; `xAt` must use the
  letter's own height (`xAt(z, y)`), not one height for the whole line.
- **Seat through the canopy.** The first seat was sized by eye. See recipe step 5.
- **A body panel looked grey from outside.** `sheet()` faces its triangles by the order of the
  points: rows running nose to tail with each ring going right-to-left gives inward faces, and
  the shadow bake then "sees" the cabin interior and darkens the skin. Run the ring the other
  way (the Cessna's `uRing` returns its points reversed).
- **A still frame of a propeller is a frozen blade.** Fast props need a blur disc (`propDisc`).
- **Seat views felt like a camera floating outside** (owner's report on the Cessna). The game
  camera's usual 60-degree view crops a roomy cabin down to sky and nose. A rig can set `fov`
  (degrees across the longer side of the screen); the Cessna uses 85 from both seats, which
  shows the panel, yoke, windshield posts, roof edge and wing as a person in the seat sees
  them. The F-16 keeps 60. `PlaneView.updateCamera` applies it and puts 60 back otherwise.
- **A window's lining opening must stay inside its cut-out.** The lining's opening is drawn a
  little bigger than the window; on the long cockpit windows 12% bigger was past the cut-out's
  margin, the shape turned inside out and covered the glass. It is now capped to the margin.
- **A rectangle in (station, angle) is a poor windshield** on a tapering nose: its lower edge
  climbs steeply rearward and blocks the pilot's view. Use outlines (`polys`) with a level
  lower edge.
- **Compare with real photos, side by side, before calling a model done** (the owner asked for
  this explicitly: "no strange bits"). Wikimedia Commons is allowed on the "playnes" cloud
  environment (commons.wikimedia.org for the search API, upload.wikimedia.org for images; the
  API hands out thumb.wikimedia.org links, rewrite them to upload.wikimedia.org). Measure a
  side-on photo against the real length (grid overlay) for ride height, nose, wing sweep,
  engine and fin positions and window spacing. The Phenom was 34 cm too low and its engines
  and fin 1.5 m and 0.35 m too far back before this check.
- **Outline overlay against a side-on photo** is the quickest way to catch proportion errors:
  render a near-orthographic side view (`eye=80,1.5,-1.3&at=0,1.3,-1.3&fov=7.5`), scale it to
  the photo by overall length, align the wheels, and draw its outline over the photo. It showed
  the Cessna's belly, cowling and tailcone 20 cm too high and its fin too tall and too far back.
- **Joining differently shaped sections:** where a round section (the Cessna's cowling) meets
  a boxy one (its cabin), blend the last stretch of one into the other's exact cross-section;
  butting them together left a gap with sky showing through underneath.
- **One side photo is not enough.** A side-on overlay checks lengths and the top and bottom
  lines, but not the underside: the owner spotted the Latitude's belly (a short pod under the
  wing) from memory of photos. Every kit jet then got a second check against photos from below
  and at low three-quarter angles: belly fairings are long keels from behind the nose wheel into
  the tail cone, and where the belly sweeps up their tail end must follow it (fairing keys take an
  optional top: `[z, half width, bottom, top]`). Check the gear's track and wheelbase against the
  maker's figures too (the Latitude's were 0.45 m off).
- **Fit to photos from every angle, and measure.** Eyeballing one or two photos missed real
  errors that a measurement found at once: the HondaJet's fin far too far back and its body 0.6 m
  long, the Global 8000 4.7 m long, the Falcon 8X and PC-12 spans 1 m and 0.7 m short, most fins
  too far forward. `tools/photofit/` (see its README) cuts the playne out of many Commons photos,
  finds each photo's camera angle, colours where the outlines disagree, and for kit jets tunes
  the spec until the photos agree, keeping to the published dimensions. The corrections sit in a
  spec's `photoFit` list. `node tools/photofit/dims.cjs <ids>` checks span, length and height.
- **Look from straight behind, too.** Even with keel fairings, the owner could still see the
  Latitude's wing trailing edge running across under the belly from behind; on the real jets the
  wing goes into the side of the fairing. The kit now fits the fairing itself (`fairSec` in
  `jet-kit.mjs`): the spec's keys give its rough shape, then over the wing root it is made as
  wide as the fuselage and deep enough that the wing's underside sits inside it; behind the wing
  its depth closes up in step with its width (a smooth sweep up, never a flat wall). The build
  warns `the wing shows under the belly at N points` if any part of the wing hangs below the body
  outside the fairing; `FAIR_DEBUG=<id>` prints the fitted sections.
- **Check in the game, from behind, at phone size, not just in the preview tool.** The owner
  found the Cessna's square cabin frame not meeting the round tailcone, seen from the default
  chase view; the preview's soft lighting hid it. `tailRing()` now blends the tailcone's first
  70 cm from the cabin's exact rear shape into its own.
- **Screens use an unlit material** (`KHR_materials_unlit`, supported by `build-models.mjs`):
  lit with a grey glow they washed out to blank grey squares in the game.
- **Registration letters** are paint-thin solid blocks; thick blocks with gaps between them
  turned into black speckle when seen at an angle.
- **Automatic interior check:** `model-phenom300.mjs` ends by testing every interior part's
  corners against the fuselage cross-section and prints any that poke through the skin. Keep
  it (and copy it into the next cabin model); it found four that renders had missed.
- **Vertex-colour stripes on a coarse grid look saw-toothed.** Draw cheatlines as thin
  ribbons laid on the skin (`ribbon()` in the Phenom builder).
- **All base materials are two-sided.** A loft's end cap is a solid wall from inside (the
  Cessna's tailcone cap was a white wall behind the rear seat). Leave caps off where a cabin
  continues, line the inside, and cut real openings for windows you should see out of.
- **Seat backs leaned forward.** In these models a positive turn about x tips the top toward
  the nose; reclining backs need a negative angle. Check seats from the side before trusting
  the eye position. The owner still found boxes-for-seats odd (and a floating headrest), so the
  Cessna's front seats are now extruded from a side profile (`profileSlab` in
  `model-c172.mjs`): a 17-degree recline, a small lumbar bulge and a headrest that is part of
  the same upholstery. Seat the person against it and put `rig.eye` in their head.
- **Paint looks darker in the game than in the preview tool.** The game's lighting is harsher
  than the preview's. Judge colours from `tools/shot-plane.cjs`, not the preview.
- **The game hid the whole model in cockpit view** (the old flat-panel approach). Anything with
  a `rig.eye` must keep the model shown.
- **`build-models.mjs <id>` still has to write every detailed model's rig**, or
  `src/data/rigs.ts` loses the others. It does; keep it that way when adding models.
- **The local test web server stops** whenever the cloud environment changes (and sometimes
  between long commands). If a tool says "connection refused", start it again:
  `cd <built folder> && setsid nohup python3 -m http.server <port> &`.
- **Headless drawing is slow** (about 1 to 10 frames a second, in software). Use it to check
  that things are right, never to judge smoothness. Wait on conditions, not fixed times.
- **Google mode in the cloud browser** needs the key that is saved on the "playnes" cloud
  environment (added to requests by the network), the browser pointed at the network proxy,
  and the game's website given as the referrer for the whole browser context. All of that is
  already in `tools/diag-google.cjs`; copy from there.

## Google-mode stability (background you need before touching `src/world/`)

Long jet flights used to slow to a crawl. The causes, all inside the map library (Cesium),
and the fixes, all in `src/world/governor.ts`, `tilePruner.ts` and the Google part of
`world.ts`: a per-texture table copied several times a frame (now shared); a ground-height
lookup under the camera every frame (switched off); detail see-sawing near the memory limit
(steadied); and the library never freeing its index of map tiles (now trimmed continuously:
branches unused for 20 seconds and over 20 km away are reset). The owner's own readings after
the fixes: 98 frames a second after 13 minutes on a PC, and an iPhone that used to reload ran
11 minutes and 236 km. **These fixes depend on Cesium 1.146's private internals.** Do not
upgrade Cesium casually, and re-run `tools/diag-google.cjs` if you do.

## Suggested next steps, in order

1. Get the owner's verdict on the F-16 in the test copy (iPad, and Google mode).
2. (Done: the audit's physics items 1 to 3.)
3. (Done: the Cessna 172 and the Phenom 300E.) Next, roll the pattern out to the rest. The
   Phenom's fuselage code (lattice, windows, lining, `refine`, `onSkin`) is the part to lift
   into a shared helper before the second cabin jet; the PC-24 and Citation Latitude are the
   closest relatives.
   `node tools/render-planes.cjs <id>` re-renders just one hangar picture (and always the
   "Meet your playne" picture and its tap spots).
4. Per-type truth from the audit (reversers only where real, F-16 automatic flaps, Chinook
   water landings), then "real stalls" as a grown-up setting. (Done: "Real controls".)
5. (Done: cartoon-map trees and buildings.)
6. When the owner is happy: put the test copy's commit in `.stable-ref` and deploy.


## To-do (updated 18 Nov 2026)

Done (21 Nov): the Falcon 8X, HondaJet, Citation Latitude and PC-24 are fitted to the makers'
dimensioned drawings (outline match: Falcon 0.66 -> 0.80, HondaJet 0.78 -> 0.86, Latitude
0.64 -> 0.84, PC-24 side 0.85 -> 0.89), keeping to the published length and span. The corrections
are each spec's photoFit list. No public three-views were found for the PC-12 NGX (Pilatus's
render is too faint; the 2024 "Just The Facts" line drawing is small), Phenom 100/300E, Praetor
600, Challenger 3500, Global 8000 and G650ER/G700; airport planning manuals are customer-only.
If the owner can supply any of those drawings, add them to tools/photofit/drawings/specs.json.
- PC-24 wingtips done (raked tips, no winglets). Short/unpaved strips dropped: the maps have no
  such strips, and any playne can already land on flat open ground.
- Small fixes done: Falcon 8X tailplane enlarged to the drawing (drawing match 0.81); Challenger
  3500 fin-top fairing enlarged and raised (tailplane.bullet r/len/fwd/dy in jet-kit), checked on
  tail photos. Phenom 300E height left as is: the model's top is 4.92 m against 5.10 m published,
  but a 0.18 m taller tail scored worse on the straight side photos (b000, b006, b009), so the
  photos say the tail is right; the published figure probably includes more strut extension.
- Latitude tailplane: the drawing showed it slightly short, not long. A tuning pass on the
  tailplane alone moved the root 0.2 m aft and grew each side 0.3 m (top-view match 0.904 to
  0.916, overall 0.841 to 0.845), in line with the earlier photo note that it looked short.
- Reset-view stutter: the reset button used to jump the view up to 180 degrees in one frame,
  so the world had to draw a whole new set of tiles at once. It now swings back over 0.3-0.65 s
  (PlaneView.resetLook(true); a slow frame advances the swing at most 1/20 s, so it slows down
  rather than jumps). A blur was not used: it costs GPU time and would make the drop worse on
  iPads. tools/diag-lookreset.cjs measures it (headless has no GPU, so only the swing itself
  can be checked there; frame times need a real device).
- iPad choppiness in Google mode at ~1,500 m (owner's overlay: 35 fps, governor pinned at
  2.6, tile memory 299/300 MB, almost nothing loading): the device was struggling to draw the
  view out to a far horizon. On iPads and phones the governor may now go to 4x coarser and far
  tiles are relaxed more (dynamicScreenSpaceErrorFactor 40 instead of 24). The overlay now
  shows the lowest frame rate and hitches (>50 ms) over the last 10 s, uncapped frame times
  (the old "slowest" was the 95th percentile and capped at 100 ms), processor time per frame
  (much less than the frame time = graphics-chip bound), tiles/triangles/draws drawn and the
  tile-trim time.
- Measured in Google mode in the cloud browser with an iPad-sized view at 1,490 m
  (tools/diag-google-view.cjs): the view itself is light (detail 14: 233 tiles/draws; at the
  governor's old limit, detail 36: 79). But the tile-index trim walked the whole tree in one go
  every 3 s: 27 ms on this fast machine with a 52k tree, so a regular stutter on an iPad with a
  177k tree (which also kept the governor pinned at its coarsest). The trim is now spread over
  frames (TreeTrimmer, at most ~2 ms per frame); a 50 km fast flight showed the tree staying
  at ~6k entries and no step over 5 ms. Next step: the owner's new overlay from the same kind
  of spot.

- Owner feedback (iPad, Google mode): still slow on long flights and in cities, and detail took
  too long to sharpen. Done:
  - Reverted the iPad-only 4x governor limit and stronger far-tile blur (they made it blurrier).
  - Found why detail came back so slowly: (1) steadyTileDetail only sharpened quickly with the
    tile cache under 85% full, but the cache is meant to be full, so on any long flight lost
    detail took 80+ s or never returned; it now waits for ~150 calm frames and then sharpens
    at ~4%/s regardless of fill. (2) setSseKeepingMemoryRelief kept the old level as a floor,
    so every governor sharpening waited on that slow easing; it now keeps the memory relief
    as a ratio. (3) The governor sharpens faster (/1.1 every 2 calm windows after 8 s).
    Confirmed in the speed test: before the fix, "Normal" drew half the tiles it should have.
  - Speed test (grown-up settings, Google mode only; src/game/speedTest.ts): flies a fixed
    loop over Charlotte and measures fps, low fps, hitches, frame and CPU ms, tiles and MB with
    Normal / 80% resolution / 1.5x and 2.5x less detail / no clouds / no FXAA / Normal again.
    The owner's screenshot of the results is the input for tuning the iPad budgets. Headless
    software-drawing numbers (tools/diag-google-view.cjs, Charlotte at 470 m): 80% resolution
    -34% drawing work, FXAA off -20%, detail 21 -24% (28: no further gain), clouds off -4%.
  - Also: place-name labels (Names button, Google mode; public/world/places.json from GeoNames
    via scripts/world/build-places.mjs, credited in settings); Free Flight trip bar hidden with
    no destination, else filling with distance to it; co-pilot captions can no longer stick
    (timeout on each voice line, skip a line cut off while loading); no co-pilot line on the
    sonic boom; crash pop-up with "Start again here" (450 m above the crash site, Chinook 150 m
    in a hover) or the nearest airport.

- Continental US, step 1 (Google / Cesium ion maps). Known-good version before it: branch
  `good-2026-11-27` (commit cacf95c).
  - Airports: src/data/usAirports.json, 424 airline airports in the lower 48 (large, or medium
    with scheduled service, paved runway of 4,500 ft or more; longest runway used), built by
    scripts/world/build-airports.mjs from OurAirports CSVs (public domain). Spoken names: an
    override table for the big ones, else the town (state added where towns clash). The 12
    hand-made airports (CORE_AIRPORTS) win over imported ones with the same code and keep the
    recorded voice lines; the rest use the device's voice for their names.
  - `AIRPORTS` is now the playable set, updated in place by setPlayableArea(): all of them in
    Google / Cesium ion, only those inside the offline map in the cartoon / basic worlds (adds
    AGS, FAY, FLO, LYH, PDK, USA there). `ALL_AIRPORTS` has everything; airportByCode searches
    both. A saved Free Flight outside the offline map is hidden (not deleted) in that mode.
  - Free Flight start measures runway heights only within 80 km in Google / ion (measuring all
    424 would load the 3D map at every airport); refreshNearbyRunways() measures the others as
    the playne comes within 60 km. groundHeightAt skips far runways cheaply.
  - The edge turn-back uses the offline map's box, or (3D map) the lower 48 plus a few degrees.
  - Free Flight picker: with more than 30 airports, the 15 nearest, a search box and a state list.
    Charters: two home-region airports in turn plus one more from the rest of the country.
  - Big map: pans (drag), zooms (+/−, pinch, wheel), opens on the playne (~700 km across) in the
    3D map or on the whole offline area; zoomed out it shows only the big airports.
  - Map pictures: public/world/tiles z4-8 for the whole lower 48 (scripts/world/build_conus_tiles.py,
    ~1,450 tiles, ~15 MB; drier West, plains farmland, mountain forests; the Southeast's own
    tiles untouched). The minimap and big map draw the nearest coarser tile, enlarged, wherever
    a detailed one doesn't exist. Not part of "Save for offline" (that stays the Southeast).
  - Town names: public/world/places.json now covers the lower 48 (16,078 places, ~270 KB gzip).
- Continental US, step 2 (not started): the offline cartoon world for the whole country (terrain
  in ~1 degree chunks loaded as you fly, lower detail away from home, offline download of a home
  region only). Later: recorded voice lines for the new airport names, buildings at more airports.

- iPad speed test 1 (owner, version a9f22b0, 11" iPad, drawing 1180x688): 57-60 fps with any
  setting while tile memory was under its limit; once it reached 300 MB (test 5 onward),
  38-44 fps with hitches whatever the setting ("Normal again" 44 vs 58 at the start). cpu 3-5 ms
  per frame throughout. Changes: pre-loading neighbour tiles (loadSiblings) is now off while
  tile memory is over 95% full (back on under 85%): at the limit Cesium unloads every tile not
  drawn this frame, so pre-loaded neighbours were being loaded and thrown out over and over.
  iPad tile budget 300 -> 256 MB (+64 overflow). Speed test v2 fills the memory first and
  compares settings with it full, including the old pre-loading and a 200 MB budget.

Still to do:
- iPad speed test v2 results (compare "FULL: normal" with "FULL: old pre-loading") from the owner, then tune the iPad budgets from them.
- Copy the test copy over to the main game (change .stable-ref) when the owner says so.
- Housekeeping: split src/game/flight.ts, add a linter, shared helpers for the test scripts,
  trim the site.
