"""Build the constellation figure sets (#95): illustrated figures drawn under the stars.

Set 1 — "stellarium-western" (sources: docs/DATA_SOURCES.md):
  Stellarium sky culture "western" (repository Stellarium/stellarium-skycultures, folder western/,
  pinned at commit PIN), 85 illustrations by Johan Meuris, each anchored on three Hipparcos stars.
  Licences, as stated by western/description.md at that commit (checked below, the build stops if
  the statement changes): illustrations Free Art License (FAL 1.3, https://artlibre.org/licence/
  lal/en/), text and data CC BY-SA. Our atlas is a derivative of the illustrations (resized,
  normalised greyscale): it is distributed under FAL 1.3 with the attribution and the link to the
  originals; the manifest (anchors) under CC BY-SA 4.0.

The format is common to every figure set (Urania's Mirror #108, Al-Sûfî #109, choice #110): an
atlas of greyscale cells (luminance = ink coverage, 0 = no ink) and a JSON manifest. The renderer
(packages/sky-renderer/src/figures.ts) is set-agnostic: each figure is placed on the sky by its
three anchor stars (image point (u, v) ↔ HIP star), fitted as an affine map from the image to the
gnomonic tangent plane at the anchors' barycentre.

Outputs (not versioned), in out/figures/:
  <set>.webp   atlas, ATLAS_COLUMNS × rows cells of CELL px; each figure is resized to
               CELL − 2·PAD px and centred in its cell (black padding: no bleeding between cells
               with bilinear filtering and the first mipmaps). Grey, stored as lossy WebP (WEBP_QUALITY).
  <set>.json   manifest (format "asteria-figure-set" v1):
    { format, version, id, name, culture, era, author, license: {name, url}, dataLicense,
      source: {repository, commit, path, url}, modifications, attribution,
      atlas: {file, width, height, cell},
      figures: [{ con, id, file, rect: [x, y, w, h] (atlas px, top-left origin),
                  anchors: [{hip, u, v}] (u, v in [0, 1] of the figure's own image, top-left
                  origin, v downwards) }] }

Controls (exit code 1 on failure): licence statement unchanged, 3 distinct anchors per figure,
anchors inside the image and not collinear (triangle ≥ MIN_TRIANGLE of the image area), known IAU
abbreviations, size budget. When the star catalogue has been built (out/stars.bin, or the copy
synced to apps/web/public/data): every anchor star is in it (except KNOWN_MISSING), the anchors are
not collinear on the sky either, and the image corners stay within MAX_CORNER_DEG of the
barycentre (the tangent plane is well conditioned). Without the catalogue those checks are
skipped with a warning (they run in the deploy workflow, after build_stars.py).
"""

from __future__ import annotations

import gzip
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
import requests
from PIL import Image

from star_binary import CONSTELLATIONS, decode_stars

ROOT = Path(__file__).parent
RAW = ROOT / "raw" / "figures"
OUT = ROOT / "out" / "figures"
CATALOGUES = [ROOT / "out", ROOT.parent.parent / "apps" / "web" / "public" / "data"]

REPOSITORY = "Stellarium/stellarium-skycultures"
PIN = "014fbb5e59233d133c22f9811af96b67d05a95c9"  # master, 2026-05-26
CULTURE = "western"
RAW_URL = f"https://raw.githubusercontent.com/{REPOSITORY}/{PIN}/{CULTURE}"
SET_ID = "stellarium-western"

# Licence statement of western/description.md at PIN ("## License" section, whitespace folded).
EXPECTED_LICENSE = "Text and data: CC BY-SA Illustrations: Free Art License"
EXPECTED_AUTHOR = "Illustrations by Johan Meuris."

CELL = 256
PAD = 8
ATLAS_COLUMNS = 8
# Lossy WebP: the 1-bit dithering hides its artefacts; q 80 ≈ 1/3 of the lossless size.
WEBP_QUALITY = 80
MIN_TRIANGLE = 0.01  # anchor triangle area / image area
MAX_CORNER_DEG = 75.0  # image corner ↔ barycentre: well inside the tangent plane's hemisphere
BUDGET = 600_000  # bytes, atlas + manifest
# Anchor stars outside our catalogue (V ≤ 6.5), with the reason. The figure is then not drawn.
KNOWN_MISSING: dict[int, str] = {
    91589: "Tel: V = 6.8 (Hipparcos), fainter than the catalogue limit V ≤ 6.5",
}


def fetch(path: str) -> bytes:
    """A file of the culture at the pinned commit, cached in raw/figures/<commit>/."""
    local = RAW / PIN[:12] / path
    if not local.exists():
        local.parent.mkdir(parents=True, exist_ok=True)
        url = f"{RAW_URL}/{path}"
        resp = requests.get(url, timeout=120, headers={"User-Agent": "AsteriaDataPipeline/0.1"})
        resp.raise_for_status()
        local.write_bytes(resp.content)
    return local.read_bytes()


def license_section(description: str) -> tuple[str, str]:
    """(licence text, authors text) of description.md, whitespace folded."""
    sections: dict[str, list[str]] = {}
    current = ""
    for line in description.splitlines():
        if line.startswith("## "):
            current = line[3:].strip()
            sections[current] = []
        elif current:
            sections[current].append(line.strip())
    fold = lambda key: " ".join(" ".join(sections.get(key, [])).split())  # noqa: E731
    return fold("License"), fold("Authors")


def ink(img: Image.Image) -> Image.Image:
    """Greyscale cell: figure resized into CELL − 2·PAD px, normalised so that its 99th percentile
    of inked pixels is full ink (the sources are dim, max ~100–160, for additive blending)."""
    size = CELL - 2 * PAD
    grey = img.convert("L").resize((size, size), Image.Resampling.LANCZOS)
    a = np.asarray(grey, dtype=np.float32)
    inked = a[a > 8]
    top = float(np.percentile(inked, 99)) if inked.size else 255.0
    a = np.clip(a * (255.0 / max(top, 1.0)), 0, 255)
    cell = Image.new("L", (CELL, CELL), 0)
    cell.paste(Image.fromarray(a.round().astype(np.uint8)), (PAD, PAD))
    return cell


def triangle_area(p: list[tuple[float, float]]) -> float:
    (x0, y0), (x1, y1), (x2, y2) = p
    return abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2


def unit(ra: float, dec: float) -> np.ndarray:
    a, d = math.radians(ra), math.radians(dec)
    return np.array([math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)])


def tangent_fit(dirs: list[np.ndarray], uvs: list[tuple[float, float]]):
    """Mirror of figures.ts fitFigure: barycentre c, tangent basis (e1, e2), affine (u, v, 1) →
    gnomonic (x, y). Returns a function uv → unit vector and the gnomonic anchor triangle."""
    c = sum(dirs)
    c = c / np.linalg.norm(c)
    pole = np.array([0.0, 0.0, 1.0]) if abs(c[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    e1 = np.cross(pole, c)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(c, e1)
    xy = [(float(d @ e1 / (d @ c)), float(d @ e2 / (d @ c))) for d in dirs]
    m = np.array([[u, v, 1.0] for u, v in uvs])
    coef = np.linalg.solve(m, np.array(xy))  # 3×2

    def to_sky(u: float, v: float) -> np.ndarray:
        x, y = np.array([u, v, 1.0]) @ coef
        p = c + x * e1 + y * e2
        return p / np.linalg.norm(p)

    return c, to_sky, xy


def load_catalogue() -> dict[int, dict] | None:
    for folder in CATALOGUES:
        path = folder / "stars.bin"
        if path.exists():
            strings_path = folder / "star-strings.json"
            strings = json.loads(strings_path.read_text("utf-8")) if strings_path.exists() else {}
            print(f"· Star catalogue: {path.relative_to(ROOT.parent.parent)}")
            return {s["hip"]: s for s in decode_stars(path.read_bytes(), strings)}
    return None


def sky_checks(manifest: dict, stars: dict[int, dict]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    dropped: list[str] = []
    for fig in manifest["figures"]:
        hips = [a["hip"] for a in fig["anchors"]]
        missing = [h for h in hips if h not in stars]
        for h in missing:
            msg = f"{fig['con']}: anchor HIP {h} not in the star catalogue"
            if h in KNOWN_MISSING:
                print(f"  ! {msg} ({KNOWN_MISSING[h]}): figure not drawn")
                dropped.append(fig["con"])
            else:
                errors.append(msg)
        if missing:
            continue
        dirs = [unit(stars[h]["ra"], stars[h]["dec"]) for h in hips]
        uvs = [(a["u"], a["v"]) for a in fig["anchors"]]
        c, to_sky, xy = tangent_fit(dirs, uvs)
        if triangle_area(xy) < 1e-5:  # rad², ~0.03 deg²
            errors.append(f"{fig['con']}: anchor stars collinear on the sky")
        for d, (u, v) in zip(dirs, uvs):  # by construction: exact
            err = math.degrees(math.acos(min(1.0, float(to_sky(u, v) @ d)))) * 3600
            if err > 0.01:
                errors.append(f"{fig['con']}: anchor misplaced by {err:.3f}″")
        corners = [to_sky(u, v) for u in (0, 1) for v in (0, 1)]
        reach = max(math.degrees(math.acos(min(1.0, float(p @ c)))) for p in corners)
        if reach > MAX_CORNER_DEG:
            errors.append(f"{fig['con']}: image corner {reach:.1f}° from the barycentre")
    return errors, dropped


def main() -> int:
    errors: list[str] = []
    print(f"· Stellarium sky culture '{CULTURE}' at {REPOSITORY}@{PIN[:12]}…")
    description = fetch("description.md").decode("utf-8")
    licence, authors = license_section(description)
    if licence != EXPECTED_LICENSE or EXPECTED_AUTHOR not in authors:
        print(f"✗ licence statement changed: {licence!r} / {authors!r} — review it before use")
        return 1
    index = json.loads(fetch("index.json"))

    figures = []
    cells: list[Image.Image] = []
    for con in index["constellations"]:
        image = con.get("image")
        if not image:
            continue
        # Stellarium writes "Tra" for TrA: matched without case.
        raw_abbr = con.get("iau") or con["id"].split()[-1]
        abbr = next((c for c in CONSTELLATIONS if c.lower() == raw_abbr.lower()), raw_abbr)
        if abbr not in CONSTELLATIONS:
            errors.append(f"{con['id']}: unknown IAU abbreviation {abbr!r}")
        src = Image.open(io.BytesIO(fetch(image["file"])))
        w, h = image["size"]
        # Anchors are in the index's pixel frame (`size`); the file may be larger (And: 1024 px).
        if src.width * h != src.height * w:
            errors.append(f"{abbr}: image is {src.size}, index frame is {(w, h)}")
        anchors = image["anchors"]
        pts = [(a["pos"][0] / w, a["pos"][1] / h) for a in anchors]
        if len(anchors) != 3 or len({a["hip"] for a in anchors}) != 3:
            errors.append(f"{abbr}: needs 3 distinct anchor stars")
        if any(not (0 <= u <= 1 and 0 <= v <= 1) for u, v in pts):
            errors.append(f"{abbr}: anchor outside the image")
        if len(pts) == 3 and triangle_area(pts) < MIN_TRIANGLE:
            errors.append(f"{abbr}: anchors nearly collinear in the image")
        i = len(cells)
        x, y = (i % ATLAS_COLUMNS) * CELL + PAD, (i // ATLAS_COLUMNS) * CELL + PAD
        cells.append(ink(src))
        figures.append(
            {
                "con": abbr,
                "id": con["id"],
                "file": image["file"],
                "rect": [x, y, CELL - 2 * PAD, CELL - 2 * PAD],
                "anchors": [
                    {"hip": a["hip"], "u": round(u, 6), "v": round(v, 6)}
                    for a, (u, v) in zip(anchors, pts)
                ],
            }
        )

    rows = math.ceil(len(cells) / ATLAS_COLUMNS)
    atlas = Image.new("L", (ATLAS_COLUMNS * CELL, rows * CELL), 0)
    for i, cell in enumerate(cells):
        atlas.paste(cell, ((i % ATLAS_COLUMNS) * CELL, (i // ATLAS_COLUMNS) * CELL))
    buf = io.BytesIO()
    atlas.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
    atlas_bytes = buf.getvalue()

    manifest = {
        "format": "asteria-figure-set",
        "version": 1,
        "id": SET_ID,
        "name": "Stellarium western",
        "culture": "western",
        "era": "contemporary",
        "author": "Johan Meuris",
        "license": {"name": "FAL 1.3", "url": "https://artlibre.org/licence/lal/en/"},
        "dataLicense": {"name": "CC BY-SA 4.0", "url": "https://creativecommons.org/licenses/by-sa/4.0/"},
        "source": {
            "repository": f"https://github.com/{REPOSITORY}",
            "commit": PIN,
            "path": CULTURE,
            "url": f"https://github.com/{REPOSITORY}/tree/{PIN}/{CULTURE}",
        },
        "modifications": (
            f"Converted to greyscale, resized to {CELL - 2 * PAD} px, luminance normalised "
            "(99th percentile = full ink), packed into an atlas; drawn with 1-bit ordered "
            "dithering (Bayer 8x8) in the app's ink colour."
        ),
        "attribution": "Illustrations: Johan Meuris (Stellarium), Free Art License 1.3",
        "atlas": {"file": f"{SET_ID}.webp", "width": atlas.width, "height": atlas.height, "cell": CELL},
        "figures": figures,
    }
    manifest_bytes = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{SET_ID}.webp").write_bytes(atlas_bytes)
    (OUT / f"{SET_ID}.json").write_bytes(manifest_bytes)
    total = len(atlas_bytes) + len(manifest_bytes)
    for name, data in ((f"{SET_ID}.webp", atlas_bytes), (f"{SET_ID}.json", manifest_bytes)):
        print(f"  {name:26} {len(data):>9,} B  gzip {len(gzip.compress(data, 9)):>8,} B")
    print(f"  atlas {atlas.width}×{atlas.height} ({len(cells)} cells of {CELL} px), GPU R8 "
          f"{atlas.width * atlas.height / 1e6:.1f} MB (+1/3 with mipmaps)")
    if total > BUDGET:
        errors.append(f"atlas + manifest = {total:,} B > budget {BUDGET:,} B")

    stars = load_catalogue()
    if stars is None:
        print("  ! star catalogue absent (run build_stars.py): anchor checks on the sky skipped")
    else:
        sky_errors, dropped = sky_checks(manifest, stars)
        errors += sky_errors
        print(f"  {len(figures) - len(dropped)} figures anchored on catalogue stars, "
              f"{len(dropped)} not drawn ({', '.join(dropped) or '—'})")

    if errors:
        print("✗ " + "\n✗ ".join(errors))
        return 1
    print(f"✓ {len(figures)} figures ({SET_ID}), {total:,} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
