import type { OfflineState } from "./offline";

/**
 * Offline copy of the app (#142): registers the service worker (production builds only) and
 * follows what it reports — download progress, ready, error — for the « Hors ligne » line of the
 * settings. Asks the browser to keep the storage (not evicted when space runs low).
 */
export const offline = $state<{ current: OfflineState }>({ current: { state: "unsupported" } });

/** Network state (#146), from the browser: « Connecté » or « Hors ligne » in the settings. */
export const network = $state({ online: navigator.onLine });

export function watchNetwork(): void {
  addEventListener("online", () => (network.online = true));
  addEventListener("offline", () => (network.online = false));
}

export function startOffline(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  offline.current = { state: "idle", done: 0, total: 0, bytes: 0 };
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    const d = e.data as { type?: string } & Exclude<OfflineState, { state: "unsupported" }>;
    if (d?.type !== "asteria-offline") return;
    // A new build downloading while this one is ready: keep « ready », the copy still works.
    if (offline.current.state === "ready" && d.state === "downloading") return;
    offline.current = { state: d.state, done: d.done, total: d.total, bytes: d.bytes };
  });
  const askStatus = () =>
    navigator.serviceWorker.ready.then((r) =>
      r.active?.postMessage({ type: "asteria-offline-status" }),
    );
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((reg) => {
      void navigator.storage?.persist?.();
      // The worker installing reports its own progress; once active, ask it where it stands.
      void askStatus();
      reg.addEventListener("updatefound", () => {
        if (offline.current.state !== "ready")
          offline.current = { state: "downloading", done: 0, total: 0, bytes: 0 };
      });
    })
    .catch(() => (offline.current = { state: "error", done: 0, total: 0, bytes: 0 }));
  navigator.serviceWorker.addEventListener("controllerchange", () => void askStatus());
}

/** Retries a failed download: re-registering re-runs the install of the waiting worker. */
export function retryOffline(): void {
  void navigator.serviceWorker?.getRegistration().then((r) => r?.update());
}
