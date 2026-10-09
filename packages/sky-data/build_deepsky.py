"""Build the deep-sky catalogue (Messier + bright NGC/IC objects) for Asteria (#100).

Source (see docs/DATA_SOURCES.md):
  - OpenNGC, Mattia Verga (https://github.com/mattiaverga/OpenNGC), release v20260501, pinned
    to its commit: database_files/NGC.csv (NGC/IC) and database_files/addendum.csv (Messier
    objects without NGC/IC number, M40 and M45, and other notable objects). Licence
    CC BY-SA 4.0 (LICENSES/CC-BY-SA-4.0.txt and .reuse/dep5 of the repository). The SHA-256 of
    both files is checked, so a changed upstream file fails the build instead of silently
    changing the catalogue.
  - Constellation membership: astropy get_constellation (Roman 1987, CDS VI/42), as for the stars;
    OpenNGC's own constellation column is only used as a cross-check.
  - French common names: packages/content/fr/deepsky-names.json (editorial content, keyed by the
    catalogue id); this script only checks that every key exists and names an object that OpenNGC
    also names.

Selection (SELECTION below, documented in docs/DATA_SOURCES.md):
  1. every Messier object (M102 is a duplicate of M101 in OpenNGC: it becomes a designation of
     the M101 entry);
  2. every other object whose V or B magnitude is <= MAG_LIMIT (10), skipping single and double
     stars, non-existent, duplicated and "other" entries. Both bands are read because OpenNGC
     sometimes lists only one, and a few galaxy V magnitudes are clearly too faint (NGC 253:
     V 11.11, B 7.94);
  3. clusters and nebulae that OpenNGC names but gives no magnitude (integrated magnitudes of
     large nebulae are rarely measured): Horsehead, Jewel Box, Southern Pleiades, Hyades…

Output (not versioned, synced into apps/web/public/data by tools/sync-data.mjs):
  out/deepsky.json   compact JSON, one row per object (format "asteria-deepsky" v1, see README)

Usage: python -I build_deepsky.py   (downloads into raw/openngc-<commit>/, exits 1 on any failed
control)
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import math
import re
import sys
from pathlib import Path

import requests
from astropy import units as u
from astropy.coordinates import SkyCoord, get_constellation

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
FR_NAMES = ROOT.parent / "content" / "fr" / "deepsky-names.json"

OPENNGC_VERSION = "v20260501"
OPENNGC_COMMIT = "36cb178a0f69dba8bfc03a99c10512831edf1c6b"  # tag v20260501 (lightweight)
OPENNGC_URL = f"https://raw.githubusercontent.com/mattiaverga/OpenNGC/{OPENNGC_COMMIT}/database_files/"
OPENNGC_FILES = {
    "NGC.csv": "840fe0c9ee1332e551b2e722a0e92726cd7b157914a3d2177602832aadd3aa9e",
    "addendum.csv": "1d8f0914e643ada325a5a94d88d8fefad6a4937a2f77cc34f21483af22b11983",
}
RAW = ROOT / "raw" / f"openngc-{OPENNGC_COMMIT[:12]}"

MAG_LIMIT = 10.0
SELECTION = (
    f"Messier objects; other OpenNGC objects with V or B <= {MAG_LIMIT:g}; named clusters and "
    "nebulae without magnitude"
)
# Budget of the gzip-compressed output (#100: < 50 kB).
GZIP_BUDGET = 50_000

# OpenNGC type -> catalogue type. Types missing here are never selected except for Messier objects.
TYPES = {
    "G": "galaxy",
    "GPair": "galaxy-group",
    "GTrpl": "galaxy-group",
    "GGroup": "galaxy-group",
    "GCl": "globular-cluster",
    "OCl": "open-cluster",
    "Cl+N": "cluster-nebula",
    "*Ass": "association",
    "PN": "planetary-nebula",
    "HII": "emission-nebula",
    "EmN": "emission-nebula",
    "RfN": "reflection-nebula",
    "Neb": "nebula",
    "DrkN": "dark-nebula",
    "SNR": "supernova-remnant",
}
# Only reachable through rule 1 (Messier): M40 is a double star, M73 an asterism ("Other").
MESSIER_ONLY_TYPES = {"**": "double-star", "Other": "asterism"}
GALAXY_TYPES = {"galaxy", "galaxy-group"}

# Reference coordinates (ICRS, J2000) from SIMBAD (https://simbad.cds.unistra.fr), basic data of
# each identifier. SIMBAD cannot be queried from the build container, so the values are constants;
# tolerance 1′ (#100). id: (RA "h m s", Dec "d m s", SIMBAD identifier and coordinate reference).
SIMBAD_REFERENCES = {
    "M31": ("00 42 44.330", "+41 16 07.50", "SIMBAD M 31 (2MASS, 2006AJ....131.1163S)"),
    "M42": ("05 35 17.3", "-05 23 28", "SIMBAD M 42"),
    "M1": ("05 34 31.94", "+22 00 52.2", "SIMBAD M 1"),
    "M13": ("16 41 41.634", "+36 27 40.75", "SIMBAD M 13 (2010AJ....140.1830G)"),
    # A 2° cluster has no sharp centre and catalogues disagree by several arcminutes: OpenNGC
    # centres M45 on Alcyone, so the control checks it against SIMBAD's position of η Tau.
    "M45": ("03 47 29.0765", "+24 06 18.494", "SIMBAD η Tau (Alcyone), Hipparcos 2007"),
}
SIMBAD_TOLERANCE_ARCMIN = 1.0
# Expected type, constellation and magnitude bounds of a few landmark objects.
CONTROL_OBJECTS = {
    "M31": ("galaxy", "And", 3.0, 4.5),
    "M42": ("cluster-nebula", "Ori", 3.0, 5.0),
    "M45": ("open-cluster", "Tau", 1.0, 2.0),
    "M13": ("globular-cluster", "Her", 5.0, 6.5),
    "M1": ("supernova-remnant", "Tau", 8.0, 9.0),
    "M57": ("planetary-nebula", "Lyr", 8.0, 10.0),
    "NGC5139": ("globular-cluster", "Cen", 3.0, 6.5),  # ω Centauri
    "ESO56-115": ("galaxy", "Dor", 0.0, 1.0),  # Large Magellanic Cloud
}


def download() -> dict[str, str]:
    """The two OpenNGC tables, downloaded once into their own directory and hash-checked."""
    texts = {}
    for name, sha in OPENNGC_FILES.items():
        path = RAW / name
        if not path.exists():
            RAW.mkdir(parents=True, exist_ok=True)
            resp = requests.get(OPENNGC_URL + name, timeout=120)
            resp.raise_for_status()
            path.write_bytes(resp.content)
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != sha:
            raise ValueError(f"{path}: SHA-256 {digest} != {sha} (delete it and run again)")
        texts[name] = data.decode("utf-8")
    return texts


def read_table(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text), delimiter=";"))


def hms_to_deg(text: str) -> float:
    h, m, s = (float(x) for x in text.replace(":", " ").split())
    return 15 * (h + m / 60 + s / 3600)


def dms_to_deg(text: str) -> float:
    text = text.replace(":", " ").strip()
    sign = -1 if text.startswith("-") else 1
    d, m, s = (float(x) for x in text.lstrip("+-").split())
    return sign * (d + m / 60 + s / 3600)


def designation(name: str) -> tuple[str, str]:
    """OpenNGC name -> (id, display): 'NGC0224' -> ('NGC224', 'NGC 224'), 'ESO056-115' ->
    ('ESO56-115', 'ESO 56-115'), 'NGC4656 NED01' -> ('NGC4656-NED01', 'NGC 4656 NED01')."""
    m = re.match(r"^([A-Za-z]+)0*(\d[\w-]*)(?: (\w+))?$", name)
    if not m:
        raise ValueError(f"unexpected OpenNGC name {name!r}")
    cat, num, part = m.groups()
    num = re.sub(r"-0*(\d)", r"-\1", num)
    return cat + num + (f"-{part}" if part else ""), f"{cat} {num}" + (f" {part}" if part else "")


def number(text: str) -> float | None:
    return float(text) if text.strip() else None


def magnitudes(row: dict[str, str]) -> tuple[float | None, float | None]:
    return number(row["V-Mag"]), number(row["B-Mag"])


def select(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    chosen = []
    for r in rows:
        v, b = magnitudes(r)
        mags = [x for x in (v, b) if x is not None]
        if r["M"] and r["Type"] != "Dup":
            chosen.append(r)
        elif r["Type"] not in TYPES:
            continue
        elif mags and min(mags) <= MAG_LIMIT:
            chosen.append(r)
        elif not mags and r["Common names"] and TYPES[r["Type"]] not in GALAXY_TYPES:
            chosen.append(r)
    return chosen


def aliases(rows: list[dict[str, str]]) -> dict[str, list[str]]:
    """Master id -> designations of the OpenNGC 'Dup' rows that point to it."""
    out: dict[str, list[str]] = {}
    for r in rows:
        if r["Type"] != "Dup":
            continue
        if r["M"]:  # M102 -> M101
            out.setdefault(f"M{int(r['M'])}", []).append(f"M {int(r['Name'][1:])}")
            continue
        for cat in ("NGC", "IC"):  # the master object: "0281" -> NGC281, "1530A" -> NGC1530A
            if r[cat]:
                master = cat + r[cat].split(",")[0].strip().lstrip("0")
                out.setdefault(master, []).append(designation(r["Name"])[1])
                break
    return out


def cross_ids(row: dict[str, str]) -> list[str]:
    """Other NGC / IC numbers of an object (OpenNGC columns 'NGC' and 'IC', comma separated)."""
    ids = []
    for cat in ("NGC", "IC"):
        for n in filter(None, (x.strip() for x in row[cat].split(","))):
            ids.append(f"{cat} {n.lstrip('0') or '0'}")
    return ids


def build(rows: list[dict[str, str]]) -> list[dict]:
    dup_of = aliases(rows)
    objects = []
    for r in select(rows):
        own_id, own = designation(r["Name"])
        messier = int(r["M"]) if r["M"] else None
        desig = ([f"M {messier}"] if messier else []) + [own]  # "M 40" twice for M040: deduped
        desig += cross_ids(r) + dup_of.get(own_id, []) + dup_of.get(f"M{messier}", [])
        v, b = magnitudes(r)
        obj: dict = {
            "id": f"M{messier}" if messier else own_id,
            "type": TYPES.get(r["Type"]) or MESSIER_ONLY_TYPES[r["Type"]],
            "ra": round(hms_to_deg(r["RA"]) % 360, 5),
            "dec": round(dms_to_deg(r["Dec"]), 5),
            "v": v,
            "b": b,
            "maj": number(r["MajAx"]),
            "min": number(r["MinAx"]),
            "pa": number(r["PosAng"]),
            "ngcCon": {"Se1": "Ser", "Se2": "Ser"}.get(r["Const"], r["Const"]),
            "designations": list(dict.fromkeys(desig)),
            "names": [n.strip() for n in r["Common names"].split(",") if n.strip()],
        }
        objects.append(obj)
    coords = SkyCoord(
        ra=[o["ra"] for o in objects] * u.deg, dec=[o["dec"] for o in objects] * u.deg, frame="icrs"
    )
    for o, con in zip(objects, get_constellation(coords, short_name=True)):
        o["con"] = str(con)
    # Messier first (by number), then by brightness: the order the search lists equal matches in.
    def key(o):
        m = re.fullmatch(r"M(\d+)", o["id"])
        mag = min(x for x in (o["v"], o["b"], 99.0) if x is not None)
        return (0, int(m.group(1)), 0.0) if m else (1, 0, mag)

    objects.sort(key=key)
    return objects


FIELDS = ["id", "type", "ra", "dec", "v", "b", "maj", "min", "pa", "con", "designations", "names"]


def write(objects: list[dict]) -> bytes:
    doc = {
        "format": "asteria-deepsky",
        "version": 1,
        "source": f"OpenNGC {OPENNGC_VERSION} (commit {OPENNGC_COMMIT[:12]}), Mattia Verga, CC BY-SA 4.0",
        "selection": SELECTION,
        "fields": FIELDS,
        "objects": [[o[f] for f in FIELDS] for o in objects],
    }
    data = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    OUT.mkdir(exist_ok=True)
    (OUT / "deepsky.json").write_bytes(data)
    return data


def separation_arcmin(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    r = math.radians
    h = math.sin(r(dec2 - dec1) / 2) ** 2 + math.cos(r(dec1)) * math.cos(r(dec2)) * math.sin(
        r(ra2 - ra1) / 2
    ) ** 2
    return math.degrees(2 * math.asin(math.sqrt(h))) * 60


def validate(objects: list[dict], data: bytes) -> list[str]:
    errors: list[str] = []
    by_id = {o["id"]: o for o in objects}
    if len(by_id) != len(objects):
        errors.append("duplicate ids")
    if not 550 <= len(objects) <= 700:
        errors.append(f"unexpected object count {len(objects)}")
    all_desig = [d for o in objects for d in o["designations"]]
    if len(set(all_desig)) != len(all_desig):
        dups = sorted({d for d in all_desig if all_desig.count(d) > 1})
        errors.append(f"designations used twice: {dups}")
    messier = sorted(int(d[2:]) for d in all_desig if re.fullmatch(r"M \d+", d))
    if messier != list(range(1, 111)):
        errors.append(f"Messier numbers are not exactly M1-M110: {len(messier)} found")
    for o in objects:
        name = o["id"]
        if not (0 <= o["ra"] < 360 and -90 <= o["dec"] <= 90):
            errors.append(f"{name}: position out of range")
        for band in ("v", "b"):
            if o[band] is not None and not -1 < o[band] < 16:
                errors.append(f"{name}: {band} magnitude {o[band]} out of range")
        mags = [x for x in (o["v"], o["b"]) if x is not None]
        if not name.startswith("M") and mags and min(mags) > MAG_LIMIT:
            errors.append(f"{name}: fainter than the selection limit")
        if o["maj"] is not None and o["min"] is not None and o["min"] > o["maj"]:
            errors.append(f"{name}: minor axis larger than major axis")
        if o["pa"] is not None and not 0 <= o["pa"] <= 180:
            errors.append(f"{name}: position angle {o['pa']} out of range")
    for oid, (ra, dec, ref) in SIMBAD_REFERENCES.items():
        o = by_id[oid]
        sep = separation_arcmin(o["ra"], o["dec"], hms_to_deg(ra), dms_to_deg(dec))
        status = "ok" if sep <= SIMBAD_TOLERANCE_ARCMIN else "FAILED"
        print(f"  {oid:4} {sep * 60:6.1f}″ from {ref} (tolerance {SIMBAD_TOLERANCE_ARCMIN:g}′): {status}")
        if sep > SIMBAD_TOLERANCE_ARCMIN:
            errors.append(f"{oid}: {sep:.2f}′ from {ref}")
    for oid, (typ, con, lo, hi) in CONTROL_OBJECTS.items():
        o = by_id.get(oid)
        if o is None:
            errors.append(f"missing control object {oid}")
            continue
        mag = o["v"] if o["v"] is not None else o["b"]
        if o["type"] != typ or o["con"] != con or mag is None or not lo <= mag <= hi:
            errors.append(f"{oid}: {o['type']}, {o['con']}, mag {mag} != {typ}, {con}, {lo}-{hi}")
    # Roman 1987 (astropy) against OpenNGC's own constellation: only objects on a boundary differ.
    differ = [f"{o['id']} ({o['ngcCon']}→{o['con']})" for o in objects if o["con"] != o["ngcCon"]]
    print(f"  constellation differs from OpenNGC for {len(differ)} objects: {', '.join(differ)}")
    if len(differ) > 0.02 * len(objects):
        errors.append("too many constellation disagreements with OpenNGC")
    if any(o["con"] != o["ngcCon"] for o in objects if re.fullmatch(r"M\d+", o["id"])):
        errors.append("a Messier object changes constellation")
    fr = json.loads(FR_NAMES.read_text(encoding="utf-8"))["names"]
    for oid in fr:
        if oid not in by_id:
            errors.append(f"deepsky-names.json: {oid} is not in the catalogue")
        elif not by_id[oid]["names"]:
            errors.append(f"deepsky-names.json: OpenNGC gives no common name for {oid}")
    size = len(gzip.compress(data, 9))
    if size >= GZIP_BUDGET:
        errors.append(f"deepsky.json weighs {size:,} B gzip (budget {GZIP_BUDGET:,} B)")
    return errors


def main() -> int:
    # `python -I` ignores PYTHONIOENCODING: print "✓", "′" and the common names in UTF-8 anyway.
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    print(f"· OpenNGC {OPENNGC_VERSION} ({OPENNGC_COMMIT[:12]})…")
    texts = download()
    rows = read_table(texts["NGC.csv"]) + read_table(texts["addendum.csv"])
    print(f"  {len(rows)} rows")
    objects = build(rows)
    data = write(objects)
    counts: dict[str, int] = {}
    for o in objects:
        counts[o["type"]] = counts.get(o["type"], 0) + 1
    print(f"  deepsky.json {len(data):>9,} B  gzip {len(gzip.compress(data, 9)):>8,} B")
    print(f"✓ {len(objects)} objects: {counts}")
    errors = validate(objects, data)
    for e in errors:
        print("✗", e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
