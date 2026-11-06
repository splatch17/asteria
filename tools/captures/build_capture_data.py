"""Temporary capture data (not versioned): HYG v4.1 (Hipparcos-derived) V <= 6.5 + Stellarium modern lines.

Usage: python -I build_capture_data.py <dl dir> <sky-data dir> <out dir>
"""
import csv
import json
import sys
from pathlib import Path

dl, sky, out = (Path(a) for a in sys.argv[1:4])
sys.path.insert(0, str(sky))
from star_binary import CONSTELLATIONS, write_star_catalog  # noqa: E402

GREEK = {
    "Alp": "α", "Bet": "β", "Gam": "γ", "Del": "δ", "Eps": "ε", "Zet": "ζ", "Eta": "η",
    "The": "θ", "Iot": "ι", "Kap": "κ", "Lam": "λ", "Mu": "μ", "Nu": "ν", "Xi": "ξ",
    "Omi": "ο", "Pi": "π", "Rho": "ρ", "Sig": "σ", "Tau": "τ", "Ups": "υ", "Phi": "φ",
    "Chi": "χ", "Psi": "ψ", "Ome": "ω",
}
SUP = "¹²³⁴⁵⁶⁷⁸⁹"
CON = {c.lower(): c for c in CONSTELLATIONS}

culture = json.loads((dl / "stellarium-modern.json").read_text(encoding="utf-8"))
lines = {c["id"].split()[-1]: c["lines"] for c in culture["constellations"]}
line_hips = {h for polys in lines.values() for poly in polys for h in poly if isinstance(h, int)}


def f(x):
    return float(x) if x not in ("", None) else None


stars = []
seen = set()
with (dl / "hyg.csv").open(encoding="utf-8") as fh:
    for r in csv.DictReader(fh):
        if not r["hip"]:
            continue
        hip = int(r["hip"])
        v = f(r["mag"])
        if v is None or hip in seen or (v > 6.5 and hip not in line_hips):
            continue
        con = CON.get((r["con"] or "").lower())
        if not con:
            continue
        seen.add(hip)
        rec = {"hip": hip, "ra": round(float(r["ra"]) * 15, 6), "dec": round(float(r["dec"]), 6), "v": round(v, 2), "con": con}
        if f(r["ci"]) is not None:
            rec["bv"] = round(f(r["ci"]), 3)
        for k, col in (("pmRa", "pmra"), ("pmDec", "pmdec")):
            if f(r[col]) is not None:
                rec[k] = round(f(r[col]), 3)
        d = f(r["dist"])
        if d and 0 < d < 100000:
            rec["plx"] = round(1000 / d, 3)
            rec["dist"] = round(d * 3.26156, 2)
            rec["distSrc"] = "hip"
        if f(r["rv"]):
            rec["rv"] = round(f(r["rv"]), 1)
            rec["rvSrc"] = "bsc"
        for k in ("hd", "hr"):
            if r[k]:
                rec[k] = int(r[k])
        if r["flam"]:
            rec["flamsteed"] = int(r["flam"])
        b = r["bayer"]
        if b:
            g = b.split("-")[0]
            sup = b.split("-")[1] if "-" in b else ""
            if g in GREEK:
                rec["bayer"] = GREEK[g] + (SUP[int(sup) - 1] if sup.isdigit() and 0 < int(sup) < 10 else "") + " " + con
        if r["proper"]:
            rec["name"] = r["proper"]
        stars.append(rec)

stars.sort(key=lambda s: s["v"])
out.mkdir(parents=True, exist_ok=True)
(out / "constellation-lines.json").write_text(json.dumps(lines, separators=(",", ":")), encoding="utf-8")
write_star_catalog(stars, out)
print(len(stars), "stars;", len(lines), "constellations;", len(line_hips - seen), "line stars missing")
