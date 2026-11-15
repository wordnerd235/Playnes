#!/usr/bin/env python3
"""Satellite-photo test patch for the offline map: Copernicus Sentinel-2 true colour (10 m)
around one airport, cut into Web Mercator WebP tiles that sit on top of the cartoon map.

Free public data, no account: the Sentinel-2 L2A Cloud-Optimised GeoTIFFs on AWS
(s3://sentinel-cogs, Element 84 / Sinergise). Only the needed parts of each file are read
(HTTP range requests), so nothing big is downloaded.

    python3 -m venv satenv && satenv/bin/pip install rasterio pillow numpy
    CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt satenv/bin/python scripts/world/satellite_patch.py

Writes public/world/sat/{z}/{x}/{y}.webp and public/world/sat/sat.json.
Cloudy pixels in the main scene (scene classification) are filled from the backup scenes.
The outer edge fades out so the photo blends into the cartoon map.
"""

import json
import math
import os
import shutil
import sys

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.transform import from_origin

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "world", "sat")
COGS = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/17/S/LA"

# Tri-Cities (TRI) with Kingsport, Johnson City, Bristol and Boone Lake: about 50 x 50 km.
PATCH = {"code": "TRI", "south": 36.25, "north": 36.70, "west": -82.70, "east": -82.12}
# Clear autumn passes (still mostly green), best first; later ones fill clouds in earlier ones.
SCENES = [
    "2025/10/S2A_17SLA_20251009_0_L2A",
    "2025/10/S2B_17SLA_20251022_0_L2A",
    "2024/10/S2A_17SLA_20241012_0_L2A",
]
DATE = "October 2025"
ZOOMS = (9, 13)  # z13 is ~15 m per pixel here, close to the 10 m source
FADE_M = 2500  # soft edge width


def tile_x(lon, z):
    return (lon + 180) / 360 * 2**z


def tile_y(lat, z):
    r = math.radians(lat)
    return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**z


def merc(lon, lat):
    R = 6378137.0
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def tile_bounds_merc(x, y, z):
    """Web Mercator bounds (minx, miny, maxx, maxy) of a block of tiles starting at x, y."""
    size = 2 * math.pi * 6378137.0 / 2**z
    o = math.pi * 6378137.0
    return lambda dx, dy: (-o + (x + 0) * size, o - (y + dy) * size, -o + (x + dx) * size, o - y * size)


def read_scene(path, bounds, w, h):
    """True colour RGB and a 'bad pixel' mask (clouds, shadows, no data) on the target grid."""
    out = {}
    for band, resamp in (("TCI", Resampling.lanczos), ("SCL", Resampling.nearest)):
        with rasterio.open(f"{COGS}/{path}/{band}.tif") as src:
            dst = from_origin(bounds[0], bounds[3], (bounds[2] - bounds[0]) / w, (bounds[3] - bounds[1]) / h)
            with WarpedVRT(src, crs="EPSG:3857", transform=dst, width=w, height=h, resampling=resamp, nodata=0) as vrt:
                out[band] = vrt.read()
    rgb = np.moveaxis(out["TCI"][:3], 0, -1)
    scl = out["SCL"][0]
    # 0 no data, 1 saturated, 3 cloud shadow, 8/9 cloud, 10 cirrus.
    bad = np.isin(scl, [0, 1, 3, 8, 9, 10]) | (rgb.sum(axis=2) == 0)
    return rgb, bad


def grade(rgb):
    """Sentinel true colour is dark and hazy; brighten and warm it to sit with the cartoon map."""
    f = rgb.astype(np.float32) / 255.0
    lo = np.percentile(f, 1, axis=(0, 1))
    f = np.clip((f - lo) / (1 - lo), 0, 1)  # remove haze
    f = f ** 0.66  # lift the dark forests
    grey = f.mean(axis=2, keepdims=True)
    f = np.clip(grey + (f - grey) * 1.35, 0, 1)  # a little more colour
    f = np.clip(f * np.array([1.0, 1.04, 0.95]), 0, 1)
    return (f * 255 + 0.5).astype(np.uint8)


def main():
    zmax = ZOOMS[1]
    x0 = math.floor(tile_x(PATCH["west"], zmax))
    x1 = math.floor(tile_x(PATCH["east"], zmax))
    y0 = math.floor(tile_y(PATCH["north"], zmax))
    y1 = math.floor(tile_y(PATCH["south"], zmax))
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    W, H = nx * 256, ny * 256
    bounds = tile_bounds_merc(x0, y0, zmax)(nx, ny)
    print(f"z{zmax}: {nx} x {ny} tiles, mosaic {W} x {H}", flush=True)

    rgb = None
    todo = None
    for s in SCENES:
        print("reading", s, flush=True)
        img, bad = read_scene(s, bounds, W, H)
        if rgb is None:
            rgb, todo = img.copy(), bad.copy()
        else:
            fill = todo & ~bad
            rgb[fill] = img[fill]
            todo &= bad
        print(f"  still missing {todo.mean() * 100:.2f}%", flush=True)
        if todo.mean() < 0.0005:
            break
    rgb = grade(rgb)

    # Alpha: 1 inside the patch, fading to 0 over FADE_M at its edges; 0 where no data.
    mx0, my1 = merc(PATCH["west"], PATCH["north"])
    mx1, my0 = merc(PATCH["east"], PATCH["south"])
    px = (bounds[2] - bounds[0]) / W
    xs = bounds[0] + (np.arange(W) + 0.5) * px
    ys = bounds[3] - (np.arange(H) + 0.5) * px
    k = math.cos(math.radians((PATCH["south"] + PATCH["north"]) / 2))  # mercator metres -> ground metres
    dx = np.minimum(xs - mx0, mx1 - xs) * k
    dy = np.minimum(ys - my0, my1 - ys) * k
    d = np.minimum(dy[:, None], dx[None, :])
    t = np.clip(d / FADE_M, 0, 1)
    alpha = (t * t * (3 - 2 * t) * 255).astype(np.uint8)
    alpha[todo] = 0
    mosaic = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    tiles = []
    total = 0
    for z in range(ZOOMS[0], zmax + 1):
        s = 2 ** (zmax - z)
        # Tile range at z covering the patch, and where the mosaic lands on that canvas.
        zx0, zy0 = x0 // s, y0 // s
        zx1, zy1 = x1 // s, y1 // s
        canvas = Image.new("RGBA", ((zx1 - zx0 + 1) * 256, (zy1 - zy0 + 1) * 256))
        scaled = mosaic if s == 1 else mosaic.resize((max(1, round(W / s)), max(1, round(H / s))), Image.LANCZOS)
        canvas.paste(scaled, (round((x0 - zx0 * s) * 256 / s), round((y0 - zy0 * s) * 256 / s)))
        have = []
        count = 0
        for tx in range(zx0, zx1 + 1):
            for ty in range(zy0, zy1 + 1):
                tile = canvas.crop(((tx - zx0) * 256, (ty - zy0) * 256, (tx - zx0 + 1) * 256, (ty - zy0 + 1) * 256))
                a = np.asarray(tile)[:, :, 3]
                if a.max() == 0:
                    continue
                os.makedirs(os.path.join(OUT, str(z), str(tx)), exist_ok=True)
                p = os.path.join(OUT, str(z), str(tx), f"{ty}.webp")
                if a.min() == 255:
                    tile.convert("RGB").save(p, "WEBP", quality=78, method=6)
                else:
                    tile.save(p, "WEBP", quality=78, method=6, exact=False)
                total += os.path.getsize(p)
                count += 1
                have.append(f"{tx}/{ty}")
        tiles.append({"z": z, "tiles": have})
        print(f"z{z}: {count} tiles", flush=True)
    meta = {
        "patches": [{**PATCH, "date": DATE}],
        "zooms": list(ZOOMS),
        "tiles": tiles,
        "credit": f"Contains modified Copernicus Sentinel data ({DATE.split()[-1]})",
    }
    with open(os.path.join(OUT, "sat.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(f"total {total / 1e6:.1f} MB", flush=True)
    mosaic.convert("RGB").resize((W // 4, H // 4)).save(sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, "..", "sat-preview.jpg"), quality=85)


if __name__ == "__main__":
    main()
