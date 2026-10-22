"""Build the IAU constellation boundaries for Asteria (#184, game « Où est-elle ? »).

Source (see docs/DATA_SOURCES.md):
  - d3-celestial, Olaf Frohn (https://github.com/ofrohn/d3-celestial), pinned to a commit:
    data/constellations.bounds.json, GeoJSON polygons of the 88 constellations (Serpens in two
    parts), converted by d3-celestial from the Catalogue of Constellation Boundary Data of
    A. C. Davenhall & S. K. Leggett (1989, CDS VI/49), itself a transcription of the boundaries
    drawn by E. Delporte for the IAU (1930). Licence BSD-3-Clause (LICENSE of the repository,
    checked below and copied into the output, as the licence requires). The SHA-256 of both files
    is checked, so a changed upstream file fails the build.

Method:
  1. d3-celestial gives the vertices at the equinox J2000 (precessed by Davenhall & Leggett from
     the B1875 definition). The boundaries are defined at B1875: arcs of constant right ascension
     and of constant declination of the equator of 1875. Each vertex is taken back to B1875
     (astropy FK4 without E-terms, equinox and epoch B1875) and rounded to the nearest second of
     time in RA and arcsecond in declination, the precision of Delporte's values. Largest residual
     before rounding: 0.07 s and 0.21″ (controlled below: 0.15 s, 0.4″), so the rounding recovers
     the definition exactly.
  2. d3-celestial added three points on the Cepheus / Ursa Minor boundary near the pole (an arc
     of the parallel +88° from 23 h to 8 h, which a straight GeoJSON edge cannot follow). They
     are not on the B1875 grid and no edge through them follows a meridian or a parallel: such
     points are removed, which restores the 9-hour arc of the parallel.
  3. Controls (exit 1 on failure): 88 constellations, Serpens in two rings; every edge follows a
     meridian (same RA) or a parallel (same declination), parallel arcs shorter than 12 h (taken
     the short way round); exactly two rings go round a pole: Ursa Minor (north celestial pole)
     and Octans (south); every point of a 40 000-point grid of the sphere falls in exactly one
     constellation, and in the one astropy's get_constellation gives (Roman 1987, CDS VI/42, the
     IAU table used for the star catalogue's `con`) for at least 99.9 % of them. Measured:
     39 987 / 40 000; the 13 others lie within 20″ of a boundary: get_constellation precesses
     through astropy's PrecessedGeocentric frame, which keeps the annual aberration of the GCRS
     (up to 20.5″), whereas the boundaries are mean (catalogue) positions.

Output (versioned, ≈ 20 kB: the game needs it offline and the tests read it):
  ../astro-core/src/data/constellation-bounds.json   format "asteria-constellation-bounds" v1:
    {"format", "version", "equinox": "B1875", "units": {...}, "source", "license", "notice",
     "northPole": "UMi", "bounds": {"And": [[ra, dec, ra, dec, …]], …, "Ser": [[…], […]]}}
  ra in seconds of time (0 ≤ ra < 86 400), dec in arcseconds, integers; one array per ring,
  vertices in order, not closed (the last vertex joins the first). Read by
  `packages/astro-core/src/constellation-bounds.ts`.

Usage: python -I build_bounds.py   (downloads into raw/d3-celestial-<commit>/)
"""

from __future__ import annotations

import gzip
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import requests
from astropy import units as u
from astropy.coordinates import FK4NoETerms, FK5, SkyCoord, get_constellation
from astropy.time import Time

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "astro-core" / "src" / "data" / "constellation-bounds.json"

D3_COMMIT = "7e720a3de062059d4c5400a379146a601d9010e0"  # master, 2022-07-05
D3_URL = f"https://raw.githubusercontent.com/ofrohn/d3-celestial/{D3_COMMIT}/"
D3_FILES = {
    "data/constellations.bounds.json": "f2e2687af6b20b24567879f838c21874d412efcc93ecc1966be07e78431cc196",
    "LICENSE": "a8c79239001ad4bea243d1796b85084e1fc39309c5c5a663930a1b46320254c6",
}
RAW = ROOT / "raw" / f"d3-celestial-{D3_COMMIT[:12]}"
LICENSE_MARKERS = (
    "Copyright (c) 2015, Olaf Frohn",
    "Redistribution and use in source and binary forms, with or without modification, are permitted",
    "Neither the name of the copyright holder nor the names of its contributors",
)

SOURCE = (
    "IAU constellation boundaries (E. Delporte 1930), Catalogue of Constellation Boundary Data, "
    "A. C. Davenhall & S. K. Leggett 1989 (CDS VI/49), via d3-celestial (O. Frohn), "
    f"data/constellations.bounds.json @ {D3_COMMIT[:12]}; vertices returned to B1875"
)
B1875 = Time("B1875", format="byear_str")
DAY_S = 86_400
HALF_DAY_S = 43_200
# Rounding residuals accepted for a vertex of the definition (seconds of time, arcseconds).
MAX_RA_RESIDUAL_S = 0.15
MAX_DEC_RESIDUAL_AS = 0.4
GRID_POINTS = 40_000
MIN_AGREEMENT = 0.999
SIZE_BUDGET = 40_000  # bytes, raw


def download() -> dict[str, bytes]:
    """The pinned files, downloaded once into their own directory and hash-checked."""
    files = {}
    for name, sha in D3_FILES.items():
        path = RAW / name
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            resp = requests.get(D3_URL + name, timeout=120)
            resp.raise_for_status()
            path.write_bytes(resp.content)
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != sha:
            raise ValueError(f"{path}: SHA-256 {digest} != {sha} (delete it and run again)")
        files[name] = data
    return files


def rings_of(geojson: dict) -> list[tuple[str, list[list[float]]]]:
    """(abbreviation, ring of [lon, lat] J2000 degrees) for every outer ring of the file."""
    out = []
    for f in geojson["features"]:
        g = f["geometry"]
        polygons = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for polygon in polygons:
            if len(polygon) != 1:
                raise ValueError(f"{f['id']}: polygon with holes")
            out.append((f["id"], polygon[0]))
    return out


def to_b1875(ring: list[list[float]]) -> tuple[np.ndarray, np.ndarray]:
    """J2000 vertices → B1875 RA (seconds of time) and declination (arcseconds), unrounded."""
    a = np.array(ring, dtype=float)
    c = SkyCoord((a[:, 0] % 360) * u.deg, a[:, 1] * u.deg, frame=FK5(equinox="J2000"))
    b = c.transform_to(FK4NoETerms(equinox=B1875, obstime=B1875))
    return b.ra.deg * 240.0, b.dec.deg * 3600.0


def aligned(p: tuple[int, int], q: tuple[int, int]) -> bool:
    return p[0] == q[0] or p[1] == q[1]


def ra_step(a: int, b: int) -> int:
    """Signed RA step from a to b the short way round (seconds of time)."""
    return (b - a + HALF_DAY_S) % DAY_S - HALF_DAY_S


def clean_ring(abbr: str, ra: np.ndarray, dec: np.ndarray, errors: list[str]) -> list[tuple[int, int]]:
    """Rounded B1875 vertices; interpolation points of d3-celestial removed (see the header)."""
    pts = [(int(round(r)) % DAY_S, int(round(d))) for r, d in zip(ra, dec)]
    residual = [(abs(r - round(r)), abs(d - round(d))) for r, d in zip(ra, dec)]
    if pts[0] == pts[-1]:
        pts, residual = pts[:-1], residual[:-1]
    # Points with no meridian or parallel edge through them are not boundary vertices.
    removed = []
    changed = True
    while changed:
        changed = False
        n = len(pts)
        for i in range(n):
            if not aligned(pts[i - 1], pts[i]) and not aligned(pts[i], pts[(i + 1) % n]):
                removed.append(pts[i])
                del pts[i]
                del residual[i]
                changed = True
                break
    for p in removed:
        if abs(p[1]) < 85 * 3600:
            errors.append(f"{abbr}: removed vertex {p} is not near a pole")
    for p, (rr, dr) in zip(pts, residual):
        if rr > MAX_RA_RESIDUAL_S or dr > MAX_DEC_RESIDUAL_AS:
            errors.append(f"{abbr}: vertex {p} off the B1875 grid by {rr:.3f} s, {dr:.2f}″")
    # Consecutive duplicates (none expected, harmless).
    pts = [p for i, p in enumerate(pts) if p != pts[i - 1]]
    if removed:
        print(f"  {abbr}: removed {len(removed)} interpolated point(s) near the pole")
    return pts


def winding(ring: list[tuple[int, int]]) -> int:
    """Sum of the RA steps of the parallel edges (seconds of time): ±86 400 around a pole."""
    n = len(ring)
    return sum(ra_step(ring[i][0], ring[(i + 1) % n][0]) for i in range(n) if ring[i][1] == ring[(i + 1) % n][1])


def ring_contains(ring: list[tuple[int, int]], north: bool, ra: np.ndarray, dec: np.ndarray) -> np.ndarray:
    """Same test as astro-core's ringContains (vectorised): a ray along the meridian of each
    point up to the north pole crosses the ring's parallel edges above it; the parity, flipped
    for the ring holding the north pole, says inside."""
    inside = np.full(ra.shape, north)
    n = len(ring)
    for i in range(n):
        (a0, d0), (a1, d1) = ring[i], ring[(i + 1) % n]
        if d0 != d1:
            continue
        step = ra_step(a0, a1)
        lo, span = (a0, step) if step > 0 else (a1, -step)
        crosses = (dec < d0) & (np.mod(ra - lo, DAY_S) < span)
        inside ^= crosses
    return inside


def fibonacci_sphere(n: int) -> tuple[np.ndarray, np.ndarray]:
    """n nearly uniform points of the sphere (RA, Dec degrees)."""
    i = np.arange(n) + 0.5
    dec = np.degrees(np.arcsin(1 - 2 * i / n))
    ra = np.degrees(np.pi * (1 + 5**0.5) * i) % 360
    return ra, dec


def main() -> int:
    files = download()
    license_text = files["LICENSE"].decode("utf-8")
    errors: list[str] = []
    for marker in LICENSE_MARKERS:
        if marker not in license_text:
            errors.append(f"LICENSE: missing « {marker} » (licence changed? check it)")
    geojson = json.loads(files["data/constellations.bounds.json"].decode("utf-8"))

    bounds: dict[str, list[list[tuple[int, int]]]] = {}
    for abbr, ring in rings_of(geojson):
        ra, dec = to_b1875(ring)
        bounds.setdefault(abbr, []).append(clean_ring(abbr, ra, dec, errors))

    if len(bounds) != 88:
        errors.append(f"{len(bounds)} constellations, expected 88")
    for abbr, rings in bounds.items():
        if len(rings) != (2 if abbr == "Ser" else 1):
            errors.append(f"{abbr}: {len(rings)} rings")
        for ring in rings:
            n = len(ring)
            if n < 4:
                errors.append(f"{abbr}: ring of {n} vertices")
            for i in range(n):
                p, q = ring[i], ring[(i + 1) % n]
                if not aligned(p, q):
                    errors.append(f"{abbr}: edge {p} → {q} follows neither a meridian nor a parallel")
                if p[1] == q[1] and abs(ra_step(p[0], q[0])) >= HALF_DAY_S:
                    errors.append(f"{abbr}: parallel arc {p} → {q} of 12 h or more")
    polar = sorted(abbr for abbr, rings in bounds.items() for r in rings if winding(r) != 0)
    if polar != ["Oct", "UMi"]:
        errors.append(f"rings around a pole: {polar}, expected Oct and UMi")
    north = "UMi"

    # Grid control against astropy (Roman 1987).
    if not errors:
        ra, dec = fibonacci_sphere(GRID_POINTS)
        grid = SkyCoord(ra * u.deg, dec * u.deg, frame="icrs")
        expected = get_constellation(grid, short_name=True)
        b = grid.transform_to(FK4NoETerms(equinox=B1875, obstime=B1875))
        bra, bdec = b.ra.deg * 240.0, b.dec.deg * 3600.0
        hits = {
            abbr: np.logical_or.reduce([ring_contains(r, abbr == north, bra, bdec) for r in rings])
            for abbr, rings in bounds.items()
        }
        names = np.array(sorted(hits))
        matrix = np.array([hits[a] for a in names])
        count = matrix.sum(axis=0)
        for k in np.flatnonzero(count != 1):
            errors.append(f"grid point RA {ra[k]:.4f} Dec {dec[k]:.4f}: in {count[k]} constellations")
        found = names[matrix.argmax(axis=0)]
        same = found == np.asarray(expected)
        agree = int(same.sum())
        mismatches = [(ra[k], dec[k], found[k], expected[k]) for k in np.flatnonzero(~same)]
        rate = agree / GRID_POINTS
        print(f"  grid: {agree}/{GRID_POINTS} agree with astropy get_constellation ({rate:.5%})")
        for m in mismatches[:10]:
            print("   differs:", m)
        if rate < MIN_AGREEMENT:
            errors.append(f"grid agreement {rate:.4%} < {MIN_AGREEMENT:.1%}")

    out = {
        "format": "asteria-constellation-bounds",
        "version": 1,
        "equinox": "B1875",
        "units": {"ra": "seconds of time", "dec": "arcseconds"},
        "source": SOURCE,
        "license": "BSD-3-Clause (d3-celestial); boundary data: Davenhall & Leggett 1989, CDS VI/49",
        "notice": license_text.strip(),
        "northPole": north,
        "bounds": {
            abbr: [[c for p in ring for c in p] for ring in bounds[abbr]] for abbr in sorted(bounds)
        },
    }
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n"
    size = len(text.encode("utf-8"))
    if size > SIZE_BUDGET:
        errors.append(f"output {size} bytes > {SIZE_BUDGET}")
    if errors:
        for e in errors:
            print("ERROR:", e, file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    vertices = sum(len(r) for rings in bounds.values() for r in rings)
    gz = len(gzip.compress(text.encode("utf-8"), 9))
    print(f"Wrote {OUT} ({vertices} vertices, {size} bytes, {gz} bytes gzip -9)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
