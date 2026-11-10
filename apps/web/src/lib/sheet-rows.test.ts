import { describe, expect, it } from "vitest";
import {
  absoluteMagnitude,
  bodySheet,
  deepSkySheet,
  LY_PER_PARSEC,
  planetSheet,
  sightLine,
  starColour,
  starSheet,
  unnamedStarTitle,
  type SheetFormat,
  type StarFacts,
  type Translate,
} from "./sheet-rows";

/** The key, and its values when there are some: the tests read which strings are used. */
const t: Translate = (key, values) => (values ? `${key} ${JSON.stringify(values)}` : key);
const fmt: SheetFormat = {
  num: (x, d) => x.toFixed(d).replace(".", ","),
  ra: () => "RA",
  dec: () => "DEC",
  clock: (ms) => {
    const d = new Date(ms);
    return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}`;
  },
};
const labels = (rows: { label: string }[]) => rows.map((r) => r.label);

// Betelgeuse as the catalogue holds it (Hipparcos V, B−V), at an invented place in the sky.
const betelgeuse: StarFacts = {
  ra: 88.79,
  dec: 7.41,
  v: 0.45,
  bv: 1.5,
  altitude: 35.2,
  azimuth: 128,
  distance: { ly: 550, approx: true },
  distanceTitle: "± 64 al",
  rank: { kind: "sky", rank: 10 },
  conOf: "d'Orion",
};

describe("star colour from B−V (#201)", () => {
  it.each([
    [-0.03, "blue"], // Rigel
    [-0.001, "blue"], // Vega
    [0.009, "white"], // Sirius
    [0.42, "yellowWhite"], // Procyon
    [0.65, "yellow"], // the Sun
    [0.8, "yellow"], // Capella
    [1.24, "orange"], // Arcturus
    [1.5, "red"], // Betelgeuse
    [1.54, "red"], // Aldebaran
  ] as const)("B−V %f is %s", (bv, colour) => expect(starColour(bv)).toBe(colour));
});

describe("star sheet by level (#201)", () => {
  it("Découverte: sentences, where to look, distance in words, no coordinates", () => {
    const s = starSheet("discovery", betelgeuse, "SIGHT", t, fmt);
    expect(s.lead).toEqual([
      'sheet.star.rankSky {"rank":10}',
      'sheet.star.colour {"colour":"sheet.colour.red"}',
    ]);
    expect(s.sight).toBe("SIGHT");
    expect(labels(s.rows)).toEqual(["data.dist"]);
    expect(s.rows[0]!.value).toBe('sheet.lyWordsApprox {"ly":550}');
    expect(s.latin).toBe(false);
  });

  it("Découverte: no distance row when the distance is unknown", () => {
    const s = starSheet("discovery", { ...betelgeuse, distance: null }, "SIGHT", t, fmt);
    expect(s.rows).toEqual([]);
  });

  it("Amateur: the same, plus magnitude, colour and distance", () => {
    const s = starSheet("amateur", betelgeuse, "SIGHT", t, fmt);
    expect(s.lead).toHaveLength(2);
    expect(s.sight).toBe("SIGHT");
    expect(labels(s.rows)).toEqual(["data.magnitude", "sheet.colour", "data.dist"]);
    expect(s.rows[0]!.value).toBe("0,5");
    expect(s.rows[1]!.value).toBe("Sheet.colour.red"); // capitalised word
    expect(s.rows[2]).toMatchObject({ value: 'star.distanceApprox {"ly":550}', title: "± 64 al" });
    expect(s.latin).toBe(true);
  });

  it("Expert: parallax, proper motion, radial velocity and absolute magnitude when known", () => {
    // Made-up values of the order of Betelgeuse's, one of them negative to check the sign.
    const s = starSheet(
      "expert",
      {
        ...betelgeuse,
        astrometry: { plx: 6.55, ePlx: 0.83, pmRa: 27.54, pmDec: -11.3 },
        radialVelocity: { kms: 21.91, source: "BSC5" },
      },
      "SIGHT",
      t,
      fmt,
    );
    expect(labels(s.rows)).toEqual([
      "data.ra",
      "data.dec",
      "data.v",
      "data.bv",
      "data.dist",
      "data.plx",
      "data.pm",
      "data.rv",
      "data.absMag",
      "body.altitude",
      "body.azimuth",
    ]);
    const row = (label: string) => s.rows.find((r) => r.label === label)!;
    expect(row("data.plx").value).toBe('data.plx.valueErr {"plx":"6,55","err":"0,83"}');
    expect(row("data.pm").value).toBe('data.pm.value {"ra":"+27,5","dec":"−11,3"}');
    expect(row("data.rv").value).toBe('data.rv.value {"kms":"+21,9"}');
    expect(row("data.rv").title).toBe("BSC5");
  });

  it("computes the absolute magnitude from the distance modulus", () => {
    // Sun-like check: V = 4.83 at 10 pc is M = 4.83; Vega, V 0.03 at 25.04 ly (7.68 pc): M = 0.60.
    expect(absoluteMagnitude(4.83, 10 * LY_PER_PARSEC)).toBeCloseTo(4.83, 10);
    expect(absoluteMagnitude(0.03, 25.04)).toBeCloseTo(0.6, 1);
    // Sirius, V −1.46 at 8.60 ly (2.64 pc): M = +1.43 (tolerance 0.02).
    expect(Math.abs(absoluteMagnitude(-1.46, 8.6) - 1.43)).toBeLessThan(0.02);
  });

  it("Expert: AD / Déc., V, B−V, distance, absolute magnitude, altitude and azimuth; no sentence", () => {
    const s = starSheet("expert", betelgeuse, "SIGHT", t, fmt);
    expect(s.lead).toEqual([]);
    expect(s.sight).toBeNull();
    expect(labels(s.rows)).toEqual([
      "data.ra",
      "data.dec",
      "data.v",
      "data.bv",
      "data.dist",
      "data.absMag",
      "body.altitude",
      "body.azimuth",
    ]);
    expect(s.rows.map((r) => r.value).slice(2, 4)).toEqual(["0,45", "1,50"]);
    // V 0.45 at 550 ly (168.6 pc): M = 0.45 − 5 log10(16.86) = −5.7.
    expect(s.rows[5]!.value).toBe("−5,7");
    expect(s.rows[6]!.value).toBe("35,2°");
  });

  it("a rank in the constellation, or none, and no colour without B−V", () => {
    const con = starSheet(
      "discovery",
      { ...betelgeuse, bv: undefined, rank: { kind: "constellation", rank: 2 } },
      "",
      t,
      fmt,
    );
    expect(con.lead).toEqual(['sheet.star.rankConstellation {"rank":2,"of":"d\'Orion"}']);
    expect(starSheet("discovery", { ...betelgeuse, rank: null }, "", t, fmt).lead).toEqual([
      'sheet.star.colour {"colour":"sheet.colour.red"}',
    ]);
  });

  it("names a star without name nor Bayer letter after its constellation", () => {
    expect(unnamedStarTitle(t, "de Pégase")).toBe('sheet.star.unnamed {"of":"de Pégase"}');
  });
});

describe("planet sheet by level (#201)", () => {
  // Jupiter on 2026-10-24: magnitude −2.0, 5.61 au (839 million km).
  const jupiter = {
    name: "Jupiter",
    ra: 145.6,
    dec: 14.5,
    altitude: -26.8,
    azimuth: 2.3,
    magnitude: -2.0,
    distanceKm: 839.2e6,
    brighterStars: 0,
  };
  it("Découverte: brighter than every star, its light's travel time, km in words", () => {
    const s = planetSheet("discovery", jupiter, "SIGHT", t, fmt);
    expect(s.lead).toEqual([
      'sheet.planet.brightest {"name":"Jupiter"}',
      'sheet.light {"time":"sheet.minutes {\\"min\\":47}"}',
    ]);
    expect(s.rows).toEqual([{ label: "data.dist", value: 'sheet.millionKm {"n":839}' }]);
  });
  it("Amateur: plus magnitude and distance in au", () => {
    const s = planetSheet("amateur", { ...jupiter, brighterStars: 3 }, "SIGHT", t, fmt);
    expect(s.lead[0]).toBe('sheet.planet.brighter {"name":"Jupiter","n":3}');
    expect(labels(s.rows)).toEqual(["data.magnitude", "data.dist", ""]);
    expect(s.rows[1]!.value).toBe('planet.distance {"au":5.61}');
  });
  it("Expert: the data block with altitude and azimuth", () => {
    const s = planetSheet("expert", jupiter, "SIGHT", t, fmt);
    expect(s.sight).toBeNull();
    expect(labels(s.rows)).toEqual([
      "data.v",
      "body.altitude",
      "body.azimuth",
      "data.ra",
      "data.dec",
      "data.dist",
      "",
    ]);
  });
  it("leaves out the brightness sentence for a faint planet, and says billions of km", () => {
    const neptune = { ...jupiter, name: "Neptune", brighterStars: 4000, distanceKm: 4.33e9 };
    const s = planetSheet("discovery", neptune, "", t, fmt);
    expect(s.lead).toEqual(['sheet.light {"time":"sheet.hoursMinutes {\\"h\\":4,\\"min\\":1}"}']);
    expect(s.rows[0]!.value).toBe('sheet.billionKm {"n":"4,3","count":4.3}');
  });
});

describe("Sun, Moon and deep sky by level (#201)", () => {
  const moon = {
    body: "Moon" as const,
    ra: 0,
    dec: 0,
    altitude: 20,
    azimuth: 90,
    distanceKm: 384_400,
  };
  it("Moon: distance only below Expert", () => {
    expect(bodySheet("discovery", moon, "SIGHT", t, fmt)).toEqual({
      lead: [],
      sight: "SIGHT",
      rows: [{ label: "data.dist", value: 'body.distance {"km":384400}' }],
      latin: false,
    });
    expect(labels(bodySheet("expert", moon, "", t, fmt).rows)).toEqual([
      "body.altitude",
      "body.azimuth",
      "data.ra",
      "data.dec",
      "data.dist",
    ]);
  });
  it("Sun: how long its light takes, 150 million km", () => {
    const sun = { ...moon, body: "Sun" as const, distanceKm: 149.6e6 };
    const s = bodySheet("discovery", sun, "", t, fmt);
    expect(s.lead).toEqual(['sheet.light {"time":"sheet.minutes {\\"min\\":8}"}']);
    expect(s.rows[0]!.value).toBe('sheet.millionKm {"n":150}');
  });
  it("deep sky: how to see it in words, data in Amateur and Expert", () => {
    const m42 = {
      ra: 83.8,
      dec: -5.4,
      altitude: 10,
      azimuth: 120,
      see: "naked-eye" as const,
      magnitude: { band: "V" as const, value: 4 },
      size: { value: "85′ × 60′", title: "hint" },
    };
    const d = deepSkySheet("discovery", m42, "SIGHT", t, fmt);
    expect(d).toEqual({
      lead: ["sheet.deepsky.see.naked-eye"],
      sight: "SIGHT",
      rows: [],
      latin: false,
    });
    expect(labels(deepSkySheet("amateur", m42, "", t, fmt).rows)).toEqual([
      "data.magnitude",
      "deepsky.size",
    ]);
    expect(labels(deepSkySheet("expert", m42, "", t, fmt).rows)).toEqual([
      "deepsky.see",
      "data.v",
      "deepsky.size",
      "data.ra",
      "data.dec",
      "body.altitude",
      "body.azimuth",
    ]);
  });
});

describe("sight line (#201)", () => {
  const now = new Date(2026, 9, 24, 21, 30).getTime(); // local time
  it("says where to look, rounding the altitude, in eight directions", () => {
    expect(
      sightLine({ state: "visible", altitude: 35.4, azimuth: 130 }, t, fmt, {
        now,
        live: true,
        fixed: true,
      }),
    ).toBe('sight.visible {"alt":35,"dir":"compass.dir.3"}');
    expect(
      sightLine({ state: "visible", altitude: 35.4, azimuth: 130 }, t, fmt, {
        now,
        live: false,
        fixed: true,
      }),
    ).toBe('sight.visibleThen {"alt":35,"dir":"compass.dir.3"}');
    expect(
      sightLine({ state: "daylight", altitude: 5, azimuth: 270 }, t, fmt, {
        now,
        live: true,
        fixed: true,
      }),
    ).toBe('sight.daylight {"alt":5,"dir":"compass.dir.6"}');
  });
  it("says when it rises, today or tomorrow, or that it does not", () => {
    const tonight = new Date(2026, 9, 24, 22, 59).getTime();
    const afterMidnight = new Date(2026, 9, 25, 2, 12).getTime();
    const tomorrow = new Date(2026, 9, 25, 16, 3).getTime();
    const o = { now, live: true, fixed: true };
    expect(sightLine({ state: "rises", at: tonight }, t, fmt, o)).toBe(
      'sight.rises {"time":"22 h 59"}',
    );
    expect(sightLine({ state: "rises", at: afterMidnight }, t, fmt, o)).toBe(
      'sight.risesTonight {"time":"2 h 12"}',
    );
    expect(sightLine({ state: "rises", at: tomorrow }, t, fmt, o)).toBe(
      'sight.risesTomorrow {"time":"16 h 03"}',
    );
    // Seen at 3 h in the morning, a rising at 2 h the next day is tomorrow's.
    const morning = { ...o, now: new Date(2026, 9, 24, 3, 0).getTime() };
    expect(sightLine({ state: "rises", at: afterMidnight }, t, fmt, morning)).toBe(
      'sight.risesTomorrow {"time":"2 h 12"}',
    );
    expect(sightLine({ state: "down" }, t, fmt, o)).toBe("sight.never");
    expect(sightLine({ state: "down" }, t, fmt, { ...o, fixed: false })).toBe("sight.notToday");
  });
});
