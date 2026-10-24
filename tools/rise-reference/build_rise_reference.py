"""Reference risings of the Sun, Moon and planets for the sheets' « se lève à … » (#201).

Prints the next rising (geometric: centre of the body on the 0° horizon, no refraction, the
convention of the sheets' « Sous l'horizon ») after the captures' instant, seen from Paris,
computed by Skyfield 1.55 (Brandon Rhodes, MIT; validated against JPL Horizons and NOVAS) with
the JPL DE421 ephemeris shipped in skyfield-data. The stars' risings are checked the same way by
tools/twilight-reference/star_rise_reference.py (#198).

The values are pasted into apps/web/src/lib/sight.test.ts (tolerance stated there).

Run (not part of the build; needs only PyPI, same pins as tools/iss-reference):
    python -m venv .venv && .venv/bin/pip install -r tools/iss-reference/requirements.txt
    .venv/bin/python -I tools/rise-reference/build_rise_reference.py
"""

from __future__ import annotations

from skyfield import almanac
from skyfield.api import load, wgs84
from skyfield.iokit import Loader
from skyfield_data import get_skyfield_data_path

PARIS = wgs84.latlon(48.8566, 2.3522)
START = (2026, 10, 24, 19, 30)  # UTC, the captures' instant
BODIES = {
    "Sun": "sun",
    "Moon": "moon",
    "Venus": "venus",
    "Mars": "mars",
    "Jupiter": "jupiter barycenter",
    "Saturn": "saturn barycenter",
}


def main() -> None:
    ts = load.timescale()
    eph = Loader(get_skyfield_data_path())("de421.bsp")
    observer = eph["earth"] + PARIS
    t0 = ts.utc(*START)
    t1 = ts.tt_jd(t0.tt + 1)
    for name, key in BODIES.items():
        t, up = almanac.find_risings(observer, eph[key], t0, t1, horizon_degrees=0.0)
        risings = [ti.utc_iso() for ti, ok in zip(t, up) if ok]
        print(f'["{name}", "{risings[0] if risings else None}"],')


if __name__ == "__main__":
    main()
