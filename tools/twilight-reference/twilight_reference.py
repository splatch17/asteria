"""Reference instants for nextDarkNight (astro-core/twilight.ts, #198).

Skyfield 1.55 (Brandon Rhodes, MIT; validated against JPL Horizons and NOVAS) with the JPL DE421
ephemeris shipped in skyfield-data: for each case, the first instant within a day where the Sun's
apparent geometric altitude (no refraction) goes below -18 degrees (almanac.find_discrete), and
the Sun's lowest point (antitransit, almanac.meridian_transits) with its altitude. The values are
copied by hand into packages/astro-core/src/twilight.test.ts (tolerance 1 min).

Run (not part of the build; needs only PyPI, same pins as tools/iss-reference):
    python -m venv .venv && .venv/bin/pip install -r tools/iss-reference/requirements.txt
    .venv/bin/python -I tools/twilight-reference/twilight_reference.py
"""

from skyfield import almanac
from skyfield.api import load, wgs84
from skyfield_data import get_skyfield_data_path

ts = load.timescale()
eph = load(get_skyfield_data_path() + "/de421.bsp")
sun, earth = eph["sun"], eph["earth"]

CASES = [
    ("Paris, autumn", 48.8566, 2.3522, (2026, 10, 24, 12, 30)),
    ("Toulouse, winter solstice", 43.6, 1.44, (2026, 12, 21, 12, 0)),
    ("Paris, June solstice", 48.8566, 2.3522, (2026, 6, 21, 12, 0)),
    ("Sydney, spring", -33.87, 151.21, (2026, 10, 24, 2, 0)),
    ("Tromso, midnight sun", 69.65, 18.96, (2026, 6, 21, 12, 0)),
    ("Paris, night already begun", 48.8566, 2.3522, (2026, 10, 24, 21, 0)),
]

for name, lat, lon, start in CASES:
    site = wgs84.latlon(lat, lon)
    observer = earth + site
    t0 = ts.utc(*start)
    t1 = ts.tt_jd(t0.tt + 1)

    def altitude(t):
        return observer.at(t).observe(sun).apparent().altaz()[0].degrees

    def above(t):
        return altitude(t) > -18

    above.step_days = 1 / 48
    times, ups = almanac.find_discrete(t0, t1, above)
    dark = [t for t, up in zip(times, ups) if not up]
    transits, kinds = almanac.find_discrete(t0, t1, almanac.meridian_transits(eph, sun, site))
    lowest = [t for t, kind in zip(transits, kinds) if kind == 0]
    print(name)
    if dark:
        print("  Sun at -18 deg:", dark[0].utc_iso())
    if lowest:
        print("  lowest point:  ", lowest[0].utc_iso(), f"{altitude(lowest[0]):.3f} deg")
