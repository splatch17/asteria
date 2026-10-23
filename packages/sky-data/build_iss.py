"""Snapshot of the ISS's orbital elements for the offline copy of the app (#12).

Downloads CelesTrak's GP data for the ISS (NORAD 25544) as an OMM record in JSON and writes
out/iss.json = {"fetchedAt": <Unix ms>, "source": <url>, "gp": [<record>]}, copied into the web
app by `pnpm data:sync`. The app prefers fresher elements (its own copy, downloaded from
CelesTrak at most every 6 hours) and uses this one only when it has nothing better and the
elements are less than 7 days from the displayed date (apps/web/src/lib/iss.ts).

Source: CelesTrak (T.S. Kelso), https://celestrak.org/NORAD/documentation/gp-data-formats.php ;
one request per build, well within CelesTrak's usage rules (no more than once per update,
i.e. every 2 hours). Optional: the deploy goes on without it (CelesTrak unreachable).

Run: python -I packages/sky-data/build_iss.py
"""

from __future__ import annotations

import json
import math
import sys
import time
import urllib.request
from pathlib import Path

URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON"
OUT = Path(__file__).resolve().parent / "out" / "iss.json"
REQUIRED = [
    "EPOCH",
    "MEAN_MOTION",
    "ECCENTRICITY",
    "INCLINATION",
    "RA_OF_ASC_NODE",
    "ARG_OF_PERICENTER",
    "MEAN_ANOMALY",
    "BSTAR",
    "NORAD_CAT_ID",
]


def main() -> int:
    request = urllib.request.Request(URL, headers={"User-Agent": "asteria-build (sky-data)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.load(response)
    records = [r for r in data if isinstance(r, dict) and r.get("NORAD_CAT_ID") == 25544]
    if len(records) != 1:
        print(f"Unexpected answer from CelesTrak: {str(data)[:200]}", file=sys.stderr)
        return 1
    record = records[0]
    missing = [k for k in REQUIRED if k not in record]
    if missing:
        print(f"Missing fields {missing}", file=sys.stderr)
        return 1
    for key in REQUIRED[1:]:
        if not math.isfinite(float(record[key])):
            print(f"Bad value for {key}: {record[key]}", file=sys.stderr)
            return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"fetchedAt": int(time.time() * 1000), "source": URL, "gp": [record]}
    OUT.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"ISS elements of {record['EPOCH']} → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
