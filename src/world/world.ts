// Swappable world providers (docs/GAME_PLAN.md §6.1):
//   google - Google Photorealistic 3D Tiles (needs a Map Tiles API key)
//   ion    - Cesium ion: World Terrain + imagery + OSM Buildings (needs a Cesium ion token)
//   basic  - key-free globe with Cesium's bundled Natural Earth imagery (works offline; flat)
// The rest of the game only talks to the World interface, so switching is a settings change.

import {
  Color,
  BoundingSphere,
  Cartesian3,
  buildModuleUrl,
  Cartographic,
  Cesium3DTileset,
  CesiumWidget,
  createGooglePhotorealistic3DTileset,
  createOsmBuildingsAsync,
  Credit,
  Ion,
  ImageryLayer,
  JulianDate,
  RequestScheduler,
  sampleTerrainMostDetailed,
  Terrain,
  TileMapServiceImageryProvider,
  type Scene,
  type TerrainProvider,
} from "cesium";
import type { LatLon } from "../sim/geo.ts";
import type { Quality } from "../game/settings.ts";
import { CartoonData } from "./cartoon.ts";
import { Scenery } from "./scenery.ts";
import { AirportBuildings } from "./buildings.ts";
import { LandmarkMarkers } from "./landmarks.ts";
import { PlaceLabels } from "./places.ts";
import { ALL_AIRPORTS } from "../data/airports.ts";
import { detailBudget, deviceClass } from "./device.ts";
import { DetailGovernor, TileLimiter, shareTextureCounts, speedStep, steadyTileDetail } from "./governor.ts";
import { TreeTrimmer, type PrunableTileset } from "./tilePruner.ts";
import { degrade, FEATURE_NAMES, gfxOn, type GfxFeature } from "./safety.ts";

/** "cartoon" = offline cartoon world; "basic" = bare globe if the offline data is missing. */
export type WorldKind = "google" | "ion" | "cartoon" | "basic";

/** One speed-test setting: map detail (allowed blur in pixels), drawing resolution, edge smoothing. */
export interface BenchSettings {
  sse: number;
  res: number;
  fxaa: boolean;
  /** Force pre-loading the tiles beside the view on or off (default: the game's own rule). */
  siblings?: boolean;
  /** Tile memory budget for this test (default: the device's). */
  cacheMB?: number;
  /** Cesium's level-of-detail skipping (the old setting; default off). */
  skipLod?: boolean;
}

export interface World {
  kind: WorldKind;
  widget: CesiumWidget;
  /** Best-effort ellipsoid ground height under a point, from data already loaded. */
  groundHeight(p: LatLon): number | undefined;
  /** Precise ellipsoid heights (loads data as needed). Missing values are undefined. */
  sampleHeights(points: LatLon[]): Promise<(number | undefined)[]>;
  setGroundVisible(v: boolean): void;
  /** True when the ground under the camera has finished loading. */
  groundReady(): boolean;
  /** Objects (plane, hoops) that ground sampling must ignore. */
  exclude: object[];
  /** Offline map data (also used by the minimap and big map in every world). */
  cartoon: CartoonData | null;
  /** Keep clouds/trees around this point. */
  updateScenery(p: LatLon, alt: number, agl: number): void;
  /** Top (ellipsoid height) of a tree, house or airport building within `radius` m of p, or null. */
  obstacleTop(p: LatLon, radius: number): number | null;
  /** The playne jumped somewhere new (respawn, line-up): let go of map tiles from the old spot. */
  afterTeleport?(): void;
  /** How fast the playne is going (m/s): streaming maps ease detail at jet speed. */
  setMotion?(speed: number): void;
  /** The grown-up "Clouds" setting: puffy clouds and the cruise cloud layer on or off. */
  setClouds(on: boolean): void;
  /** Numbers for the optional performance readout (grown-up setting). */
  perfStats?(): string;
  /** The speed test (Google mode): fix detail, resolution and smoothing (null = back to normal,
   *  with the automatic detail governor). */
  benchmark?(o: BenchSettings | null): void;
  /** Names of cities and towns floating over them (Google mode only; null elsewhere). */
  placeNames: { readonly visible: boolean; setVisible(on: boolean): void } | null;
  destroy(): void;
}

/** Called with a short message whenever graphics recovery switches something off. */
export let onGraphicsRecovered: (msg: string) => void = () => {};
export function setGraphicsRecoveredHandler(fn: (msg: string) => void): void {
  onGraphicsRecovered = fn;
}

/**
 * If rendering throws (a GPU/browser limit, or a bug), switch off the next most demanding
 * feature and restart the render loop instead of freezing the game.
 */
function installRecovery(widget: CesiumWidget, scenery: Scenery): void {
  let restarts = 0;
  const apply = (f: GfxFeature) => {
    const scene = widget.scene;
    if (f === "cumulus") scenery.disableClouds();
    if (f === "props") scenery.disableProps();
    if (f === "groundPolys") widget.entities.removeAll();
    if (f === "terrainDepth" && scene.globe) scene.globe.depthTestAgainstTerrain = false;
    if (f === "msaa") {
      scene.msaaSamples = 1;
      scene.postProcessStages.fxaa.enabled = false;
    }
    // cloudDeck: CloudDeck checks gfxOn() every frame.
  };
  widget.scene.renderError.addEventListener((_scene: unknown, error: unknown) => {
    console.error("render error", error);
    const off = degrade(error);
    if (off) apply(off);
    if (restarts++ < 12) {
      setTimeout(() => {
        widget.useDefaultRenderLoop = true;
      }, 50);
      onGraphicsRecovered(off ? `Graphics fix: turned off ${FEATURE_NAMES[off]}.` : "Graphics hiccup: restarted.");
    } else {
      onGraphicsRecovered("Graphics keep failing. A grown-up can see the details in settings.");
    }
  });
}

/**
 * Safety net for iPad Safari (no order-independent translucency): Cesium sorts see-through draw
 * commands by bounding volume and crashes if one has none. This invisible primitive is kept
 * last in the list and gives any command without a volume a huge sphere around the camera.
 */
function installCommandGuard(widget: CesiumWidget): void {
  const scene = widget.scene;
  const fallback = new BoundingSphere(new Cartesian3(), 1e7);
  const guard = {
    show: true,
    update(frameState: { commandList: { boundingVolume?: unknown }[] }) {
      Cartesian3.clone(scene.camera.positionWC, fallback.center);
      for (const cmd of frameState.commandList) if (!cmd.boundingVolume) cmd.boundingVolume = fallback;
    },
    isDestroyed: () => false,
    destroy: () => {},
  };
  scene.primitives.add(guard);
  scene.preUpdate.addEventListener(() => {
    const prims = scene.primitives;
    if (prims.length && prims.get(prims.length - 1) !== guard) prims.raiseToTop(guard);
  });
}

/**
 * Change a tileset's detail without throwing away Cesium's memory relief: setting
 * maximumScreenSpaceError also resets memoryAdjustedScreenSpaceError (Cesium's own easing
 * when the tile cache is full), which let memory climb whenever the governor stepped in.
 */
function setSseKeepingMemoryRelief(tileset: Cesium3DTileset, sse: number): void {
  const t = tileset as unknown as { _memoryAdjustedScreenSpaceError?: number };
  // Keep the memory relief as a ratio over the old level, so the new level takes effect at once
  // (keeping the old value as a floor made every sharpening wait for the slow memory easing).
  const ratio = Math.max(1, (t._memoryAdjustedScreenSpaceError ?? sse) / Math.max(1e-6, tileset.maximumScreenSpaceError));
  tileset.maximumScreenSpaceError = sse;
  t._memoryAdjustedScreenSpaceError = sse * Math.min(ratio, 4);
}

/** Runs the detail governor on every rendered frame; `apply` gets the new detail scale. */
function installGovernor(scene: Scene, apply: (scale: number) => void, max = 2.6, slowMs = 24): DetailGovernor {
  const g = new DetailGovernor({ max, min: 0.85, window: 1.5, slowMs });
  let last = performance.now();
  scene.postRender.addEventListener(() => {
    const now = performance.now();
    const k = g.frame(now, now - last);
    last = now;
    if (k !== null) apply(k);
  });
  return g;
}

let cartoonCache: Promise<CartoonData | null> | null = null;
/** Loads the bundled offline map data once (null if unavailable). */
export function loadCartoon(): Promise<CartoonData | null> {
  cartoonCache ??= CartoonData.load().catch((e) => {
    console.warn("offline world data unavailable", e);
    return null;
  });
  return cartoonCache;
}

export interface WorldOptions {
  googleKey?: string;
  ionToken?: string;
  quality: Quality;
}

function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 1 || /iPad|iPhone/.test(navigator.userAgent);
}

export function qualityLevel(q: Quality): "high" | "medium" | "low" {
  if (q === "high") return "high";
  if (q === "low") return "low";
  return isTouchDevice() ? "medium" : "high";
}

function baseWidget(container: HTMLElement, kind: WorldKind, q: "high" | "medium" | "low", extra: ConstructorParameters<typeof CesiumWidget>[1]): CesiumWidget {
  const widget = new CesiumWidget(container, {
    shouldAnimate: false,
    useBrowserRecommendedResolution: q !== "high",
    msaaSamples: q === "high" && gfxOn("msaa") ? 4 : 1,
    // We handle render errors ourselves (see installRecovery) instead of showing Cesium's panel.
    showRenderLoopErrors: false,
    // "?nooit" mimics devices without order-independent translucency (iPad Safari) for testing.
    orderIndependentTranslucency: !new URLSearchParams(location.search).has("nooit"),
    ...extra,
  });
  const scene = widget.scene;
  // Aerial haze, like real distance: far-off ground fades into the sky colour. It hides the
  // lower-detail tiles that are always used far away (and their switch to sharper ones as
  // you get closer). About 25% haze at 30 km and 60% at 60 km from 1,000 m up; thinner higher.
  scene.fog.enabled = true;
  scene.fog.density = kind === "basic" ? 2.0e-4 : 5.0e-4;
  scene.fog.visualDensityScalar = 0.18;
  scene.postProcessStages.fxaa.enabled = q !== "high";
  scene.screenSpaceCameraController.enableInputs = false;
  // The real Moon is drawn where it really is; near new moon it shows as a black disc in the
  // daytime sky. Leave it out.
  if (scene.moon) scene.moon.show = false;
  // Cesium decides "camera underground" (black sky, see-through ground) from a ground height it
  // only re-measures when the camera moves; while the camera sits still it keeps whatever the
  // last-loaded tile said, which can be a coarse tile a few meters too high. Re-measure every
  // frame so a cockpit camera near the runway is never mistaken for one underground.
  scene.preUpdate.addEventListener(() => {
    (scene as unknown as { _globeHeightDirty: boolean })._globeHeightDirty = true;
  });
  // A pleasant midday sun over the eastern US.
  const now = new Date();
  widget.clock.currentTime = JulianDate.fromDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0)));
  widget.clock.shouldAnimate = false;
  return widget;
}

export async function createWorld(container: HTMLElement, kind: WorldKind, opts: WorldOptions): Promise<World> {
  const q = qualityLevel(opts.quality);
  const cartoon = await loadCartoon();
  let w: Omit<World, "cartoon" | "updateScenery" | "obstacleTop" | "setClouds" | "placeNames">;
  if (kind === "google") w = await createGoogleWorld(container, opts.googleKey ?? "", q);
  else if (kind === "ion") w = await createIonWorld(container, opts.ionToken ?? "", q);
  else w = await createBasicWorld(container, q, cartoon);
  const scenery = new Scenery(w.widget.scene, w.kind === "cartoon" ? cartoon : null, q === "high" ? 1 : q === "medium" ? 0.75 : 0.4);
  // Real airport buildings for the offline world (Google's 3D world already has them).
  const buildings = w.kind === "cartoon" && cartoon ? new AirportBuildings(w.widget.scene, cartoon) : null;
  if (buildings) {
    // Cartoon trees and houses never grow through the real terminals and hangars.
    scenery.blocked = (lat, lon, r) => buildings.occupied(lat, lon, r);
    buildings.onLoaded = () => scenery.refreshProps();
  }
  // Star pins over the landmarks (every map type), standing on the ground below them.
  const markers = new LandmarkMarkers(w.widget.scene, (lat, lon) => cartoon?.height(lat, lon) ?? 0);
  // Town and city names (a button in Google mode; the cartoon map has its own look).
  // Ground height for the labels: the offline terrain where it reaches, else the elevation of
  // the nearest airport (good to a few hundred meters, plenty for a floating name).
  const roughGround = (lat: number, lon: number): number => {
    if (cartoon?.inside(lat, lon)) return cartoon.height(lat, lon);
    let best = Infinity, h = 0;
    for (const a of ALL_AIRPORTS) {
      const d = (a.lat - lat) ** 2 + ((a.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
      if (d < best) [best, h] = [d, a.elevFt * 0.3048];
    }
    return h;
  };
  const places = w.kind === "google" ? new PlaceLabels(w.widget.scene, roughGround) : null;
  installRecovery(w.widget, scenery);
  installCommandGuard(w.widget);
  const setGround = w.setGroundVisible.bind(w);
  const destroy = w.destroy.bind(w);
  return {
    ...w,
    cartoon,
    setGroundVisible(v: boolean) {
      setGround(v);
      scenery.setVisible(v);
      buildings?.setVisible(v);
      markers.setVisible(v);
      places?.setGroundShown(v);
    },
    placeNames: places,
    setClouds(on: boolean) {
      scenery.setClouds(on);
    },
    perfStats: w.perfStats?.bind(w),
    updateScenery(p, alt, agl) {
      scenery.update(p, alt, agl);
      buildings?.update(p);
      places?.update(p);
    },
    obstacleTop(p, radius) {
      const a = scenery.obstacleTop(p, radius);
      const b = buildings ? buildings.obstacleTop(p, radius) : null;
      return a === null ? b : b === null ? a : Math.max(a, b);
    },
    destroy() {
      scenery.destroy();
      buildings?.destroy();
      markers.destroy();
      places?.destroy();
      destroy();
    },
  };
}

async function createGoogleWorld(container: HTMLElement, key: string, q: "high" | "medium" | "low"): Promise<Omit<World, "cartoon" | "updateScenery" | "obstacleTop" | "setClouds" | "placeNames">> {
  const widget = baseWidget(container, "google", q, { globe: false, baseLayer: false });
  const scene = widget.scene;
  // Every frame the camera moves, Cesium asks the 3D map for the ground height under the
  // camera (only to tell whether the camera is underground) by testing rays against the tiles
  // on the CPU, and re-asks each time a tile arrives: work that grows with every tile loaded.
  // Nothing here uses it (the game measures the ground itself, with sampleHeight), so skip it.
  const sceneHeights = scene as unknown as { getHeight: (...a: unknown[]) => number | undefined; updateHeight: (...a: unknown[]) => () => void };
  sceneHeights.getHeight = () => undefined;
  sceneHeights.updateHeight = () => () => {};
  const b = detailBudget(q);
  const mobileDevice = deviceClass() !== "desktop";
  // Google serves over HTTP/2: more requests at once means tiles arrive sooner.
  RequestScheduler.requestsByServer["tile.googleapis.com:443"] = 24;
  const makeTileset = (): Promise<Cesium3DTileset> => createGooglePhotorealistic3DTileset(
    { key },
    {
      // Memory: Cesium keeps the tiles in view within this budget by easing detail a little
      // when it's tight, instead of growing until iOS reloads the page.
      maximumScreenSpaceError: b.tilesSse,
      cacheBytes: b.tilesCacheMB * 1024 * 1024,
      maximumCacheOverflowBytes: b.tilesOverflowMB * 1024 * 1024,
      // No level-of-detail skipping: it jumped from blurry straight to sharp tiles and, while
      // the sharp ones loaded, drew both levels mixed together (the owner saw flicker and
      // sudden "snaps" on an iPad). Without it, detail sharpens one level at a time and a tile
      // is only replaced once all its sharper children are ready.
      skipLevelOfDetail: false,
      skipScreenSpaceErrorFactor: 6,
      // No quick low-resolution pass first (it is then swapped again for the real detail).
      progressiveResolutionHeightFraction: 0,
      // Load the tiles beside the ones in view too, so turning doesn't reveal blurry ground.
      loadSiblings: true,
      // No "middle of the screen first": it gives tiles off to the sides coarser detail than
      // the same tiles in the middle, so turning swapped them back and forth (flicker at the
      // screen edges in every turn), and a flying camera never stops for the sides to catch up.
      foveatedScreenSpaceError: false,
      preloadWhenHidden: false,
      dynamicScreenSpaceError: true,
    },
  );
  const makeSteadyTileset = async () => {
    const ts = await makeTileset();
    steadyTileDetail(ts);
    shareTextureCounts((ts as unknown as { _statistics: object })._statistics);
    return ts;
  };
  let tileset = await makeSteadyTileset();
  scene.primitives.add(tileset);
  // Detail = base x frame-rate governor x speed. Busy areas (cities) can mean more tiles than
  // the device can keep up with: the governor eases detail while frames drop. At jet speed
  // the ground flashes past too fast to see fine detail, and every tile is on screen only
  // briefly, so detail relaxes with speed too (or tile streaming snowballs).
  let govK = 1;
  let speedK = 1;
  let benchSse: number | null = null;
  // Tile limit (iPads, phones): see TileLimiter. It eases only the far tiles: the "far"
  // relief (Cesium's dynamic screen-space error, which coarsens tiles more the farther away they
  // are) goes from 24 up to 160, while the detail near the playne stays as it is. The owner
  // found sharper tiles popping in close to the playne distracting, far ones much less so.
  // Measured over Charlotte: far relief 24 -> 60 halves the tiles drawn (148 -> 77); easing the
  // whole view instead (detail 14 -> 21) only got to 93 and softened the ground nearby.
  let tileK = 1;
  const FAR_BASE = 24;
  const farRelief = () => (benchSse !== null ? FAR_BASE : FAR_BASE + (tileK - 1) * 136);
  const limiter = new TileLimiter(b.maxTiles);
  scene.postRender.addEventListener(() => {
    const st = (tileset as unknown as { _statistics?: { selected?: number } })._statistics;
    const k = limiter.frame(performance.now(), st?.selected ?? 0);
    if (k !== null) {
      tileK = k;
      applyDetail();
    }
  });
  const applyDetail = () => {
    tileset.dynamicScreenSpaceErrorFactor = farRelief();
    const target = benchSse ?? Math.min(72, b.tilesSse * govK * speedK);
    if (Math.abs(target - tileset.maximumScreenSpaceError) < target * 0.04) return;
    setSseKeepingMemoryRelief(tileset, target);
  };
  // With a tile limit (iPads, phones) that does the everyday easing, the frame-rate governor only
  // steps in for real trouble (frames over 32 ms, under ~30 fps), so the two don't fight.
  installGovernor(scene, (k) => {
    govK = k;
    applyDetail();
  }, 2.6, b.maxTiles > 0 ? 32 : 24);
  let lastSpeedApply = 0;

  // Safety net: Cesium never lets go of the tile tree it has explored (only the tiles'
  // contents). Measured on a fast jet flight, the tree starts at ~65k entries (Google's root
  // file alone) and grows only slowly (~+5k per 60 km), with live memory flat, so refreshing
  // often does more harm than good (a second copy of the world loads alongside). Only if the
  // trip is very long, load a fresh copy of the 3D world in the background, switch over once
  // it has the ground around us, and drop the old one. (A "tree has doubled" trigger fired
  // too early: Google's map is still filling in for a while after the start.)
  const mobile = mobileDevice;
  const maxTravel = mobile ? 400_000 : 600_000;
  const treeSize = () => (tileset as unknown as { _statistics?: { numberOfTilesTotal?: number } })._statistics?.numberOfTilesTotal ?? 0;
  let treeBaseline = 0;
  let travel = 0;
  let lastMotion = performance.now();
  let createdAt = performance.now();
  let recycling = false;
  let recycles = 0;
  let groundVisible = true;
  const recycle = async () => {
    recycling = true;
    try {
      const fresh = await makeSteadyTileset();
      if (widget.isDestroyed()) return;
      // Keep the overlap small: the old copy lets go of everything out of view first.
      tileset.trimLoadedTiles();
      fresh.preloadWhenHidden = true;
      fresh.show = false;
      fresh.loadSiblings = tileset.loadSiblings;
      setSseKeepingMemoryRelief(fresh, tileset.maximumScreenSpaceError);
      scene.primitives.add(fresh);
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const off = scene.postRender.addEventListener(() => {
          const waited = performance.now() - t0;
          if ((fresh.tilesLoaded && waited > 1500) || waited > 12000) {
            off();
            resolve();
          }
        });
      });
      if (widget.isDestroyed()) return;
      const old = tileset;
      tileset = fresh;
      fresh.show = groundVisible;
      fresh.preloadWhenHidden = false;
      scene.primitives.remove(old); // destroys it, tile tree and all
      recycles++;
      for (const m of heightMemo) m.t = -1e9;
      travel = 0;
      treeBaseline = 0;
      createdAt = performance.now();
    } catch (e) {
      console.warn("Couldn't refresh the 3D world; keeping the current one", e);
      travel = 0; // try again later, not every frame
    } finally {
      recycling = false;
    }
  };

  // Trim the tile index as we go (see tilePruner.ts): every few seconds, branches the camera
  // hasn't used for 20 s and that are over 20 km away are freed (Cesium fetches them again if
  // we come back). Without this the index grew past a million entries (~3 GB) on a long jet
  // flight. `window.__playnesPrune` overrides the timings (dev tests).
  const frameLog: { t: number; f: number }[] = [];
  // Pre-loading the tiles beside the view: off at jet speed (it doubles the work), and off while
  // the tile memory is full. Measured on an iPad (speed test): smooth at ~60 fps until the
  // memory reached its limit, then ~40 fps with hitches. At the limit Cesium unloads every tile
  // not drawn this frame to stay under it, and the neighbours it pre-loads are exactly such
  // tiles: they were loaded, thrown out and loaded again, over and over.
  let speedSiblings = true;
  let memSiblings = true;
  let benchSiblings: boolean | null = null;
  const applySiblings = () => {
    tileset.loadSiblings = benchSiblings ?? (speedSiblings && memSiblings);
  };
  let memCheck = 0;
  scene.postRender.addEventListener(() => {
    if (++memCheck % 30) return;
    const used = tileset.totalMemoryUsageInBytes / tileset.cacheBytes;
    const was = memSiblings;
    if (used > 0.95) memSiblings = false;
    else if (used < 0.85) memSiblings = true;
    if (memSiblings !== was) applySiblings();
  });
  let lastPrune = 0;
  let trimmed = 0;
  let trimMs = 0;
  // A pass is spread over frames, at most ~2 ms each (see TreeTrimmer).
  const trimmer = new TreeTrimmer();
  let passSince = 0;
  scene.postRender.addEventListener(() => {
    const now = performance.now();
    const f = (scene as unknown as { frameState: { frameNumber: number } }).frameState.frameNumber;
    if (!frameLog.length || now - frameLog[frameLog.length - 1].t >= 1000) {
      frameLog.push({ t: now, f });
      if (frameLog.length > 90) frameLog.shift();
    }
    if (recycling) return;
    const dev = (window as unknown as { __playnesPrune?: { idleMs?: number; minDistance?: number; everyMs?: number } }).__playnesPrune;
    if (!trimmer.busy) {
      if (now - lastPrune < (dev?.everyMs ?? 3000)) return;
      lastPrune = now;
      const idleMs = dev?.idleMs ?? 20_000;
      let since: number | null = null;
      for (const e of frameLog) if (now - e.t >= idleMs) since = e.f;
      if (since === null) return;
      passSince = since;
    }
    const t0 = performance.now();
    try {
      trimmed += trimmer.step(tileset as unknown as PrunableTileset, { untouchedSince: passSince, camera: scene.camera.positionWC, minDistance: dev?.minDistance ?? 20_000, budget: 50_000 }, 2);
    } catch (e) {
      console.warn("tile trim failed", e);
    }
    trimMs = Math.max(trimMs * 0.98, performance.now() - t0);
  });

  // With no globe, Cesium leaves out the blue sky (you'd see stars at noon): turn it back on.
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
  if (scene.skyBox) scene.skyBox.show = false;
  scene.backgroundColor = Color.fromCssColorString("#8ec5f2");
  const exclude: object[] = [];
  // Measuring the ground renders everything below the point and takes the top. The clouds,
  // landmark pins, sky guide line and rings are drawn things too, so the playne could "land"
  // on a cloud (and the game thought it was rolling down a runway). For the instant of a
  // measurement, show only the 3D map itself.
  const onlyTheMap = <T>(measure: () => T): T => {
    const hidden: { show: boolean }[] = [];
    const prims = scene.primitives;
    for (let i = 0; i < prims.length; i++) {
      const prim = prims.get(i) as { show?: boolean };
      if (prim !== tileset && prim.show === true) {
        prim.show = false;
        hidden.push(prim as { show: boolean });
      }
    }
    const restore = () => {
      for (const prim of hidden) prim.show = true;
    };
    try {
      const out = measure();
      if (out instanceof Promise) {
        out.then(restore, restore);
        return out;
      }
      restore();
      return out;
    } catch (e) {
      restore();
      throw e;
    }
  };
  const heightMemo: { lat: number; lon: number; h: number | undefined; t: number }[] = Array.from({ length: 4 }, () => ({ lat: 0, lon: 0, h: undefined, t: -1e9 }));
  let memoNext = 0;
  return {
    kind: "google",
    widget,
    exclude,
    groundHeight(p) {
      if (!tileset.show || !scene.sampleHeightSupported) return undefined;
      // Each reading is an extra small render of the tiles below the point. The physics and
      // the camera both ask about nearly the same spots several times a second: share the
      // answers for a moment instead of re-rendering for each.
      const now = performance.now();
      for (const m of heightMemo) {
        if (now - m.t < 150 && Math.abs(m.lat - p.lat) < 6e-5 && Math.abs(m.lon - p.lon) < 6e-5) return m.h;
      }
      const h = onlyTheMap(() => scene.sampleHeight(Cartographic.fromDegrees(p.lon, p.lat), exclude, 1));
      heightMemo[memoNext] = { lat: p.lat, lon: p.lon, h, t: now };
      memoNext = (memoNext + 1) % heightMemo.length;
      return h;
    },
    async sampleHeights(points) {
      const carts = points.map((p) => Cartographic.fromDegrees(p.lon, p.lat));
      try {
        // (At flight start, behind the loading screen, so hiding things meanwhile isn't seen.)
        const out = await onlyTheMap(() => withTimeout(scene.sampleHeightMostDetailed(carts, exclude, 1), 12000));
        return out.map((c) => (c && Number.isFinite(c.height) ? c.height : undefined));
      } catch {
        return points.map(() => undefined);
      }
    },
    setGroundVisible(v) {
      groundVisible = v;
      tileset.show = v;
    },
    perfStats() {
      const t = tileset as unknown as { _memoryAdjustedScreenSpaceError?: number; _statistics?: { numberOfTilesTotal?: number; numberOfPendingRequests?: number; numberOfTilesProcessing?: number; selected?: number; numberOfCommands?: number } };
      const st = t._statistics ?? {};
      const mb = (b: number) => Math.round(b / 1048576);
      return [
        `tiles ${mb(tileset.totalMemoryUsageInBytes)}/${mb(tileset.cacheBytes)} MB  tree ${st.numberOfTilesTotal ?? "?"}${treeBaseline ? ` (start ${treeBaseline})` : ""}`,
        `detail ${tileset.maximumScreenSpaceError.toFixed(0)}→${(t._memoryAdjustedScreenSpaceError ?? 0).toFixed(0)}  gov ${govK.toFixed(2)}  far ${farRelief().toFixed(0)}  speed ${speedK}`,
        `loading ${st.numberOfPendingRequests ?? 0}+${st.numberOfTilesProcessing ?? 0}  fresh starts ${recycles}${recycling ? " (now)" : ""}  ${(travel / 1000).toFixed(0)} km`,
        `drawn ${st.selected ?? "?"} tiles  ${st.numberOfCommands ?? "?"} draws`,
        `trimmed ${trimmed}  trim ${trimMs.toFixed(0)} ms`,
      ].join("\n");
    },
    afterTeleport() {
      // Old tiles out of view are unloaded on the next frame instead of being evicted bit by
      // bit while the new area streams in (that overlap is what made respawns choppy).
      tileset.trimLoadedTiles();
    },
    setMotion(speed) {
      const now = performance.now();
      travel += speed * Math.min(1, (now - lastMotion) / 1000);
      lastMotion = now;
      const age = now - createdAt;
      // The tree's size ~30 s after a fresh start is "normal" for this flight.
      if (!treeBaseline && age > 30_000) treeBaseline = Math.max(2000, treeSize());
      if (!recycling && age > 120_000 && travel > maxTravel) void recycle();
      if (now - lastSpeedApply < 500) return;
      lastSpeedApply = now;
      // Coarser at jet speed: 1x up to ~230 kt, then in a few steps (with a margin between
      // them, so speed bled off in a turn doesn't keep swapping distant tiles) up to 4x from
      // ~700 kt (the curve steepens above ~580 kt). Measured: at 700+ kt a coarser level fetches
      // about a third as many map files,
      // and the ground rushes past too fast to see the difference.
      speedK = speedStep(speedK, speed / 120 + Math.max(0, speed - 300) / 60);
      // Pre-loading the tiles beside the view helps slow turns; at jet speed it doubles the work.
      if (speed > 110) speedSiblings = false;
      else if (speed < 85) speedSiblings = true;
      applySiblings();
      applyDetail();
    },
    benchmark(o) {
      // sse 0: the game's own automatic detail (the tile limit and governors).
      benchSse = o && o.sse > 0 ? o.sse : null;
      benchSiblings = o?.siblings ?? null;
      tileset.skipLevelOfDetail = o?.skipLod ?? false;
      tileset.cacheBytes = (o?.cacheMB ?? b.tilesCacheMB) * 1024 * 1024;
      applySiblings();
      widget.resolutionScale = o ? o.res : 1;
      scene.postProcessStages.fxaa.enabled = o ? o.fxaa : q !== "high";
      if (o && o.sse > 0) {
        // Exactly this detail, without any leftover easing from before the test.
        tileset.dynamicScreenSpaceErrorFactor = FAR_BASE;
        tileset.maximumScreenSpaceError = o.sse;
        (tileset as unknown as { _memoryAdjustedScreenSpaceError: number })._memoryAdjustedScreenSpaceError = o.sse;
      } else applyDetail();
    },
    groundReady() {
      return tileset.tilesLoaded;
    },
    destroy() {
      widget.destroy();
    },
  };
}

async function createIonWorld(container: HTMLElement, token: string, q: "high" | "medium" | "low"): Promise<Omit<World, "cartoon" | "updateScenery" | "obstacleTop" | "setClouds" | "placeNames">> {
  Ion.defaultAccessToken = token;
  const widget = baseWidget(container, "ion", q, {
    terrain: Terrain.fromWorldTerrain(),
    baseLayer: ImageryLayer.fromWorldImagery({}),
  });
  const scene = widget.scene;
  const b = detailBudget(q);
  scene.globe.tileCacheSize = b.globeTileCache;
  scene.globe.preloadSiblings = true;
  const globeSse = scene.globe.maximumScreenSpaceError;
  let buildings: Cesium3DTileset | undefined;
  try {
    buildings = await createOsmBuildingsAsync();
    buildings.cacheBytes = Math.round(b.tilesCacheMB / 3) * 1024 * 1024;
    buildings.maximumCacheOverflowBytes = Math.round(b.tilesOverflowMB / 3) * 1024 * 1024;
    buildings.foveatedTimeDelay = 0;
    scene.primitives.add(buildings);
  } catch {
    /* buildings are optional */
  }
  installGovernor(scene, (k) => {
    scene.globe.maximumScreenSpaceError = globeSse * Math.min(k, 2);
    if (buildings) setSseKeepingMemoryRelief(buildings, 16 * k);
  });
  return {
    kind: "ion",
    widget,
    exclude: [],
    groundHeight(p) {
      if (!scene.globe.show) return undefined;
      return scene.globe.getHeight(Cartographic.fromDegrees(p.lon, p.lat));
    },
    async sampleHeights(points) {
      const carts = points.map((p) => Cartographic.fromDegrees(p.lon, p.lat));
      try {
        const out = await withTimeout(sampleTerrainMostDetailed(scene.terrainProvider as TerrainProvider, carts), 12000);
        return out.map((c) => (Number.isFinite(c.height) ? c.height : undefined));
      } catch {
        return points.map(() => undefined);
      }
    },
    setGroundVisible(v) {
      scene.globe.show = v;
      if (buildings) buildings.show = v;
    },
    groundReady() {
      return scene.globe.tilesLoaded;
    },
    destroy() {
      widget.destroy();
    },
  };
}

async function createBasicWorld(container: HTMLElement, q: "high" | "medium" | "low", cartoon: CartoonData | null): Promise<Omit<World, "cartoon" | "updateScenery" | "obstacleTop" | "setClouds" | "placeNames">> {
  const provider = await TileMapServiceImageryProvider.fromUrl(buildModuleUrl("Assets/Textures/NaturalEarthII"), {
    credit: new Credit("Natural Earth II"),
  });
  const widget = baseWidget(container, cartoon ? "cartoon" : "basic", q, {
    baseLayer: new ImageryLayer(provider),
    ...(cartoon ? { terrainProvider: cartoon.terrainProvider() } : {}),
  });
  const scene = widget.scene;
  if (cartoon) {
    scene.imageryLayers.addImageryProvider(cartoon.imageryProvider());
    scene.globe.depthTestAgainstTerrain = gfxOn("terrainDepth");
    scene.globe.maximumScreenSpaceError = q === "high" ? 1.5 : 2.5;
    scene.globe.tileCacheSize = detailBudget(q).globeTileCache;
    // Keep the neighbours of tiles in view loaded, so turning doesn't show blurry patches.
    scene.globe.preloadSiblings = true;
    const globeSse = scene.globe.maximumScreenSpaceError;
    // Sharper picture on phones and tablets: their screens have 2-3 times as many dots as the
    // game normally draws (it draws at half resolution and smooths). The cartoon world is light
    // enough to draw at 1.5x, which makes the playne and runway edges crisp; if the frame rate
    // suffers, it drops back to 1x (and returns when things are smooth again).
    const sharp = deviceClass() !== "desktop" && q !== "low" && (window.devicePixelRatio || 1) >= 2;
    if (sharp) widget.resolutionScale = 1.5;
    installGovernor(scene, (k) => {
      scene.globe.maximumScreenSpaceError = globeSse * Math.min(k, 2);
      if (sharp) {
        if (k >= 1.4 && widget.resolutionScale !== 1) widget.resolutionScale = 1;
        else if (k <= 1 && widget.resolutionScale !== 1.5) widget.resolutionScale = 1.5;
      }
    });
  }
  return {
    kind: cartoon ? "cartoon" : "basic",
    widget,
    exclude: [],
    groundHeight(p) {
      return cartoon ? cartoon.height(p.lat, p.lon) : 0;
    },
    async sampleHeights(points) {
      return points.map((p) => (cartoon ? cartoon.height(p.lat, p.lon) : 0));
    },
    setGroundVisible(v) {
      scene.globe.show = v;
    },
    groundReady() {
      return scene.globe.tilesLoaded;
    },
    destroy() {
      widget.destroy();
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
