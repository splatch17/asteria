"""Compact binary encoding of the star catalogue (format "ASTS" v2; v1 still decodes).

Layout (all integers little-endian, see packages/sky-data/README.md):

  header   16 bytes : magic "ASTS", version u16, header_size u16, count u32,
                      con_count u16, flags u16 (reserved, 0)
  con table          : con_count x 3 ASCII bytes (IAU abbreviations), zero-padded to 4 bytes
  columns            : one typed array per field, `count` entries each, in COLUMNS order

Names and Bayer designations are written to a separate JSON string table keyed by HIP
(prepares i18n, ADR-0002). The decoder is packages/catalog (TypeScript).
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

MAGIC = b"ASTS"
VERSION = 2  # v2 (#75, #79): reference distance, its error and source, radial velocity
STRINGS_VERSION = 1  # the string table only gained an optional "distRef" map
HEADER = struct.Struct("<4sHHIHH")  # 16 bytes
STRINGS_FORMAT = "asteria-star-strings"

# The 88 IAU constellation abbreviations, ASCII order. Index = value of the `con` column.
CONSTELLATIONS = sorted(
    """And Ant Aps Aql Aqr Ara Ari Aur Boo Cae Cam Cap Car Cas Cen Cep Cet Cha Cir CMa CMi Cnc
    Col Com CrA CrB Crt Cru Crv CVn Cyg Del Dor Dra Equ Eri For Gem Gru Her Hor Hya Hyi Ind Lac
    Leo Lep Lib LMi Lup Lyn Lyr Men Mic Mon Mus Nor Oct Oph Ori Pav Peg Per Phe Pic PsA Psc Pup
    Pyx Ret Scl Sco Sct Ser Sex Sge Sgr Tau Tel TrA Tri Tuc UMa UMi Vel Vir Vol Vul""".split()
)
assert len(CONSTELLATIONS) == 88 and len(set(CONSTELLATIONS)) == 88

# Fixed-point scales. RA/Dec use the full 32-bit range (uniform ~0.0003" resolution).
RA_SCALE = 2**32 / 360.0
DEC_SCALE = 2**31 / 90.0
I32_NONE = -(2**31)
I16_NONE = -(2**15)

# (field, struct code, encoder); decoders mirror these in packages/catalog/src/star-catalog.ts
COLUMNS: list[tuple[str, str]] = [
    ("hip", "I"),  # u32
    ("ra", "I"),  # u32, deg * 2^32/360
    ("dec", "i"),  # i32, deg * 2^31/90
    ("plx", "i"),  # i32, mas * 1000, I32_NONE if absent
    ("ePlx", "i"),  # i32, mas * 1000, I32_NONE if absent
    ("pmRa", "i"),  # i32, mas/yr * 1000, I32_NONE if absent
    ("pmDec", "i"),  # i32, mas/yr * 1000, I32_NONE if absent
    ("hd", "I"),  # u32, 0 if absent
    ("v", "h"),  # i16, mag * 1000
    ("bv", "h"),  # i16, mag * 1000, I16_NONE if absent
    ("hr", "H"),  # u16, 0 if absent
    ("flamsteed", "B"),  # u8, 0 if absent
    ("con", "B"),  # u8, index into the constellation table
    # --- v2 ---
    ("dist", "I"),  # u32, reference distance, ly * 100, 0 if absent
    ("eDist", "I"),  # u32, its 1-sigma error, ly * 100, 0 if absent
    ("rv", "h"),  # i16, radial velocity, km/s * 10, I16_NONE if absent
    ("src", "B"),  # u8, distance source (low 4 bits) | radial velocity source << 4
]
V1_COLUMNS = 13
DIST_SOURCES = [None, "hip", "gaia", "lit"]  # index = low nibble of `src`
RV_SOURCES = [None, "bsc", "gaia"]  # index = high nibble of `src`


def bytes_per_star(version: int = VERSION) -> int:
    cols = COLUMNS[:V1_COLUMNS] if version == 1 else COLUMNS
    return sum(struct.calcsize("<" + code) for _, code in cols)


BYTES_PER_STAR = bytes_per_star()


def _milli(value: float | None, none: int) -> int:
    return none if value is None else round(value * 1000)


def _encode(field: str, s: dict) -> int:
    if field == "ra":
        return round(s["ra"] * RA_SCALE) % 2**32
    if field == "dec":
        return max(-(2**31) + 1, min(2**31 - 1, round(s["dec"] * DEC_SCALE)))
    if field in ("plx", "ePlx", "pmRa", "pmDec"):
        return _milli(s.get(field), I32_NONE)
    if field == "v":
        return _milli(s["v"], I16_NONE)
    if field == "bv":
        return _milli(s.get("bv"), I16_NONE)
    if field == "con":
        return CONSTELLATIONS.index(s["con"])
    if field in ("dist", "eDist"):
        return round(s[field] * 100) if field in s else 0
    if field == "rv":
        return I16_NONE if "rv" not in s else round(s["rv"] * 10)
    if field == "src":
        return DIST_SOURCES.index(s.get("distSrc")) | RV_SOURCES.index(s.get("rvSrc")) << 4
    return s.get(field) or 0  # hip, hd, hr, flamsteed


def _header_size() -> int:
    raw = HEADER.size + 3 * len(CONSTELLATIONS)
    return (raw + 3) // 4 * 4


def encode_stars(stars: list[dict]) -> bytes:
    header_size = _header_size()
    out = bytearray(HEADER.pack(MAGIC, VERSION, header_size, len(stars), len(CONSTELLATIONS), 0))
    out += "".join(CONSTELLATIONS).encode("ascii")
    out += b"\0" * (header_size - len(out))
    for field, code in COLUMNS:
        out += struct.pack(f"<{len(stars)}{code}", *(_encode(field, s) for s in stars))
    return bytes(out)


def string_table(stars: list[dict]) -> dict:
    return {
        "format": STRINGS_FORMAT,
        "version": STRINGS_VERSION,
        "name": {str(s["hip"]): s["name"] for s in stars if "name" in s},
        "bayer": {str(s["hip"]): s["bayer"] for s in stars if "bayer" in s},
        "distRef": {str(s["hip"]): s["distRef"] for s in stars if "distRef" in s},
    }


def decode_stars(data: bytes, strings: dict) -> list[dict]:
    """Reference decoder, used by the pipeline to check the round trip."""
    magic, version, header_size, count, con_count, _ = HEADER.unpack_from(data, 0)
    if magic != MAGIC or version not in (1, 2):
        raise ValueError("not an ASTS v1/v2 star catalogue")
    if len(data) != header_size + count * bytes_per_star(version):
        raise ValueError("truncated star catalogue")
    cons = data[HEADER.size : HEADER.size + 3 * con_count].decode("ascii")
    cons = [cons[i : i + 3] for i in range(0, len(cons), 3)]
    cols: dict[str, tuple] = {}
    offset = header_size
    for field, code in COLUMNS[:V1_COLUMNS] if version == 1 else COLUMNS:
        fmt = f"<{count}{code}"
        cols[field] = struct.unpack_from(fmt, data, offset)
        offset += struct.calcsize(fmt)
    stars = []
    for i in range(count):
        hip = cols["hip"][i]
        s: dict = {
            "hip": hip,
            "ra": cols["ra"][i] / RA_SCALE,
            "dec": cols["dec"][i] / DEC_SCALE,
            "v": cols["v"][i] / 1000,
        }
        if cols["bv"][i] != I16_NONE:
            s["bv"] = cols["bv"][i] / 1000
        for key in ("plx", "ePlx", "pmRa", "pmDec"):
            if cols[key][i] != I32_NONE:
                s[key] = cols[key][i] / 1000
        for key in ("hd", "hr", "flamsteed"):
            if cols[key][i]:
                s[key] = cols[key][i]
        for key in ("name", "bayer", "distRef"):
            if str(hip) in strings.get(key, {}):
                s[key] = strings[key][str(hip)]
        s["con"] = cons[cols["con"][i]]
        if version >= 2:
            if cols["dist"][i]:
                s["dist"] = cols["dist"][i] / 100
                s["eDist"] = cols["eDist"][i] / 100
                s["distSrc"] = DIST_SOURCES[cols["src"][i] & 15]
            if cols["rv"][i] != I16_NONE:
                s["rv"] = cols["rv"][i] / 10
                s["rvSrc"] = RV_SOURCES[cols["src"][i] >> 4]
        stars.append(s)
    return stars


def check_round_trip(stars: list[dict], data: bytes, strings: dict) -> list[str]:
    """Compare decoded stars with the source records; returns error messages."""
    errors: list[str] = []
    decoded = decode_stars(data, strings)
    if len(decoded) != len(stars):
        return [f"binary: {len(decoded)} stars != {len(stars)}"]
    max_arcsec = 0.0
    for s, d in zip(stars, decoded):
        dra = (d["ra"] - s["ra"] + 180) % 360 - 180
        max_arcsec = max(max_arcsec, abs(dra) * 3600, abs(d["dec"] - s["dec"]) * 3600)
        for key in s:
            if key in ("ra", "dec"):
                continue
            ok = abs(d.get(key, 1e9) - s[key]) < 1e-9 if isinstance(s[key], float) else d.get(key) == s[key]
            if not ok:
                errors.append(f"binary: HIP {s['hip']} {key} {d.get(key)!r} != {s[key]!r}")
                break
        if set(d) != set(s):
            errors.append(f"binary: HIP {s['hip']} fields {sorted(set(d) ^ set(s))} differ")
        if len(errors) > 10:
            break
    if max_arcsec >= 0.001:
        errors.append(f'binary: position error {max_arcsec:.5f}" >= 0.001"')
    print(f'  binary round trip: max position error {max_arcsec * 1000:.3f} mas')
    return errors


def write_star_catalog(stars: list[dict], out_dir: Path) -> tuple[bytes, dict]:
    """Write out/stars.bin and out/star-strings.json; returns what was written."""
    unknown = {s["con"] for s in stars} - set(CONSTELLATIONS)
    if unknown:
        raise ValueError(f"unknown constellations {unknown}")
    data = encode_stars(stars)
    strings = string_table(stars)
    (out_dir / "stars.bin").write_bytes(data)
    (out_dir / "star-strings.json").write_text(
        json.dumps(strings, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    return data, strings
