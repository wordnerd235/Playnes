"""Build the offline "cartoon world" for the playable region.

Inputs (downloaded and cached):
  - AWS Terrain Tiles (terrarium PNG elevation): https://registry.opendata.aws/terrain-tiles/
    (SRTM / USGS 3DEP / ETOPO1 and others; see their attribution page)
  - Natural Earth 1:10m vector data (public domain): lakes, rivers, roads, urban areas, borders

Outputs (shipped with the game, in public/world/):
  - dem.bin.gz        int16 meters on a regular lat/lon grid, row-delta coded, gzip
  - landcover.bin.gz  uint8 per grid cell: 0 land, 1 water, 2 town, 3 airport
  - tiles/{z}/{x}/{y}.webp  cartoon map tiles (Web Mercator): z6-10 for the region,
                            z11-15 patches around each airport
  - world.json        bounds, grid size, tile patches

Usage:
  node scripts/world/export-data.mjs <cache>/data.json
  <venv>/bin/python scripts/world/build_world.py --cache <cache-dir>
Needs numpy + pillow.
"""

import argparse
import gzip
import io
import json
import math
import os
import ssl
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "world"
DEM_Z = 10
GRID_STEP = 1 / 300  # degrees (~370 m)
TILE = 256
SS = 2  # supersampling for anti-aliased vectors

NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
NE_LAYERS = [
    "ne_10m_land",
    "ne_10m_lakes",
    "ne_10m_lakes_north_america",
    "ne_10m_rivers_lake_centerlines",
    "ne_10m_rivers_north_america",
    "ne_10m_roads",
    "ne_10m_urban_areas",
    "ne_10m_admin_1_states_provinces_lines",
]
TERRAIN_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

# Airport detail patches: zoom -> radius in meters around each airport.
PATCH_RADIUS = {11: 15000, 12: 8000, 13: 4000, 14: 2600, 15: 2000}


def ssl_ctx():
    cafile = os.environ.get("SSL_CERT_FILE") or ("/root/.ccr/ca-bundle.crt" if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
    return ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()


CTX = ssl_ctx()


def fetch(url, dest: Path, tries=5):
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "playnes-world-builder"})
            with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
                data = r.read()
            dest.write_bytes(data)
            return dest
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise RuntimeError(f"failed {url}: {e}") from e
            time.sleep(2 ** i)
    return dest


# ---------------------------------------------------------------- projection

def lonlat_to_px(lon, lat, z):
    """Global Web Mercator pixel coordinates (float) at zoom z."""
    n = TILE * (2 ** z)
    x = (np.asarray(lon) + 180.0) / 360.0 * n
    latr = np.radians(np.asarray(lat))
    y = (1.0 - np.log(np.tan(latr) + 1.0 / np.cos(latr)) / math.pi) / 2.0 * n
    return x, y


def px_to_lonlat(x, y, z):
    n = TILE * (2 ** z)
    lon = np.asarray(x) / n * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * np.asarray(y) / n))))
    return lon, lat


def tile_range(south, north, west, east, z):
    x0, y0 = lonlat_to_px(west, north, z)
    x1, y1 = lonlat_to_px(east, south, z)
    return int(x0 // TILE), int(x1 // TILE), int(y0 // TILE), int(y1 // TILE)


# ---------------------------------------------------------------- elevation

class Dem:
    def __init__(self, cache: Path, region):
        m = 0.3
        tx0, tx1, ty0, ty1 = tile_range(region["south"] - m, region["north"] + m, region["west"] - m, region["east"] + m, DEM_Z)
        self.tx0, self.ty0 = tx0, ty0
        jobs = [(x, y) for x in range(tx0, tx1 + 1) for y in range(ty0, ty1 + 1)]
        print(f"terrain tiles: {len(jobs)} at z{DEM_Z}")

        def get(xy):
            x, y = xy
            return xy, fetch(TERRAIN_URL.format(z=DEM_Z, x=x, y=y), cache / "terrarium" / str(DEM_Z) / str(x) / f"{y}.png")

        with ThreadPoolExecutor(8) as ex:
            paths = dict(ex.map(get, jobs))
        w = (tx1 - tx0 + 1) * TILE
        h = (ty1 - ty0 + 1) * TILE
        self.mosaic = np.zeros((h, w), dtype=np.float32)
        for (x, y), p in paths.items():
            a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
            e = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
            self.mosaic[(y - ty0) * TILE:(y - ty0 + 1) * TILE, (x - tx0) * TILE:(x - tx0 + 1) * TILE] = e

    def at(self, lon, lat):
        x, y = lonlat_to_px(lon, lat, DEM_Z)
        x = np.clip(x - self.tx0 * TILE - 0.5, 0, self.mosaic.shape[1] - 1.001)
        y = np.clip(y - self.ty0 * TILE - 0.5, 0, self.mosaic.shape[0] - 1.001)
        x0 = np.floor(x).astype(int)
        y0 = np.floor(y).astype(int)
        fx = x - x0
        fy = y - y0
        m = self.mosaic
        return (m[y0, x0] * (1 - fx) * (1 - fy) + m[y0, x0 + 1] * fx * (1 - fy) + m[y0 + 1, x0] * (1 - fx) * fy + m[y0 + 1, x0 + 1] * fx * fy)


# ---------------------------------------------------------------- vectors

def load_vectors(cache: Path, region):
    pad = 0.6
    bb = (region["west"] - pad, region["south"] - pad, region["east"] + pad, region["north"] + pad)
    layers = {}
    for name in NE_LAYERS:
        p = fetch(NE_BASE + name + ".geojson", cache / "ne" / f"{name}.geojson")
        gj = json.loads(p.read_text(encoding="utf-8"))
        feats = []
        for f in gj["features"]:
            g = f.get("geometry")
            if not g:
                continue
            parts = []
            if g["type"] == "Polygon":
                parts = [("poly", g["coordinates"])]
            elif g["type"] == "MultiPolygon":
                parts = [("poly", c) for c in g["coordinates"]]
            elif g["type"] == "LineString":
                parts = [("line", g["coordinates"])]
            elif g["type"] == "MultiLineString":
                parts = [("line", c) for c in g["coordinates"]]
            for kind, coords in parts:
                ring = coords[0] if kind == "poly" else coords
                xs = [c[0] for c in ring]
                ys = [c[1] for c in ring]
                fb = (min(xs), min(ys), max(xs), max(ys))
                if fb[2] < bb[0] or fb[0] > bb[2] or fb[3] < bb[1] or fb[1] > bb[3]:
                    continue
                feats.append({"kind": kind, "coords": coords, "bbox": fb, "props": f.get("properties", {})})
        layers[name] = feats
        print(f"{name}: {len(feats)} features in region")
    return layers


def runway_polys(airports):
    """Runway rectangles (lon/lat corners) and centerline data."""
    out = []
    for a in airports:
        e0, e1 = a["runway"]["ends"]
        w = a["runway"]["widthFt"] * 0.3048
        out.append({"code": a["code"], "a": (e0["lon"], e0["lat"]), "b": (e1["lon"], e1["lat"]), "w": w, "ids": (e0["id"], e1["id"]),
                    "elev": (e0["elevFt"] * 0.3048, e1["elevFt"] * 0.3048)})
    return out


def meters_offset(lon, lat, de, dn):
    mlat = 111320.0
    mlon = 111320.0 * math.cos(math.radians(lat))
    return lon + de / mlon, lat + dn / mlat


def runway_frame(rw):
    (lon0, lat0), (lon1, lat1) = rw["a"], rw["b"]
    mlon = 111320.0 * math.cos(math.radians(lat0))
    dx = (lon1 - lon0) * mlon
    dy = (lat1 - lat0) * 111320.0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    return L, ux, uy


def runway_point(rw, s, x):
    L, ux, uy = runway_frame(rw)
    lon0, lat0 = rw["a"]
    # along (ux,uy), right = (uy,-ux)
    return meters_offset(lon0, lat0, ux * s + uy * x, uy * s - ux * x)


# ---------------------------------------------------------------- grid products

def build_grid(dem: Dem, region, layers, runways):
    W = int(round((region["east"] - region["west"]) / GRID_STEP)) + 1
    H = int(round((region["north"] - region["south"]) / GRID_STEP)) + 1
    lons = region["west"] + np.arange(W) * GRID_STEP
    lats = region["north"] - np.arange(H) * GRID_STEP
    LON, LAT = np.meshgrid(lons, lats)
    elev = dem.at(LON, LAT)

    # Rasterize lakes and towns onto the grid.
    def raster(names, kind="poly", width=1):
        img = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(img)
        for n in names:
            for f in layers[n]:
                if f["kind"] != kind:
                    continue
                rings = f["coords"] if kind == "poly" else [f["coords"]]
                for i, ring in enumerate(rings):
                    pts = [((c[0] - region["west"]) / GRID_STEP, (region["north"] - c[1]) / GRID_STEP) for c in ring]
                    if len(pts) < 2:
                        continue
                    if kind == "poly":
                        d.polygon(pts, fill=0 if i > 0 else 255)
                    else:
                        d.line(pts, fill=255, width=width)
        return np.asarray(img) > 0

    lakes = raster(["ne_10m_lakes", "ne_10m_lakes_north_america"])
    towns = raster(["ne_10m_urban_areas"])
    # Sea = outside the coastline polygons (the elevation data dips below 0 on some coastal land).
    ocean = ~raster(["ne_10m_land"])
    elev = np.where(ocean, 0.0, np.maximum(elev, 1.5))
    land = np.zeros((H, W), dtype=np.uint8)
    land[towns] = 2
    land[lakes | ocean] = 1

    # Flatten terrain along runways and mark airport land.
    for rw in runways:
        L, ux, uy = runway_frame(rw)
        lon0, lat0 = rw["a"]
        mlon = 111320.0 * math.cos(math.radians(lat0))
        de = (LON - lon0) * mlon
        dn = (LAT - lat0) * 111320.0
        s = de * ux + dn * uy
        x = de * uy - dn * ux
        near = (s > -1200) & (s < L + 1200) & (np.abs(x) < 1500)
        if not near.any():
            continue
        def end_h(lonlat, published_m):
            d = float(dem.at(np.array([lonlat[0]]), np.array([lonlat[1]]))[0])
            # Trust the published runway elevation when the terrain data is clearly off.
            return published_m if abs(d - published_m) > 8 else d
        h0 = end_h(rw["a"], rw["elev"][0])
        h1 = end_h(rw["b"], rw["elev"][1])
        flat = h0 + (h1 - h0) * np.clip(s / L, 0, 1)
        lat_w = np.clip(1 - (np.abs(x) - 150) / 600, 0, 1)
        lon_w = np.clip(1 - (np.maximum(-s, s - L) - 200) / 800, 0, 1)
        wgt = np.where(near, lat_w * lon_w, 0)
        elev = elev * (1 - wgt) + flat * wgt
        land[(near) & (np.abs(x) < 450) & (s > -500) & (s < L + 500)] = 3
    return elev, land, W, H


def write_grid(elev, land, W, H, region):
    OUT.mkdir(parents=True, exist_ok=True)
    e = np.round(elev).astype(np.int32)
    delta = np.empty_like(e)
    delta[:, 0] = e[:, 0]
    delta[:, 1:] = e[:, 1:] - e[:, :-1]
    data = delta.astype("<i2").tobytes()
    (OUT / "dem.bin.gz").write_bytes(gzip.compress(data, 9))
    (OUT / "landcover.bin.gz").write_bytes(gzip.compress(land.astype(np.uint8).tobytes(), 9))
    print(f"dem {W}x{H}: {(OUT / 'dem.bin.gz').stat().st_size / 1e6:.2f} MB, landcover {(OUT / 'landcover.bin.gz').stat().st_size / 1e6:.2f} MB")


# ---------------------------------------------------------------- tile rendering

PALETTE = [  # meters -> cartoon color (open land)
    (0, (150, 216, 112)),
    (300, (136, 206, 104)),
    (700, (118, 190, 96)),
    (1100, (112, 172, 92)),
    (1500, (134, 166, 100)),
    (1900, (176, 178, 136)),
    (2300, (214, 210, 186)),
]
FOREST = (64, 140, 72)
FOREST_DARK = (44, 112, 56)
FIELD_COLORS = [(186, 216, 118), (150, 210, 108), (214, 202, 140), (128, 194, 96), (170, 200, 96), (200, 222, 150)]
WATER = (72, 156, 222)
WATER_EDGE = (150, 205, 240)
TOWN = (226, 216, 196)
TOWN_BLOCK = (205, 194, 172)
ROAD = (250, 240, 214)
ROAD_EDGE = (176, 164, 140)
BORDER = (255, 255, 255)
GRASS = (156, 212, 120)
RUNWAY = (70, 74, 82)


def hash01(v, seed):
    h = np.sin(v * 12.9898 + seed * 78.233) * 43758.5453
    return h - np.floor(h)


def box_blur(a, r):
    """Separable box blur with radius r (pixels), edges clamped."""
    out = a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        p = np.pad(out, pad, mode="edge")
        c = np.cumsum(p, axis=axis, dtype=np.float64)
        if axis == 0:
            out = (c[2 * r + 1:, :] - c[:-2 * r - 1, :]) / (2 * r + 1)
        else:
            out = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return out.astype(np.float32)


def value_noise(lon, lat, scale_deg, seed):
    gx = lon / scale_deg
    gy = lat / scale_deg
    x0 = np.floor(gx)
    y0 = np.floor(gy)
    fx = gx - x0
    fy = gy - y0

    def h(ix, iy):
        v = np.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453
        return v - np.floor(v)

    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    return (h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx) * (1 - sy) + (h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx) * sy


def render_tile(z, tx, ty, dem, layers, runways, region):
    N = TILE * SS
    px = tx * TILE + (np.arange(N) + 0.5) / SS
    py = ty * TILE + (np.arange(N) + 0.5) / SS
    PX, PY = np.meshgrid(px, py)
    LON, LAT = px_to_lonlat(PX, PY, z)
    elev = dem.at(LON, LAT)

    # Hillshade (meters per pixel at this zoom and latitude). Smooth the elevation first at
    # high zoom so the 150 m source grid doesn't show up as facets.
    mpp = 156543.03392 * np.cos(np.radians(LAT)) / (2 ** z) / SS
    shade_elev = box_blur(elev, max(1, int(round(220 / float(mpp.mean())))) ) if z >= 11 else elev
    gy, gx = np.gradient(shade_elev)
    exag = 1.4 if z <= 9 else 1.1
    gx = gx / mpp * exag
    gy = gy / mpp * exag
    az, alt = math.radians(315), math.radians(45)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    shade = np.clip(0.86 + 0.42 * (shade - 0.7), 0.7, 1.1)

    # Elevation tint for open land.
    stops = np.array([s for s, _ in PALETTE], dtype=np.float32)
    cols = np.array([c for _, c in PALETTE], dtype=np.float32)
    e = np.clip(elev, 0, stops[-1])
    rgb = np.stack([np.interp(e, stops, cols[:, i]) for i in range(3)], axis=-1)

    # Meter coordinates (fixed scale for the region) for procedural ground detail.
    MX = LON * 111320.0 * math.cos(math.radians(35.0))
    MY = LAT * 111320.0

    # Farm-field patchwork: rotated rectangles, rotation varies by 6 km super-cell.
    sc = np.floor(MX / 6000) * 31 + np.floor(MY / 6000) * 17
    ang = (hash01(sc, 3) - 0.5) * 1.2
    ca, sa = np.cos(ang), np.sin(ang)
    RX = MX * ca - MY * sa
    RY = MX * sa + MY * ca
    cell = hash01(np.floor(RX / 320) * 7.13 + np.floor(RY / 210) * 3.71, 5)
    fcols = np.array(FIELD_COLORS, dtype=np.float32)
    field_rgb = fcols[np.minimum((cell * len(FIELD_COLORS)).astype(int), len(FIELD_COLORS) - 1)]
    lowland = np.clip((800 - elev) / 300, 0, 1)
    if z >= 12:
        # Hedgerows between fields.
        fx_ = RX / 320 - np.floor(RX / 320)
        fy_ = RY / 210 - np.floor(RY / 210)
        hedge = (np.minimum(fx_, 1 - fx_) * 320 < 4) | (np.minimum(fy_, 1 - fy_) * 210 < 4)
        field_rgb[hedge] = FOREST
    rgb = rgb * (1 - lowland[..., None] * 0.8) + field_rgb * (lowland[..., None] * 0.8)

    # Forests: more of them up in the mountains.
    fnoise = value_noise(MX, MY, 1800, 7) * 0.7 + value_noise(MX, MY, 500, 8) * 0.3
    forest_thresh = np.clip(0.66 - elev / 3600, 0.2, 0.66)
    forest = fnoise > forest_thresh
    edge_w = 0.03 if z <= 10 else 0.008
    edge = np.clip((fnoise - forest_thresh) / edge_w, 0, 1)
    frgb = np.array(FOREST, dtype=np.float32) * (1 + (value_noise(MX, MY, 260, 9) - 0.5) * 0.18)[..., None]
    if z >= 13:
        # Individual tree crowns.
        tx_ = np.floor(MX / 14)
        ty_ = np.floor(MY / 14)
        h = hash01(tx_ * 1.7 + ty_ * 9.1, 11)
        cx = (MX / 14 - tx_ - 0.3 - h * 0.4)
        cy = (MY / 14 - ty_ - 0.3 - hash01(tx_ * 3.3 + ty_ * 1.3, 12) * 0.4)
        crown = (cx * cx + cy * cy) < 0.09
        frgb[crown] = FOREST_DARK
    rgb = rgb * (1 - edge[..., None]) + frgb * edge[..., None]

    rgb *= shade[..., None]
    def to_px(lon, lat):
        x, y = lonlat_to_px(lon, lat, z)
        return ((x - tx * TILE) * SS, (y - ty * TILE) * SS)

    # Sea: outside the Natural Earth land polygons.
    land_mask = Image.new("L", (N, N), 0)
    lmd = ImageDraw.Draw(land_mask)
    for f in layers["ne_10m_land"]:
        if f["kind"] != "poly":
            continue
        for i, ring in enumerate(f["coords"]):
            xs, ys = to_px(np.array([c[0] for c in ring]), np.array([c[1] for c in ring]))
            lmd.polygon(list(zip(xs.tolist(), ys.tolist())), fill=255 if i == 0 else 0)
    water = np.asarray(land_mask) == 0
    rgb[water] = WATER
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")
    d = ImageDraw.Draw(img, "RGBA")

    lon_min, lat_min = px_to_lonlat(tx * TILE - 8, (ty + 1) * TILE + 8, z)
    lon_max, lat_max = px_to_lonlat((tx + 1) * TILE + 8, ty * TILE - 8, z)
    tb = (float(lon_min), float(lat_min), float(lon_max), float(lat_max))

    def visible(f):
        b = f["bbox"]
        return not (b[2] < tb[0] or b[0] > tb[2] or b[3] < tb[1] or b[1] > tb[3])

    def ring_px(ring):
        xs, ys = to_px(np.array([c[0] for c in ring]), np.array([c[1] for c in ring]))
        return list(zip(xs.tolist(), ys.tolist()))

    # Towns
    for f in layers["ne_10m_urban_areas"]:
        if f["kind"] == "poly" and visible(f):
            for i, ring in enumerate(f["coords"]):
                d.polygon(ring_px(ring), fill=TOWN + (235,) if i == 0 else None)
    if z >= 12:
        # Simple city blocks inside towns.
        block = (img.copy(), )
        town_mask = Image.new("L", img.size, 0)
        md = ImageDraw.Draw(town_mask)
        for f in layers["ne_10m_urban_areas"]:
            if f["kind"] == "poly" and visible(f):
                md.polygon(ring_px(f["coords"][0]), fill=255)
        grid = Image.new("RGBA", img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(grid)
        step = max(6, int(120 / (156543.03392 * math.cos(math.radians(float(LAT.mean()))) / (2 ** z)) * SS))
        for gxp in range(0, N, step):
            gd.line([(gxp, 0), (gxp, N)], fill=TOWN_BLOCK + (255,), width=max(1, SS))
        for gyp in range(0, N, step):
            gd.line([(0, gyp), (N, gyp)], fill=TOWN_BLOCK + (255,), width=max(1, SS))
        img.paste(grid, (0, 0), Image.fromarray((np.asarray(town_mask) // 2).astype(np.uint8)))
        del block

    # Lakes
    for name in ("ne_10m_lakes", "ne_10m_lakes_north_america"):
        for f in layers[name]:
            if f["kind"] == "poly" and visible(f):
                for i, ring in enumerate(f["coords"]):
                    pts = ring_px(ring)
                    if i == 0:
                        d.polygon(pts, fill=WATER + (255,), outline=WATER_EDGE + (255,))
                    else:
                        d.polygon(pts, fill=None)
    # Rivers
    rw = {6: 1, 7: 1, 8: 2, 9: 2, 10: 3, 11: 4, 12: 6, 13: 8, 14: 10, 15: 12}[z] * SS
    for name in ("ne_10m_rivers_lake_centerlines", "ne_10m_rivers_north_america"):
        for f in layers[name]:
            if f["kind"] == "line" and visible(f):
                d.line(ring_px(f["coords"]), fill=WATER + (255,), width=rw, joint="curve")
    # State borders
    if z <= 11:
        for f in layers["ne_10m_admin_1_states_provinces_lines"]:
            if f["kind"] == "line" and visible(f):
                d.line(ring_px(f["coords"]), fill=BORDER + (110,), width=max(1, SS))
    # Roads
    road_w = {6: 1, 7: 1, 8: 2, 9: 2, 10: 3, 11: 4, 12: 5, 13: 6, 14: 7, 15: 8}[z] * SS
    for f in layers["ne_10m_roads"]:
        if f["kind"] != "line" or not visible(f):
            continue
        t = str(f["props"].get("type", ""))
        major = "Major" in t or f["props"].get("expressway") == 1
        if z <= 7 and not major:
            continue
        pts = ring_px(f["coords"])
        w = road_w if major else max(SS, road_w * 2 // 3)
        d.line(pts, fill=ROAD_EDGE + (255,), width=w + 2 * SS, joint="curve")
        d.line(pts, fill=ROAD + (255,), width=w, joint="curve")

    # Airports
    if z >= 11:
        for r in runways:
            L, ux, uy = runway_frame(r)
            grass = [runway_point(r, s, x) for s, x in ((-350, -180), (L + 350, -180), (L + 350, 180), (-350, 180))]
            d.polygon([to_px(lo, la) for lo, la in grass], fill=GRASS + (255,))
            corners = [runway_point(r, s, x) for s, x in ((0, -r["w"] / 2), (L, -r["w"] / 2), (L, r["w"] / 2), (0, r["w"] / 2))]
            d.polygon([to_px(lo, la) for lo, la in corners], fill=RUNWAY + (255,))
            if z >= 13:
                wpx = max(1, int(SS * (1 if z == 13 else 2 if z == 14 else 3)))
                s = 120.0
                while s < L - 120:
                    a = to_px(*runway_point(r, s, 0))
                    b = to_px(*runway_point(r, s + 36, 0))
                    d.line([a, b], fill=(255, 255, 255, 255), width=wpx)
                    s += 66
                for end_s, sign in ((6, 1), (L - 6, -1)):
                    for k in range(-3, 4):
                        if k == 0:
                            continue
                        x = k * r["w"] / 9
                        a = to_px(*runway_point(r, end_s, x))
                        b = to_px(*runway_point(r, end_s + sign * 45, x))
                        d.line([a, b], fill=(255, 255, 255, 255), width=wpx * 2)
                    # touchdown zone bars at the 1,000 ft aiming point
                    for x in (-r["w"] / 4, r["w"] / 4):
                        a = to_px(*runway_point(r, end_s + sign * 300, x))
                        b = to_px(*runway_point(r, end_s + sign * 345, x))
                        d.line([a, b], fill=(255, 255, 255, 255), width=wpx * 4)

    img = img.resize((TILE, TILE), Image.LANCZOS)
    return img


def tiles_for_patches(airports):
    patches = []
    for a in airports:
        for z, rad in PATCH_RADIUS.items():
            lo0, la0 = meters_offset(a["lon"], a["lat"], -rad, -rad)
            lo1, la1 = meters_offset(a["lon"], a["lat"], rad, rad)
            x0, x1, y0, y1 = tile_range(la0, la1, lo0, lo1, z)
            patches.append({"z": z, "x0": x0, "x1": x1, "y0": y0, "y1": y1, "code": a["code"]})
    return patches


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--max-base-zoom", type=int, default=10)
    ap.add_argument("--skip-tiles", action="store_true")
    args = ap.parse_args()
    cache = Path(args.cache)
    data = json.loads((cache / "data.json").read_text())
    region = data["region"]
    airports = data["airports"]
    runways = runway_polys(airports)

    dem = Dem(cache, region)
    layers = load_vectors(cache, region)
    elev, land, W, H = build_grid(dem, region, layers, runways)
    write_grid(elev, land, W, H, region)

    # Use the runway-flattened grid for tile shading too, so the drawn runways sit on flat ground.
    patches = tiles_for_patches(airports)
    jobs = []
    for z in range(6, args.max_base_zoom + 1):
        x0, x1, y0, y1 = tile_range(region["south"], region["north"], region["west"], region["east"], z)
        jobs += [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    seen = set(jobs)
    for p in patches:
        for x in range(p["x0"], p["x1"] + 1):
            for y in range(p["y0"], p["y1"] + 1):
                if (p["z"], x, y) not in seen:
                    seen.add((p["z"], x, y))
                    jobs.append((p["z"], x, y))
    print(f"rendering {len(jobs)} tiles")
    if not args.skip_tiles:
        t0 = time.time()
        total = 0
        for i, (z, x, y) in enumerate(jobs):
            out = OUT / "tiles" / str(z) / str(x) / f"{y}.webp"
            out.parent.mkdir(parents=True, exist_ok=True)
            img = render_tile(z, x, y, dem, layers, runways, region)
            buf = io.BytesIO()
            img.save(buf, "WEBP", quality=78, method=5)
            out.write_bytes(buf.getvalue())
            total += buf.tell()
            if i % 100 == 0:
                print(f"  {i}/{len(jobs)}  {time.time() - t0:.0f}s  {total / 1e6:.1f} MB")
        print(f"tiles: {total / 1e6:.1f} MB")

    world = {
        "bounds": region,
        "grid": {"step": GRID_STEP, "width": W, "height": H, "west": region["west"], "north": region["north"]},
        "baseZoom": [6, args.max_base_zoom],
        "patches": patches,
        "attribution": "Terrain: AWS Terrain Tiles (USGS 3DEP, SRTM and others). Map: Natural Earth.",
    }
    (OUT / "world.json").write_text(json.dumps(world))
    return 0


if __name__ == "__main__":
    sys.exit(main())
