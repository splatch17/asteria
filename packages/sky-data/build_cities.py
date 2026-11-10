"""Build the list of cities for the place picker (Réglages › Lieu et temps, first-launch welcome).

Source (see docs/DATA_SOURCES.md):
  - Natural Earth 1:10m "Populated places", release v5.1.2 (public domain): 7 342 places with
    their French name, country code, population and position.

Output (not versioned), in out/:
  cities.json   {"version": 1, "source": "...", "cities": [[name, alt, country, lat, lon, region], ...]}
                sorted by population, the largest first (the picker lists its matches in that order).
                name     French name (NAME_FR), else the local one
                alt      the local name when it differs (« London » for « Londres »), else ""
                country  ISO 3166-1 alpha-2 code ("" when Natural Earth has none); the app writes the
                         country's name with Intl.DisplayNames
                lat, lon degrees, north and east positive, 2 decimals (about 1 km: far more than the
                         sky needs)
                region   first-level region, only when two places share name and country, else ""

The downloaded file is untrusted data: run with `python -I`.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import requests

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "out"

RELEASE = "v5.1.2"
URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    f"{RELEASE}/geojson/ne_10m_populated_places.geojson"
)
RAW_NAME = f"ne_10m_populated_places-{RELEASE}.geojson"
SOURCE = f"Natural Earth {RELEASE[1:]}, 1:10m populated places (public domain)"
# Places of the past (Troy, Carthage…) are not somewhere to watch the sky from tonight.
SKIPPED_CLASSES = {"Historic place"}
BUDGET = 400_000  # bytes, before compression


def cached_bytes(name: str, url: str) -> bytes:
    path = RAW / name
    if not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        resp = requests.get(url, timeout=180, headers={"User-Agent": "AsteriaDataPipeline/0.1"})
        resp.raise_for_status()
        path.write_bytes(resp.content)
    return path.read_bytes()


def text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def build(geojson: dict) -> list[list]:
    places = []
    for feature in geojson["features"]:
        p = feature["properties"]
        if p.get("FEATURECLA") in SKIPPED_CLASSES:
            continue
        lon, lat = feature["geometry"]["coordinates"][:2]
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f"position out of range: {p.get('NAME')!r} {lat} {lon}")
        local = text(p.get("NAME"))
        name = text(p.get("NAME_FR")) or local
        if not name:
            continue
        country = text(p.get("ISO_A2")).upper()
        if len(country) != 2 or not country.isalpha():
            country = ""
        places.append(
            {
                "name": name,
                "alt": local if local.casefold() != name.casefold() else "",
                "country": country,
                "lat": round(float(lat), 2),
                "lon": round(float(lon), 2),
                "region": text(p.get("ADM1NAME")),
                "pop": int(p.get("POP_MAX") or 0),
            }
        )
    places.sort(key=lambda c: (-c["pop"], c["name"]))
    shared = Counter((c["name"].casefold(), c["country"]) for c in places)
    return [
        [
            c["name"],
            c["alt"],
            c["country"],
            c["lat"],
            c["lon"],
            c["region"] if shared[(c["name"].casefold(), c["country"])] > 1 else "",
        ]
        for c in places
    ]


def main() -> int:
    cities = build(json.loads(cached_bytes(RAW_NAME, URL)))
    by_name = {c[0]: c for c in reversed(cities)}
    # Controls: the count, and three places checked by hand against their known positions.
    if not 7000 <= len(cities) <= 7400:
        raise SystemExit(f"unexpected number of places: {len(cities)}")
    for name, country, lat, lon in (
        ("Paris", "FR", 48.86, 2.35),
        ("Cayenne", "GF", 4.93, -52.33),
        ("Sydney", "AU", -33.87, 151.21),
    ):
        c = by_name.get(name)
        if not c or c[2] != country or abs(c[3] - lat) > 0.1 or abs(c[4] - lon) > 0.1:
            raise SystemExit(f"control failed for {name}: {c}")
    payload = json.dumps(
        {"version": 1, "source": SOURCE, "cities": cities}, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    if len(payload) > BUDGET:
        raise SystemExit(f"cities.json is {len(payload)} bytes, over the {BUDGET} budget")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "cities.json").write_bytes(payload)
    print(f"cities.json: {len(cities)} places, {len(payload) / 1000:.0f} kB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
