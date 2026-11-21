// Trims Cesium's 3D-tile index while flying. Google's photoreal map is a tree of small index
// files ("external tilesets"); Cesium loads them as new ground comes into view and never lets
// go of them (only of the tiles' models). On a real screen at jet speed that index grew past a
// million entries (~3 GB of memory) in 13 minutes. This puts branches the camera hasn't used
// for a while, far away, back the way they were before Cesium loaded them: their tiles are
// unloaded and destroyed, and the branch's index entry is reset so Cesium fetches it again if
// it's ever needed (flying back).
//
// It mirrors what Cesium itself does for an expired external tileset (destroySubtree), using
// Cesium's internal fields; structural types keep it testable without Cesium.

/** Cesium3DTileContentState values. */
const UNLOADED = 0;
const LOADING = 1;
const PROCESSING = 2;
const EXPIRED = 4;

export interface PrunableTile {
  children: PrunableTile[];
  hasTilesetContent: boolean;
  hasImplicitContent?: boolean;
  hasRenderableContent: boolean;
  _contentState: number;
  _touchedFrame: number;
  cacheNode?: unknown;
  content?: unknown;
  _content?: { destroy?: () => unknown } | undefined;
  boundingSphere?: { center: { x: number; y: number; z: number }; radius: number };
  destroy(): unknown;
  unloadContent(): void;
}

export interface PrunableTileset {
  root: PrunableTile;
  _cache: { unloadTile(ts: PrunableTileset, tile: PrunableTile, cb: (ts: PrunableTileset, tile: PrunableTile) => void): void };
  _statistics: { numberOfTilesTotal: number; numberOfTilesWithContentReady: number; decrementLoadCounts(content: unknown): void };
  tileUnload?: { raiseEvent(tile: PrunableTile): void };
}

export interface PruneOptions {
  /** Branches not touched by Cesium's traversal since this frame number are candidates. */
  untouchedSince: number;
  /** Camera position (Earth-centred, metres). */
  camera: { x: number; y: number; z: number };
  /** Only branches at least this far away (edge of their bounding sphere), metres. */
  minDistance: number;
  /** Stop after destroying about this many tiles (keeps each run short). */
  budget: number;
}

/** Cesium's own unload step (Cesium3DTileset's unloadTile). */
function unloadTile(ts: PrunableTileset, tile: PrunableTile): void {
  ts.tileUnload?.raiseEvent(tile);
  ts._statistics.decrementLoadCounts(tile.content);
  --ts._statistics.numberOfTilesWithContentReady;
  tile.unloadContent();
}

function far(tile: PrunableTile, o: PruneOptions): boolean {
  const s = tile.boundingSphere;
  if (!s) return false;
  const d = Math.hypot(s.center.x - o.camera.x, s.center.y - o.camera.y, s.center.z - o.camera.z) - s.radius;
  return d > o.minDistance;
}

/**
 * Collect a branch's tiles below `top`, or null if any of them is busy (loading or being
 * processed), in which case the branch is left alone this time.
 */
function collect(top: PrunableTile): PrunableTile[] | null {
  const out: PrunableTile[] = [];
  const stack = [...top.children];
  while (stack.length) {
    const t = stack.pop()!;
    if (t._contentState === LOADING || t._contentState === PROCESSING || t._contentState === EXPIRED) return null;
    out.push(t);
    for (const c of t.children) stack.push(c);
  }
  return out;
}

/** Free one external-tileset branch. Returns how many tiles were destroyed. */
function pruneBranch(ts: PrunableTileset, top: PrunableTile, tiles: PrunableTile[]): number {
  for (const t of tiles) {
    // Tiles with a model are in Cesium's cache (and its counts): unload them properly.
    if (t.cacheNode !== undefined) ts._cache.unloadTile(ts, t, unloadTile);
    t.destroy();
    --ts._statistics.numberOfTilesTotal;
  }
  top.children = [];
  // Back to "never loaded": Cesium requests the index file again when this is needed.
  top._content = top._content && (top._content.destroy?.() as undefined);
  top._contentState = UNLOADED;
  top.hasTilesetContent = false;
  top.hasRenderableContent = true;
  return tiles.length;
}

/**
 * One trimming pass, all at once. Walks the parts of the tree in use, and for every branch the
 * camera hasn't touched lately and that's far away, frees the topmost index branch(es) under it.
 * Returns the number of tiles destroyed. (The game uses TreeTrimmer, which spreads a pass over
 * many frames.)
 */
export function pruneTileTree(ts: PrunableTileset, o: PruneOptions): number {
  const t = new TreeTrimmer();
  return t.step(ts, o, Infinity);
}

/**
 * The trimming pass spread over frames: each step works for at most a couple of milliseconds
 * and carries on where the last one stopped. Walking the whole tree in one go took ~27 ms on a
 * fast computer with a 50k-entry tree and much longer on an iPad with a bigger one: a stutter
 * every few seconds (and the detail governor then kept the map coarse for nothing).
 */
export class TreeTrimmer {
  private stack: { t: PrunableTile; depth: number }[] = [];
  private ts: PrunableTileset | null = null;
  /** Passes started (a pass ends when the whole tree in use has been walked). */
  passes = 0;

  /** True while a pass is part-way through. */
  get busy(): boolean {
    return this.stack.length > 0;
  }

  /** Work for at most `maxMs`. Starts a new pass if the last one finished. Returns tiles destroyed. */
  step(ts: PrunableTileset, o: PruneOptions, maxMs: number, now: () => number = () => performance.now()): number {
    if (ts !== this.ts) {
      this.ts = ts;
      this.stack = [];
    }
    if (!this.stack.length) {
      this.stack.push({ t: ts.root, depth: 0 });
      this.passes++;
    }
    const end = maxMs === Infinity ? Infinity : now() + maxMs;
    const stack = this.stack;
    let destroyed = 0;
    let n = 0;
    while (stack.length && destroyed < o.budget) {
      if (end !== Infinity && (++n & 63) === 0 && now() > end) break;
      const { t, depth } = stack.pop()!;
      const idle = t._touchedFrame < o.untouchedSince;
      // Never the root or its own index (the first file Cesium loads).
      if (depth >= 2 && idle && t.hasTilesetContent && !t.hasImplicitContent && t._contentState !== LOADING && t._contentState !== PROCESSING && t.children.length && far(t, o)) {
        const tiles = collect(t);
        if (tiles) {
          destroyed += pruneBranch(ts, t, tiles);
          continue;
        }
      }
      for (const c of t.children) stack.push({ t: c, depth: depth + 1 });
    }
    if (destroyed >= o.budget) this.stack = [];
    return destroyed;
  }
}
