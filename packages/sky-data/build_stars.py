"""Build the naked-eye star catalogue and constellation lines for Asteria.

Sources (see docs/DATA_SOURCES.md):
  - Hipparcos main catalogue, ESA 1997 (CDS I/239)       : V mag, B-V, HD cross-id
  - Hipparcos new reduction, van Leeuwen 2007 (CDS I/311) : improved astrometry
  - Yale Bright Star Catalogue 5 (CDS V/50)               : HR number, Bayer/Flamsteed
  - IAU Catalog of Star Names (WGSN, IAU-CSN.txt)         : official proper names
  - Constellation membership: astropy get_constellation (Roman 1987, CDS VI/42)
  - Constellation lines: Stellarium "modern" sky culture (CC BY-SA 4.0), HIP numbers

Outputs (not versioned):
  out/stars.json               one record per star, V <= MAG_LIMIT
  out/stars.bin                same catalogue, compact binary (format ASTS v1, see star_binary.py)
  out/star-strings.json        names and Bayer designations keyed by HIP (string table of stars.bin)
  out/constellation-lines.json { "Ori": [[hip, hip, ...], ...], ... }
"""

from __future__ import annotations

import gzip
import json
import re
import sys
from pathlib import Path

import numpy as np
import requests
from astropy import units as u
from astropy.coordinates import SkyCoord, get_constellation
from astropy.table import vstack
from astroquery.vizier import Vizier

sys.path.insert(0, str(Path(__file__).parent))
from star_binary import check_round_trip, write_star_catalog  # noqa: E402

MAG_LIMIT = 6.5
ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "out"

IAU_CSN_URL = "https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt"
# Conventional figures (close to Sky & Telescope / IAU charts), e.g. Scorpius' head fanning from Antares.
STELLARIUM_LINES_URL = (
    "https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/index.json"
)

GREEK = {
    "Alp": "α", "Bet": "β", "Gam": "γ", "Del": "δ", "Eps": "ε", "Zet": "ζ", "Eta": "η",
    "The": "θ", "Iot": "ι", "Kap": "κ", "Lam": "λ", "Mu": "μ", "Nu": "ν", "Xi": "ξ",
    "Omi": "ο", "Pi": "π", "Rho": "ρ", "Sig": "σ", "Tau": "τ", "Ups": "υ", "Phi": "φ",
    "Chi": "χ", "Psi": "ψ", "Ome": "ω",
}  # fmt: skip


def cached(name: str, url: str) -> str:
    path = RAW / name
    if not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        path.write_text(resp.text, encoding="utf-8")
    return path.read_text(encoding="utf-8")


def vizier(catalog: str, columns: list[str], filters: dict[str, str] | None = None):
    v = Vizier(columns=columns, column_filters=filters or {}, row_limit=-1)
    return v.get_catalogs(catalog)[0]


def parse_bsc_name(name: str) -> tuple[int | None, str | None]:
    """'58Alp Ori' -> (58, 'α Ori'); 'Alp1Cen' -> (None, 'α¹ Cen')."""
    m = re.match(r"^\s*(\d+)?\s*([A-Z][a-z]{1,2})?(\d)?\s*([A-Z][A-Za-z]{2})\s*$", name or "")
    if not m:
        return None, None
    flam, greek, sup, con = m.groups()
    bayer = None
    if greek and greek in GREEK:
        bayer = GREEK[greek] + ("¹²³⁴⁵⁶⁷⁸⁹"[int(sup) - 1] if sup else "") + " " + con
    return (int(flam) if flam else None), bayer


def parse_iau_csn(text: str) -> dict[int, str]:
    """HIP -> official IAU proper name (with diacritics)."""
    lines = text.splitlines()
    header = next(line for line in lines if line.startswith("#Name/ASCII"))
    start_diacritics = header.index("Name/Diacritics")
    start_designation = header.index("Designation")
    names: dict[int, str] = {}
    for line in lines:
        if line.startswith(("#", "$")) or not line.strip():
            continue
        name = line[start_diacritics:start_designation].strip()
        # Columns end with: ... HIP HD RA Dec Date [Notes] → HIP is 4 fields before the date.
        fields = line[start_designation:].split()
        date_idx = next((i for i, f in enumerate(fields) if re.match(r"\d{4}-\d{2}-\d{2}$", f)), None)
        if date_idx is None:
            continue
        hip_field = fields[date_idx - 4]
        if hip_field.isdigit():
            names[int(hip_field)] = name
    return names


def load_lines() -> dict[str, list[list[int]]]:
    """Stellarium modern figures: {"Sco": [[hip, hip, ...], ...]} for the 88 constellations."""
    culture = json.loads(cached("stellarium-modern.json", STELLARIUM_LINES_URL))
    return {c["id"].split()[-1]: c["lines"] for c in culture["constellations"]}


def main() -> int:
    print("· Constellation lines (Stellarium modern)…")
    lines = load_lines()
    line_hips = {h for polys in lines.values() for poly in polys for h in poly}

    print("· Hipparcos I/239 (V, B-V, HD)…")
    main_cat = vizier(
        "I/239/hip_main",
        ["HIP", "Vmag", "B-V", "HD"],
        {"Vmag": f"<={MAG_LIMIT}"},
    )
    print(f"  {len(main_cat)} stars with V <= {MAG_LIMIT}")
    # Figures occasionally use a star fainter than the magnitude limit: fetch those too.
    extra = sorted(line_hips - {int(h) for h in main_cat["HIP"]})
    if extra:
        main_cat = vstack(
            [main_cat]
            + [vizier("I/239/hip_main", ["HIP", "Vmag", "B-V", "HD"], {"HIP": f"={h}"}) for h in extra]
        )
        print(f"  + {len(extra)} fainter stars used by constellation figures: {extra}")

    print("· Hipparcos new reduction I/311 (astrometry)…")
    hip2 = vizier(
        "I/311/hip2",
        ["HIP", "RArad", "DErad", "Plx", "e_Plx", "pmRA", "pmDE"],
        {"Hpmag": f"<={MAG_LIMIT + 1}"},
    )
    astrometry = {int(r["HIP"]): r for r in hip2}
    for h in extra:
        if h not in astrometry:
            row = vizier("I/311/hip2", ["HIP", "RArad", "DErad", "Plx", "e_Plx", "pmRA", "pmDE"], {"HIP": f"={h}"})
            astrometry[h] = row[0]
    # VizieR names these columns "RArad"/"DErad" but serves them in degrees: trust the unit.
    to_deg = (1 * hip2["RArad"].unit).to(u.deg).value

    print("· Yale BSC5 V/50 (HR, Bayer/Flamsteed)…")
    bsc = vizier("V/50/catalog", ["HR", "Name", "HD"])
    bsc_by_hd = {int(r["HD"]): r for r in bsc if not np.ma.is_masked(r["HD"])}

    print("· IAU WGSN names…")
    iau = parse_iau_csn(cached("IAU-CSN.txt", IAU_CSN_URL))
    print(f"  {len(iau)} names with a HIP number")

    stars = []
    for r in main_cat:
        hip = int(r["HIP"])
        a = astrometry.get(hip)
        if a is None:
            continue  # no new-reduction solution (a handful of stars)
        rec: dict = {
            "hip": hip,
            "ra": round(float(a["RArad"]) * to_deg, 6),
            "dec": round(float(a["DErad"]) * to_deg, 6),
            "v": round(float(r["Vmag"]), 2),
        }
        if not np.ma.is_masked(r["B-V"]):
            rec["bv"] = round(float(r["B-V"]), 3)
        for key, col in (("plx", "Plx"), ("ePlx", "e_Plx"), ("pmRa", "pmRA"), ("pmDec", "pmDE")):
            if not np.ma.is_masked(a[col]):
                rec[key] = round(float(a[col]), 3)
        if not np.ma.is_masked(r["HD"]):
            hd = int(r["HD"])
            rec["hd"] = hd
            b = bsc_by_hd.get(hd)
            if b is not None:
                rec["hr"] = int(b["HR"])
                flam, bayer = parse_bsc_name(str(b["Name"]))
                if flam:
                    rec["flamsteed"] = flam
                if bayer:
                    rec["bayer"] = bayer
        if hip in iau:
            rec["name"] = iau[hip]
        stars.append(rec)

    stars.sort(key=lambda s: s["v"])
    coords = SkyCoord(
        ra=[s["ra"] for s in stars] * u.deg, dec=[s["dec"] for s in stars] * u.deg, frame="icrs"
    )
    for s, con in zip(stars, get_constellation(coords, short_name=True)):
        s["con"] = str(con)

    known = {s["hip"] for s in stars}
    unmatched = sorted(line_hips - known)

    OUT.mkdir(exist_ok=True)
    (OUT / "stars.json").write_text(json.dumps(stars, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "constellation-lines.json").write_text(json.dumps(lines, separators=(",", ":")), encoding="utf-8")
    data, strings = write_star_catalog(stars, OUT)
    report_sizes()

    print(f"✓ {len(stars)} stars, {sum(1 for s in stars if 'name' in s)} named, "
          f"{len(lines)} constellations with lines, {len(unmatched)} line stars missing")
    errors = check_round_trip(stars, data, strings)
    return validate(stars, lines, unmatched, errors)


LEVEL1_FILES = ("stars.bin", "star-strings.json", "constellation-lines.json")
LEVEL1_BUDGET = 1_000_000  # bytes, uncompressed (DATA_SOURCES.md: level 1 < 1 MB)


def report_sizes() -> None:
    for name in ("stars.json", *LEVEL1_FILES):
        raw = (OUT / name).read_bytes()
        print(f"  {name:26} {len(raw):>9,} B  gzip {len(gzip.compress(raw, 9)):>8,} B")


# Control stars: values from SIMBAD / Hipparcos (V mag), IAU names.
CONTROLS = {
    32349: ("Sirius", -1.44, "CMa"),
    91262: ("Vega", 0.03, "Lyr"),
    27989: ("Betelgeuse", 0.45, "Ori"),
    11767: ("Polaris", 1.97, "UMi"),
    24436: ("Rigel", 0.18, "Ori"),
}


def validate(stars: list[dict], lines: dict, unmatched: list[int], errors: list[str]) -> int:
    by_hip = {s["hip"]: s for s in stars}
    if not 8000 <= len(stars) <= 10000:
        errors.append(f"unexpected star count {len(stars)}")
    if len({s["hip"] for s in stars}) != len(stars):
        errors.append("duplicate HIP numbers")
    for hip, (name, vmag, con) in CONTROLS.items():
        s = by_hip.get(hip)
        if not s:
            errors.append(f"missing control star {name}")
            continue
        if s.get("name") != name:
            errors.append(f"HIP {hip}: name {s.get('name')!r} != {name!r}")
        if abs(s["v"] - vmag) > 0.05:
            errors.append(f"{name}: V {s['v']} != {vmag}")
        if s["con"] != con:
            errors.append(f"{name}: constellation {s['con']} != {con}")
    orion = {h for poly in lines.get("Ori", []) for h in poly}
    if not {27989, 24436, 25336, 26727, 26311, 25930} <= orion:  # α β γ ζ ε δ Ori
        errors.append("Orion lines do not include its main stars")
    if any(by_hip[h]["con"] != "Ori" for h in orion if h in by_hip):
        errors.append("Orion lines reference stars outside Orion")
    if by_hip.get(32349, {}).get("bayer") != "α CMa":
        errors.append("Sirius Bayer designation not parsed")
    if len(lines) != 88:
        errors.append(f"{len(lines)} constellations with lines (expected 88)")
    if unmatched:
        errors.append(f"constellation figures use stars missing from the catalogue: {unmatched}")
    # Conventional Scorpius: the three head stars (β, δ, π) each joined to Antares (α).
    sco_edges = {frozenset(e) for poly in lines.get("Sco", []) for e in zip(poly, poly[1:])}
    for head in (78820, 78401, 78265):  # β, δ, π Sco
        if frozenset((80763, head)) not in sco_edges:  # 80763 = Antares
            errors.append(f"Scorpius head star HIP {head} is not joined to Antares")
    level1 = sum((OUT / name).stat().st_size for name in LEVEL1_FILES)
    if level1 >= LEVEL1_BUDGET:
        errors.append(f"level 1 files weigh {level1:,} B (budget {LEVEL1_BUDGET:,} B)")
    for e in errors:
        print("✗", e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
