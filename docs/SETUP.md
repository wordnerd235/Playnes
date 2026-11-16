# Playnes setup guide

How to run the game, put it on the iPad, and turn on the real 3D world.

---

## 1. Play it

The game is a web app. Once it's hosted (section 3), open the link on the iPad in Safari, then:

1. Tap **Share → Add to Home Screen**. This gives you a full-screen app with no address bar for little fingers to tap.
2. Open Playnes from the Home Screen and tap **Tap to fly!**
3. Optional, recommended: turn on **Guided Access** (Settings → Accessibility → Guided Access). Triple-click the top button while the game is open to lock the iPad to it.

Without a map key the game runs in the **cartoon world**: a bundled, offline map of the playable region (Tennessee, the Carolinas, north Georgia and southwest Virginia) with real mountains, rivers, lakes, roads, towns, farm fields, trees and clouds, plus crisp runways at all 12 airports. Everything works in it, including Free Flight. Add a Google key (section 2) for the photoreal 3D world.

**Full screen:** on the home screen, tap the ⛶ button (next to your Wings) to hide Safari's tabs and address bar on an iPad (tap it again, or Safari's ✕, to leave). iPhone Safari doesn't let web pages go full screen, so there the button explains the iPhone way: Share → **Add to Home Screen**, then open Playnes from its icon (it runs full screen like an app, and that's also how offline play works). The button hides itself when Playnes is already running from the Home Screen. iPad Safari itself closes full screen on any quick downward swipe (flicking a menu back up, a fast pull on the yoke) and a web page can't stop that, so when that happens Playnes goes back to full screen on your next tap. Leaving with the ⛶ button or Safari's ✕ is respected. For an app that never drops out of full screen, use Add to Home Screen on the iPad too.

**Offline play (car trips, real flights):** in grown-up settings, tap **Save for offline play** once on Wi-Fi (about 25 MB). After that, the cartoon world works with no internet. Google and Cesium maps always need internet.

### Free Flight

The purple **Free Flight** card on the home screen is an open sandbox:
- Pick any of the 12 airports to take off from (the one you're at is outlined in yellow), and fly anywhere in the region. Going home from the pause menu saves the flight (it also saves itself every few seconds); the **Keep flying** card on the Free Flight page picks it up right where you left it.
- Fly anywhere in the region. The lever is a **real throttle**: pull it back and the plane slows, then glides down. Raise the wheels and flaps after takeoff (the co-pilot reminds you) and climb high to go fast. Thin air up high means a jet flies much faster there, just like the real thing: a Phenom 100 cruises around 400 knots at 30,000 ft, so Charlotte to Tri-Cities takes about 20-25 minutes, the same as a real flight. Grown-up settings can switch to "co-pilot holds the speed" for little pilots.
- The speed gauge shows **airspeed** (what pilots read in the cockpit); the small "ground" number underneath is how fast you're actually covering the map.
- The **minimap** (top right) shows nearby airports (✈) and landmarks (⭐). Tap it for the **big map**: the autopilot keeps flying your last heading and height while it's open. Tap an airport to see how far it is, then **Fly to** draws a pink line to it on the minimap.
- Line up with any runway and let go of the stick: the co-pilot helps you down the glide path.
- **Wings in Free Flight:** landing at an airport pays for the trip from the airport you took off from (by straight-line distance, about 8 Wings per 100 nm) plus landing stars. Circuits back to the same airport pay a little; a safe emergency landing in a field pays a small 5 Wings (after at least 20 seconds in the air), then a pop-up offers **Go home**, **Take off from here** or **Fly from** the nearest airport; the trip distance starts again from the next airport takeoff.

### Solo charters

Once you've successfully landed at an airport (by charter or in Free Flight), every charter **to that airport** is flown **solo**: no rings to follow, no tips or button prompts, the co-pilot doesn't steer toward the runway, doesn't hold the climb or glide path (you fly up and down yourself; letting go holds level flight) and doesn't flare for you. The tower still talks on the radio, and power is still managed. As a last resort the co-pilot still quietly steps in if you'd otherwise be stuck (it waits much longer first). Charter cards to those airports show a "Solo flight" badge. To turn solo off (the co-pilot always helps), untick the solo option in grown-up settings.

### Wings (rewards)

| What | Wings |
|---|---|
| Charter (only when you land at the destination) | 10 + distance × (0.1 + 0.025 × seats) per nm. Cessna (4 seats) Charlotte→Tri-Cities 104 nm ≈ 31; a 19-seat Gulfstream ≈ 70 |
| Free Flight trip between two airports | about 0.08 per nm (no passengers) |
| Landing stars | 5 each (2 in Free Flight); butter landing +5 (+3 in Free Flight) |
| First landing at an airport (passport stamp) | +20, once per airport |
| First takeoff from an airport | +10, once per airport |
| Safe emergency landing in a field (Free Flight) | +5 |
| Flight School lesson | 25 the first time (50 for the landing lesson), 5 for practice |

All the numbers live in `REWARDS` in `src/game/progress.ts`.
- Fly to the edge of the map and the co-pilot takes the controls and turns you firmly around (a 60° bank, 75° in the F-16) until you're pointing back in and inside the map again; then the stick is yours.
- **Crashes** are off by default (the co-pilot always pulls up). Turn on "Free Flight: allow crashes" in grown-up settings for a challenge; after a crash you restart at the nearest airport.
- The **eye bubble** just above the yoke: drag it to look around. The ⟲ button next to it resets the view. The camera button switches between the chase view and the **cockpit** (window frame and instrument panel: round dials in the Cessna, glass screens in the turboprops and jets).
- The stick is always yours. Full stick banks 35° in Flight School, 45° on charters and 60° in Free Flight (80° in the F-16). Slower = tighter turns, just like a real playne. Let go and the co-pilot gently follows the hoops or levels the wings.
- **Flap lever** (next to the throttle): real detents UP, 1, 2, FULL. Tap a notch or drag the handle, any time in the flight. Each notch has a speed limit; too fast and the co-pilot says so and the lever won't move (and if you speed up a lot with flaps out, the co-pilot brings them up a notch).
- **Slowing down, like real pilots:** pull the throttle back first (idle). Jets have **Air brake** (the Brakes button turns into it in the air) to slow down or come down faster; on final, if you're much too fast, the co-pilot puts them out for you. Lower the flaps as the speed drops. After touchdown with the throttle at idle, the **ground spoilers, thrust reversers and autobrakes** do the rest (a jet stops in about 300-500 m). Holding Brakes on the ground still works too.
- **Landing and takeoff help** is off by default in Free Flight: you fly the approach, flare and takeoff roll yourself (the autobrakes still stop you after touchdown). A grown-up can turn on "Free Flight: co-pilot helps land and take off" in settings: then, lined up with a runway within about 7 km with the stick centred, the co-pilot holds the glide path, steering and landing speed, flares for you, deploys speedbrakes if you're much too fast, and keeps the takeoff roll on the centreline. Charters and Flight School keep their co-pilot help (charters to airports you've landed at before are solo).
- **Co-pilot tips in Free Flight** are off by default: no spoken how-to tips ("pull back to take off", "flaps up"...) and no flashing hints on the controls. Landings, rewards, the edge-of-map turn and landmark fun facts are still announced. A grown-up can turn on "Free Flight: co-pilot tips" in settings. Flight School and charters keep their tips (charters to airports you've landed at before are solo).
- **Clouds** are soft, painted puffy clouds (one cheap picture each, facing the camera, fading out as you fly into one), in every world. A grown-up can turn them off with "Clouds" under Graphics quality in settings; that also hides the cloud layer on long charters.
- **Emergency landings:** put the wheels down, pull the power back and slow to landing speed, and you can land on flat, open, dry ground (no trees, buildings or water), gently and with the wings level. With crashes on, a bad spot is a crash; with crashes off, the co-pilot bounces you back up.
- **Camera button:** chase view → cockpit → passenger window → chase.
- **? button** (next to Pause, or the H key): a quick tour of every gauge and control, read out by the co-pilot. It also runs once automatically on the very first flight (only once, even if that flight is left early). The **✕** in the corner of the bubble closes it at any step.
- **Landmarks** (the stars on the minimap) have a golden star pin and name floating over them when you're within about 30 km.
- The **HEIGHT** gauge shows feet above sea level, like a real altimeter, with a bar that fills toward the playne's cruising altitude and turns green ("cruising!") when you get there. Within 2,500 ft of the ground a **radio altimeter** appears under it: "↓ 350 ft above ground", orange below 500 ft and red below 150 ft (mountains around here are 2,000-6,000 ft above sea level, so the big number alone can mislead). The small number under SPEED is ground speed, also in knots. (There's no "Terrain, pull up!" alarm: the above-ground readout is the warning, and the co-pilot still quietly eases you up if you get very low away from a runway.)
- **Radio:** on charters and in Flight School the radio button stays greyed out until the co-pilot asks you to call the tower ("Tap the radio..."), then lights up; it greys out again after the call.
- The big map's **Clear route** button removes a destination you picked.
- **Routes:** picking a destination draws the route on the minimap and big map the way a pilot would fly it: a turn toward it, then a smooth curve onto the runway's extended centreline about 6 km (3 nm) out, then straight in (the runway end that suits your direction of arrival). It re-plans if you wander more than about 2 km off it. On the way to an airport you've never landed at **in Free Flight** (charter landings don't count: they're heavily assisted), the same route also appears as a **faint glowing line in the sky** to follow: it eases to about 1,000 ft above the runway at the start of final, then down a normal 3° glide slope to the touchdown point. (The Chinook gets a straight line: helicopters don't need to line up.)
- **Hangar 3D view:** tap any playne and its picture turns into the real 3D model. Drag a finger to spin it (sideways to turn, up and down to look over the top or under the belly), pinch to look closer, double-tap to see the whole playne again. Left alone, it turns slowly by itself.
- **F-16 Fighting Falcon** (900 Wings): about Mach 1.2 down low and Mach 1.8 up high, 40,000 ft in under two minutes, and a sonic boom when you pass the speed of sound. Push the stick forward to **dive-bomb**: in the F-16 the stick sets the dive angle, and full forward points it nearly straight down. With crashes off, the co-pilot pulls you out in time (it starts early enough for the dive you're in); with crashes on, pulling out is up to you. One seat, so it's Free Flight only (charters use your best playne with seats).
- **CH-47 Chinook** (1,500 Wings, the super-special one): it appears in the hangar with a gold frame but can only be bought once **every other playne** is in the hangar. It's a tandem-rotor helicopter and flies with its own controls (Free Flight only):
  - **Lever = lift.** Push it up to rise, the middle (marked HOVER) holds the height, pull it down to come down.
  - **Stick forward / back** speeds up / slows down (let go and it keeps its speed; pull back to stop in a hover, and keep pulling to **fly backward**, up to about 35 kt, like the real one). **Left / right** turns: on the spot when hovering, a banked turn when flying fast. The two **Slide** buttons (◀ ▶, where the flap lever is on playnes; Q / E on a keyboard) slide it sideways at up to about 35 kt while flying slowly; let go and it settles back to a hover. Top speed about 160 kt, up to about 15,000 ft.
  - **Land anywhere flat:** airports (counts as an airport landing: stars, passport stamp, welcome pop-up), open fields (the field pop-up and +5 Wings after a real flight) or a big flat roof. Not on water or steep slopes: with crashes off the co-pilot cushions every landing and lifts you back up from a bad spot; with crashes on, a hard or bad landing is a crash.
  - A short helicopter tour runs on its first flight (and from the ? button while flying it). No flaps, wheels or brakes buttons.

### Grown-up settings

On the home screen, **press and hold the gear icon** (top left) for about 2 seconds, then answer the multiplication question. Settings include:

- map source and keys
- graphics quality
- co-pilot help level
- tilt steering (and a flip option if tilting up/down feels backwards)
- volume and break reminder
- **backup code**: copy it somewhere safe; paste it back to restore progress on a new device or after Safari clears data
- unlock all planes, reset progress

---

## 2. Turn on Google Photorealistic 3D Tiles

> **Read first.** Google's Maps Platform Terms (§3.2.1(c)(vi)) say its maps may not be used in an app "directed to children" under COPPA. COPPA's definition is about commercial services, so a private, non-commercial family game is arguably outside it. This is not legal advice, and Google decides. Keep the game private and non-commercial, and **enter the key on your own devices only** (step 5) rather than building it into the public site. If you'd rather avoid the question, use Cesium ion instead (section 2b).

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g. "playnes").
2. Set up billing for the project. Photorealistic 3D Tiles includes **1,000 free sessions a month**; the game uses about one per launch, so a family should stay well inside it. Check the current [pricing page](https://developers.google.com/maps/billing-and-pricing/pricing).
3. Enable the **Map Tiles API** (APIs & Services → Library → "Map Tiles API").
4. Create an API key (APIs & Services → Credentials → Create credentials → API key), then **restrict it**:
   - **Application restrictions → Websites:** add `https://<your-github-user>.github.io/*` (the whole site: some browsers only tell Google the site, not the page), plus `http://localhost:5173/*` for local testing. If Google still refuses, grown-up settings show Google's own reason under Map source.
   - **API restrictions → Restrict key:** select only **Map Tiles API**.
5. Protect against surprises:
   - Billing → Budgets & alerts → create a **$5 budget** with email alerts.
   - APIs & Services → Map Tiles API → **Quotas**: lower the daily request limits (e.g. 100 root-tileset requests a day).
6. On the iPad: open Playnes → hold the gear → **Map source: Google Photorealistic 3D**, paste the key → **Save**. The key is stored only on that device.

### 2b. Cesium ion instead (optional)

Cesium ion gives satellite photos on real 3D terrain with simple 3D buildings, for all of North America. It looks less lifelike than Google's photoreal tiles but needs no billing setup.

1. Create a free account at [cesium.com/ion](https://cesium.com/ion/) (the Community plan is for personal, non-commercial use).
2. Access Tokens → copy the default token.
3. In grown-up settings choose **Map source: Cesium ion** and paste the token.

### Which map should I use?

| Map | Looks | Needs | Works offline |
|-----|-------|-------|---------------|
| Cartoon world (default) | Bright cartoon: real terrain, rivers, towns, trees | Nothing | Yes, after "Save for offline play" |
| Google Photorealistic 3D | Real buildings, trees and terrain everywhere | Google key + billing account | No |
| Cesium ion | Satellite photos on 3D terrain, grey buildings | Free Cesium account token | No |

**iPhone and iPad.** Safari gives a web page far less memory than the device has, and reloads the page if it goes over (graphics memory counts too). The game keeps itself inside a budget per device: Google's 3D tiles get about 200 MB (+64 MB headroom) on iPhone, 300 MB (+96 MB) on iPad and 768 MB on a computer, and Cesium eases detail slightly when the budget is full instead of growing. Voice lines and map pictures are kept in small recent-use caches. An automatic **detail governor** watches the frame rate: in busy areas (cities in Google mode) it trades a little distant detail for smooth flying, and sharpens back up when there's headroom. In Google mode, detail also eases with speed (from about 230 kt, up to 3x at Mach speeds: the ground flashes past too fast to see it, and streaming every tile would snowball), and every ~150 km (or 25 minutes) the game quietly loads a fresh copy of the 3D world and swaps to it once the ground around you is ready, because Cesium never lets go of the map tree it has explored and a long, fast flight would otherwise slow to a crawl. The game also checks the ground below less often when flying high (each check is an extra render of the 3D tiles), and drops the old area's tiles right away when the playne jumps somewhere new (after a crash or a new line-up). If an older iPad still struggles, set **Graphics quality: Low (older iPad)** in grown-up settings.

---

## 3. Host it on GitHub Pages

The repository includes `.github/workflows/deploy.yml`.

1. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions → Deploy to GitHub Pages → Run workflow** (pick the branch with the latest code). It also runs on every push to `main`.
3. The game appears at `https://<your-github-user>.github.io/Playnes/`.

**Keys and the public site.** This repository is public, so never commit a key. The workflow can bake a key into the build from a repository secret named `GOOGLE_MAPS_API_KEY`, but then anyone who opens the site uses your key, and it's visible in the page's JavaScript. Entering the key in grown-up settings on your own devices (section 2, step 5) is the better choice.

---

## 4. Develop locally

Requirements: Node.js 20+.

```bash
npm install          # .npmrc sets legacy-peer-deps; Cesium sub-packages are pinned in package.json
npm run dev          # http://localhost:5173 (also on your network with --host, for testing on the iPad)
npm test             # flight-model, economy, runway and voice-line tests
npm run build        # type-check + production build into dist/
```

To test on the iPad during development, run `npm run dev`, then open `http://<your-computer's-IP>:5173` in Safari on the same Wi-Fi. Tilt controls need HTTPS, so test those on the hosted site.

A key can also come from a local `.env.local` file (git-ignored):

```
VITE_GOOGLE_MAPS_API_KEY=your-key
```

### Rebuild the offline cartoon map

The cartoon world is built from public data: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) for elevation and [Natural Earth](https://www.naturalearthdata.com/) for coastlines, lakes, rivers, roads and towns. To change the region (`src/data/region.ts`), add airports, or restyle the map (`scripts/world/build_world.py`):

```bash
python3 -m venv ~/mapenv && ~/mapenv/bin/pip install numpy pillow
node scripts/world/export-data.mjs ~/worldcache/data.json
~/mapenv/bin/python scripts/world/build_world.py --cache ~/worldcache    # ~5 minutes, writes public/world/
```

Runways in the cartoon world sit on a flat pad: the game flattens the terrain under each runway (plus shoulders and overruns) to the runway's own slope and blends it back into the hills over about 450 m (`CartoonData.height` in `src/world/cartoon.ts`), so the ground can't poke through the runway. The runway itself is drawn a hair closer to the camera with distance, so far-off simplified terrain can't hide it either.

The cartoon trees and houses are never placed on (or within a few metres of) a real airport building.

Real airport buildings (terminals, hangars, parking decks...) come from [Overture Maps](https://overturemaps.org/) (OpenStreetMap and other open footprints, ODbL). Only the parts of the dataset around the airports are downloaded:

```bash
python3 -m venv ~/ovenv && ~/ovenv/bin/pip install pyarrow requests shapely
~/ovenv/bin/python scripts/world/airport_buildings.py ~/worldcache/data.json   # ~5 minutes, writes public/world/buildings.json
```

### Regenerate the playne pictures (hangar tiles and "Meet your playne")

After changing the models, serve the repo root on port 8765 and run `node tools/render-planes.cjs` (it renders each model with three.js in headless Chromium and writes `public/models/thumbs/` and the lesson's tap spots in `src/data/meetSpots.ts`), then convert the PNGs to WebP with the one-liner at the top of that script.

### Regenerate the 3D planes

The planes are built from code, so there are no model licenses to worry about. Edit shapes and colors in `src/data/aircraft.ts` (the Chinook has its own builder, `buildChinook` in the script), then:

```bash
npm run models       # writes public/models/*.glb
```

Preview them all: serve the repository root (e.g. `npx vite`) and open `/tools/model-preview.html`.

### Regenerate voice lines

Lines live in `src/data/lines.ts`. Audio is made with **Kokoro-82M**, a free, open-source (Apache-2.0) text-to-speech model. New lines play right away with the device's built-in voice until their audio is generated.

```bash
bash scripts/voice/setup-kokoro.sh ~/kokoro            # once: downloads the model (~90 MB) and voices
node scripts/voice/collect-lines.mjs                   # list every line the game can say
~/kokoro/venv/bin/python scripts/voice/generate.py --model-dir ~/kokoro   # makes only the missing files
```

The co-pilot uses the `af_heart` voice. The tower uses `am_michael` with a radio filter. To swap in a family recording, record the line and save it over `public/audio/voice/<id>.mp3`. The id is shown in `scripts/voice/lines.json` next to the line's text.

### Headless checks (optional)

```bash
npm run build
python3 -m http.server 8765 &                                    # serve the repo root
node tools/smoke.cjs http://127.0.0.1:8765/dist/ /tmp/shots      # full charter flight with screenshots
node tools/smoke-lessons.cjs http://127.0.0.1:8765/dist/ /tmp/shots
node tools/smoke-touch.cjs http://127.0.0.1:8765/dist/ /tmp/shots    # on-screen controls only
node tools/smoke-free.cjs http://127.0.0.1:8765/dist/ /tmp/shots     # Free Flight: maps, autopilot, landing, crash
node tools/smoke-spin.cjs http://127.0.0.1:8765/dist/ /tmp/shots     # hangar 3D viewer
node tools/smoke-heli.cjs http://127.0.0.1:8765/dist/ /tmp/shots     # Chinook: unlock, tour, helicopter flying, landings
node tools/smoke-route.cjs http://127.0.0.1:8765/dist/ /tmp/shots    # Free Flight routes and the sky guide line
node tools/smoke-edge.cjs http://127.0.0.1:8765/dist/                # edge of the map turns the playne back
node tools/diag-labels.cjs http://127.0.0.1:8765/dist/ /tmp/shots   # flying-screen labels: overlaps / cut off, 3 screen sizes
node tools/diag-props.cjs http://127.0.0.1:8765/dist/ CLT            # cartoon trees/houses inside real airport buildings (want 0)
node tools/diag-fastflight.cjs http://127.0.0.1:8765/dist/ 7          # long F-16 flight: memory/objects must stay flat
```

These use the Playwright browser and fast-forward the physics, because software rendering is slow.

---

## 5. Project map

```
src/
  main.ts            app boot, menus <-> flights, saving, pause, parent corner
  data/              aircraft, airports + landmarks, every spoken line
  sim/               geodesy, flight physics, co-pilot assists
  game/              flight session (phases, hoops, scoring), runway helpers, progress, settings
  world/             swappable map providers (google / ion / cartoon), offline map data, scenery, cloud deck
  input/             touch yoke + throttle, tilt, keyboard, game controller
  audio/             voice player (files, then device speech), sound effects, engine synth
  ui/                HUD, menu screens, icons
scripts/             model builder, offline map builder, Cesium asset copy, voice generation
public/              models, offline map (world/), voice audio, icons, manifest, service worker
tests/               unit tests (vitest)
tools/               dev helpers: model preview, screenshots, smoke tests
docs/                GAME_PLAN.md (design + review), SETUP.md (this file), plan-page.html
```
