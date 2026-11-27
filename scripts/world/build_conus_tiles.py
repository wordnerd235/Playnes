"""Cartoon map tiles for the whole lower 48 states, zoom 4-8, for the minimap and the big map
when flying the 3D map across the country (they draw these, enlarged, where the detailed
Southeast tiles don't reach). Same look as the Southeast (build_world.py), with the drier West.
Tiles that already exist (the Southeast at zoom 6-8) are left alone.

Usage: <venv>/bin/python scripts/world/build_conus_tiles.py --cache <cache-dir> [--workers 4]
Needs numpy + pillow. Downloads elevation (AWS Terrain Tiles, zoom 7) and Natural Earth data
into the cache.
"""

import argparse
import io
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_world as bw  # noqa: E402

CONUS = {"south": 24.3, "north": 49.6, "west": -125.0, "east": -66.8}
ZOOMS = range(4, 9)
DEM_ZOOM = 7
# Elevation for everything the zoom-4 tiles show (they reach well past the borders and coasts),
# so their edges aren't smeared.
DEM_AREA = {"south": 20.5, "north": 56.0, "west": -135.0, "east": -55.0}

_state = {}


def _init(cache):
    cache = Path(cache)
    _state["dem"] = bw.Dem(cache, DEM_AREA, z=DEM_ZOOM)
    _state["layers"] = bw.load_vectors(cache, CONUS)


def _render(job):
    z, x, y = job
    out = bw.OUT / "tiles" / str(z) / str(x) / f"{y}.webp"
    img = bw.render_tile(z, x, y, _state["dem"], _state["layers"], [], CONUS, conus=True)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=74, method=5)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(buf.getvalue())
    return buf.tell()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    jobs = []
    for z in ZOOMS:
        x0, x1, y0, y1 = bw.tile_range(CONUS["south"], CONUS["north"], CONUS["west"] - 4, CONUS["east"], z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                if not (bw.OUT / "tiles" / str(z) / str(x) / f"{y}.webp").exists():
                    jobs.append((z, x, y))
    print(f"{len(jobs)} tiles to render")
    # Load the elevation once in the parent first (downloads), so workers only read the cache.
    _init(args.cache)
    t0 = time.time()
    total = 0
    with ProcessPoolExecutor(args.workers, initializer=_init, initargs=(args.cache,)) as ex:
        for i, n in enumerate(ex.map(_render, jobs, chunksize=4)):
            total += n
            if i % 100 == 0:
                print(f"  {i}/{len(jobs)}  {time.time() - t0:.0f}s  {total / 1e6:.1f} MB", flush=True)
    print(f"done: {len(jobs)} tiles, {total / 1e6:.1f} MB, {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
