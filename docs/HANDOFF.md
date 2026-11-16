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
- **Not done:** every other aircraft, passenger cabins, and the rest of the audit's list
  (per-type truth, "Real controls", "real stalls", wind).
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
`prop`, `pilot` and `canopy` (hidden in the cockpit view). Old models keep the single `gear`
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

**For passenger cabins** (not started): the same trick as the cockpit tub should work. Cut the
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

## Pitfalls already hit (so you don't hit them again)

- **Wheels all appeared at one spot under the belly.** `asNode` assumes its parts were built
  in model space and moves them back by the pivot. Wheel parts are built around their own
  centre, so give them `translation` directly instead of `asNode`.
- **Letters sunk into the fuselage.** The body narrows toward the top; `xAt` must use the
  letter's own height (`xAt(z, y)`), not one height for the whole line.
- **Seat through the canopy.** The first seat was sized by eye. See recipe step 5.
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
3. The next aircraft. The Cessna 172 is the best second one (it is the first playne every
   player flies, has the simplest cabin, and "Meet your playne" uses its picture, whose tap
   spots come from `tools/render-planes.cjs`). Then one cabin-class jet to prove the passenger
   interior, then roll the pattern out to the rest.
4. Per-type truth from the audit (reversers only where real, F-16 automatic flaps, Chinook
   water landings), then "Real controls" and "real stalls" as grown-up settings.
5. (Done: cartoon-map trees and buildings.)
6. When the owner is happy: put the test copy's commit in `.stable-ref` and deploy.
