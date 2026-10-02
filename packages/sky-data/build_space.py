"""Build the textures of the realistic style of the space view (#55).

Sources (see docs/DATA_SOURCES.md):
  - Earth, day colour: NASA Visible Earth "Blue Marble: Next Generation", June 2004, without
    topography shading or bathymetry (public domain, credit NASA Earth Observatory / Reto Stöckli)
  - Moon: NASA SVS "CGI Moon Kit" (#4720), LRO LROC WAC colour mosaic with polar fill
    (public domain, credit NASA's Scientific Visualization Studio)
  - Planets and Saturn's rings: Solar System Scope textures, CC BY 4.0
    (https://www.solarsystemscope.com/textures/, attribution "Solar System Scope"),
    themselves derived from NASA mission imagery

Outputs (not versioned), in out/space/:
  earth-day.webp   2048×1024 equirectangular colour (sRGB), north up, lon −180 at x = 0
  moon.webp        1024×512 equirectangular colour, lon −180 at x = 0 (near side in the middle)
  planets.webp     256×1024 atlas, eight cells of 256×128 (top to bottom):
                   Mercury, Venus (clouds), Mars, Jupiter, Saturn, Uranus, Neptune, Saturn's rings.
                   Each planet map fills rows PAD … CELL − PAD of its cell (lon −180 … +180,
                   lat +90 … −90) and its first/last rows are repeated into the padding, so
                   mipmaps do not bleed between cells. Ring cell: radial colour in the upper
                   half, radial opacity (grey) in the lower half, inner radius RING_INNER to outer
                   radius RING_OUTER (Saturn radii) from left to right.
The atlas layout constants are mirrored in packages/sky-renderer/src/space-real-shaders.ts.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "out" / "space"

EARTH_DAY_URL = (
    "https://eoimages.gsfc.nasa.gov/images/imagerecords/76000/76487/world.200406.3x5400x2700.jpg"
)
MOON_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_1k.jpg"
SSS = "https://www.solarsystemscope.com/textures/download/"
PLANET_FILES = [
    "2k_mercury.jpg",
    "2k_venus_atmosphere.jpg",
    "2k_mars.jpg",
    "2k_jupiter.jpg",
    "2k_saturn.jpg",
    "2k_uranus.jpg",
    "2k_neptune.jpg",
]
RING_FILE = "2k_saturn_ring_alpha.png"

CELL_W, CELL, PAD = 256, 128, 8
# Radii (Saturn radii, 60 268 km) spanned by the ring texture, fitted on its edges: C ring inner
# edge (74 658 km) at x ≈ 120 and A ring outer edge (136 775 km) at x ≈ 1930 of 2048.
RING_INNER, RING_OUTER = 1.171, 2.336
BUDGET = 1_500_000  # bytes for the three files

Image.MAX_IMAGE_PIXELS = None  # NASA mosaics are large but trusted


def cached_bytes(name: str, url: str, referer: str | None = None) -> bytes:
    path = RAW / name
    if not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        headers = {"User-Agent": "Mozilla/5.0 (AsteriaDataPipeline/0.1)"}
        if referer:
            headers["Referer"] = referer  # Solar System Scope refuses downloads without it
        resp = requests.get(url, timeout=120, headers=headers)
        resp.raise_for_status()
        if not resp.headers.get("content-type", "").startswith("image/"):
            raise RuntimeError(f"{url}: not an image ({resp.headers.get('content-type')})")
        path.write_bytes(resp.content)
    return path.read_bytes()


def webp(img: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def planet_cell(raw: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    body = img.resize((CELL_W, CELL - 2 * PAD), Image.LANCZOS)
    cell = Image.new("RGB", (CELL_W, CELL))
    cell.paste(body, (0, PAD))
    top, bottom = body.crop((0, 0, CELL_W, 1)), body.crop((0, CELL - 2 * PAD - 1, CELL_W, CELL - 2 * PAD))
    for y in range(PAD):
        cell.paste(top, (0, y))
        cell.paste(bottom, (0, CELL - 1 - y))
    return cell


def ring_cell(raw: bytes) -> Image.Image:
    ring = Image.open(io.BytesIO(raw)).convert("RGBA")
    # Average across the strip's height, then resample to the cell width.
    strip = ring.resize((CELL_W, 1), Image.BOX)
    colour = strip.convert("RGB").resize((CELL_W, CELL // 2), Image.NEAREST)
    alpha = strip.getchannel("A").convert("RGB").resize((CELL_W, CELL // 2), Image.NEAREST)
    cell = Image.new("RGB", (CELL_W, CELL))
    cell.paste(colour, (0, 0))
    cell.paste(alpha, (0, CELL // 2))
    return cell


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []

    print("· Earth, day colour (Blue Marble NG, June 2004)…")
    earth = Image.open(io.BytesIO(cached_bytes("blue-marble-200406-5400.jpg", EARTH_DAY_URL))).convert("RGB")
    earth = earth.resize((2048, 1024), Image.LANCZOS)
    (OUT / "earth-day.webp").write_bytes(webp(earth, 80))

    print("· Moon (NASA SVS CGI Moon Kit, LROC colour)…")
    moon = Image.open(io.BytesIO(cached_bytes("lroc_color_poles_1k.jpg", MOON_URL))).convert("RGB")
    moon = moon.resize((1024, 512), Image.LANCZOS)
    (OUT / "moon.webp").write_bytes(webp(moon, 80))

    print("· Planets (Solar System Scope, CC BY 4.0)…")
    atlas = Image.new("RGB", (CELL_W, CELL * 8))
    referer = "https://www.solarsystemscope.com/textures/"
    for i, name in enumerate(PLANET_FILES):
        atlas.paste(planet_cell(cached_bytes(f"sss-{name}", SSS + name, referer)), (0, i * CELL))
    atlas.paste(ring_cell(cached_bytes(f"sss-{RING_FILE}", SSS + RING_FILE, referer)), (0, 7 * CELL))
    (OUT / "planets.webp").write_bytes(webp(atlas, 85))

    # Sanity checks: colours where they are expected.
    day = Image.open(OUT / "earth-day.webp").convert("RGB")

    def at(img: Image.Image, lon: float, lat: float) -> tuple[int, int, int]:
        w, h = img.size
        return img.getpixel((int((lon + 180) / 360 * (w - 1)), int((90 - lat) / 180 * (h - 1))))

    sahara, pacific, amazon = at(day, 15, 23), at(day, -150, 0), at(day, -62, -4)
    if not (sahara[0] > sahara[2] + 40 and sum(sahara) > 300):
        errors.append(f"earth-day: the Sahara should be bright and ochre, got {sahara}")
    if not (pacific[2] > pacific[0] and sum(pacific) < 120):
        errors.append(f"earth-day: the Pacific should be dark blue, got {pacific}")
    if not (amazon[1] > amazon[2]):
        errors.append(f"earth-day: the Amazon should be green, got {amazon}")
    moon_img = Image.open(OUT / "moon.webp").convert("L")
    # Mare Imbrium (lon −16, lat 33) is darker than the highlands south of Tycho (lon 0, lat −30).
    if not at(moon_img, -16, 33) + 25 < at(moon_img, 0, -30):
        errors.append("moon: Mare Imbrium should be darker than the southern highlands")
    planets = Image.open(OUT / "planets.webp").convert("RGB")
    mars = planets.getpixel((CELL_W // 2, 2 * CELL + CELL // 2))
    if not mars[0] > mars[2] + 30:
        errors.append(f"planets: Mars should be red, got {mars}")
    neptune = planets.getpixel((CELL_W // 2, 6 * CELL + CELL // 2))
    if not neptune[2] > neptune[0] + 30:
        errors.append(f"planets: Neptune should be blue, got {neptune}")

    total = 0
    for name in ("earth-day.webp", "moon.webp", "planets.webp"):
        size = (OUT / name).stat().st_size
        total += size
        print(f"  {name:16} {size:>9,} B")
    print(f"  {'total':16} {total:>9,} B")
    if total >= BUDGET:
        errors.append(f"space textures {total:,} B exceed the {BUDGET:,} B budget")

    for e in errors:
        print("✗", e, file=sys.stderr)
    print("✓ Space textures" if not errors else "✗ Space textures failed")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
