# Playnes: Game Plan & Design Review

*Working title. A real-world flying game for a 5-year-old airplane fan. Main platform is iPad, with Windows PC as the second.*

Status: **First playable build done (Phase 0/1)** · Last updated 2026-11-13

---

## 0. The pitch (one paragraph)

The player is the captain of their own little charter company. It's based at **Tri-Cities (TRI)** with a second base at **Charlotte (CLT)**. They fly passengers in real business jets across a real North America: mountains, beaches, big cities. A friendly co-pilot talks them through everything, because a 5-year-old probably can't read yet. Each flight takes about 5–8 minutes. The player earns **Wings** (gold pilot-wing pins, the game's currency) for good charter flights and for learning new flying skills. Wings buy new planes: a Cessna trainer first, then Embraer, Pilatus, HondaJet, Cessna Citation, Bombardier, Dassault and Gulfstream jets. The planes, airports and procedures are real. The physics is forgiving. You can't crash, you can't lose progress, and nothing in the game costs real money.

---

## Decisions (Nov 13, 2026)

| Topic | Decision |
|-------|----------|
| Target device | A **standard iPad, recent generation**. Photoreal 3D is the default, with automatic quality fallback |
| Audience & distribution | **Private family game for now.** Not published, no money involved |
| World data | **Google Photorealistic 3D Tiles**, behind a swappable `WorldProvider`, so Cesium ion can replace it later with a config change. A key-free "basic globe" mode exists for development and offline testing |
| Personal details | **Kept out for now.** Generic callsign, no names, no family voices; easy to add later |
| Voices | **Free neural TTS (Kokoro, Apache-2.0)** generates the co-pilot and tower lines. Device speech is the fallback. Family recordings can replace lines later |

---

## Build status (Nov 14, 2026)

The game is playable at the GitHub Pages site. See `docs/SETUP.md`.

**Working now**
- Three map sources behind one switch: Google Photorealistic 3D Tiles, Cesium ion, and a bundled **offline cartoon world** (default) built from AWS Terrain Tiles + Natural Earth, with terrain, fields, forests, rivers, lakes, towns, trees, clouds and crisp runways
- 12 airports (TRI, CLT, AVL, MYR, ATL, TYS, CHA, GSP, CAE, GSO, RDU, ROA) and 19 landmarks; about 4,300 real airport buildings (terminals, hangars, parking decks) from Overture Maps / OpenStreetMap footprints
- Flight model with a standard atmosphere (thrust and drag change with altitude), induced and parasite drag, real Vmo/Mmo limits; every plane calibrated to its book climb rate, cruise speed and glide ratio and unit-tested; co-pilot assists, Ground Buddy, envelope protection
- 14 procedural "toy-real" playnes (13 business/training aircraft plus an F-16 for Free Flight), each with PLAYNE123 painted on the side, with moving flaps, ailerons, elevators and rudder, blinking beacons and strobes, and a ground shadow
- Controls: touch yoke + throttle lever, tilt, keyboard, game controller; drag-to-look bubble above the yoke, with reset; full stick = 45° steep turn, and a hoop helper that flies the curve when you steer toward the next hoop
- Cockpit view (round dials in the Cessna, glass screens elsewhere) and a passenger window view
- Real slowing down: flap lever with detents and speed limits, speedbrakes, ground spoilers, reversers, autobrakes; emergency landings on flat open ground
- Charters (radio call → takeoff → hoops → cloud cruise with landmarks → approach with live PAPI lights → landing score), Flight School 1–5 with graduation, hangar with Wings prices
- **Free Flight** sandbox: pick any departure airport, save and resume, minimap, big map with autopilot while open, fly-to target line, landing helper on any runway, passport stamps, edge-of-map turnaround, optional crashes
- 321 voice lines generated with free Kokoro TTS (callsign "Playne one two three")
- Grown-up corner, backup codes, break reminder, installable PWA, "Save for offline play"
- Headless tests: charter, lessons 2–5, touch-only controls, Free Flight (maps, autopilot, guided landing, crash)

**Needs the real iPad**
- Frame rate in the cartoon world (trees, clouds) and with Google tiles; the Low graphics setting thins out scenery
- Tilt direction and touch-yoke feel with the actual player

**Next**
- Juice-cup comfort meter, paint shop, taxi and walkaround mini-games, tower-cam replay
- Charters to the new airports and more destinations (TEB, MCO, PBI, YYZ…)
- Verify CLT and ATL runway names on the FAA diagrams

---

## 1. Who it's for: design principles

A 5-year-old player brings specific needs. Every feature below follows from these rules:

| # | Principle | What it means in practice |
|---|-----------|---------------------------|
| 1 | **Pre-reader first** | Every instruction is spoken and shown as an icon. Text is decoration and captions for parents, never required. |
| 2 | **Real things, kid-sized** | Real airports, plane models, terms ("rotate", "gear up", "flaps", "magenta line", "butter landing") and procedures, all explained in kid words. The physics is simplified and has protections. |
| 3 | **Never stuck, never punished** | No crashes, no game over, no losing Wings. After 2 misses the co-pilot helps more. After 3, the co-pilot demonstrates. Every lesson can be completed. |
| 4 | **Short loops** | One flight takes 5–8 minutes. A session (2–3 flights) takes about 20 minutes. The game always has a natural stopping point. |
| 5 | **Big, forgiving touch targets** | At least 64pt buttons (Apple's minimum is 44pt, and small fingers need more), spaced well apart. Nothing important sits near screen edges, where palms rest. |
| 6 | **Fair, visible progress** | Unlocks are fixed: "collect 150 Wings → HondaJet". No random loot, no timers, no streaks, no ads, no purchases. |
| 7 | **Delight the expert, too** | Grown-ups who fly for a living should nod along. Correct bizjet airports (TEB, not JFK), correct phraseology and correct callouts make it a game parent and child can play together. |

---

## 2. Core game loop

```
        ┌────────────────────────────────────────────────────────┐
        │                                                        │
        ▼                                                        │
  ┌───────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────┐ │
  │  HANGAR   │──▶│ CHARTER BOARD│──▶│  FLIGHT  │──▶│ DEBRIEF  │─┘
  │ pick plane│   │ or FLIGHT    │   │ (5-8 min)│   │ stars,   │
  │ paint it  │   │ SCHOOL lesson│   │          │   │ Wings,   │
  └───────────┘   └──────────────┘   └──────────┘   │ stamp    │
        ▲                                           └────┬─────┘
        │            ┌──────────────┐                    │
        └────────────│  UNLOCK NEW  │◀───── spend Wings ─┘
                     │  PLANE/PAINT │
                     └──────────────┘
```

Supporting screens:
- **Map of North America:** a big stylized map with pins and landmark icons. A green ring shows the range of the selected plane, which teaches "bigger jets fly farther".
- **Logbook / Passport:** a stamp for every airport visited, a photo of every "butter" landing, and badges from Flight School.
- **Parent corner:** behind a parent gate. Contains settings, a session timer, save backup, and an unlock-all option for special days.

---

## 3. A flight, step by step

**Example charter:** *"The Lopez family wants to go to Charlotte for a soccer game. 4 passengers."* (TRI → CLT, 104 nm, Phenom 100)

| Phase | ~Time | What the player does | Real concept taught |
|-------|-------|----------------------|---------------------|
| Preflight walkaround | 30 s | Tap 3 glowing things: tires, fuel cap, and the red **REMOVE BEFORE FLIGHT** flag | Pilots inspect the plane before every flight |
| Boarding | 15 s | Passengers walk up the airstair. Tap "close door". *Ding*: seatbelt sign on | Checklists, passenger safety |
| Radio + taxi | 45 s | Tap the radio button. The co-pilot says *"Tri-Cities Ground, Playnes Seven-Sierra-Mike, ready to taxi."* The tower answers. Follow the yellow line to Runway 23 | ATC, taxiways, phonetic alphabet |
| Takeoff | 30 s | Throttle forward. Co-pilot: *"Eighty knots… ROTATE!"* Pull back gently. *"Positive rate, gear up!"* Tap the gear button | V-speeds, rotation, landing gear |
| Climb & turn | 45 s | Fly through big hoops. Bank toward the **magenta line**. Look: mountains! | Banking to turn, GPS course line |
| Cruise | 90–240 s | Above the clouds, sped up. The clouds part over a landmark (Lake Norman on this trip). Keep the passenger's juice cup from spilling | Smooth flying, navigation, geography |
| Descent | 30 s | *"Charlotte Approach, Seven-Sierra-Mike."* Flaps 1, gear down | Configuring for landing |
| Approach & landing | 60 s | Follow the glide-path hoops. **PAPI lights:** "two red, two white, you're just right!" Flare, then touch down | Glide path, PAPI, flare |
| Taxi to the FBO | 30 s | Follow the marshaller's wands to the red carpet. Passengers cheer | FBOs, ramp ops |
| Debrief | 30 s | Stars, Wings and a passport stamp. Tower-cam replay of the landing | — |

**Landing score:** based on touchdown sink rate, plus bonuses for centerline and touchdown zone.
- Under 150 fpm: **"BUTTER!"** ★★★
- Under 400 fpm: "Smooth!" ★★
- Under 700 fpm: "Firm!" ★
- Harder: "Boing! Let's try that again". The plane bounces safely and you go around.

**Go-arounds are celebrated:** *"Great decision, Captain! Real pilots go around when it doesn't look right."*

---

## 4. Flight model & controls

### 4.1 Physics: "arcade-realistic"

The rule: simple underneath, honest on the outside.

- **State:** position (lat/lon/alt on the WGS84 globe), heading, pitch, bank, airspeed, vertical speed, throttle, flaps (0/1/2/FULL), gear, on-ground.
- **Turning uses real physics:** turn rate = g·tan(bank) / airspeed. Big fast jets turn wider, with no extra code.
- **Energy model:** thrust minus drag, and climbing costs speed. Each plane has a parameter set: rotation speed, approach speed, cruise speed, climb rate, ceiling, roll rate, and "heaviness" (control response lag).
- **Envelope protection** (like Airbus fly-by-wire): no stalls (the nose lowers itself), bank limited to 30° in assisted modes and 45° in manual, no overspeed.
- **"Ground Buddy"** (based on real terrain warning systems): flying toward terrain triggers *"Terrain! Pull up!"* and a gentle automatic pull-up. Touching ground or water gives a soft bounce, never a crash.
- Physics runs at a fixed 60 Hz step, separate from rendering, so a slow iPad frame rate doesn't change how the plane flies.

### 4.2 Co-pilot assist levels

These are also the main "learn advanced controls" progression.

| Level | Name | Player controls | Co-pilot handles | Graduation reward |
|-------|------|-----------------|------------------|-------------------|
| 1 | "You steer" | Left/right, plus buttons when asked | Pitch, throttle, flare, taxi | (starting level) |
| 2 | "Up & down" | + pitch | Throttle, flare | +100 Wings, badge |
| 3 | "Power" | + throttle (speed tape shows green/yellow/red) | Flare, brakes | +100 Wings, badge |
| 4 | "Landing Pro" | + flare & brakes, guided by PAPI | Crash protection only | +100 Wings, badge |
| 5 | "Captain" | Everything; autopilot is now a tool he can use (HDG / ALT) | Crash protection only | +150 Wings, **special plane** |

He can always drop back a level with no penalty. Level 1 is the default for every new player.

### 4.3 Input methods

| Platform | Primary | Alternatives |
|----------|---------|--------------|
| **iPad** | **Touch yoke:** big draggable control on the left; tall throttle lever with notches (IDLE / TAXI / CLIMB / TAKEOFF) on the right | **Tilt-to-fly:** hold the iPad like a steering wheel, recalibrated at the start of each flight. **Game controller:** Xbox/PlayStation controller over Bluetooth works in Safari |
| **Windows PC** | Keyboard: arrows/WASD = yoke, PgUp/PgDn = throttle, G = gear, F = flaps, C = camera, Space = brakes | Xbox controller (sticks + triggers), touchscreen laptops (same UI as iPad), USB flight sticks via the browser Gamepad API |

Big on-screen buttons: **Gear**, **Flaps**, **Lights**, **Radio**, **Camera** (chase / cockpit / tower / wing), **Autopilot** (from level 5), **Pause**.

> **Recommendation:** build touch yoke and tilt together in Phase 1. Then hand both to the player for 5 minutes each and let them pick. Kids this age split roughly evenly, and it is cheap to support both.

### 4.4 Instruments (kid-readable)

The instruments are real, but colors carry the meaning:
- **Artificial horizon:** a blue-sky/brown-ground ball (the real instrument).
- **Speed tape and altitude tape:** big numbers with green/yellow/red bands.
- **Compass ribbon** with N/E/S/W.
- **Mini-map** with the magenta course line and the plane icon.
- **Passenger comfort cup:** a juice cup that sloshes when you fly roughly. It turns g-force into something a 5-year-old gets immediately.

---

## 5. Flight School curriculum

Each lesson takes 2–4 minutes and is fully voiced. It has one goal, and you can't fail it (see principle 3).

**Basics (Lessons 1–5)** → graduation ceremony with a gold Wings pin, plus the **Embraer Phenom 100EX**

| # | Lesson | Goal | Kid phrasing | Reward |
|---|--------|------|--------------|--------|
| 1 | Meet your plane | Tap the wings, tail, engines, wheels and cockpit | "Wings lift us up like a bird!" | 25 Wings |
| 2 | Go fast, go slow | Taxi with the throttle and stop with the brakes | "Push to go, pull back to slow" | 25 |
| 3 | Takeoff! | Speed up, rotate, gear up | "When I say ROTATE, pull back gently!" | 25 |
| 4 | Turning | Bank left and right, then level the wings | "Tilt the wings to turn, like a bike leaning" | 25 |
| 5 | Landing | Follow the hoops, check the PAPI, touch down | "Two red, two white, you're just right!" | 50 |

**Advanced (unlock gradually, Phase 3)**

| # | Lesson | Real skill |
|---|--------|-----------|
| 6 | Up and down | Pitch for climb and descent, reading the altitude tape |
| 7 | Flaps & gear | Configuring for slow flight |
| 8 | Talk to the tower | Radio calls: cleared for takeoff, cleared to land |
| 9 | Follow the magenta line | Navigation with headings and the compass |
| 10 | Autopilot | Setting heading and altitude, and letting the plane help |
| 11 | Crosswind landing | Pointing into the wind |
| 12 | Clouds & rain | Flying with instruments; follow the ILS diamonds |
| 13 | Mountain airport | Steep approach (Aspen) |
| 14 | Night flight | Runway lights, landing lights |

---

## 6. The world: real North America

### 6.1 What "Google Maps data" can mean

| Option | What you get | Fit for this game |
|--------|--------------|-------------------|
| **A. Google Photorealistic 3D Tiles** (Map Tiles API) | Photogrammetry 3D cities and terrain for the whole continent. He could see real neighborhoods, lakes and mountains around TRI | **Best visuals.** Heavier on the iPad. Billed per session (1,000 free per month, then about $6 per 1,000) |
| B. Google 2D satellite tiles draped on terrain | Satellite photos on 3D terrain (the terrain comes from another source) | Lighter. Flat-looking cities |
| **C. Non-Google: Cesium ion** (Cesium World Terrain + Bing/Sentinel-2 imagery + OSM 3D buildings) | Satellite imagery, real terrain, simple grey buildings | Good enough for kids, lighter, and **avoids the Google terms issue below** |

> ⚠️ **Read §15 risk #1 first.** Google's Maps Platform Terms prohibit using its maps in apps "directed to children" as defined by COPPA. This applies to every Google option (A and B).

**Recommendation:** build the world behind a swappable `WorldProvider` interface from day one, so switching between Google 3D Tiles and Cesium ion is a config change. Decide in Phase 0 after the legal read and an iPad performance test.

### 6.2 Home bases

| Base | Real details used in game | Why it's great |
|------|---------------------------|----------------|
| **TRI**, Tri-Cities (Blountville, TN), elev. 1,519 ft | Runway 5/23 (8,000 × 150 ft) and 9/27 (~4,440 ft) | Home turf. Appalachian mountains, South Holston and Boone lakes. A calm, simple airport for learning |
| **CLT**, Charlotte Douglas, elev. 748 ft | Several long parallel runways plus a diagonal one. **Check current runway names against the FAA airport diagram** (see §15 #10) | Big-airport excitement: lots of other planes on the ground, city skyline |

TRI → CLT is **104 nm**. That's about 25 minutes in a real light jet, or about 5 minutes in the game.

### 6.3 Time compression (how a continent fits into 6 minutes)

- **Near airports** (within about 10 nm), the game runs in real time and at real scale. Takeoffs and landings stay authentic.
- **Cruise** is sped up so it lasts between **90 s and 4 min**: `cruise_seconds = clamp(60 + distance_nm × 0.1, 90, 240)`. Long trips still feel long, but not boring.
- **The cruise happens above a cloud layer.** The clouds open for 1–3 "look-down moments" over real landmarks on the route. This cuts down how much map data has to load at high speed, which is the main iPad performance risk. It also gives the cruise a rhythm.
- Parents can turn on a **"Skip to approach"** button for impatient days.

### 6.4 Destinations

These are curated, not the whole continent. About 4 ship in the first playable version (MVP) and 20–25 in the full game. Business-jet airports are used where real charter flights would actually go.

| Region | Airport | Dist. from TRI | Landmark moment | Teaches / special |
|--------|---------|---------------:|-----------------|-------------------|
| Home | **TRI** Tri-Cities | — | Boone Lake, mountains | Home base |
| Home | **CLT** Charlotte | 104 nm | Uptown skyline, Lake Norman | Big busy airport |
| Southeast | **AVL** Asheville | 63 nm | Blue Ridge Mountains | Shortest hop, first trip (MVP) |
| Southeast | **ATL** Atlanta (or PDK) | 197 nm | World's busiest airport | Traffic |
| Southeast | **BNA** Nashville | 208 nm | Music City | — |
| Southeast | **MYR** Myrtle Beach | 240 nm | Ocean & beach | First ocean! (MVP) |
| Southeast | **MCO** Orlando | 486 nm | Theme-park country (generic, no Disney IP) | Popular family charter |
| Southeast | **PBI** Palm Beach | 600 nm | Palm trees, ocean | Classic bizjet destination |
| Southeast | **EYW** Key West | 716 nm | Islands & bridges | Short runway (advanced) |
| Northeast | **IAD** Washington Dulles | 278 nm | Monuments (seen from outside restricted airspace) | — |
| Northeast | **TEB** Teterboro | 471 nm | NYC skyline, Statue of Liberty | **The** business jet airport |
| Northeast | **BOS** Boston | 635 nm | Harbor | — |
| Midwest | **MDW/PWK** Chicago | ~420 nm | Lake Michigan, skyscrapers | — |
| Mountain | **APA** Denver Centennial | ~1,070 nm | The Rockies | Mountain flying |
| Mountain | **ASE** Aspen | 1,168 nm | Ski mountains | Famous tricky approach (advanced) |
| Mountain | **JAC** Jackson Hole | 1,363 nm | Grand Tetons | — |
| South | **AUS** Austin / **MSY** New Orleans | 852 / 554 nm | River & bayou | — |
| West | **LAS** Las Vegas | 1,577 nm | Desert, the Strip | — |
| West | **VNY** Van Nuys (LA) | 1,762 nm | Hollywood hills, ocean | Real LA bizjet hub |
| West | **BFI/SEA** Seattle | ~1,875 nm | Space Needle, Mt. Rainier | — |
| Canada | **YYZ** Toronto | 451 nm | CN Tower | First international trip |
| Canada | **YVR** Vancouver | ~2,000 nm | Mountains meet ocean | — |
| Mexico | **CUN** Cancún | 956 nm | Turquoise sea | Over-water flight |
| Alaska | **ANC** Anchorage | 2,884 nm | Glaciers, Denali | The "epic" long-haul |

*Distances are great-circle from TRI, computed from OurAirports coordinates.*

---

## 7. Charter missions

- **Charter board:** 3 mission cards at a time, each with a big passenger picture, a destination landmark and a Wings reward. Cards only offer destinations the current plane can reach, and party sizes that fit its cabin. That teaches plane size and range.
- **Passenger types** (all made up, no real people or brands):
  - The Lopez family going to the beach
  - A basketball team going to Chicago
  - Grandma going to meet the new baby
  - A puppy-rescue flight
  - A band going to Nashville
  - Skiers going to Aspen
  - Scientists going to Alaska to see the Northern Lights
  - A doctor carrying medicine
- **Special cargo missions:** "Deliver the birthday cake — don't let it wobble!" The comfort cup becomes a cake. "Rush delivery" missions give bonus Wings for a smooth flight, never a timer penalty.
- **Personal missions** (later, optional): missions written around real trips the family knows, with personal names and voices added when the family is ready.

---

## 8. Planes & unlocks

All planes are real models. Plane cards show real-world stats, read aloud: *"The Gulfstream G700 can carry 19 people and fly from here all the way to Japan without stopping!"*

| # | Plane | Type | Seats (max) | Cruise | Range (real) | Unlock | Kid "wow" fact |
|---|-------|------|------------:|-------:|-------------:|--------|----------------|
| 1 | Cessna 172 Skyhawk | Piston trainer | 4 | ~124 kt | ~640 nm | **Starter** | "Almost every pilot learns in one!" |
| 2 | Embraer Phenom 100EX | Light jet | 6 | ~406 kt | ~1,180 nm | **Flight School graduation** | Your first jet! |
| 3 | Pilatus PC-12 NGX | Turboprop | 10 | ~290 kt | ~1,800 nm | 75 Wings | One big propeller |
| 4 | HondaJet Elite II | Very light jet | 6 | ~422 kt | ~1,550 nm | 125 | Engines sit *on top of* the wings! |
| 5 | Embraer Phenom 300E | Light jet | 10 | ~464 kt | ~2,000 nm | 175 | Best-selling light jet in the world |
| 6 | Pilatus PC-24 | Light jet | 10 | ~440 kt | ~2,000 nm | 225 | Can land on grass and dirt! (unlocks a grass-strip mission) |
| 7 | Cessna Citation Latitude | Midsize jet | 9 | ~446 kt | ~2,700 nm | 275 | Flat floor; grown-ups can stand up inside |
| 8 | Embraer Praetor 600 | Super-midsize | 12 | ~466 kt | ~4,000 nm | 325 | Smooth-ride fly-by-wire |
| 9 | Bombardier Challenger 3500 | Super-midsize | 10 | ~470 kt | ~3,400 nm | 375 | Wide cabin |
| 10 | Dassault Falcon 8X | Large-cabin trijet | 16 | ~460 kt | ~6,450 nm | 450 | **Three** engines! |
| 11 | Gulfstream G650ER | Ultra-long-range | 19 | ~488 kt | ~7,500 nm | 550 | Giant oval windows |
| 12 | Gulfstream G700 | Ultra-long-range | 19 | ~488 kt | ~7,750 nm | 650 | Biggest cabin; it can even have a bedroom! |
| 13 | Bombardier Global 8000 | Ultra-long-range | 19 | ~490 kt (max Mach 0.94) | ~8,000 nm | 750 | Fastest business jet |
| ★ | **Special plane** | A personal pick, to be chosen later | — | — | — | Captain graduation (assist level 5) | (personalized later) |

*Stats are approximate public figures. Verify against each manufacturer's current spec sheet before writing the voice lines.*

**Range gating uses real numbers.** The Cessna 172 can reach AVL, CLT, ATL, BNA and MYR. A light jet opens up most of the East and Midwest. Alaska needs a midsize jet or bigger. The map's range ring makes this visible.

**Other things to spend Wings on:**
- **Paint shop** (10–40 Wings): colors, stripes, stickers (stars, dinosaurs, flags), and a custom **tail number** made from his initials (N7SM style).
- **Hangar & ramp** (20–60 Wings): fuel truck, tug, windsock, red carpet, hangar decorations, a pet "airport dog".
- **Fun extras:** airshow smoke trails, colored nav lights. Plane performance stays real; there are no stat upgrades.

---

## 9. Economy: earning & pacing

All values live in `data/economy.json` so they can be tuned without code changes.

| Earned by | Wings |
|-----------|------:|
| Complete a charter | 10 + 1 per 50 nm (max +30) |
| Landing stars | +5 per star (max +15) |
| Comfort bonus (no spills) | +5 |
| First visit to an airport (passport stamp) | +15 |
| Flight School lesson | +25 basic / +50 advanced |
| Assist-level graduation | +100 to +150 |

**Pacing targets:**
- A typical flight earns 30–45 Wings, so a 20-minute session earns about 100.
- **First plane unlock happens in the first session** (graduation), and the second by session 2.
- After that, roughly one new plane every 2–4 sessions. All 13 planes take about 35–40 sessions. That's weeks of play, not years.
- Wings are **never lost**. A bouncy landing still pays the base amount.

**Deliberately excluded** (manipulative for this age): real-money purchases, ads, loot boxes / random rewards, daily-login streaks, energy timers, limited-time offers, "your plane is sad" guilt messages.

---

## 10. Child safety & privacy

- **No accounts, no chat, no multiplayer, no external links, no ads, no analytics, no tracking.** Save data stays on the device.
- **Parent gate** on settings: press and hold for 3 seconds, then solve a simple adult question.
- **Parent corner:**
  - Optional session timer: *"Time to land, Captain!"* ends the flight gracefully, never mid-air.
  - Volume and voice speed controls
  - Assist level override
  - Save backup/restore
  - Unlock all
- **iPad tip for parents:** use **Guided Access** (Settings → Accessibility) to lock the iPad to the game.
- The game does send requests to the map provider (Google or Cesium), which see the device's IP address. That is unavoidable with streamed maps.

---

## 11. Platform plan: iPad first, Windows second

### iPad (Safari / WebKit; every iPad browser uses WebKit)

| Concern | Plan |
|---------|------|
| Full-screen, kid-proof | Ship as a **PWA**: "Add to Home Screen" removes the browser chrome and the address bar a kid can tap by accident |
| Landscape | Design for landscape. Show a friendly "turn me sideways" animation in portrait, because iPadOS Safari can't reliably lock orientation |
| Tilt controls | `DeviceOrientationEvent.requestPermission()` must be called from a tap. Ask once in a cute "Ready to fly?" screen |
| Sound | Audio unlocks on the first tap (same screen) |
| Memory | Safari kills tabs that use too much memory. Cap the map tile cache, lower resolution adaptively, no shadows. Target under ~1 GB |
| **Save data** | Safari can delete website storage after a period of disuse, and installed home-screen apps are treated better. Mitigations: install as PWA, call `navigator.storage.persist()`, use a versioned save in browser storage, and offer **backup/restore codes** in the parent corner. Losing every plane means tears, so this matters |
| Performance target | 60 fps in menus, steady 30+ fps in flight. Gracefully lower quality on older iPads |
| Testing | **Must be tested on the actual iPad.** Desktop WebKit is not the same thing |

### Windows PC
- Edge or Chrome (also installable as a PWA). Keyboard, mouse, Xbox controller and touchscreen all supported.
- Same build and same save format. Moving progress between devices uses backup codes (cloud sync is an optional later item).

---

## 12. Technical architecture

### Stack
- **TypeScript + Vite**: fast builds, static output.
- **CesiumJS** (Apache-2.0): globe, WGS84 math, camera, sky, atmosphere and sun lighting. It loads Google Photorealistic 3D Tiles directly, and Cesium ion works the same way. It also loads glTF plane models and samples ground height for collision.
  - *Fallback if Cesium is too heavy on the iPad:* three.js + NASA-AMMOS `3DTilesRendererJS`. That is lighter and gives more art control, but means more custom code.
- **UI:** plain HTML/CSS overlays (no framework). Instruments drawn in SVG so they stay sharp and readable.
- **Audio:** Web Audio API. Voice lines are pre-generated audio files made with **Kokoro**, a free open-source (Apache-2.0) neural text-to-speech model, so they can be swapped for family recordings later. Any line without a file falls back to the device's built-in speech voice. Engine sound is synthesized and changes pitch with throttle.
- **Save:** versioned JSON in browser storage, plus export/import backup codes.
- **Data:** airport and runway geometry from the **FAA's official airport data** (public domain), cross-checked with OurAirports. *Not* traced from Google imagery, which Google's terms forbid.
- **Hosting:** static HTTPS (GitHub Pages or Cloudflare Pages). A service worker caches the app shell, plane models and audio. It does **not** cache Google map tiles, which the terms forbid.

### Module layout

```
src/
  main.ts
  world/        WorldProvider interface → GoogleTilesProvider, CesiumIonProvider, (later) OfflineProvider
  flight/       physics.ts, aircraft params, assists.ts, autopilot.ts, groundBuddy.ts
  input/        touchYoke.ts, tilt.ts, keyboard.ts, gamepad.ts  →  one unified ControlState
  missions/     charter generator, scoring, comfort cup
  lessons/      data-driven lesson scripts (steps, voice lines, success checks)
  progression/  wallet, unlocks, logbook, save/load
  ui/           Home, Hangar, Map, Briefing, Flight HUD, Debrief, Parent Corner
  audio/        voice player, sfx, engine synth
data/           airports.json, aircraft.json, economy.json, missions.json, lessons.json, voice/*.json
public/         models/*.glb, audio/*, icons, manifest.webmanifest
```

Everything that is *content* is data, not code: planes, airports, lessons, missions, prices. Adding a plane means adding a model file and a JSON entry.

### Keys, cost and abuse protection
- The API key is visible in a browser game. Protect it three ways: restrict it to the game's domain (HTTP referrer), restrict it to the map API only, and set a **daily quota cap** plus a **$5 billing alert** in Google Cloud.
- Google 3D Tiles bills about once per game launch (root tileset request), not per tile. One family's use, a few launches a day, should stay well under the 1,000 free per month. Create the world once per session and keep it, rather than reloading it for every flight.

### Testing
- Unit tests (Vitest): physics sanity, scoring, economy math, save migration.
- Automated browser tests (Playwright, WebKit engine): menus, save/load, one full scripted flight.
- **Real-device playtests:** on the iPad, with the actual 5-year-old. Kid testing beats every other kind of testing.

---

## 13. Art & audio direction

- **Planes are "toy-real":** true silhouettes, liveries and features (HondaJet's over-wing engines, Falcon's three engines, Gulfstream's oval windows), with slightly chunky proportions and bright colors. Animated gear, flaps, propellers and lights.
  - Model budget: about 10–30k triangles per plane, compressed glTF.
  - Sourcing options: commission low-poly models, buy licensed models (check each license for branded/editorial restrictions), or build in Blender. **Plan for this to be the biggest content cost.**
- **The world is real** (photoreal or satellite). Menus and UI are bright, rounded and icon-led. Real-looking world plus toy-like controls is the look.
- **Co-pilot character:** a warm, encouraging voice with a face in the corner. For now the voices are generated with free TTS (Kokoro): one voice for the co-pilot, a different one for the tower. **Later:** a family member can re-record any line. Each line is a separate file, so recordings can replace them one at a time.
- Voice-line budget: about 300–500 lines. Dynamic parts (destination names, his callsign) are stitched together from recorded pieces.
- Sound: engine spool-up, gear thunk, flap whir, seatbelt ding, tire chirp on touchdown, cabin cheers.

---

## 14. Roadmap

Each phase ends with something he can play.

### Phase 0: Spike & decisions (go/no-go)
- Load the Google 3D Tiles provider *and* the Cesium ion provider around TRI on **the actual iPad**. Fly a placeholder plane at 250 kt / 3,000 ft and at cruise.
- Measure frame rate, memory, tile pop-in and per-session cost. Check how detailed TRI and CLT look.
- Prototype touch yoke vs. tilt and hand both to the player.
- Confirm the PWA install, motion permission and audio unlock flow.
- **Exit:** a decision on the world provider (see §15 #1), the input default and the quality settings.

### Phase 1: "First Flight" (MVP)
- Planes: Cessna 172 + Phenom 100EX
- Flight School lessons 1–5, fully voiced
- Routes: TRI ⇄ CLT, TRI → AVL, TRI → MYR
- Full flight loop, landing scoring, Wings, graduation ceremony, save/backup
- Touch, tilt and keyboard controls; assist levels 1–2
- **Exit:** the player completes TRI → CLT on assist level 1 **without adult help**, and wants to go again.

### Phase 2: "Hangar & Charters"
- 6 planes, about 12 destinations, charter board, comfort cup
- Hangar, paint shop, tail number, logbook/passport, map with range rings
- Parent corner, gamepad support
- **Exit:** a week of normal play with no bugs that break the save, and pacing feels right.

### Phase 3: "Advanced Pilot"
- Lessons 6–14, assist levels 3–5, autopilot, ATC radio interactions
- Weather (clouds/rain, light crosswind), sunset/night
- Mountain approaches, remaining planes, the special plane

### Phase 4: "Extras" (optional)
- Offline "Cartoon World" mode for car trips and real flights, built from open data
- Landing replay album, holiday missions, cloud save, multiple pilot profiles (siblings and cousins)

---

## 15. Design review: risks & tough calls

Ranked by how much they could change the plan.

### 1. 🔴 Google's terms forbid child-directed apps (blocker-level)
Google Maps Platform Terms of Service, §3.2.1(c)(vi), last modified Aug 26, 2026, says the customer will not use the Services:
> "in a Customer Application that would be deemed to be a 'Website or online service directed to children' under the Children's Online Privacy Protection Act (COPPA)."

Map Tiles API (which includes Photorealistic 3D Tiles) is a Google Maps Core Service, so this applies directly. A game built for a 5-year-old is plainly aimed at children in content.

*Nuance (not legal advice):* my understanding is that COPPA's definition of a child-directed website covers **commercial** websites and services. A private, non-commercial game for one family is therefore *arguably* outside it. But Google decides what breaks its own license, and the realistic worst case is a suspended API key or billing account.

**Options:**
- **(a)** Use Google 3D Tiles for a private, never-published, non-commercial family build, accepting that gray area.
- **(b)** Use Cesium ion data (Option C in §6.1) and skip Google entirely. It looks less photoreal but is clean. Cesium ion's free Community plan is for personal/non-commercial use; review its terms too.
- **(c)** Build on (b), with (a) as an optional private setting.

**If this is ever published publicly, Google data is out.** The swappable `WorldProvider` keeps every option open, and this is **your decision to make**.

### 2. 🟠 iPad performance & memory
Photoreal 3D Tiles is the heaviest thing in the game. On an older or base-model iPad it may stutter or get the Safari tab killed. Mitigations:
- the cloud-layer cruise
- fog, which also hides distant tiles
- capped cache and adaptive resolution
- lower tile detail during cruise
- the Cesium ion fallback

**Which iPad he has matters a lot** (question 1 below).

### 3. 🟠 No offline play with streamed maps
Google's terms forbid offline use and caching, and every streamed map needs internet anyway. iPads come along on car trips and real flights, so expect a disappointed kid on a plane with no Wi-Fi. Plan the Phase 4 Offline Cartoon World, or at least an honest "Need Wi-Fi to fly" screen that still lets him use the hangar and paint shop offline.

### 4. 🟡 Realism vs. fun
"Realistic" should come from the *nouns and rituals* (real planes, airports, callouts, checklists), not from hard physics. A truly realistic flight model would frustrate a 5-year-old within a minute. The assist levels let realism grow with him.

### 5. 🟡 Save-data loss on iPad
Covered in §11. Treat it as a must-have for Phase 1, not polish.

### 6. 🟡 Aircraft trademarks & 3D models
Real names and liveries (Gulfstream, Dassault Falcon, Embraer…) are fine for a private family game. Publishing would need licensing or generic "inspired-by" designs. 3D model licenses vary; some marketplace models with brand names are "editorial use only".

### 7. 🟡 Cost & key abuse
Usage should stay within the free tier, but a leaked key could be abused. Use domain + API restrictions, a daily quota cap and a billing alert (§12).

### 8. 🟢 Pre-reader UX is a big content job
300–500 voice lines plus icon design for everything. Budget real time for it, and playtest early to catch "he didn't know what to tap" moments.

### 9. 🟢 Scope: North America is huge
Curating 20–25 great destinations beats "fly anywhere". Free flight is still allowed, but the content (landmarks, missions) is focused.

### 10. 🟢 Airport data accuracy
OurAirports is crowd-sourced. Its current CLT runway entries looked inconsistent (unusual runway names and a runway marked closed). Use the FAA's official data and check each game airport against the current FAA airport diagram. Have a working pilot sanity-check TRI and CLT too.

---

## 16. Open questions

Answered on Nov 13 (see **Decisions** at the top): device, distribution, world data, personal details and voices.

Still open, none blocking:
1. **Google API key:** a parent needs to create one (steps in `docs/SETUP.md`) before photoreal mode works. Until then the game runs on the basic globe.
2. **Special plane and personal touches:** pick later.
3. **Hosting:** GitHub Pages from this repo (workflow included), or another static host.

---

## Sources

- Google Maps Platform Terms of Service (§3.2.1 restrictions, "No Caching", "No Creating Content From Google Maps Content"): https://cloud.google.com/maps-platform/terms
- Google Maps Platform Core Services list (includes Map Tiles API): https://cloud.google.com/maps-platform/terms/maps-services
- Map Tiles API policies (attribution, no offline use, overlay rules): https://developers.google.com/maps/documentation/tile/policies
- Google Maps Platform pricing (Photorealistic 3D Tiles: 1,000 free/month, then ~$6 per 1,000): https://developers.google.com/maps/billing-and-pricing/pricing
- Map Tiles API usage & billing: https://developers.google.com/maps/documentation/tile/usage_limits
- Cesium ion pricing / Community plan: https://cesium.com/platform/cesium-ion/pricing/
- Cesium ion content (Bing Maps imagery, Sentinel-2, World Terrain): https://cesium.com/platform/cesium-ion/content/
- OurAirports open data (public domain): https://ourairports.com/data/
- TRI facilities: https://flytri.com/facilities-information · https://airnav.com/airport/KTRI
