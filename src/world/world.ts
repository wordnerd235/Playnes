// Swappable world providers (docs/GAME_PLAN.md §6.1):
//   google - Google Photorealistic 3D Tiles (needs a Map Tiles API key)
//   ion    - Cesium ion: World Terrain + imagery + OSM Buildings (needs a Cesium ion token)
//   basic  - key-free globe with Cesium's bundled Natural Earth imagery (works offline; flat)
// The rest of the game only talks to the World interface, so switching is a settings change.

import {
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

export type WorldKind = "google" | "ion" | "basic";

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
  destroy(): void;
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
    msaaSamples: q === "high" ? 4 : 1,
    showRenderLoopErrors: true,
    ...extra,
  });
  const scene = widget.scene;
  scene.fog.enabled = true;
  scene.fog.density = kind === "google" ? 1.2e-4 : 2.0e-4;
  scene.postProcessStages.fxaa.enabled = q !== "high";
  scene.screenSpaceCameraController.enableInputs = false;
  // A pleasant midday sun over the eastern US.
  const now = new Date();
  widget.clock.currentTime = JulianDate.fromDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0)));
  widget.clock.shouldAnimate = false;
  return widget;
}

export async function createWorld(container: HTMLElement, kind: WorldKind, opts: WorldOptions): Promise<World> {
  const q = qualityLevel(opts.quality);
  if (kind === "google") return createGoogleWorld(container, opts.googleKey ?? "", q);
  if (kind === "ion") return createIonWorld(container, opts.ionToken ?? "", q);
  return createBasicWorld(container, q);
}

async function createGoogleWorld(container: HTMLElement, key: string, q: "high" | "medium" | "low"): Promise<World> {
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

async function createIonWorld(container: HTMLElement, token: string, q: "high" | "medium" | "low"): Promise<World> {
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

async function createBasicWorld(container: HTMLElement, q: "high" | "medium" | "low"): Promise<World> {
  const provider = await TileMapServiceImageryProvider.fromUrl(buildModuleUrl("Assets/Textures/NaturalEarthII"), {
    credit: new Credit("Natural Earth II imagery (bundled with CesiumJS)"),
  });
  const widget = baseWidget(container, "basic", q, { baseLayer: new ImageryLayer(provider) });
  const scene = widget.scene;
  return {
    kind: "basic",
    widget,
    exclude: [],
    groundHeight() {
      return 0;
    },
    async sampleHeights(points) {
      return points.map(() => 0);
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
