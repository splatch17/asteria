/**
 * The ISS's orbital elements in the app (#12): SGP4 code loaded on demand, elements downloaded
 * by the device itself from CelesTrak and kept on it (strategy in lib/iss.ts). Asteria never
 * ships or serves the elements.
 */
import type { OrbitalElements } from "@asteria/astro-core/satellites";
import { readSetting, writeSetting } from "./storage";
import {
  CELESTRAK_ISS_URL,
  ISS_CACHE_KEY,
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
  /** Elements in use, and when they were downloaded. */
  elements = $state.raw<OrbitalElements | null>(null);
  stored = $state.raw<StoredElements | null>(null);
  /** No elements at all (never downloaded: offline, CORS, CelesTrak unreachable). */
  failed = $state(false);
  /** Last request to CelesTrak (ms), failures included: when the sheet may try again (#198). */
  lastAttempt = $state<number | null>(null);
  /** A request is under way (the sheet's « Réessayer »). */
  busy = $state(false);
  private started = false;

  /** Loads the module and the device's copy (once); downloads from CelesTrak when due. */
  async ensure(online: boolean): Promise<void> {
    if (this.started) {
      if (online) await this.refresh(online);
      this.failed = !this.elements;
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

  /**
   * One request to CelesTrak's GP endpoint for the ISS when refreshDue allows it (at most one
   * attempt per device every RETRY_HOURS, recorded before the request so that a failure counts).
   */
  private async refresh(online: boolean): Promise<void> {
    const now = Date.now();
    const last = readSetting<number | null>(ATTEMPT_KEY, null, (v): v is number | null =>
      isNumber(v),
    );
    this.lastAttempt = last;
    if (!refreshDue(this.stored, last, now, online)) return;
    writeSetting(ATTEMPT_KEY, now);
    this.lastAttempt = now;
    this.busy = true;
    try {
      const omm = pickIss(await fetchJson(CELESTRAK_ISS_URL));
      if (!omm) throw new Error("No ISS record in CelesTrak's answer");
      const copy: StoredElements = { omm, fetchedAt: now, source: "celestrak" };
      if (newer(this.stored, copy) === copy) {
        writeSetting(ISS_CACHE_KEY, copy);
        this.use(copy);
      }
    } catch (e) {
      // CORS, network, CelesTrak's rate limit (403): the copy in hand stays; the sheet says
      // « orbite indisponible » or « trop ancienne ».
      console.warn("CelesTrak unreachable", e);
    } finally {
      this.busy = false;
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
