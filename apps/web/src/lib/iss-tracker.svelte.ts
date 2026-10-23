/**
 * The ISS's orbital elements in the app (#12): SGP4 code loaded on demand, elements from the
 * device's copy, CelesTrak or the build's snapshot (strategy in lib/iss.ts).
 */
import type { OrbitalElements } from "@asteria/astro-core/satellites";
import { readSetting, writeSetting } from "./storage";
import {
  CELESTRAK_ISS_URL,
  ISS_CACHE_KEY,
  REFRESH_HOURS,
  isStoredElements,
  newer,
  pickIss,
  refreshDue,
  type StoredElements,
} from "./iss";

export type SatelliteModule = typeof import("@asteria/astro-core/satellites");

const ATTEMPT_KEY = "asteria.iss.lastAttempt";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const FETCH_TIMEOUT_MS = 15_000;

export class IssTracker {
  /** The SGP4 module, once loaded. */
  sat = $state.raw<SatelliteModule | null>(null);
  /** Elements in use, and where they come from. */
  elements = $state.raw<OrbitalElements | null>(null);
  stored = $state.raw<StoredElements | null>(null);
  /** No elements could be found (offline without a copy, CelesTrak and snapshot unavailable). */
  failed = $state(false);
  private started = false;

  constructor(private readonly snapshotUrl: string) {}

  /** Loads the module and the elements (once); refreshes from CelesTrak when due. */
  async ensure(online: boolean): Promise<void> {
    if (this.started) {
      if (online) void this.refresh(online);
      return;
    }
    this.started = true;
    try {
      this.sat = await import("@asteria/astro-core/satellites");
    } catch (e) {
      console.warn("SGP4 module unavailable", e);
      this.started = false; // offline before the chunk was cached: try again later
      return;
    }
    const kept = readSetting<StoredElements | null>(
      ISS_CACHE_KEY,
      null,
      (v): v is StoredElements | null => isStoredElements(v),
    );
    if (kept) this.use(kept);
    await this.refresh(online);
    // The build's snapshot may be newer than an old copy (it is part of the offline copy).
    const s = this.stored;
    if (!s || s.source !== "celestrak" || Date.now() - s.fetchedAt > REFRESH_HOURS * 3_600_000)
      await this.loadSnapshot();
    this.failed = !this.elements;
  }

  private use(copy: StoredElements): void {
    if (!this.sat) return;
    try {
      this.elements = this.sat.elementsFromOmm(copy.omm);
      this.stored = copy;
    } catch (e) {
      console.warn("Unusable ISS elements", e);
    }
  }

  private async refresh(online: boolean): Promise<void> {
    const now = Date.now();
    const last = readSetting<number | null>(ATTEMPT_KEY, null, (v): v is number | null =>
      isNumber(v),
    );
    if (!refreshDue(this.stored, last, now, online)) return;
    writeSetting(ATTEMPT_KEY, now);
    try {
      const omm = pickIss(await fetchJson(CELESTRAK_ISS_URL));
      if (!omm) throw new Error("No ISS record in CelesTrak's answer");
      const copy: StoredElements = { omm, fetchedAt: now, source: "celestrak" };
      const best = newer(this.stored, copy);
      if (best === copy) {
        writeSetting(ISS_CACHE_KEY, copy);
        this.use(copy);
      }
      this.failed = false;
    } catch (e) {
      // CORS, network, CelesTrak's rate limit (403): the copy in hand stays.
      console.warn("CelesTrak unreachable", e);
    }
  }

  private async loadSnapshot(): Promise<void> {
    try {
      const json: unknown = await fetchJson(this.snapshotUrl);
      const s = json as { fetchedAt?: unknown; gp?: unknown };
      const omm = pickIss(s.gp);
      if (!omm || !isNumber(s.fetchedAt)) return;
      const copy: StoredElements = { omm, fetchedAt: s.fetchedAt, source: "snapshot" };
      if (newer(this.stored, copy) === copy) this.use(copy);
    } catch {
      // No snapshot in this build (CelesTrak unreachable when it was made).
    }
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
