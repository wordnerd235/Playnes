// Swappable world providers (docs/GAME_PLAN.md §6.1):
//   google - Google Photorealistic 3D Tiles (needs a Map Tiles API key)
//   ion    - Cesium ion: World Terrain + imagery + OSM Buildings (needs a Cesium ion token)
//   basic  - key-free globe with Cesium's bundled Natural Earth imagery (works offline; flat)
// The rest of the game only talks to the World interface, so switching is a settings change.

import {
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
  sampleTerrainMostDetailed,
  Terrain,
  TileMapServiceImageryProvider,
  type TerrainProvider,
} from "cesium";
import type { LatLon } from "../sim/geo.ts";
import type { Quality } from "../game/settings.ts";
import { CartoonData } from "./cartoon.ts";
import { Scenery } from "./scenery.ts";
import { AirportBuildings } from "./buildings.ts";
import { degrade, FEATURE_NAMES, gfxOn, type GfxFeature } from "./safety.ts";

/** "cartoon" = offline cartoon world; "basic" = bare globe if the offline data is missing. */
export type WorldKind = "google" | "ion" | "cartoon" | "basic";

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
    if (f === "terrainDepth") scene.globe.depthTestAgainstTerrain = false;
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

function qualityLevel(q: Quality): "high" | "medium" | "low" {
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
  scene.fog.enabled = true;
  scene.fog.density = kind === "google" ? 1.2e-4 : kind === "cartoon" ? 1.4e-4 : 2.0e-4;
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
  let w: Omit<World, "cartoon" | "updateScenery">;
  if (kind === "google") w = await createGoogleWorld(container, opts.googleKey ?? "", q);
  else if (kind === "ion") w = await createIonWorld(container, opts.ionToken ?? "", q);
  else w = await createBasicWorld(container, q, cartoon);
  const scenery = new Scenery(w.widget.scene, w.kind === "cartoon" ? cartoon : null, q === "high" ? 1 : q === "medium" ? 0.75 : 0.4);
  // Real airport buildings for the offline world (Google's 3D world already has them).
  const buildings = w.kind === "cartoon" && cartoon ? new AirportBuildings(w.widget.scene, cartoon) : null;
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
    },
    updateScenery(p, alt, agl) {
      scenery.update(p, alt, agl);
      buildings?.update(p);
    },
    destroy() {
      scenery.destroy();
      buildings?.destroy();
      destroy();
    },
  };
}

async function createGoogleWorld(container: HTMLElement, key: string, q: "high" | "medium" | "low"): Promise<Omit<World, "cartoon" | "updateScenery">> {
  const widget = baseWidget(container, "google", q, { globe: false, baseLayer: false });
  const scene = widget.scene;
  const tileset: Cesium3DTileset = await createGooglePhotorealistic3DTileset(
    { key },
    {
      maximumScreenSpaceError: q === "high" ? 12 : q === "medium" ? 18 : 28,
      cacheBytes: (q === "high" ? 768 : q === "medium" ? 384 : 256) * 1024 * 1024,
      maximumCacheOverflowBytes: 128 * 1024 * 1024,
      skipLevelOfDetail: true,
      preloadWhenHidden: false,
      dynamicScreenSpaceError: true,
    },
  );
  scene.primitives.add(tileset);
  const exclude: object[] = [];
  return {
    kind: "google",
    widget,
    exclude,
    groundHeight(p) {
      if (!tileset.show || !scene.sampleHeightSupported) return undefined;
      return scene.sampleHeight(Cartographic.fromDegrees(p.lon, p.lat), exclude, 1);
    },
    async sampleHeights(points) {
      const carts = points.map((p) => Cartographic.fromDegrees(p.lon, p.lat));
      try {
        const out = await withTimeout(scene.sampleHeightMostDetailed(carts, exclude, 1), 12000);
        return out.map((c) => (c && Number.isFinite(c.height) ? c.height : undefined));
      } catch {
        return points.map(() => undefined);
      }
    },
    setGroundVisible(v) {
      tileset.show = v;
    },
    groundReady() {
      return tileset.tilesLoaded;
    },
    destroy() {
      widget.destroy();
    },
  };
}

async function createIonWorld(container: HTMLElement, token: string, q: "high" | "medium" | "low"): Promise<Omit<World, "cartoon" | "updateScenery">> {
  Ion.defaultAccessToken = token;
  const widget = baseWidget(container, "ion", q, {
    terrain: Terrain.fromWorldTerrain(),
    baseLayer: ImageryLayer.fromWorldImagery({}),
  });
  const scene = widget.scene;
  let buildings: Cesium3DTileset | undefined;
  try {
    buildings = await createOsmBuildingsAsync();
    scene.primitives.add(buildings);
  } catch {
    /* buildings are optional */
  }
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

async function createBasicWorld(container: HTMLElement, q: "high" | "medium" | "low", cartoon: CartoonData | null): Promise<Omit<World, "cartoon" | "updateScenery">> {
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
    scene.globe.tileCacheSize = 200;
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
