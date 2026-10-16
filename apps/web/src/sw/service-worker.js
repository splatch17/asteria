// Asteria service worker (#142): the whole app — code, fonts, star catalogue, Earth and planet
// textures, figures — is downloaded at install, so that the sky works without a network (in the
// field, far from any antenna). Template: the build (offline.ts) replaces the two placeholders.
//
// - Install: every file of the build is fetched into a cache named after the build; a file whose
//   revision has not changed is copied from the previous cache instead of downloaded again. The
//   pages are told the progress.
// - Fetch: cache first, then the network (a file outside the list, e.g. a new deploy's chunk).
//   Navigations get the cached index.html, so the app opens offline.
// - Activate: the new build takes over at once; the cache of the build before it is kept (a page
//   still running it may load one of its lazy chunks), older ones are deleted.

/** @type {{ url: string, rev: string, size: number }[]} */
const PRECACHE = self.__ASTERIA_PRECACHE__;
const BUILD = self.__ASTERIA_BUILD__;
const PREFIX = "asteria-";
const CACHE = PREFIX + BUILD;
/** Kept in each cache: the revisions it holds, to reuse the unchanged files on the next build. */
const MANIFEST = "__manifest.json";
const scope = new URL(self.registration.scope);
const INDEX = new URL("index.html", scope).href;

let progress = { state: "idle", done: 0, total: PRECACHE.length, bytes: 0 };

async function broadcast() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage({ type: "asteria-offline", build: BUILD, ...progress });
}

const totalBytes = PRECACHE.reduce((s, e) => s + e.size, 0);

/** Revisions held by the newest other Asteria cache, and that cache. */
async function previousCache() {
  const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX) && n !== CACHE);
  for (const name of names.reverse()) {
    const cache = await caches.open(name);
    const res = await cache.match(new URL(MANIFEST, scope).href);
    if (res) return { name, cache, revs: new Map(Object.entries(await res.json())) };
  }
  return null;
}

async function fetchWithRetry(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) return res;
      last = new Error(`${url}: HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

async function precache() {
  const cache = await caches.open(CACHE);
  const prev = await previousCache();
  progress = { state: "downloading", done: 0, total: PRECACHE.length, bytes: 0 };
  void broadcast();
  let next = 0;
  async function worker() {
    while (next < PRECACHE.length) {
      const entry = PRECACHE[next++];
      const url = new URL(entry.url, scope).href;
      let res = (await cache.match(url)) ? null : undefined;
      if (res === undefined && prev && prev.revs.get(entry.url) === entry.rev)
        res = (await prev.cache.match(url)) ?? undefined;
      if (res === undefined) res = await fetchWithRetry(url);
      if (res) await cache.put(url, res);
      progress.done++;
      progress.bytes += entry.size;
      if (progress.done % 8 === 0) void broadcast();
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  const revs = Object.fromEntries(PRECACHE.map((e) => [e.url, e.rev]));
  await cache.put(
    new URL(MANIFEST, scope).href,
    new Response(JSON.stringify(revs), { headers: { "Content-Type": "application/json" } }),
  );
  progress = { state: "ready", done: PRECACHE.length, total: PRECACHE.length, bytes: totalBytes };
  void broadcast();
}

/** Ready when the manifest of this build is in its cache (all files are, then). */
async function isReady() {
  const cache = await caches.open(CACHE);
  return !!(await cache.match(new URL(MANIFEST, scope).href));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precache().then(
      () => self.skipWaiting(),
      (e) => {
        progress = { ...progress, state: "error" };
        void broadcast();
        throw e;
      },
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX) && n !== CACHE);
      // Keep the build just before this one (pages still running it), drop the older ones.
      const prev = await previousCache();
      for (const n of names) if (n !== prev?.name) await caches.delete(n);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "asteria-offline-status") return;
  event.waitUntil(
    (async () => {
      if (progress.state !== "downloading" && (await isReady()))
        progress = {
          state: "ready",
          done: PRECACHE.length,
          total: PRECACHE.length,
          bytes: totalBytes,
        };
      await broadcast();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith(
    (async () => {
      if (req.mode === "navigate") {
        // Network first for the page itself (a fresh deploy is seen online), cache when offline.
        // A weak signal must not hold the app: past a few seconds, the cached page.
        try {
          return await Promise.race([
            fetch(req),
            new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 4000)),
          ]);
        } catch {
          const cached = await caches.match(INDEX);
          if (cached) return cached;
          throw new Error("offline and no cached page");
        }
      }
      const key = url.origin + url.pathname; // query strings are not versions here
      const cached = (await caches.match(key, { cacheName: CACHE })) ?? (await caches.match(key));
      return cached ?? fetch(req);
    })(),
  );
});
