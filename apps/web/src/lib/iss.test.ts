import { describe, expect, it } from "vitest";
import type { OmmRecord } from "@asteria/astro-core/satellites";
import {
  FRESH_DAYS,
  MAX_AGE_DAYS,
  compassPoint,
  freshness,
  isStoredElements,
  minuteTicks,
  newer,
  ommEpoch,
  passToShow,
  passWhen,
  passWindow,
  pickIss,
  nextAttemptAt,
  refreshDue,
  trackInstants,
  type StoredElements,
} from "./iss";

const DAY = 86_400_000;
const HOUR = 3_600_000;

// CelesTrak GP record of the ISS (same elements as the TLE of 2018-07-03 used by astro-core's
// tests), as gp.php?CATNR=25544&FORMAT=JSON returns it: EPOCH in UTC without "Z".
const record: OmmRecord = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2018-07-03T19:25:57.304128",
  MEAN_MOTION: 15.54005638,
  ECCENTRICITY: 0.0003435,
  INCLINATION: 51.6414,
  RA_OF_ASC_NODE: 295.8524,
  ARG_OF_PERICENTER: 262.6267,
  MEAN_ANOMALY: 204.2868,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 12110,
  BSTAR: 3.1745e-5,
  MEAN_MOTION_DOT: 1.614e-5,
  MEAN_MOTION_DDOT: 0,
};
const epoch = Date.parse("2018-07-03T19:25:57.304Z");

describe("elements", () => {
  it("reads the epoch as UTC", () => {
    expect(ommEpoch(record)).toBe(epoch);
  });

  it("picks the ISS out of a CelesTrak answer, and nothing else", () => {
    expect(pickIss([record])).toBe(record);
    expect(pickIss([{ ...record, NORAD_CAT_ID: 20580 }])).toBeNull();
    expect(pickIss([{ ...record, MEAN_MOTION: "abc" }])).toBeNull();
    expect(pickIss([{ ...record, EPOCH: "yesterday" }])).toBeNull();
    // CelesTrak answers a text message (not JSON) when it has no data: never an array of records.
    expect(pickIss("No GP data found")).toBeNull();
    expect(pickIss(null)).toBeNull();
  });

  it("validates a stored copy", () => {
    const copy: StoredElements = { omm: record, fetchedAt: epoch, source: "celestrak" };
    expect(isStoredElements(copy)).toBe(true);
    expect(isStoredElements({ ...copy, source: "elsewhere" })).toBe(false);
    expect(isStoredElements({ ...copy, fetchedAt: "now" })).toBe(false);
    expect(isStoredElements({ ...copy, omm: {} })).toBe(false);
  });

  it("keeps the copy with the later epoch", () => {
    const old: StoredElements = { omm: record, fetchedAt: epoch, source: "celestrak" };
    const recent: StoredElements = {
      omm: { ...record, EPOCH: "2018-07-05T10:00:00.000000" },
      fetchedAt: epoch - DAY, // downloaded earlier does not matter
      source: "celestrak",
    };
    expect(newer(old, recent)).toBe(recent);
    expect(newer(recent, old)).toBe(recent);
    expect(newer(null, old)).toBe(old);
    expect(newer(old, null)).toBe(old);
  });
});

describe("freshness", () => {
  it("is fresh up to 3 days either side of the epoch, then aging up to 7, then stale", () => {
    expect(FRESH_DAYS).toBe(3);
    expect(MAX_AGE_DAYS).toBe(7);
    expect(freshness(epoch, epoch + 2.9 * DAY)).toBe("fresh");
    expect(freshness(epoch, epoch - 2.9 * DAY)).toBe("fresh");
    expect(freshness(epoch, epoch + 5 * DAY)).toBe("aging");
    expect(freshness(epoch, epoch + 7.1 * DAY)).toBe("stale");
    expect(freshness(epoch, epoch - 30 * DAY)).toBe("stale");
  });
});

describe("nextAttemptAt (#198)", () => {
  const now = epoch + DAY;
  it("lets the sheet try again 2 hours after the last request, not before", () => {
    expect(nextAttemptAt(null, now)).toBe(null);
    expect(nextAttemptAt(now - 1.5 * HOUR, now)).toBe(now + 0.5 * HOUR);
    expect(nextAttemptAt(now - 2 * HOUR, now)).toBe(null);
  });
  it("agrees with refreshDue when there is no copy", () => {
    for (const ago of [0.5, 1.99, 2, 3]) {
      const last = now - ago * HOUR;
      expect(nextAttemptAt(last, now) === null).toBe(refreshDue(null, last, now, true));
    }
  });
});

describe("refreshDue", () => {
  const now = epoch + DAY;
  const copy: StoredElements = { omm: record, fetchedAt: now - 7 * HOUR, source: "celestrak" };

  it("never offline", () => {
    expect(refreshDue(null, null, now, false)).toBe(false);
  });

  it("asks when there is no copy", () => {
    expect(refreshDue(null, null, now, true)).toBe(true);
  });

  it("does not ask again within 2 hours of a failed attempt, even without a copy", () => {
    expect(refreshDue(null, now - 1.9 * HOUR, now, true)).toBe(false);
    expect(refreshDue(null, now - 2.1 * HOUR, now, true)).toBe(true);
  });

  it("asks again after 6 hours, at most once every 2 hours", () => {
    expect(refreshDue({ ...copy, fetchedAt: now - 5 * HOUR }, null, now, true)).toBe(false);
    expect(refreshDue(copy, null, now, true)).toBe(true);
    expect(refreshDue(copy, now - 1 * HOUR, now, true)).toBe(false);
    expect(refreshDue(copy, now - 3 * HOUR, now, true)).toBe(true);
  });
});

describe("directions and times", () => {
  it("names the nearest of the eight compass points", () => {
    expect([0, 22, 23, 90, 180, 247, 292.6, 337.6, 359, -10].map(compassPoint)).toEqual([
      0, 0, 1, 2, 4, 5, 7, 0, 0, 0,
    ]);
  });

  it("says when a pass happens in everyday words (local time)", () => {
    const now = new Date(2026, 9, 23, 17, 0).getTime(); // Friday 17:00
    const at = (d: number, h: number, m = 0) => new Date(2026, 9, 23 + d, h, m).getTime();
    expect(passWhen(at(0, 20, 14), now)).toEqual({ day: "today", part: "evening" });
    expect(passWhen(at(1, 3, 30), now)).toEqual({ day: "today", part: "night" });
    expect(passWhen(at(1, 6, 10), now)).toEqual({ day: "tomorrow", part: "morning" });
    expect(passWhen(at(1, 21, 0), now)).toEqual({ day: "tomorrow", part: "evening" });
    expect(passWhen(at(2, 21, 0), now)).toEqual({ day: "later", part: "evening" });
    expect(passWhen(at(2, 2, 0), now)).toEqual({ day: "later", part: "night" });
  });

  it("puts minute ticks strictly inside a span", () => {
    const t0 = Date.UTC(2018, 6, 6, 2, 45, 28);
    expect(minuteTicks(t0, t0 + 3 * 60_000).map((t) => new Date(t).toISOString())).toEqual([
      "2018-07-06T02:46:00.000Z",
      "2018-07-06T02:47:00.000Z",
      "2018-07-06T02:48:00.000Z",
    ]);
    expect(minuteTicks(Date.UTC(2018, 6, 6, 2, 46), Date.UTC(2018, 6, 6, 2, 46, 30))).toEqual([]);
  });

  it("samples a track from rise to set, with the visible part's ends", () => {
    const pass = { rise: 0, set: 25_000, visible: { start: 4_000, end: 21_500 } };
    expect(trackInstants(pass)).toEqual([0, 4_000, 10_000, 20_000, 21_500, 25_000]);
  });
});

describe("passToShow", () => {
  const passes = [
    { rise: 100, set: 200, visible: null },
    { rise: 300, set: 400, visible: null },
    { rise: 500, set: 600, visible: { start: 520, end: 580 } },
  ];

  it("shows the pass under way", () => {
    expect(passToShow(passes, 150)).toBe(0);
  });

  it("else the next visible pass, else the next one", () => {
    expect(passToShow(passes, 250)).toBe(2);
    expect(passToShow(passes.slice(0, 2), 250)).toBe(1);
    expect(passToShow(passes, 700)).toBe(-1);
  });
});

describe("passWindow", () => {
  it("covers three days ahead and is computed again after two", () => {
    const w = passWindow(epoch);
    expect(w.start).toBe(epoch - 15 * 60_000);
    expect(w.end).toBe(epoch + 3 * DAY);
    expect(w.validUntil).toBe(epoch + 2 * DAY);
  });
});
