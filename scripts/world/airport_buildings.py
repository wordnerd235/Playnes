"""Extract real building footprints around each game airport from Overture Maps (open data:
OpenStreetMap plus other open footprint sources, ODbL / CDLA). Writes public/world/buildings.json.

Only the small parts of the dataset that cover our airports are downloaded: each Parquet file's
footer is read to find the row groups whose bounding boxes touch an airport, and only those
row groups (and only the needed columns) are fetched with HTTP range requests.

Usage:
  node scripts/world/export-data.mjs /tmp/world.json
  python scripts/world/airport_buildings.py /tmp/world.json [release]

Needs: pyarrow, requests, shapely.
"""

import io
import json
import math
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pyarrow.parquet as pq
import requests
import shapely
from shapely import wkb
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "world" / "buildings.json"
BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"
DEFAULT_RELEASE = "2026-10-21.0"

# Area kept around each airport: along the runway (beyond each end) and to either side.
ALONG_PAD_M = 900
SIDE_M = 1400
MIN_AREA_M2 = 120
MAX_PER_AIRPORT = 450

session = requests.Session()
_local = threading.local()


class RangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP range requests (with a small read-ahead cache)."""

    def __init__(self, url: str, size: int):
        self.url, self.size, self.pos = url, size, 0
        self.cache_start, self.cache = 0, b""

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        if n <= 0:
            return b""
        end = min(self.size, self.pos + n)
        if not (self.cache_start <= self.pos and end <= self.cache_start + len(self.cache)):
            fetch_end = min(self.size, max(end, self.pos + 256 * 1024))
            r = session.get(self.url, headers={"Range": f"bytes={self.pos}-{fetch_end - 1}"}, timeout=120)
            r.raise_for_status()
            self.cache_start, self.cache = self.pos, r.content
        out = self.cache[self.pos - self.cache_start : end - self.cache_start]
        self.pos = end
        return out

    def readinto(self, b):
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)


def list_files(release: str):
    prefix = f"release/{release}/theme=buildings/type=building/"
    out, token = [], None
    while True:
        params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if token:
            params["continuation-token"] = token
        r = session.get(BUCKET + "/", params=params, timeout=60)
        r.raise_for_status()
        t = r.text
        import re

        keys = re.findall(r"<Key>([^<]+)</Key>", t)
        sizes = [int(x) for x in re.findall(r"<Size>(\d+)</Size>", t)]
        out += [(k, s) for k, s in zip(keys, sizes) if k.endswith(".parquet")]
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", t)
        if not m:
            return out
        token = m.group(1)


def runway_frame(a):
    e0, e1 = a["runway"]["ends"]
    lat0 = (e0["lat"] + e1["lat"]) / 2
    mlon = 111320.0 * math.cos(math.radians(lat0))
    dx = (e1["lon"] - e0["lon"]) * mlon
    dy = (e1["lat"] - e0["lat"]) * 111320.0
    L = math.hypot(dx, dy)
    return e0, L, dx / L, dy / L, mlon


def airport_box(a):
    """Lon/lat bounding box of the kept area, plus a function that tests a point (lon, lat)."""
    e0, L, ux, uy, mlon = runway_frame(a)

    def local(lon, lat):
        de = (lon - e0["lon"]) * mlon
        dn = (lat - e0["lat"]) * 111320.0
        return de * ux + dn * uy, de * uy - dn * ux

    def inside(lon, lat):
        s, x = local(lon, lat)
        return -ALONG_PAD_M < s < L + ALONG_PAD_M and abs(x) < SIDE_M

    corners = []
    for s in (-ALONG_PAD_M, L + ALONG_PAD_M):
        for x in (-SIDE_M, SIDE_M):
            de = s * ux + x * uy
            dn = s * uy - x * ux
            corners.append((e0["lon"] + de / mlon, e0["lat"] + dn / 111320.0))
    xs = [c[0] for c in corners]
    ys = [c[1] for c in corners]
    return (min(xs), min(ys), max(xs), max(ys)), inside, local


def rg_bbox(meta, rg, cols):
    """Row-group bbox from column statistics (bbox.xmin etc.)."""
    g = meta.row_group(rg)
    vals = {}
    for i in range(g.num_columns):
        c = g.column(i)
        if c.path_in_schema in cols and c.statistics is not None and c.statistics.has_min_max:
            name = cols[c.path_in_schema]
            vals[name] = c.statistics.min if name.endswith("min") else c.statistics.max
    if len(vals) < 4:
        return None
    return vals["xmin"], vals["ymin"], vals["xmax"], vals["ymax"]


def overlaps(a, b):
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


BBOX_COLS = {"bbox.xmin": "xmin", "bbox.ymin": "ymin", "bbox.xmax": "xmax", "bbox.ymax": "ymax"}


def scan_file(key, size, boxes):
    url = f"{BUCKET}/{key}"
    f = RangeFile(url, size)
    pf = pq.ParquetFile(f)
    meta = pf.metadata
    wanted = []
    for rg in range(meta.num_row_groups):
        bb = rg_bbox(meta, rg, BBOX_COLS)
        if bb and any(overlaps(bb, b) for b in boxes):
            wanted.append(rg)
    return key, size, wanted


def height_of(row):
    h = row.get("height")
    if h and h > 0:
        return float(h)
    floors = row.get("num_floors")
    if floors and floors > 0:
        return floors * 3.6
    cls = (row.get("class") or "").lower()
    if cls in ("hangar",):
        return 13.0
    if cls in ("terminal", "transportation", "commercial", "office"):
        return 14.0
    if cls in ("garage", "parking"):
        return 9.0
    return None


def main():
    data = json.load(open(sys.argv[1]))
    release = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_RELEASE
    airports = data["airports"]
    boxes, tests = [], []
    for a in airports:
        b, inside, local = airport_box(a)
        boxes.append(b)
        tests.append((a, b, inside))

    files = list_files(release)
    print(f"{len(files)} files in release {release}")
    with ThreadPoolExecutor(16) as ex:
        scans = list(ex.map(lambda kv: scan_file(kv[0], kv[1], boxes), files))
    hits = [(k, s, w) for k, s, w in scans if w]
    print(f"{sum(len(w) for _, _, w in hits)} row groups in {len(hits)} files touch an airport")

    cols = ["id", "geometry", "bbox", "height", "num_floors", "class", "subtype", "names"]
    per_airport = {a["code"]: [] for a in airports}
    for key, size, rgs in hits:
        pf = pq.ParquetFile(RangeFile(f"{BUCKET}/{key}", size))
        have = set(pf.schema_arrow.names)
        t = pf.read_row_groups(rgs, columns=[c for c in cols if c in have])
        for row in t.to_pylist():
            bb = row["bbox"]
            for a, box, inside in tests:
                if not overlaps((bb["xmin"], bb["ymin"], bb["xmax"], bb["ymax"]), box):
                    continue
                cx = (bb["xmin"] + bb["xmax"]) / 2
                cy = (bb["ymin"] + bb["ymax"]) / 2
                if not inside(cx, cy):
                    continue
                geom = wkb.loads(row["geometry"])
                if geom.geom_type == "MultiPolygon":
                    geom = max(geom.geoms, key=lambda g: g.area)
                if geom.geom_type != "Polygon":
                    continue
                mlon = 111320.0 * math.cos(math.radians(cy))
                area = geom.area * mlon * 111320.0
                if area < MIN_AREA_M2:
                    continue
                per_airport[a["code"]].append((area, geom, row))
        print(f"  read {key.split('/')[-1][:12]}: {t.num_rows} rows")

    out = {"source": f"Overture Maps {release} (OpenStreetMap contributors and others, ODbL)", "airports": {}}
    total = 0
    for a in airports:
        items = sorted(per_airport[a["code"]], key=lambda x: -x[0])[:MAX_PER_AIRPORT]
        lon0, lat0 = a["lon"], a["lat"]
        blds = []
        for area, geom, row in items:
            g = shapely.simplify(geom, 0.000012, preserve_topology=True)
            ring = list(g.exterior.coords)[:-1]
            if len(ring) < 3:
                continue
            pts = []
            for lon, lat in ring:
                pts += [round((lon - lon0) * 1e6), round((lat - lat0) * 1e6)]
            cls = row.get("class") or ""
            name = ""
            if row.get("names") and row["names"].get("primary"):
                name = row["names"]["primary"]
            h = height_of(row)
            b = {"p": pts, "a": round(area)}
            if h:
                b["h"] = round(h, 1)
            if cls:
                b["c"] = cls
            if name:
                b["n"] = name[:60]
            blds.append(b)
        out["airports"][a["code"]] = {"lon": lon0, "lat": lat0, "b": blds}
        total += len(blds)
        print(f"{a['code']}: {len(blds)} buildings")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {total} buildings)")


if __name__ == "__main__":
    main()
