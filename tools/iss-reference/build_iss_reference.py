"""Reference values for the satellite tests of astro-core (#12).

Writes packages/astro-core/src/data/iss-reference.json from:

1. Vallado et al. 2006, "Revisiting Spacetrack Report #3" (AIAA 2006-6753, Rev 2): the SGP4
   verification cases SGP4-VER.TLE and the C++ reference output tcppver.out (WGS-72, improved
   mode), as shipped with the python-sgp4 package 2.27 (Brandon Rhodes, MIT). A subset of
   near-Earth satellites (the ISS's regime) and two deep-space ones.
2. Skyfield 1.55 (Brandon Rhodes, MIT; validated against JPL Horizons and NOVAS) for an
   independent topocentric chain: ISS TLE of 2018-07-03 (the one of Skyfield's Horizons test),
   seen from Paris (WGS-84, 0 m): altitude, azimuth, range; rise / culmination / set events
   (find_events, horizon 0°, geometric); sunlit state (is_sunlit, DE421) and Sun altitude.

Run (not part of the build; needs only PyPI):
    python -m venv .venv && .venv/bin/pip install -r tools/iss-reference/requirements.txt
    .venv/bin/python -I tools/iss-reference/build_iss_reference.py
    pnpm prettier --write packages/astro-core/src/data/iss-reference.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import sgp4
from skyfield import __version__ as skyfield_version
from skyfield.api import EarthSatellite, load, wgs84
from skyfield.iokit import Loader
from skyfield.searchlib import find_discrete
from skyfield_data import get_skyfield_data_path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/astro-core/src/data/iss-reference.json"

# Vallado cases kept: near-Earth (drag, low perigee, quasi-circular) and deep space (resonant).
VALLADO_SATS = ["5", "6251", "28057", "28350", "29238", "88888", "8195", "9880"]

ISS_NAME = "ISS (ZARYA)"
ISS_L1 = "1 25544U 98067A   18184.80969102  .00001614  00000-0  31745-4 0  9993"
ISS_L2 = "2 25544  51.6414 295.8524 0003435 262.6267 204.2868 15.54005638121106"
PARIS = {"latitude": 48.8566, "longitude": 2.3522}


def vallado_cases() -> list[dict]:
    pkg = Path(sgp4.__file__).parent
    tle_lines = (pkg / "SGP4-VER.TLE").read_text().splitlines()
    tles: dict[str, tuple[str, str]] = {}
    for i, line in enumerate(tle_lines):
        if line.startswith("1 ") and i + 1 < len(tle_lines) and tle_lines[i + 1].startswith("2 "):
            # Line 2 carries the start/stop/step of the test after column 69: drop them.
            tles.setdefault(str(int(line[2:7])), (line[:69], tle_lines[i + 1][:69]))
    cases: dict[str, list[dict]] = {}
    current: list[dict] | None = None
    for line in (pkg / "tcppver.out").read_text().splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1] == "xx":
            sat = parts[0]
            # 20413 appears twice in the file: keep the first run only.
            current = cases.setdefault(sat, []) if sat not in cases else None
            continue
        if current is None or len(parts) < 7:
            continue
        t, x, y, z, vx, vy, vz = (float(p) for p in parts[:7])
        current.append({"tsince": t, "r": [x, y, z], "v": [vx, vy, vz]})
    return [
        {"satnum": s, "line1": tles[s][0], "line2": tles[s][1], "points": cases[s]}
        for s in VALLADO_SATS
    ]


def iso(t) -> str:
    return t.utc_iso(places=3)


def skyfield_reference() -> dict:
    ts = load.timescale()
    eph = Loader(get_skyfield_data_path())("de421.bsp")
    sun, earth = eph["sun"], eph["earth"]
    sat = EarthSatellite(ISS_L1, ISS_L2, ISS_NAME, ts)
    paris = wgs84.latlon(PARIS["latitude"], PARIS["longitude"], elevation_m=0)
    topo = sat - paris

    t0, t1 = ts.utc(2018, 7, 3), ts.utc(2018, 7, 7)
    times, kinds = sat.find_events(paris, t0, t1, altitude_degrees=0.0)
    events = []
    for t, k in zip(times, kinds):
        alt, az, dist = topo.at(t).altaz()
        sun_alt = (earth + paris).at(t).observe(sun).apparent().altaz()[0].degrees
        events.append(
            {
                "kind": ["rise", "culmination", "set"][int(k)],
                "time": iso(t),
                "altitude": round(float(alt.degrees), 4),
                "azimuth": round(float(az.degrees), 4),
                "sunlit": bool(sat.at(t).is_sunlit(eph)),
                "sunAltitude": round(float(sun_alt), 3),
            }
        )

    # Every 20 s across three passes (two in twilight, one in daylight).
    samples = []
    for start in ["2018-07-04T02:51:00Z", "2018-07-04T04:26:30Z", "2018-07-06T02:42:30Z"]:
        y, mo, d = (int(v) for v in start[:10].split("-"))
        h, mi, s = (int(v) for v in start[11:19].split(":"))
        for k in range(0, 34):
            t = ts.utc(y, mo, d, h, mi, s + 20 * k)
            alt, az, dist = topo.at(t).altaz()
            samples.append(
                {
                    "time": iso(t),
                    "altitude": round(float(alt.degrees), 5),
                    "azimuth": round(float(az.degrees), 5),
                    "rangeKm": round(float(dist.km), 4),
                    "sunlit": bool(sat.at(t).is_sunlit(eph)),
                }
            )

    # Shadow entries / exits (Earth's shadow: line of sight to the Sun's centre, sphere of
    # 6 378.137 km), over one day.
    def sunlit(t):
        return sat.at(t).is_sunlit(eph)

    sunlit.step_days = 0.002
    st, sv = find_discrete(ts.utc(2018, 7, 4), ts.utc(2018, 7, 5), sunlit)
    shadow = [{"time": iso(t), "sunlit": bool(v)} for t, v in zip(st, sv)]

    return {
        "tle": [ISS_NAME, ISS_L1, ISS_L2],
        "observer": PARIS,
        "events": events,
        "samples": samples,
        "shadow": shadow,
    }


def main() -> int:
    data = {
        "_source": (
            "tools/iss-reference/build_iss_reference.py — Vallado et al. 2006 (AIAA 2006-6753 Rev 2) "
            f"via python-sgp4 {sgp4.__version__}; Skyfield {skyfield_version} with DE421 "
            "(skyfield-data). Not edited by hand."
        ),
        "vallado": vallado_cases(),
        "skyfield": skyfield_reference(),
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
