# Playnes setup guide

How to run the game, put it on the iPad, and turn on the real 3D world.

---

## 1. Play it

The game is a web app. Once it's hosted (section 3), open the link on the iPad in Safari, then:

1. Tap **Share → Add to Home Screen**. This gives you a full-screen app with no address bar for little fingers to tap.
2. Open Playnes from the Home Screen and tap **Tap to fly!**
3. Optional, recommended: turn on **Guided Access** (Settings → Accessibility → Guided Access). Triple-click the top button while the game is open to lock the iPad to it.

Without a map key the game runs on a **simple globe**: real airport positions, simple drawn runways, low-detail Earth imagery. Everything else works, including all flights, lessons, planes and saving. Add a Google key (section 2) for the photoreal 3D world.

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
   - **Application restrictions → Websites:** add your game's address, e.g. `https://<your-github-user>.github.io/Playnes/*`, plus `http://localhost:5173/*` for local testing.
   - **API restrictions → Restrict key:** select only **Map Tiles API**.
5. Protect against surprises:
   - Billing → Budgets & alerts → create a **$5 budget** with email alerts.
   - APIs & Services → Map Tiles API → **Quotas**: lower the daily request limits (e.g. 100 root-tileset requests a day).
6. On the iPad: open Playnes → hold the gear → **Map source: Google Photorealistic 3D**, paste the key → **Save**. The key is stored only on that device.

### 2b. Cesium ion instead (optional)

1. Create a free account at [cesium.com/ion](https://cesium.com/ion/) (the Community plan is for personal, non-commercial use).
2. Access Tokens → copy the default token.
3. In grown-up settings choose **Map source: Cesium ion** and paste the token.

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

### Regenerate the 3D planes

The planes are built from code, so there are no model licenses to worry about. Edit shapes and colors in `src/data/aircraft.ts`, then:

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
  world/             swappable map providers (google / ion / basic) and the cloud deck
  input/             touch yoke + throttle, tilt, keyboard, game controller
  audio/             voice player (files, then device speech), sound effects, engine synth
  ui/                HUD, menu screens, icons
scripts/             model builder, Cesium asset copy, voice generation
public/              models, voice audio, icons, manifest, service worker
tests/               unit tests (vitest)
tools/               dev helpers: model preview, screenshots, smoke tests
docs/                GAME_PLAN.md (design + review), SETUP.md (this file), plan-page.html
```
