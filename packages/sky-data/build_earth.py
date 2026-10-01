"""Build the Earth assets for the space view (globe), all public-domain sources.

Sources (see docs/DATA_SOURCES.md):
  - Coastlines: Natural Earth 1:50m (public domain)
  - Relief: NASA Visible Earth "Blue Marble: Next Generation" topography + bathymetry, Dec 2004 (public domain)
  - City lights: NASA Earth Observatory "Black Marble" 2016, 0.1° (public domain)

Outputs (not versioned), in out/earth/:
  coastlines.bin   "ASTE" v1: u32 polyline count, u32 offsets[count + 1] (point index), then
                   int16 lon/lat pairs in centidegrees (resolution 0.01° ≈ 1.1 km)
  relief.webp      2048×1024 equirectangular luminance (grayscale), north up, lon −180 at x = 0
  lights.webp      2048×1024 equirectangular night lights (grayscale)
"""

from __future__ import annotations

import io
import json
import struct
import sys
from pathlib import Path

import requests
from PIL import Image, ImageOps

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "out" / "earth"

COASTLINES_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_coastline.geojson"
)
RELIEF_URL = (
    "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg"
)
LIGHTS_URL = "https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg"

TEXTURE_SIZE = (2048, 1024)
EARTH_BUDGET = 1_500_000  # bytes for the three files
MAGIC = b"ASTE"
VERSION = 1

Image.MAX_IMAGE_PIXELS = None  # NASA mosaics are large but trusted


def cached_bytes(name: str, url: str) -> bytes:
    path = RAW / name
    if not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        resp = requests.get(url, timeout=120, headers={"User-Agent": "AsteriaDataPipeline/0.1"})
        resp.raise_for_status()
        path.write_bytes(resp.content)
    return path.read_bytes()


def encode_coastlines(geojson: dict) -> tuple[bytes, int, int]:
    polylines: list[list[tuple[int, int]]] = []
    for feature in geojson["features"]:
        geom = feature["geometry"]
        parts = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        for part in parts:
            pts = [(round(lon * 100), round(lat * 100)) for lon, lat in part]
            # drop consecutive duplicates created by quantisation
            pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
            if len(pts) >= 2:
                polylines.append(pts)
    offsets = [0]
    for pl in polylines:
        offsets.append(offsets[-1] + len(pl))
    flat = [c for pl in polylines for p in pl for c in p]
    data = (
        MAGIC
        + struct.pack("<HHI", VERSION, 0, len(polylines))
        + struct.pack(f"<{len(offsets)}I", *offsets)
        + struct.pack(f"<{len(flat)}h", *flat)
    )
    return data, len(polylines), offsets[-1]


def texture(raw: bytes, contrast_cutoff: float) -> bytes:
    img = Image.open(io.BytesIO(raw))
    gray = ImageOps.grayscale(img).resize(TEXTURE_SIZE, Image.LANCZOS)
    gray = ImageOps.autocontrast(gray, cutoff=contrast_cutoff)
    buf = io.BytesIO()
    gray.save(buf, "WEBP", quality=78, method=6)
    return buf.getvalue()


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []

    print("· Coastlines (Natural Earth 1:50m)…")
    coast, n_lines, n_points = encode_coastlines(json.loads(cached_bytes("ne_50m_coastline.geojson", COASTLINES_URL)))
    (OUT / "coastlines.bin").write_bytes(coast)
    print(f"  {n_lines} polylines, {n_points} points")
    if n_lines < 1000 or n_points < 50_000:
        errors.append(f"unexpectedly small coastline set ({n_lines} lines, {n_points} points)")

    print("· Relief (Blue Marble)…")
    (OUT / "relief.webp").write_bytes(texture(cached_bytes("blue-marble-5400.jpg", RELIEF_URL), 0.5))
    print("· City lights (Black Marble)…")
    (OUT / "lights.webp").write_bytes(texture(cached_bytes("black-marble-01deg.jpg", LIGHTS_URL), 0.1))

    # Sanity checks on the textures: Sahara is bright land, central Pacific dark ocean;
    # Paris region lit at night, central Sahara dark at night.
    relief = Image.open(OUT / "relief.webp").convert("L")  # WebP has no grayscale mode
    lights = Image.open(OUT / "lights.webp").convert("L")

    def at(img: Image.Image, lon: float, lat: float) -> int:
        w, h = img.size
        return img.getpixel((int((lon + 180) / 360 * (w - 1)), int((90 - lat) / 180 * (h - 1))))

    if not at(relief, 15, 23) > at(relief, -150, 0) + 60:
        errors.append("relief texture: Sahara should be much brighter than the Pacific")
    if not at(lights, 2.35, 48.86) > at(lights, 15, 23) + 60:
        errors.append("lights texture: Paris should be much brighter than the Sahara at night")

    total = 0
    for name in ("coastlines.bin", "relief.webp", "lights.webp"):
        size = (OUT / name).stat().st_size
        total += size
        print(f"  {name:16} {size:>9,} B")
    if total >= EARTH_BUDGET:
        errors.append(f"Earth assets {total:,} B exceed the {EARTH_BUDGET:,} B budget")

    for e in errors:
        print("✗", e, file=sys.stderr)
    print("✓ Earth assets" if not errors else "✗ Earth assets failed")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
