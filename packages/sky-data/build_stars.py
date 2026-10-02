"""Build the naked-eye star catalogue and constellation lines for Asteria.

Sources (see docs/DATA_SOURCES.md):
  - Hipparcos main catalogue, ESA 1997 (CDS I/239)       : V mag, B-V, HD cross-id
  - Hipparcos new reduction, van Leeuwen 2007 (CDS I/311) : improved astrometry
  - Yale Bright Star Catalogue 5 (CDS V/50)               : HR number, Bayer/Flamsteed
  - IAU Catalog of Star Names (WGSN, IAU-CSN.txt)         : official proper names
  - Gaia DR3 (ESA archive, gaia_source x hipparcos2_best_neighbour): parallax (distances, #75),
    radial velocity (#79)
  - Yale BSC5 RadVel                                      : radial velocity when Gaia has none
  - Published distances (LITERATURE_DISTANCES below)      : stars whose parallax is unreliable
  - Constellation membership: astropy get_constellation (Roman 1987, CDS VI/42)
  - Constellation lines: Stellarium "modern" sky culture (CC BY-SA 4.0), HIP numbers

Outputs (not versioned):
  out/stars.json               one record per star, V <= MAG_LIMIT
  out/stars.bin                same catalogue, compact binary (format ASTS v2, see star_binary.py)
  out/star-strings.json        names, Bayer designations, distance references keyed by HIP
  out/constellation-lines.json { "Ori": [[hip, hip, ...], ...], ... }
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import unicodedata
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
        # Decode the bytes as UTF-8 ourselves: the WGSN server sends "text/plain" without a
        # charset, so `resp.text` falls back to Latin-1 ("BÃ©lÃ©nos") and shifts the fixed-width
        # columns of IAU-CSN.txt (#67).
        path.write_text(resp.content.decode("utf-8"), encoding="utf-8")
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


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def parse_iau_csn(text: str) -> dict[int, str]:
    """HIP -> official IAU proper name (with diacritics)."""
    if "Ã" in text:  # UTF-8 read as Latin-1 (cache written before #75): columns are shifted
        raise ValueError("raw/IAU-CSN.txt is mojibake: delete it and run again")
    lines = text.splitlines()
    header = next(line for line in lines if line.startswith("#Name/ASCII"))
    start_diacritics = header.index("Name/Diacritics")
    start_designation = header.index("Designation")
    names: dict[int, str] = {}
    for line in lines:
        if line.startswith(("#", "$")) or not line.strip():
            continue
        name = line[start_diacritics:start_designation].strip()
        ascii_name = line[:start_diacritics].strip()
        if strip_accents(name) != ascii_name:  # fixed-width columns misread (#75)
            raise ValueError(f"IAU-CSN: {name!r} is not the accented form of {ascii_name!r}")
        # Columns end with: ... HIP HD RA Dec Date [Notes] → HIP is 4 fields before the date.
        fields = line[start_designation:].split()
        date_idx = next((i for i, f in enumerate(fields) if re.match(r"\d{4}-\d{2}-\d{2}$", f)), None)
        if date_idx is None:
            continue
        hip_field = fields[date_idx - 4]
        if hip_field.isdigit():
            names[int(hip_field)] = name
    return names


LY_PER_PC = 3.261563777  # IAU 2015: 1 pc = 648000/π au, 1 ly = c × 365.25 d
GAIA_G_MIN = 6.0  # brighter: saturated, outside the parallax zero-point calibration (L21: 6 < G < 21)
GAIA_RUWE_MAX = 1.4  # Lindegren et al. 2021: above, the single-star astrometric solution is poor
GAIA_CACHE = "gaia-dr3-hip.ecsv"
GAIA_QUERY = """
SELECT n.original_ext_source_id AS hip, g.source_id, g.phot_g_mean_mag, g.parallax,
       g.parallax_error, g.ruwe, g.astrometric_params_solved, g.nu_eff_used_in_astrometry,
       g.pseudocolour, g.ecl_lat, g.radial_velocity, g.radial_velocity_error
FROM gaiadr3.hipparcos2_best_neighbour AS n
JOIN gaiadr3.gaia_source AS g ON g.source_id = n.source_id
WHERE g.phot_g_mean_mag < 9
"""

# Published distances for bright stars whose parallax is biased or imprecise (σϖ/ϖ > 0.1 in
# Hipparcos 2007, too bright for Gaia). Each value is transcribed from the cited paper (ADS
# bibcode) and checked by the pipeline (CONTROL_DISTANCES); keep this list short and justified.
# HIP: (distance, minus error, plus error in pc, citation shown in the app, bibcode, method)
LITERATURE_DISTANCES: dict[int, tuple[float, float, float, str, str, str]] = {
    # Deneb: Hipparcos 2.31 ± 0.32 mas (1 400 ly) is too large a parallax for an A2 Ia supergiant;
    # Table 2 of the paper adopts the distance of its OB association Cyg OB7.
    102098: (802, 66, 66, "Schiller & Przybilla 2008, A&A 479, 849", "2008A&A...479..849S",
             "Cyg OB7 association membership"),
    # Betelgeuse: photocentre motion (giant convective cells) biases its parallax; independent
    # distance from evolutionary + asteroseismic + hydrodynamic modelling (abstract: 168 +27/−15 pc).
    27989: (168, 15, 27, "Joyce et al. 2020, ApJ 902, 63", "2020ApJ...902...63J",
            "evolutionary, asteroseismic and hydrodynamic modelling"),
}  # fmt: skip


def load_gaia() -> dict[int, dict]:
    """Gaia DR3 sources matched to Hipparcos (best neighbour), G < 9, cached in raw/."""
    from astropy.table import Table

    path = RAW / GAIA_CACHE
    if not path.exists():
        from astroquery.gaia import Gaia

        RAW.mkdir(parents=True, exist_ok=True)
        Gaia.launch_job_async(GAIA_QUERY).get_results().write(path, format="ascii.ecsv")
    from zero_point import zpt

    zpt.load_tables()  # Lindegren et al. 2021 parallax zero-point
    return {int(r["hip"]): r for r in Table.read(path, format="ascii.ecsv")}


# Colour ranges of the zero-point calibration (L21): outside, the correction "can be seriously
# wrong" (zero_point package), so the Gaia parallax is not used.
NU_EFF_RANGE = (1.1, 1.9)  # 5-parameter solutions, nu_eff_used_in_astrometry (1/µm)
PSEUDOCOLOUR_RANGE = (1.24, 1.72)  # 6-parameter solutions, pseudocolour (1/µm)


def gaia_parallax(g) -> tuple[float, float] | None:
    """Zero-point corrected Gaia DR3 parallax and error (mas), or None when not reliable."""
    from zero_point import zpt

    if g is None or np.ma.is_masked(g["parallax"]) or float(g["phot_g_mean_mag"]) <= GAIA_G_MIN:
        return None
    if np.ma.is_masked(g["ruwe"]) or float(g["ruwe"]) >= GAIA_RUWE_MAX:
        return None
    solved = int(g["astrometric_params_solved"])
    colour, (lo, hi) = (
        (g["nu_eff_used_in_astrometry"], NU_EFF_RANGE)
        if solved == 31
        else (g["pseudocolour"], PSEUDOCOLOUR_RANGE)
    )
    if solved not in (31, 95) or np.ma.is_masked(colour) or not lo <= float(colour) <= hi:
        return None
    nu = float(colour) if solved == 31 else np.nan
    pc = float(colour) if solved == 95 else np.nan
    # gaiadr3-zeropoint calls np.can_cast on its inputs, which NumPy 2 rejects for Python scalars:
    # pass 1-element arrays.
    zero = float(
        zpt.get_zpt(
            np.array([float(g["phot_g_mean_mag"])]),
            np.array([nu]),
            np.array([pc]),
            np.array([float(g["ecl_lat"])]),
            np.array([solved]),
        )[0]
    )
    return float(g["parallax"]) - zero, float(g["parallax_error"])


def reference_distance(rec: dict, g) -> None:
    """Sets rec["dist"], rec["eDist"] (ly) and rec["distSrc"] (#75): a published distance for the
    stars of LITERATURE_DISTANCES, otherwise the inverse of the more precise parallax (Gaia DR3
    when reliable, Hipparcos 2007), with its 1σ error. No distance when σϖ > ϖ."""
    lit = LITERATURE_DISTANCES.get(rec["hip"])
    if lit:
        d, minus, plus = lit[0], lit[1], lit[2]
        rec["dist"], rec["eDist"], rec["distSrc"] = d * LY_PER_PC, (minus + plus) / 2 * LY_PER_PC, "lit"
        rec["distRef"] = lit[3]
    else:
        options = []
        if rec.get("plx", 0) > 0 and rec.get("ePlx") is not None:
            options.append((rec["plx"], rec["ePlx"], "hip"))
        gp = gaia_parallax(g)
        if gp and gp[0] > 0:
            options.append((*gp, "gaia"))
        if not options:
            return
        plx, e_plx, src = min(options, key=lambda o: o[1] / o[0])
        if e_plx > plx:  # σϖ > ϖ: the inverse says nothing about the distance
            return
        d = 1000 / plx * LY_PER_PC
        rec["dist"], rec["eDist"], rec["distSrc"] = d, d * e_plx / plx, src
    # 3 significant figures (≤ 0.5 %, below the parallax errors): smaller and better compressed.
    rec["dist"] = significant(rec["dist"], 3)
    rec["eDist"] = max(0.01, significant(rec["eDist"], 2))


def significant(x: float, digits: int) -> float:
    """Rounds to `digits` significant figures and at most 2 decimals (the binary's 0.01 ly)."""
    if x <= 0:
        return 0.0
    return float(round(x, min(2, digits - 1 - int(np.floor(np.log10(x))))))


def radial_velocity(rec: dict, g, bsc_row) -> None:
    """Sets rec["rv"] (km/s, positive receding) and rec["rvSrc"] (#79): Gaia DR3 when measured,
    otherwise the Yale BSC5 value."""
    if g is not None and not np.ma.is_masked(g["radial_velocity"]):
        rec["rv"], rec["rvSrc"] = round(float(g["radial_velocity"]), 1) + 0.0, "gaia"  # no -0.0
    elif bsc_row is not None and not np.ma.is_masked(bsc_row["RadVel"]):
        rec["rv"], rec["rvSrc"] = float(int(bsc_row["RadVel"])), "bsc"


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

    print("· Yale BSC5 V/50 (HR, Bayer/Flamsteed, radial velocity)…")
    bsc = vizier("V/50/catalog", ["HR", "Name", "HD", "RadVel"])
    bsc_by_hd = {int(r["HD"]): r for r in bsc if not np.ma.is_masked(r["HD"])}

    print("· IAU WGSN names…")
    iau = parse_iau_csn(cached("IAU-CSN.txt", IAU_CSN_URL))
    print(f"  {len(iau)} names with a HIP number")

    print("· Gaia DR3 x Hipparcos best neighbours (parallax, radial velocity)…")
    gaia = load_gaia()
    print(f"  {len(gaia)} matched sources with G < 9")

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
        b = None
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
        reference_distance(rec, gaia.get(hip))
        radial_velocity(rec, gaia.get(hip), b)
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


# Names misread before IAU-CSN.txt was decoded as UTF-8 (#75): a non-ASCII name, names that came
# out as column debris ("4.62  V") and names that were missing.
CONTROL_NAMES = {33719: "Citalá", 4422: "Castula", 7513: "Titawin", 85696: "Lesath", 48356: "Zhang"}

# Reference distances (#75), ly: (expected, relative tolerance, expected source, reference).
CONTROL_DISTANCES = {
    32349: (8.60, 0.005, "hip", "Sirius: Hipparcos 2007, 379.21 ± 1.58 mas (SIMBAD)"),
    24436: (860, 0.10, "hip", "Rigel: Hipparcos 2007, 3.78 ± 0.34 mas"),
    27989: (548, 0.05, "lit", "Betelgeuse: Joyce et al. 2020, 168 +27/-15 pc"),
    102098: (2600, 0.10, "lit", "Deneb: Schiller & Przybilla 2008, 802 ± 66 pc"),
}
# Radial velocities (#79), km/s: (expected, tolerance, reference), SIMBAD values.
CONTROL_RV = {
    71683: (-21.4, 1.5, "α Cen A (SIMBAD −21.40, BSC5 −22)"),
    32349: (-5.5, 3.0, "Sirius (SIMBAD −5.50; BSC5 rounds older values)"),
    69673: (-5.2, 1.5, "Arcturus (SIMBAD −5.19)"),
    104214: (-65.9, 1.5, "61 Cyg A (SIMBAD −65.97, Gaia DR3)"),
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
    for hip, name in CONTROL_NAMES.items():
        if by_hip.get(hip, {}).get("name") != name:
            errors.append(f"HIP {hip}: name {by_hip.get(hip, {}).get('name')!r} != {name!r}")
    for hip, (ly, tol, src, ref) in CONTROL_DISTANCES.items():
        s = by_hip.get(hip, {})
        if s.get("distSrc") != src or abs(s.get("dist", 0) / ly - 1) > tol:
            errors.append(f"{ref}: got {s.get('dist')} ly ({s.get('distSrc')}), "
                          f"expected {ly} ly ± {tol:.0%} ({src})")
        else:
            print(f"  distance {ref}: {s['dist']} ± {s['eDist']} ly ({src}), "
                  f"{(s['dist'] / ly - 1) * 100:+.1f} % from {ly}")
    for hip, (rv, tol, ref) in CONTROL_RV.items():
        s = by_hip.get(hip, {})
        if "rv" not in s or abs(s["rv"] - rv) > tol:
            errors.append(f"radial velocity {ref}: got {s.get('rv')} km/s, expected {rv} ± {tol}")
        else:
            print(f"  radial velocity {ref}: {s['rv']} km/s ({s['rvSrc']})")
    with_dist = [s for s in stars if "dist" in s]
    counts = {k: sum(1 for s in with_dist if s["distSrc"] == k) for k in ("gaia", "hip", "lit")}
    with_rv = {k: sum(1 for s in stars if s.get("rvSrc") == k) for k in ("gaia", "bsc")}
    print(f"  distances: {len(with_dist)} stars {counts}; radial velocities: {with_rv}")
    if len(with_dist) < 0.95 * len(stars) or sum(with_rv.values()) < 0.9 * len(stars):
        errors.append("too few distances or radial velocities")
    if any(not 1 < s["dist"] < 100_000 or s["eDist"] <= 0 for s in with_dist):
        errors.append("distance out of range (1 to 100 000 ly) or without error")
    # Perspective acceleration: u = p(1 + ζt) + μt must not flip within ±15 000 years.
    zeta_max = max(abs(s["rv"]) * s["plx"] / 4.740470446 * 4.8481368e-9 for s in stars
                   if "rv" in s and s.get("plx", 0) > 0)
    if zeta_max * 15_000 > 0.5:
        errors.append(f"radial velocity term too large: |ζ| max {zeta_max:.2e} /yr")
    # Bright stars still left with an imprecise distance: candidates for LITERATURE_DISTANCES.
    vague = [f"{s.get('name', s['hip'])} ({s['eDist'] / s['dist']:.0%})" for s in with_dist
             if s["v"] <= 2.0 and s["eDist"] / s["dist"] > 0.1]
    print(f"  V <= 2 with a distance error > 10 % (shown as approximate): {', '.join(vague)}")
    if any("Ã" in s.get("name", "") for s in stars):
        errors.append("mojibake in star names")
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
