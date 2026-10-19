"""Build the Milky Way texture of the sky map from Tycho-2 star counts (#162).

Source (see docs/DATA_SOURCES.md):
  AT-HYG v3.2, David Nash (astronexus), https://github.com/astronexus/ATHYG-Database, pinned to
  commit ATHYG_COMMIT, subset data/subsets/athyg_32_reduced_m11.csv.gz: the 871,139 AT-HYG stars
  to V (Hipparcos, Gliese) or VT (Tycho-2) magnitude 11.0, positions J2000 (ICRS). Licence
  CC BY-SA 4.0 for versions >= 3.0 (LICENSE and README.md of the repository at that commit). The
  size and SHA-256 of the file are checked, so a changed upstream file fails the build.
  The derived texture is distributed under CC BY-SA 4.0 with the attribution of the Crédits page.

Why star counts: the Milky Way seen by the naked eye is the light of billions of faint stars,
dimmed by dust. Counting the stars of Tycho-2 between magnitudes MAG_MIN and MAG_MAX traces the
same thing at a coarser scale: the counts rise towards the galactic plane, and the dark clouds
(Great Rift of Cygnus–Aquila, Ophiuchus, Taurus) empty them. Brighter stars are left out: they
are near the Sun and spread over the whole sky.

Processing:
  1. keep the stars with MAG_MIN <= mag < MAG_MAX (the Sun's row and empty magnitudes skipped);
  2. count them on an equirectangular grid in J2000 equatorial coordinates, WIDTH x HEIGHT cells:
     column i covers RA [360 i / W, 360 (i + 1) / W) (RA increasing with x, no mirror), row j
     covers Dec [90 - 180 j / H, 90 - 180 (j + 1) / H) (north at the top);
  3. smooth on the sphere with a Gaussian of SIGMA_DEG in true angular distance. For two rows of
     the grid the angular distance between cells only depends on their RA difference
     (cos θ = sin δ sin δ' + cos δ cos δ' cos Δα), so the contribution of each row j' to each row j
     is an exact circular convolution along RA (done by FFT): no seam at RA 0/360 and no
     distortion near the poles, where a ring of cells is a few arcminutes across. The same
     convolution applied to the cells' solid angles gives the normalisation, so the result is a
     density in stars per steradian, exact even where the kernel is cut by the pole;
  4. log10 of the density; the "floor" is the FLOOR_PERCENTILE of that log over the high galactic
     latitudes (|b| > FLOOR_LAT: the counting noise there stays under it) and the "top" its
     PEAK_PERCENTILE over the whole sky; the texture is
     (log density - floor) / (top - floor), clipped to [0, 1], so the sky away from the band fades
     to zero;
  5. written as an 8-bit greyscale WebP (lossy, quality WEBP_QUALITY: smooth data), sampled by
     the map with bilinear filtering, RA wrapped (see sky-renderer/src/milky-way.ts).

Controls (the script exits 1 otherwise): number of stars kept; mean density at |b| < 5° at least
PLANE_CONTRAST times that at |b| > 60°; the texture near the galactic centre (within 15°, the
Sagittarius star clouds) in the top quarter of the sky; the north and south galactic poles at
zero; the Great Rift (l = 30–50°, b ≈ 0) darker than the band beside it; output under BUDGET.

Output (not versioned, synced into apps/web/public/data by tools/sync-data.mjs):
  out/milkyway.webp

Usage: python -I build_milkyway.py   (downloads into raw/athyg-<commit>/; numpy + pillow only)
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"

ATHYG_COMMIT = "e7ee3a737a17d84530e0012b77492f412e0e02c0"  # main, 2024-08-17 (v3.2)
ATHYG_FILE = "data/subsets/athyg_32_reduced_m11.csv.gz"
ATHYG_URL = f"https://raw.githubusercontent.com/astronexus/ATHYG-Database/{ATHYG_COMMIT}/{ATHYG_FILE}"
ATHYG_SIZE = 70_833_346
ATHYG_SHA256 = "088019536303efe73f7710d65633a7b658aa2ac5bfd2506e7e0e9bc65ce9e786"
RAW = ROOT / "raw" / f"athyg-{ATHYG_COMMIT[:12]}"

MAG_MIN = 9.0
MAG_MAX = 11.0
WIDTH = 1024
HEIGHT = 512
SIGMA_DEG = 1.0
FLOOR_LAT = 60.0
FLOOR_PERCENTILE = 90.0
PEAK_PERCENTILE = 99.7
WEBP_QUALITY = 82
BUDGET = 100_000
PLANE_CONTRAST = 3.0

# ICRS (J2000) -> galactic rotation (ESA 1997, The Hipparcos and Tycho Catalogues, vol. 1,
# §1.5.3, matrix A_G transposed): rows are the galactic x (centre), y (l = 90°), z (north pole).
TO_GALACTIC = np.array(
    [
        [-0.0548755604, -0.8734370902, -0.4838350155],
        [+0.4941094279, -0.4448296300, +0.7469822445],
        [-0.8676661490, -0.1980763734, +0.4559837762],
    ]
)


def fail(message: str) -> None:
    print(f"FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def download() -> bytes:
    """The AT-HYG subset, downloaded once into its own directory, size- and hash-checked."""
    path = RAW / Path(ATHYG_FILE).name
    if not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        with urllib.request.urlopen(ATHYG_URL, timeout=600) as resp, open(tmp, "wb") as f:
            while chunk := resp.read(1 << 20):
                f.write(chunk)
        tmp.rename(path)
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if len(data) != ATHYG_SIZE or digest != ATHYG_SHA256:
        fail(f"{path}: {len(data)} bytes, SHA-256 {digest} (expected {ATHYG_SIZE}, {ATHYG_SHA256})")
    return data


def read_stars(data: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """RA (degrees), Dec (degrees) and magnitude of every row with a magnitude."""
    ra, dec, mag = [], [], []
    with gzip.open(io.BytesIO(data), "rt", encoding="utf-8", newline="") as f:
        rows = csv.reader(f)
        header = next(rows)
        i_ra, i_dec, i_mag = header.index("ra"), header.index("dec"), header.index("mag")
        for row in rows:
            try:
                m = float(row[i_mag])
                r = float(row[i_ra]) * 15.0  # hours -> degrees
                d = float(row[i_dec])
            except (ValueError, IndexError):
                continue
            ra.append(r)
            dec.append(d)
            mag.append(m)
    return np.array(ra), np.array(dec), np.array(mag)


def unit(ra_deg: np.ndarray, dec_deg: np.ndarray) -> np.ndarray:
    a, d = np.radians(ra_deg), np.radians(dec_deg)
    return np.stack([np.cos(d) * np.cos(a), np.cos(d) * np.sin(a), np.sin(d)], axis=-1)


def galactic_latitude(ra_deg: np.ndarray, dec_deg: np.ndarray) -> np.ndarray:
    g = unit(ra_deg, dec_deg) @ TO_GALACTIC.T
    return np.degrees(np.arcsin(np.clip(g[..., 2], -1, 1)))


def galactic_to_equatorial(l_deg: float, b_deg: float) -> tuple[float, float]:
    l, b = np.radians(l_deg), np.radians(b_deg)
    g = np.array([np.cos(b) * np.cos(l), np.cos(b) * np.sin(l), np.sin(b)])
    v = TO_GALACTIC.T @ g
    return float(np.degrees(np.arctan2(v[1], v[0])) % 360), float(np.degrees(np.arcsin(v[2])))


def grid_centres() -> tuple[np.ndarray, np.ndarray]:
    ra = (np.arange(WIDTH) + 0.5) * 360.0 / WIDTH
    dec = 90.0 - (np.arange(HEIGHT) + 0.5) * 180.0 / HEIGHT
    return ra, dec


def count(ra: np.ndarray, dec: np.ndarray) -> np.ndarray:
    x = np.floor(ra % 360.0 / 360.0 * WIDTH).astype(int) % WIDTH
    y = np.clip(np.floor((90.0 - dec) / 180.0 * HEIGHT).astype(int), 0, HEIGHT - 1)
    counts = np.zeros((HEIGHT, WIDTH))
    np.add.at(counts, (y, x), 1.0)
    return counts


def smooth_density(counts: np.ndarray) -> np.ndarray:
    """Gaussian smoothing on the sphere (true angular distance), in stars per steradian."""
    _, dec = grid_centres()
    d = np.radians(dec)
    dra = 2 * np.pi / WIDTH
    # Solid angle of each row's cells: Δα (sin δ_top − sin δ_bottom).
    edges = np.radians(90.0 - np.arange(HEIGHT + 1) * 180.0 / HEIGHT)
    omega = dra * (np.sin(edges[:-1]) - np.sin(edges[1:]))
    sigma = np.radians(SIGMA_DEG)
    reach = int(np.ceil(4 * SIGMA_DEG / (180.0 / HEIGHT)))  # rows within 4 σ in Dec
    # RA offsets of the cells (circular), for the kernel rows.
    offsets = np.arange(WIDTH)
    offsets = np.minimum(offsets, WIDTH - offsets) * dra
    cos_off = np.cos(offsets)
    count_ft = np.fft.rfft(counts, axis=1)
    out = np.zeros_like(counts)
    for j in range(HEIGHT):
        num = np.zeros(WIDTH // 2 + 1, dtype=complex)
        den = 0.0
        for k in range(max(0, j - reach), min(HEIGHT, j + reach + 1)):
            cos_t = np.sin(d[j]) * np.sin(d[k]) + np.cos(d[j]) * np.cos(d[k]) * cos_off
            theta = np.arccos(np.clip(cos_t, -1.0, 1.0))
            kernel = np.exp(-0.5 * (theta / sigma) ** 2)
            num += count_ft[k] * np.fft.rfft(kernel)
            den += omega[k] * kernel.sum()  # uniform rows: the convolution is a plain sum
        out[j] = np.fft.irfft(num, n=WIDTH) / den
    return np.maximum(out, 0.0)


def main() -> None:
    ra, dec, mag = read_stars(download())
    keep = (mag >= MAG_MIN) & (mag < MAG_MAX)
    n = int(keep.sum())
    print(f"AT-HYG rows with a magnitude: {len(mag)}; kept {MAG_MIN} <= mag < {MAG_MAX}: {n}")
    if not 500_000 <= n <= 800_000:
        fail(f"{n} stars kept, expected 500,000 to 800,000")

    density = smooth_density(count(ra[keep], dec[keep]))
    gra, gdec = grid_centres()
    RA, DEC = np.meshgrid(gra, gdec)
    b = galactic_latitude(RA, DEC)

    # Controls on the density itself (stars per square degree, area-weighted means).
    w = np.cos(np.radians(DEC))
    per_deg2 = density * (np.pi / 180) ** 2
    plane = np.average(per_deg2[np.abs(b) < 5], weights=w[np.abs(b) < 5])
    high = np.average(per_deg2[np.abs(b) > 60], weights=w[np.abs(b) > 60])
    print(f"mean density: |b| < 5°: {plane:.1f} /deg², |b| > 60°: {high:.1f} /deg²")
    if plane < PLANE_CONTRAST * high:
        fail(f"galactic plane only {plane / high:.2f} times denser than |b| > 60°")

    log = np.log10(np.maximum(density, 1.0))
    floor = float(np.percentile(log[np.abs(b) > FLOOR_LAT], FLOOR_PERCENTILE))
    top = float(np.percentile(log, PEAK_PERCENTILE))
    tex = np.clip((log - floor) / (top - floor), 0.0, 1.0)
    img = np.round(tex * 255).astype(np.uint8)

    def at(ra_deg: float, dec_deg: float) -> float:
        x = int(ra_deg % 360 / 360 * WIDTH) % WIDTH
        y = min(HEIGHT - 1, int((90 - dec_deg) / 180 * HEIGHT))
        return float(tex[y, x])

    def disc_mean(ra_deg: float, dec_deg: float, radius: float) -> float:
        c = unit(np.array(ra_deg), np.array(dec_deg))
        near = unit(RA, DEC) @ c > np.cos(np.radians(radius))
        return float(np.average(tex[near], weights=w[near]))

    sky = np.sort(tex.ravel())
    q = lambda v: float(np.searchsorted(sky, v) / sky.size)  # noqa: E731 (quantile of a value)
    gc = disc_mean(266.405, -28.936, 15)
    print(f"galactic centre (15° disc mean) {gc:.2f}, quantile {q(gc):.3f}")
    if q(gc) < 0.75:
        fail("the galactic centre region is not among the densest quarter of the sky")
    ngp, sgp = at(192.859, 27.128), at(12.859, -27.128)
    print(f"north / south galactic poles: {ngp:.3f} / {sgp:.3f}")
    if ngp > 0.05 or sgp > 0.05:
        fail("the galactic poles are not at the floor")
    rift = np.mean([at(*galactic_to_equatorial(l, 0.0)) for l in (35, 40, 45)])
    beside = np.mean([at(*galactic_to_equatorial(l, -6.0)) for l in (35, 40, 45)])
    print(f"Great Rift (l 35–45°, b 0): {rift:.2f}; band beside it (b −6°): {beside:.2f}")
    if rift >= beside:
        fail("the Great Rift is not darker than the band beside it")

    OUT.mkdir(exist_ok=True)
    path = OUT / "milkyway.webp"
    Image.fromarray(img, mode="L").save(path, "WEBP", quality=WEBP_QUALITY, method=6)
    size = path.stat().st_size
    print(f"{path.relative_to(ROOT)}: {WIDTH}x{HEIGHT}, {size} bytes")
    if size > BUDGET:
        fail(f"{path.name} is {size} bytes (budget {BUDGET})")


if __name__ == "__main__":
    main()
