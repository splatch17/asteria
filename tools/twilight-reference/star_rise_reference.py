"""Reference rise times for nextRise (apps/web/src/lib/horizon.ts, #198).

Skyfield 1.55 (MIT) with JPL DE421 (skyfield-data): geometric rise (horizon 0 deg, no
refraction, the app's « sous l'horizon » rule) of catalogue stars seen from Paris. Star positions
J2000 / ICRS from SIMBAD (proper motion ignored: under 0.03 arcsec a year for these stars).

Run (not part of the build; same pins as tools/iss-reference):
    .venv/bin/python -I tools/twilight-reference/star_rise_reference.py
"""

from skyfield import almanac
from skyfield.api import Star, load, wgs84
from skyfield_data import get_skyfield_data_path

ts = load.timescale()
eph = load(get_skyfield_data_path() + "/de421.bsp")
earth = eph["earth"]
paris = wgs84.latlon(48.8566, 2.3522)
observer = earth + paris

STARS = [
    # name, RA (deg), Dec (deg), start (UTC)
    ("Betelgeuse", 88.792939, 7.407064, (2026, 10, 24, 19, 30)),
    ("Sirius", 101.287155, -16.716116, (2026, 10, 24, 19, 30)),
    ("Antares", 247.351915, -26.432003, (2026, 10, 24, 19, 30)),
]

for name, ra, dec, start in STARS:
    star = Star(ra_hours=ra / 15, dec_degrees=dec)
    t0 = ts.utc(*start)
    t1 = ts.tt_jd(t0.tt + 1)
    times, ok = almanac.find_risings(observer, star, t0, t1, horizon_degrees=0.0)
    print(name, [t.utc_iso() for t, y in zip(times, ok) if y][:1])
