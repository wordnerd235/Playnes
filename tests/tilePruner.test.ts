import { describe, expect, it } from "vitest";
import { pruneTileTree, type PrunableTile, type PrunableTileset } from "../src/world/tilePruner.ts";

let destroyedCount = 0;
let unloadedCount = 0;

function tile(opts: Partial<PrunableTile> & { at?: number; kids?: PrunableTile[] } = {}): PrunableTile {
  const t: PrunableTile = {
    children: opts.kids ?? [],
    hasTilesetContent: opts.hasTilesetContent ?? false,
    hasRenderableContent: opts.hasRenderableContent ?? !opts.hasTilesetContent,
    _contentState: opts._contentState ?? 3,
    _touchedFrame: opts._touchedFrame ?? 0,
    cacheNode: opts.cacheNode,
    content: {},
    _content: { destroy: () => undefined },
    boundingSphere: { center: { x: opts.at ?? 100000, y: 0, z: 0 }, radius: 100 },
    destroy() {
      destroyedCount++;
    },
    unloadContent() {
      unloadedCount++;
    },
  };
  return t;
}

/** An external-tileset branch: the index entry plus `n` model tiles under it (one with a nested index). */
function branch(touched: number, at = 100000, state = 3): PrunableTile {
  const nested = tile({ hasTilesetContent: true, _touchedFrame: touched, at, kids: [tile({ cacheNode: {}, _touchedFrame: touched, at })] });
  const models = [tile({ cacheNode: {}, _touchedFrame: touched, at, _contentState: state }), tile({ _touchedFrame: touched, at, _contentState: 0 }), nested];
  return tile({ hasTilesetContent: true, _touchedFrame: touched, at, kids: models });
}

function tileset(children: PrunableTile[]): PrunableTileset & { removed: number } {
  // root (depth 0) -> its own index (depth 1) -> branches (depth 2)
  const rootIndex = tile({ hasTilesetContent: true, _touchedFrame: 1000, at: 0, kids: children });
  const root = tile({ _touchedFrame: 1000, at: 0, kids: [rootIndex] });
  const ts = {
    root,
    removed: 0,
    _cache: {
      unloadTile(s: PrunableTileset, t: PrunableTile, cb: (s: PrunableTileset, t: PrunableTile) => void) {
        ts.removed++;
        t.cacheNode = undefined;
        cb(s, t);
      },
    },
    _statistics: { numberOfTilesTotal: 100, numberOfTilesWithContentReady: 10, decrementLoadCounts() {} },
  };
  return ts;
}

const opts = { untouchedSince: 500, camera: { x: 0, y: 0, z: 0 }, minDistance: 20000, budget: 1e6 };

describe("tile tree pruning", () => {
  it("frees an idle, far branch and resets it to 'never loaded'", () => {
    destroyedCount = unloadedCount = 0;
    const b = branch(100);
    const ts = tileset([b]);
    const n = pruneTileTree(ts, opts);
    expect(n).toBe(4); // three tiles under it plus the nested index's one model tile
    expect(destroyedCount).toBe(4);
    expect(b.children).toEqual([]);
    expect(b._contentState).toBe(0);
    expect(b.hasTilesetContent).toBe(false);
    expect(b.hasRenderableContent).toBe(true);
    // Only tiles with a model (in Cesium's cache) are unloaded through the cache.
    expect(ts.removed).toBe(2);
    expect(unloadedCount).toBe(2);
    expect(ts._statistics.numberOfTilesTotal).toBe(96);
    expect(ts._statistics.numberOfTilesWithContentReady).toBe(8);
  });

  it("leaves branches in use, close by, or still loading", () => {
    destroyedCount = 0;
    const recent = branch(900);
    const near = branch(100, 5000);
    const busy = branch(100, 100000, 1);
    const ts = tileset([recent, near, busy]);
    // The busy branch is kept as a whole; only its idle nested index (one tile) is freed.
    expect(pruneTileTree(ts, opts)).toBe(1);
    expect(recent.children.length).toBe(3);
    expect(near.children.length).toBe(3);
    expect(busy.children.length).toBe(3);
    expect(busy.children[0]._contentState).toBe(1);
    expect(busy.children[2].children).toEqual([]);
  });

  it("never touches the root or its own index", () => {
    destroyedCount = 0;
    const ts = tileset([]);
    ts.root._touchedFrame = 0;
    ts.root.children[0]._touchedFrame = 0;
    ts.root.children[0].children = [tile({ cacheNode: {}, at: 100000 })];
    expect(pruneTileTree(ts, opts)).toBe(0);
    expect(ts.root.children[0].children.length).toBe(1);
  });

  it("stops at its budget", () => {
    const ts = tileset([branch(100), branch(100), branch(100)]);
    expect(pruneTileTree(ts, { ...opts, budget: 3 })).toBe(4);
  });
});
