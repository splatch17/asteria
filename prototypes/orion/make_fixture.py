"""Generate the Orion DA prototype fixtures from the sky-data pipeline output.

Inputs : packages/sky-data/out/{stars,constellation-lines}.json (run build_stars.py first)
         assets-src/orion-urania.jpg — Sidney Hall, Urania's Mirror (1824), pl. 29, public domain
         (Wikimedia Commons, "Sidney Hall - Urania's Mirror - Orion (best currently available version - 2014).jpg")
Outputs: public/orion-sky.json, public/orion-figure.png
"""

import json
import math
from pathlib import Path

import requests
from PIL import Image, ImageOps

HERE = Path(__file__).parent
DATA = HERE / "../../packages/sky-data/out"
CENTER = (83.0, 3.0)  # RA, Dec (deg)
RADIUS_DEG = 32
MAG_LIMIT = 6.0
SOURCE = HERE / "assets-src/orion-urania.jpg"
SOURCE_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/1/1a/"
    "Sidney_Hall_-_Urania%27s_Mirror_-_Orion_%28best_currently_available_version_-_2014%29.jpg"
)

# Pixel positions of star glyphs in the 1252x1800 source engraving (measured by hand).
ANCHORS_PX = {
    27989: (365, 785),  # Betelgeuse
    25336: (714, 851),  # Bellatrix
    24436: (812, 1529),  # Rigel
    27366: (451, 1582),  # Saiph
    25930: (625, 1164),  # Mintaka
    26207: (585, 682),  # Meissa
}


def angular_distance(ra, dec, ra0, dec0):
    r = math.radians
    c = math.sin(r(dec)) * math.sin(r(dec0)) + math.cos(r(dec)) * math.cos(r(dec0)) * math.cos(r(ra - ra0))
    return math.degrees(math.acos(max(-1, min(1, c))))


def main():
    stars = json.loads((DATA / "stars.json").read_text(encoding="utf-8"))
    lines = json.loads((DATA / "constellation-lines.json").read_text(encoding="utf-8"))

    sky = [
        [s["hip"], s["ra"], s["dec"], s["v"], s.get("bv", 0.6), s.get("name"), s.get("bayer"), s.get("plx")]
        for s in stars
        if s["v"] <= MAG_LIMIT and angular_distance(s["ra"], s["dec"], *CENTER) <= RADIUS_DEG
    ]

    if not SOURCE.exists():
        SOURCE.parent.mkdir(exist_ok=True)
        resp = requests.get(SOURCE_URL, headers={"User-Agent": "AsteriaDev/0.1"}, timeout=60)
        resp.raise_for_status()
        SOURCE.write_bytes(resp.content)
    src = Image.open(SOURCE)
    w, h = src.size
    anchors = {str(k): [x / w, y / h] for k, (x, y) in ANCHORS_PX.items()}

    # Figure texture: luminance → ink (1 = dark engraving line), downscaled.
    gray = ImageOps.grayscale(src)
    ink = ImageOps.invert(gray).resize((w * 1100 // h, 1100), Image.LANCZOS)
    ink.save(HERE / "public/orion-figure.png", optimize=True)

    out = {
        "center": CENTER,
        "stars": sky,
        "lines": {"Ori": lines["Ori"]},
        "anchors": anchors,
        "credits": "Stars: Hipparcos (ESA), IAU WGSN · Lines: d3-celestial (BSD-3) · Figure: Sidney Hall, Urania's Mirror (1824), public domain",
    }
    (HERE / "public/orion-sky.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(sky)} stars, figure {ink.size}")


if __name__ == "__main__":
    main()
